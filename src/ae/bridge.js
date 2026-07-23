/**
 * After Effects CEP bridge.
 * Only active when running inside Adobe CEP (window.__adobe_cep__).
 */

import { downloadToTemp, safeDownloadName } from './download.js';
import {
  getUploaderScriptPath,
  getPythonCmd,
} from './uploaderConfig.js';

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
 * Download an ftrack component URL to temp, then import into AE.
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

/**
 * Launch the CPFX ftrack_uploader.py with the given absolute file paths.
 * Fire-and-forget (detached) — the Tk GUI owns the rest.
 */
export function launchFtrackUploader(filePaths, opts = {}) {
  if (!isAePanel()) {
    return Promise.reject(new Error('Not in After Effects panel'));
  }
  const paths = (filePaths || []).filter(Boolean);
  if (!paths.length) {
    return Promise.reject(new Error('No files to upload'));
  }

  const scriptPath = opts.scriptPath || getUploaderScriptPath();
  const pythonCmd = opts.pythonCmd || getPythonCmd();

  const fs = nodeRequire('fs');
  const { spawn } = nodeRequire('child_process');

  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return Promise.reject(
      new Error(`Uploader script not found:\n${scriptPath}`),
    );
  }

  for (const p of paths) {
    if (!fs.existsSync(p)) {
      return Promise.reject(new Error(`File not found: ${p}`));
    }
  }

  try {
    const child = spawn(pythonCmd, [scriptPath, ...paths], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return Promise.resolve({
      ok: true,
      count: paths.length,
      scriptPath,
      pythonCmd,
    });
  } catch (e) {
    return Promise.reject(
      new Error(
        `Failed to launch Python (${pythonCmd}): ${e.message || e}. ` +
          'Set the Python command in Publish settings if needed.',
      ),
    );
  }
}

/** Read a local path into a browser File (for CEP Node → createComponent). */
export async function fileFromPath(filePath) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  // Blob/File available in CEP Chromium
  return new File([buf], name);
}
