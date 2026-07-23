/**
 * Filename → shot/task parsing — mirrors CPFX ftrack_uploader.py parse_filename.
 * Does NOT create tasks; resolution stops at match/miss.
 */

const LOCATION_SUFFIXES = ['_PARK', '_REAL', '_STRANGE'];

/** Known department tokens → canonical task hint (uploader uses 'comp', 'ab', …). */
const TASK_TOKENS = [
  { re: /\bab\b/i, hint: 'ab' },
  { re: /\bcomp(?:osit(?:e|ing)?)?\b/i, hint: 'comp' },
  { re: /\broto(?:scope)?\b/i, hint: 'roto' },
  { re: /\bpaint\b/i, hint: 'paint' },
  { re: /\btrack(?:ing)?\b/i, hint: 'track' },
  { re: /\bfx\b/i, hint: 'fx' },
  { re: /\bcg\b/i, hint: 'cg' },
];

function stripLocationSuffix(shotName) {
  let name = String(shotName || '');
  for (const suffix of LOCATION_SUFFIXES) {
    if (name.toUpperCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
    // also mid-string like Python's "if suffix in shot_name" for refs
    if (name.toUpperCase().includes(suffix)) {
      name = name.replace(new RegExp(suffix, 'ig'), '');
      break;
    }
  }
  return name.replace(/_+$/, '');
}

/**
 * @returns {{
 *   shotName: string,
 *   taskHint: string,
 *   version: number,
 *   extension: string,
 *   isAb: boolean,
 *   isRef: boolean,
 * } | null}
 */
export function parsePublishFilename(filename) {
  const raw = String(filename || '').trim();
  if (!raw) return null;

  const isRef = /(_ref\.(mov|mp4)$|_REF_\d+\.(mov|mp4)$)/i.test(raw);
  const isAb = /_AB_v\d+\.(mov|mp4)$/i.test(raw);
  const extension = (raw.match(/\.([^.]+)$/) || [])[1] || '';
  const nameWithoutExt = raw.replace(/\.[^.]+$/, '');

  // Reference files → shot from stem, task hint comp, version 0
  if (isRef) {
    let shotName = nameWithoutExt.replace(/_ref$/i, '').replace(/_REF_\d+$/i, '');
    shotName = stripLocationSuffix(shotName);
    return {
      shotName,
      taskHint: 'comp',
      version: 0,
      extension,
      isAb: false,
      isRef: true,
    };
  }

  // Version: last _v### (optional _LT/_RT / trailing junk already stripped by cut)
  const versionMatches = [...nameWithoutExt.matchAll(/_[vV](\d+)(?:_[A-Z]+)?(?:_ref)?/g)];
  if (!versionMatches.length) return null;
  const last = versionMatches[versionMatches.length - 1];
  const version = parseInt(last[1], 10);
  const nameWithoutVersion = nameWithoutExt.slice(0, last.index);

  // Task token: prefer explicit dept word; Python requires 'comp' — we accept known tokens
  let taskHint = isAb ? 'ab' : '';
  let shotPart = nameWithoutVersion;

  // Split on 'comp' first (Python behavior) — case insensitive
  const compIdx = nameWithoutVersion.toLowerCase().lastIndexOf('comp');
  if (compIdx >= 0 && !isAb) {
    shotPart = nameWithoutVersion.slice(0, compIdx).replace(/_+$/, '');
    taskHint = 'comp';
  } else {
    // Fallback: other dept tokens as path segments
    const parts = nameWithoutVersion.split(/_+/).filter(Boolean);
    let tokenIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      const hit = TASK_TOKENS.find((t) => t.re.test(parts[i]));
      if (hit) {
        tokenIdx = i;
        taskHint = hit.hint;
        break;
      }
    }
    if (tokenIdx < 0) return null;
    shotPart = parts.slice(0, tokenIdx).join('_');
  }

  if (!shotPart) return null;
  const shotName = stripLocationSuffix(shotPart);
  if (!shotName) return null;

  return {
    shotName,
    taskHint: taskHint || 'comp',
    version,
    extension,
    isAb: !!isAb,
    isRef: false,
  };
}

/** Map uploader task hint → likely ftrack task name/type patterns. */
const TASK_HINT_PATTERNS = {
  comp: [/compos/i, /^comp$/i],
  ab: [/^ab$/i],
  roto: [/roto/i],
  paint: [/paint/i],
  track: [/track/i],
  fx: [/^fx$/i, /vfx/i, /effects/i],
  cg: [/^cg$/i],
};

/**
 * Pick best existing task under a shot for a parsed task hint.
 * @returns {object|null} task from fetchTasksForShot shape
 */
export function pickTaskForHint(tasks, taskHint) {
  const list = tasks || [];
  if (!list.length) return null;
  const hint = String(taskHint || 'comp').toLowerCase();
  const patterns = TASK_HINT_PATTERNS[hint] || [new RegExp(hint, 'i')];

  const score = (t) => {
    const name = t.name || '';
    const type = t.type || '';
    let s = 0;
    for (const re of patterns) {
      if (re.test(type)) s = Math.max(s, 100);
      if (re.test(name)) s = Math.max(s, 90);
    }
    // Python: name is 'comp' OR 'Compositing'
    if (hint === 'comp') {
      if (/^comp$/i.test(name)) s = Math.max(s, 95);
      if (/^compositing$/i.test(name) || /^compositing$/i.test(type)) s = Math.max(s, 100);
    }
    return s;
  };

  const ranked = list
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.t || null;
}

/**
 * Resolve one filename against a project (exact shot name, then task hint).
 * deps: { findShotsMatchingName, fetchTasksForShot }
 */
export async function resolvePublishFile(projectId, filename, deps) {
  const parsed = parsePublishFilename(filename);
  if (!parsed) {
    return {
      ok: false,
      error: `Can't parse "${filename}" (need …_comp_v###.mov style)`,
      parsed: null,
      shot: null,
      task: null,
    };
  }

  const shots = await deps.findShotsMatchingName(projectId, parsed.shotName);
  const exact = (shots || []).find(
    (s) => String(s.name).toLowerCase() === parsed.shotName.toLowerCase(),
  );
  const shot = exact || (shots?.length === 1 ? shots[0] : null);
  if (!shot) {
    return {
      ok: false,
      error: shots?.length
        ? `Ambiguous shot for "${parsed.shotName}"`
        : `No shot "${parsed.shotName}" in project`,
      parsed,
      shot: null,
      task: null,
      candidates: shots || [],
    };
  }

  const tasks = await deps.fetchTasksForShot(shot.id);
  const task = pickTaskForHint(tasks, parsed.taskHint);
  if (!task) {
    return {
      ok: false,
      error: `No "${parsed.taskHint}" task on ${shot.name}`,
      parsed,
      shot,
      task: null,
      tasks,
    };
  }

  return {
    ok: true,
    error: '',
    parsed,
    shot,
    task,
    tasks,
  };
}
