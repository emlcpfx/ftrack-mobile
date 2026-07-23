/**
 * After Effects CEP bridge.
 * Only active when running inside Adobe CEP (window.__adobe_cep__).
 */

import { downloadToTemp, safeDownloadName } from './download.js';

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
 * Download an ftrack component URL to temp, then import into AE.
 * @param {string} url - authenticated component URL from getComponentUrl
 * @param {{ name?: string, fileType?: string, intoActiveComp?: boolean }} opts
 */
export async function downloadAndImport(url, opts = {}) {
  if (!isAePanel()) throw new Error('Not in After Effects panel');
  if (!url) throw new Error('No download URL');

  const filename = safeDownloadName(
    opts.name || 'ftrack_media',
    opts.fileType || '',
  );
  const path = await downloadToTemp(url, filename);
  const result = await importFootage(path, {
    intoActiveComp: opts.intoActiveComp !== false,
    folderName: opts.folderName || 'ftrack',
  });
  return { ...result, path };
}
