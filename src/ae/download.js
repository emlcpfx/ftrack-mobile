/**
 * Download helpers for Adobe CEP (Node mixed-context).
 * Bypasses browser CORS by using Node http(s).
 */

function nodeRequire(name) {
  // CEP with --enable-nodejs --mixed-context
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    return window.require(name);
  }
  if (typeof require === 'function') {
    return require(name);
  }
  throw new Error('Node require unavailable — enable CEP Node.js in manifest');
}

function downloadOnce(url, destPath, redirectsLeft = 5) {
  const https = nodeRequire('https');
  const http = nodeRequire('http');
  const fs = nodeRequire('fs');

  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const req = mod.get(url, (res) => {
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
        downloadOnce(next, destPath, redirectsLeft - 1).then(resolve, reject);
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
    });

    req.on('error', (err) => {
      try { file.close(); } catch { /* ignore */ }
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

/** Sanitize a filename for the OS temp dir. */
export function safeDownloadName(name, fileType = '') {
  let base = String(name || 'ftrack').replace(/[^\w.\-()+]+/g, '_');
  const ext = fileType && !base.toLowerCase().endsWith(String(fileType).toLowerCase())
    ? fileType
    : '';
  if (!base) base = 'ftrack';
  return `${base}${ext}`;
}

/**
 * Download *url* into OS temp `ftrack-ae/` and return absolute path.
 */
export async function downloadToTemp(url, filename) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const os = nodeRequire('os');

  const dir = path.join(os.tmpdir(), 'ftrack-ae');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dest = path.join(dir, filename);
  // Overwrite stale copies
  if (fs.existsSync(dest)) {
    try { fs.unlinkSync(dest); } catch { /* ignore */ }
  }

  await downloadOnce(url, dest);

  const stat = fs.statSync(dest);
  if (!stat.size) {
    throw new Error('Downloaded file is empty');
  }

  return dest;
}
