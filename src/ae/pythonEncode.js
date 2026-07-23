/**
 * Stream local files to ftrack via Python encode_media (same path as right-click uploader).
 * CEP Node only — Chromium XHR createComponent is far slower for the same bytes.
 */

import { getPythonCmd } from './uploaderConfig.js';
import { isAePanel } from './bridge.js';

function nodeRequire(name) {
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    return window.require(name);
  }
  throw new Error('Node require unavailable');
}

/** Absolute path to ae-panel/python/encode_media.py */
export function getEncodeMediaScriptPath() {
  const path = nodeRequire('path');
  const fs = nodeRequire('fs');

  // CEP extension root (parent of www/)
  try {
    // eslint-disable-next-line no-undef
    if (typeof CSInterface !== 'undefined') {
      // eslint-disable-next-line no-undef
      const cs = new CSInterface();
      // eslint-disable-next-line no-undef
      const ext = cs.getSystemPath(SystemPath.EXTENSION);
      const candidate = path.join(ext, 'python', 'encode_media.py');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    /* fall through */
  }

  // Dev / odd layouts
  const fallbacks = [
    path.join(process.cwd(), 'ae-panel', 'python', 'encode_media.py'),
    path.join(process.cwd(), 'python', 'encode_media.py'),
  ];
  for (const p of fallbacks) {
    if (fs.existsSync(p)) return p;
  }
  return fallbacks[0];
}

/**
 * Upload *filePath* onto an existing AssetVersion using Python ftrack_api.encode_media.
 * onProgress({ percent, phase, msg })
 */
export function encodeMediaViaPython({
  server,
  user,
  apiKey,
  versionId,
  filePath,
  componentName,
  onProgress,
} = {}) {
  if (!isAePanel()) {
    return Promise.reject(new Error('Python encode path only available in AE panel'));
  }

  const { spawn } = nodeRequire('child_process');
  const fs = nodeRequire('fs');
  const script = getEncodeMediaScriptPath();
  if (!fs.existsSync(script)) {
    return Promise.reject(new Error(`encode_media.py not found at ${script}`));
  }

  const payload = JSON.stringify({
    server,
    user,
    apiKey,
    versionId,
    filePath,
    componentName,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(getPythonCmd(), [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let last = null;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          last = msg;
          if (typeof onProgress === 'function' && msg.percent != null) {
            onProgress({
              percent: msg.percent,
              phase: msg.phase || 'upload',
              msg: msg.msg,
            });
          }
        } catch {
          /* ignore non-JSON */
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      reject(new Error(
        `Failed to start Python (${getPythonCmd()}): ${err.message}. `
        + 'Set the Python command in Publish settings if needed.',
      ));
    });

    child.on('close', (code) => {
      // flush trailing line
      if (stdout.trim()) {
        try {
          last = JSON.parse(stdout.trim());
        } catch {
          /* ignore */
        }
      }
      if (last?.ok) {
        resolve(last);
        return;
      }
      const errMsg = last?.error
        || stderr.trim()
        || `Python encode_media exited ${code}`;
      reject(new Error(errMsg));
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
