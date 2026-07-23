/**
 * Paths / commands for launching the CPFX right-click ftrack uploader.
 */

const SCRIPT_KEY = 'ftrack_ae_uploader_script';
const PYTHON_KEY = 'ftrack_ae_uploader_python';

export const DEFAULT_UPLOADER_SCRIPT =
  'D:\\Work\\Dropbox\\Documents_DB\\Work_DB\\CPFX_Tools\\Scripts\\FTrack\\right-click-upload\\ftrack_uploader.py';

export function getUploaderScriptPath() {
  try {
    return localStorage.getItem(SCRIPT_KEY) || DEFAULT_UPLOADER_SCRIPT;
  } catch {
    return DEFAULT_UPLOADER_SCRIPT;
  }
}

export function setUploaderScriptPath(path) {
  localStorage.setItem(SCRIPT_KEY, String(path || '').trim());
}

export function getPythonCmd() {
  try {
    return localStorage.getItem(PYTHON_KEY) || 'python';
  } catch {
    return 'python';
  }
}

export function setPythonCmd(cmd) {
  localStorage.setItem(PYTHON_KEY, String(cmd || '').trim() || 'python');
}
