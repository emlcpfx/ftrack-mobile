/**
 * Heuristics for matching AE comp names → ftrack shot names.
 */

export function normalizeShotToken(name) {
  return String(name || '')
    .trim()
    .replace(/\.(aep|aepx)$/i, '')
    .replace(/[_\s.-]*(comp|precomp|pre-comp|main|master|work|wip)[_\s.-]*$/i, '')
    .replace(/[_\s.-]*v\d+[_\s.-]*$/i, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/** Score 0–100 how well *compName* matches *shotName*. */
export function scoreShotMatch(compName, shotName) {
  const c = String(compName || '').trim();
  const s = String(shotName || '').trim();
  if (!c || !s) return 0;
  if (c === s) return 100;
  if (c.toLowerCase() === s.toLowerCase()) return 95;

  const cn = normalizeShotToken(c);
  const sn = normalizeShotToken(s);
  if (!cn || !sn) return 0;
  if (cn === sn) return 90;
  if (cn.startsWith(sn + '_') || sn.startsWith(cn + '_')) return 75;
  if (cn.startsWith(sn) || sn.startsWith(cn)) return 70;
  if (cn.includes(sn) || sn.includes(cn)) return 50;

  // Shared first token (e.g. SH010_comp vs SH010_plate)
  const ct = cn.split(/[_\-.]+/)[0];
  const st = sn.split(/[_\-.]+/)[0];
  if (ct && st && ct === st && ct.length >= 3) return 60;

  return 0;
}

export function rankShotMatches(compName, shots) {
  return (shots || [])
    .map((shot) => ({ shot, score: scoreShotMatch(compName, shot.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.shot.name.localeCompare(b.shot.name));
}

/** First path segment useful for LIKE queries. */
export function searchTokenFromComp(compName) {
  const raw = String(compName || '').trim();
  const norm = normalizeShotToken(raw);
  const token = (norm || raw).split(/[_\-.]+/).filter(Boolean)[0];
  return token || raw;
}
