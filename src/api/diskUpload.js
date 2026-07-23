import { assertSafeLocalPath } from '../ae/download.js';

/**
 * Stream a local file into ftrack.server without buffering the whole file in JS heap.
 * CEP / Node mixed-context only.
 */

function nodeRequire(name) {
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    return window.require(name);
  }
  if (typeof require === 'function') return require(name);
  throw new Error('Node require unavailable');
}

function putStream(url, headers, filePath, {
  start = 0,
  end = null,
  contentLength = null,
  onProgress,
} = {}) {
  const https = nodeRequire('https');
  const http = nodeRequire('http');
  const fs = nodeRequire('fs');
  const { URL } = nodeRequire('url');

  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error(`Invalid upload URL: ${e.message}`));
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = { ...(headers || {}) };
    if (contentLength != null && !reqHeaders['Content-Length'] && !reqHeaders['content-length']) {
      reqHeaders['Content-Length'] = String(contentLength);
    }

    const req = mod.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'PUT',
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const etag = res.headers?.etag || res.headers?.ETag || null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, etag, body: Buffer.concat(chunks).toString('utf8') });
          } else {
            reject(
              new Error(
                `Upload PUT HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );

    req.on('error', reject);

    const opts = { start };
    if (end != null && end >= start) opts.end = end;
    const stream = fs.createReadStream(filePath, opts);
    let sent = 0;
    const total = contentLength || Math.max(1, (end != null ? end - start + 1 : 0));
    stream.on('data', (chunk) => {
      sent += chunk.length;
      if (typeof onProgress === 'function') {
        onProgress(Math.min(99, Math.round((sent / total) * 100)));
      }
    });
    stream.on('error', (err) => {
      req.destroy(err);
      reject(err);
    });
    stream.pipe(req);
  });
}

/**
 * Create FileComponent, stream bytes from disk, register in ftrack.server.
 * @returns {{ componentId: string, size: number }}
 */
export async function uploadComponentFromDisk(session, {
  versionId,
  filePath,
  componentName,
  onProgress,
} = {}) {
  if (!session) throw new Error('No session');
  if (!versionId) throw new Error('Need versionId');
  if (!filePath) throw new Error('Need filePath');

  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const safePath = assertSafeLocalPath(filePath);
  if (!fs.existsSync(safePath)) throw new Error(`File not found: ${safePath}`);

  const stat = fs.statSync(safePath);
  if (!stat.size) throw new Error('File is empty (0 bytes)');

  const base = path.basename(safePath);
  const ext = path.extname(base) || '';
  const name = componentName || base.replace(/\.[^.]+$/, '') || base;

  onProgress?.(1);

  const created = await session.create('FileComponent', {
    name,
    file_type: ext,
    size: stat.size,
    version_id: versionId,
  });
  const component = created?.data ?? created;
  const componentId = component?.id;
  if (!componentId) throw new Error('Failed to create FileComponent');

  onProgress?.(3);

  const metaResults = await session.call([
    {
      action: 'get_upload_metadata',
      component_id: componentId,
      file_size: stat.size,
      file_name: base,
    },
  ]);
  const meta = Array.isArray(metaResults) ? metaResults[0] : metaResults;
  const data = meta?.data || meta;
  const uploadUrl = data?.url || data?.put_url;
  const headers = data?.headers || {};
  const uploadId = data?.upload_id || data?.uploadId || null;
  const partsMeta = data?.parts || null;

  if (Array.isArray(partsMeta) && partsMeta.length > 0 && uploadId) {
    const completedParts = [];
    let offset = 0;
    for (let i = 0; i < partsMeta.length; i++) {
      const part = partsMeta[i];
      const partUrl = part.url || part.put_url;
      if (!partUrl) throw new Error(`Multipart part ${i + 1} missing URL`);
      const start = part.start ?? part.byte_offset ?? offset;
      const size = part.size || part.byte_count || null;
      const end = part.end != null
        ? part.end
        : (size != null ? start + size - 1 : null);
      const len = end != null ? end - start + 1 : (size || null);
      // eslint-disable-next-line no-await-in-loop
      const putRes = await putStream(partUrl, part.headers || headers, safePath, {
        start,
        end,
        contentLength: len,
        onProgress: (pct) => {
          const basePct = (i / partsMeta.length) * 92;
          onProgress?.(Math.round(basePct + (pct / 100) * (92 / partsMeta.length)) + 3);
        },
      });
      completedParts.push({
        part_number: part.part_number || part.partNumber || i + 1,
        etag: putRes.etag || `"part-${i + 1}"`,
      });
      offset = end != null ? end + 1 : offset;
    }
    await session.call([
      {
        action: 'complete_multipart_upload',
        component_id: componentId,
        upload_id: uploadId,
        parts: completedParts,
      },
    ]);
  } else if (uploadUrl) {
    await putStream(uploadUrl, headers, safePath, {
      start: 0,
      end: stat.size - 1,
      contentLength: stat.size,
      onProgress: (pct) => onProgress?.(Math.min(95, 3 + Math.round(pct * 0.92))),
    });
  } else {
    throw new Error('get_upload_metadata returned no upload URL');
  }

  onProgress?.(96);

  const loc = await session.query(
    'select id from Location where name is "ftrack.server" limit 1',
  );
  const locationId = loc.data[0]?.id || '3a372bde-05bc-11e4-8908-20c9d081909b';
  try {
    await session.create('ComponentLocation', {
      component_id: componentId,
      location_id: locationId,
    });
  } catch (err) {
    console.warn('[upload] ComponentLocation:', err?.message || err);
  }

  onProgress?.(100);
  return { componentId, size: stat.size };
}
