/**
 * Stream / download helpers for Adobe CEP (Node mixed-context).
 * Bypasses browser CORS by using Node http(s).
 */

function nodeRequire(name) {
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    return window.require(name);
  }
  if (typeof require === 'function') {
    return require(name);
  }
  throw new Error('Node require unavailable — enable CEP Node.js in manifest');
}

export function getAeTempDir() {
  const path = nodeRequire('path');
  const os = nodeRequire('os');
  return path.join(os.tmpdir(), 'ftrack-ae');
}

/** Reject path traversal / uncanny absolute paths for publish reads. */
export function assertSafeLocalPath(filePath) {
  const path = nodeRequire('path');
  const os = nodeRequire('os');
  const raw = String(filePath || '');
  if (!raw || /[\0]/.test(raw)) throw new Error('Invalid file path');
  const resolved = path.resolve(raw);
  if (resolved !== path.normalize(resolved)) throw new Error('Invalid file path');
  // Block classic traversal after resolve (already collapsed) and empty
  if (!path.isAbsolute(resolved)) throw new Error('File path must be absolute');
  const lower = resolved.toLowerCase();
  // Disallow reading from Windows system roots that artists never publish from
  const blocked = ['\\windows\\', '/windows/', '\\system32\\', '/system32/', '\\$recycle.bin'];
  if (blocked.some((b) => lower.includes(b))) {
    throw new Error('Refusing to read system path');
  }
  // Must live under a user-ish root or temp (picker / renders / ae temp)
  const home = os.homedir ? os.homedir() : '';
  const tmp = os.tmpdir();
  const allowedRoots = [home, tmp, 'c:\\users', 'd:\\', 'e:\\', 'f:\\']
    .filter(Boolean)
    .map((r) => path.resolve(r).toLowerCase());
  const ok = allowedRoots.some(
    (root) => lower === root || lower.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
      || lower.startsWith(root),
  );
  // Also allow any drive letter path that isn't blocked (artist media drives)
  const driveOk = /^[a-z]:\\/i.test(resolved);
  if (!ok && !driveOk) {
    throw new Error('File path outside allowed roots');
  }
  return resolved;
}

function assertAllowedDownloadUrl(url, allowedHosts = []) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid download URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Download protocol not allowed');
  }
  if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('HTTP downloads only allowed for localhost');
  }
  // Reject URLs that embed credentials in the query (defense in depth)
  for (const key of parsed.searchParams.keys()) {
    if (/^(api[_-]?key|apiKey|password|token)$/i.test(key)) {
      throw new Error('Refusing download URL that embeds credentials in query string');
    }
  }
  const hosts = (allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean);
  if (hosts.length) {
    const host = parsed.hostname.toLowerCase();
    const ok = hosts.some((h) => host === h || host.endsWith(`.${h}`));
    if (!ok) {
      throw new Error(`Download host not allowed: ${host}`);
    }
  }
}

function downloadOnce(url, destPath, redirectsLeft = 5, allowedHosts = [], headers = null) {
  assertAllowedDownloadUrl(url, allowedHosts);

  const https = nodeRequire('https');
  const http = nodeRequire('http');
  const fs = nodeRequire('fs');
  const { URL } = nodeRequire('url');

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(destPath);

    const req = mod.get(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        headers: headers || {},
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(destPath); } catch { /* ignore */ }
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          // Don't forward auth headers to a different host
          let nextHeaders = headers;
          try {
            if (new URL(next).hostname !== parsed.hostname) nextHeaders = null;
          } catch { nextHeaders = null; }
          downloadOnce(next, destPath, redirectsLeft - 1, allowedHosts, nextHeaders).then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch { /* ignore */ }
          reject(new Error(`Download HTTP ${res.statusCode}`));
          return;
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      },
    );

    req.on('error', (err) => {
      try { file.close(); } catch { /* ignore */ }
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

export function safeDownloadName(name, fileType = '') {
  let base = String(name || 'ftrack').replace(/[^\w.\-()+]+/g, '_');
  const ext = fileType && !base.toLowerCase().endsWith(String(fileType).toLowerCase())
    ? fileType
    : '';
  if (!base) base = 'ftrack';
  return `${base}${ext}`;
}

/**
 * Download URL into OS temp `ftrack-ae/`.
 * Optional `headers` for header-auth downloads (no apiKey in URL).
 */
export async function downloadToTemp(url, filename, opts = {}) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const allowedHosts = opts.allowedHosts || [];
  const headers = opts.headers || null;

  const dir = getAeTempDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dest = path.join(dir, filename);
  if (fs.existsSync(dest)) {
    try { fs.unlinkSync(dest); } catch { /* ignore */ }
  }

  await downloadOnce(url, dest, 5, allowedHosts, headers);

  const stat = fs.statSync(dest);
  if (!stat.size) {
    throw new Error('Downloaded file is empty');
  }

  return dest;
}

/** Delete temp files older than maxAgeMs (default 1h). */
export function purgeAeTemp({ maxAgeMs = 60 * 60 * 1000 } = {}) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const dir = getAeTempDir();
  if (!fs.existsSync(dir)) return { removed: 0 };
  const now = Date.now();
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (now - st.mtimeMs > maxAgeMs) {
        fs.unlinkSync(full);
        removed += 1;
      }
    } catch { /* ignore */ }
  }
  return { removed };
}
