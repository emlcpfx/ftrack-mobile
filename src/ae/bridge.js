/**
 * After Effects CEP bridge.
 * Only active when running inside Adobe CEP (window.__adobe_cep__).
 */

import { downloadToTemp, safeDownloadName, assertSafeLocalPath, purgeAeTemp } from './download.js';
import { getAeComponentDownload, getAllowedDownloadHosts } from '../api/ftrack.js';

export function isAePanel() {
  return typeof window !== 'undefined' && !!window.__adobe_cep__;
}

let _csi = null;
let _ready = null;

/** Load CSInterface.js and resolve when usable. No-op outside CEP. */
export function initAeBridge() {
  if (!isAePanel()) return Promise.resolve(null);
  if (_ready) return _ready;

  _ready = new Promise((resolve, reject) => {
    const done = () => {
      try {
        // eslint-disable-next-line no-undef
        _csi = new CSInterface();
        document.documentElement.classList.add('ae-panel');
        document.body?.classList.add('ae-panel');
        resolve(_csi);
      } catch (e) {
        reject(e);
      }
    };

    // eslint-disable-next-line no-undef
    if (typeof CSInterface !== 'undefined') {
      done();
      return;
    }

    const s = document.createElement('script');
    s.src = `${import.meta.env.BASE_URL}ae/CSInterface.js`;
    s.onload = done;
    s.onerror = () => reject(new Error('Failed to load CSInterface.js'));
    document.head.appendChild(s);
  });

  return _ready;
}

function csi() {
  return _csi;
}

function nodeRequire(name) {
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    return window.require(name);
  }
  if (typeof require === 'function') {
    return require(name);
  }
  throw new Error('Node require unavailable — enable CEP Node.js in manifest');
}

export function evalExtendScript(expression) {
  const cs = csi();
  if (!cs) return Promise.reject(new Error('AE bridge not initialized'));
  return new Promise((resolve) => {
    cs.evalScript(expression, (result) => {
      if (!result || result === 'EvalScript error.') {
        resolve({ ok: false, error: result || 'EvalScript error' });
        return;
      }
      try {
        resolve(JSON.parse(result));
      } catch {
        resolve({ ok: true, raw: result });
      }
    });
  });
}

export function getActiveComp() {
  return evalExtendScript('getActiveCompInfo()');
}

export function getProjectName() {
  return evalExtendScript('getProjectName()');
}

export function getSelectedFootagePaths() {
  return evalExtendScript('getSelectedFootagePaths()');
}

export function pickMediaFiles() {
  return evalExtendScript('pickMediaFiles()');
}

/**
 * Import a local file into AE (optionally as a layer in the active comp).
 */
export function importFootage(filePath, { intoActiveComp = true, folderName = 'ftrack' } = {}) {
  const args = [
    JSON.stringify(filePath),
    intoActiveComp ? 'true' : 'false',
    JSON.stringify(folderName),
  ].join(', ');
  return evalExtendScript(`importFootageToComp(${args})`);
}

/**
 * Download an ftrack component (signed URL or header-auth) then import into AE.
 * Never uses apiKey-in-query URLs.
 */
export async function downloadComponentAndImport(componentId, opts = {}) {
  if (!isAePanel()) throw new Error('Not in After Effects panel');
  if (!componentId) throw new Error('No component id');

  try { purgeAeTemp({ maxAgeMs: 60 * 60 * 1000 }); } catch { /* ignore */ }

  const plan = await getAeComponentDownload(componentId);
  const filename = safeDownloadName(
    opts.name || 'ftrack_media',
    opts.fileType || '',
  );
  const path = await downloadToTemp(plan.url, filename, {
    allowedHosts: opts.allowedHosts || getAllowedDownloadHosts(),
    headers: plan.headers || null,
  });
  try {
    const result = await importFootage(path, {
      intoActiveComp: opts.intoActiveComp !== false,
      folderName: opts.folderName || 'ftrack',
    });
    return { ...result, path, downloadMode: plan.mode };
  } finally {
    if (!opts.keepTemp) {
      try {
        const fs = nodeRequire('fs');
        if (fs.existsSync(path)) fs.unlinkSync(path);
      } catch { /* ignore */ }
    }
  }
}

/**
 * Download an ftrack component URL to temp, then import into AE.
 * Prefer downloadComponentAndImport — this path rejects credentialed query URLs.
 */
export async function downloadAndImport(url, opts = {}) {
  if (!isAePanel()) throw new Error('Not in After Effects panel');
  if (!url) throw new Error('No download URL');

  const filename = safeDownloadName(
    opts.name || 'ftrack_media',
    opts.fileType || '',
  );
  const path = await downloadToTemp(url, filename, {
    allowedHosts: opts.allowedHosts || [],
    headers: opts.headers || null,
  });
  try {
    const result = await importFootage(path, {
      intoActiveComp: opts.intoActiveComp !== false,
      folderName: opts.folderName || 'ftrack',
    });
    return { ...result, path };
  } finally {
    if (!opts.keepTemp) {
      try {
        const fs = nodeRequire('fs');
        if (fs.existsSync(path)) fs.unlinkSync(path);
      } catch {
        /* temp cleanup best-effort */
      }
    }
  }
}

/** Read a local path into a browser File stub (keeps disk path — bytes loaded at publish time). */
export async function fileFromPath(filePath) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const resolved = assertSafeLocalPath(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  const name = path.basename(resolved);
  const file = new File([new Uint8Array(0)], name, {
    type: 'application/octet-stream',
    lastModified: stat.mtimeMs || Date.now(),
  });
  try {
    Object.defineProperty(file, 'size', { value: stat.size, configurable: true });
  } catch {
    /* some environments seal size */
  }
  file._aePath = resolved;
  file.path = resolved;
  file._aeSize = stat.size;
  return file;
}
