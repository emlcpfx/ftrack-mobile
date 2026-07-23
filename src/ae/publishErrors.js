/**
 * Normalize ftrack / network / CEP errors into short UI strings.
 */

export function formatPublishError(err, context = '') {
  const raw = err?.message || err?.error || err?.content || String(err || 'Unknown error');
  let msg = String(raw)
    .replace(/^Operation \d+ failed:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  if (/Cannot set relationship to string value/i.test(msg)) {
    msg = 'ftrack rejected a link (shot/task/asset). Rematch and try again.';
  } else if (/No attribute ['"]?parent_id['"]?.*Asset/i.test(msg)) {
    msg = 'Asset parent link failed (server schema).';
  } else if (/permission|forbidden|not allowed|403|unauthorized|401/i.test(msg)) {
    msg = 'Permission denied — check your ftrack role for publishing.';
  } else if (/unique|already exists|duplicate|IntegrityError/i.test(msg)) {
    msg = 'Version or asset already exists — bump the version in the filename.';
  } else if (/Failed to fetch|NetworkError|ECONNREFUSED|ENOTFOUND|timeout|CORS/i.test(msg)) {
    msg = 'Network error talking to ftrack — check VPN / server URL.';
  } else if (/No AssetType/i.test(msg)) {
    msg = 'No Upload asset type on this ftrack server.';
  } else if (/Shot not found/i.test(msg)) {
    msg = 'Matched shot disappeared — rematch and retry.';
  } else if (/createComponent|component/i.test(msg) && /fail|error|reject/i.test(msg)) {
    msg = `Upload failed: ${msg}`;
  }

  // Cap length for panel UI
  if (msg.length > 220) msg = `${msg.slice(0, 217)}…`;

  return context ? `${context}: ${msg}` : msg;
}

export function isEmptyOrTinyFile(file) {
  if (!file) return true;
  const size = file._aeSize ?? file.size;
  if (typeof size === 'number' && size <= 0) return true;
  return false;
}

/** Soft warn threshold — browser XHR path still loads into memory. */
export const LARGE_FILE_BYTES = 1500 * 1024 * 1024; // ~1.5 GB

export function isLargeFile(file) {
  const size = file?._aeSize ?? file?.size;
  return !!(file && typeof size === 'number' && size >= LARGE_FILE_BYTES);
}
