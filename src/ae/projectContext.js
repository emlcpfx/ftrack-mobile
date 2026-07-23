/**
 * Resolve ftrack project from AE .aep / comp naming (e.g. LLL_* → LLL project).
 */

import { isAePanel, getActiveComp, getProjectName } from './bridge.js';
import { extractShowCode, pickProjectFromAe } from './match.js';

export async function getAeNameHints() {
  if (!isAePanel()) {
    return { projectName: '', compName: '', showCode: '' };
  }
  const [proj, comp] = await Promise.all([
    getProjectName().catch(() => null),
    getActiveComp().catch(() => null),
  ]);
  const projectName = proj?.ok ? proj.name : '';
  const compName = comp?.ok ? comp.name : '';
  const showCode =
    extractShowCode(projectName) || extractShowCode(compName) || '';
  return { projectName, compName, showCode };
}

/** Persist so AE / Shots / Reviews stay on the same project. */
export function persistSharedProjectId(id) {
  if (!id) return;
  try {
    sessionStorage.setItem('ftrack_ae_project', id);
    sessionStorage.setItem('ftrack_shots_project', id);
    sessionStorage.setItem('ftrack_reviews_project', id);
  } catch { /* ignore */ }
}

/**
 * @returns {{ project: object|null, score: number, hints: object }}
 */
export async function resolveAeProject(projects) {
  const hints = await getAeNameHints();
  const hit = pickProjectFromAe(projects, hints);
  return {
    project: hit?.project || null,
    score: hit?.score || 0,
    hints,
  };
}
