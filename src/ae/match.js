/**
 * Heuristics for matching AE comp names → ftrack shot names,
 * and AE project/comp prefixes → ftrack projects.
 */

export function normalizeShotToken(name) {
  let s = String(name || '')
    .trim()
    .replace(/\.(aep|aepx)$/i, '');
  // Strip trailing dept / version tokens repeatedly: FOO_comp_v002 → FOO
  const trail =
    /[_\s.-]+(comp|precomp|pre-comp|compositing|main|master|work|wip|roto|paint|track|fx|cg|ab)[_\s.-]*$/i;
  const ver = /[_\s.-]*v\d+[_\s.-]*$/i;
  for (let i = 0; i < 6; i++) {
    const next = s.replace(trail, '').replace(ver, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, '_').toLowerCase();
}

/** Show/job code from AE filename or comp: LLL_FA_070 → "lll" */
export function extractShowCode(name) {
  const raw = String(name || '')
    .trim()
    .replace(/\.(aep|aepx)$/i, '');
  if (!raw) return '';
  const first = raw.split(/[_\-.\s]+/).filter(Boolean)[0] || '';
  if (/^(comp|precomp|main|master|untitled|new|project)$/i.test(first)) return '';
  return first.toLowerCase();
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
  if (cn.includes(sn) || sn.includes(cn)) return 55;

  // Require ≥2 shared tokens (avoid every LLL_* scoring 60)
  const ct = cn.split(/[_\-.]+/).filter(Boolean);
  const st = sn.split(/[_\-.]+/).filter(Boolean);
  let shared = 0;
  for (let i = 0; i < Math.min(ct.length, st.length); i++) {
    if (ct[i] === st[i]) shared++;
    else break;
  }
  if (shared >= 3) return 65;
  if (shared >= 2 && ct.length >= 2 && st.length >= 2) return 50;

  return 0;
}

export function rankShotMatches(compName, shots) {
  const ranked = (shots || [])
    .map((shot) => ({ shot, score: scoreShotMatch(compName, shot.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.shot.name.localeCompare(b.shot.name));

  if (!ranked.length) return ranked;
  const top = ranked[0].score;
  // Drop weak near-misses that only share show code
  return ranked.filter((x) => x.score >= 70 || x.score >= top - 10);
}

export function searchTokenFromComp(compName) {
  const raw = String(compName || '').trim();
  const norm = normalizeShotToken(raw);
  const token = (norm || raw).split(/[_\-.]+/).filter(Boolean)[0];
  return token || raw;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score ftrack project against AE .aep name + active comp name.
 * hints: { projectName, compName }
 */
export function scoreProjectMatch(hints, project) {
  const candidates = [hints?.projectName, hints?.compName].filter(Boolean);
  if (!candidates.length || !project) return 0;

  const codes = [
    ...new Set(candidates.map(extractShowCode).filter((c) => c.length >= 2)),
  ];
  const labels = [project.name, project.full_name].filter(Boolean);
  let best = 0;

  for (const label of labels) {
    const ln = label.toLowerCase();
    const pCode = extractShowCode(label);

    for (const code of codes) {
      if (pCode === code || ln === code) best = Math.max(best, 100);
      if (
        ln.startsWith(`${code} `) ||
        ln.startsWith(`${code}_`) ||
        ln.startsWith(`${code}-`)
      ) {
        best = Math.max(best, 95);
      }
      if (new RegExp(`(^|[\\s_\\-./])${escapeReg(code)}([\\s_\\-./]|$)`, 'i').test(label)) {
        best = Math.max(best, 90);
      }
      if (code.length >= 3 && ln.includes(code)) best = Math.max(best, 75);
    }

    for (const hint of candidates) {
      const h = String(hint).toLowerCase().replace(/\.(aep|aepx)$/i, '');
      if (h === ln) best = Math.max(best, 100);
      if (h.startsWith(`${ln}_`) || h.startsWith(`${ln}-`) || h.startsWith(`${ln} `)) {
        best = Math.max(best, 92);
      }
      if (ln.length >= 3 && h.includes(ln)) best = Math.max(best, 70);
    }
  }

  return best;
}

/** Best ftrack project for AE context, or null if confidence < 70. */
export function pickProjectFromAe(projects, hints) {
  const ranked = (projects || [])
    .map((project) => ({ project, score: scoreProjectMatch(hints, project) }))
    .filter((x) => x.score >= 70)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.project.name || '').localeCompare(String(b.project.name || '')),
    );
  return ranked[0] || null;
}
