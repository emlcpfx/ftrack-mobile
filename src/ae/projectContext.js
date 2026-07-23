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

/** Persist so AE / Shots / Reviews / Chat stay on the same project. */
export function persistSharedProjectId(id) {
  if (!id) return;
  try {
    sessionStorage.setItem('ftrack_ae_project', id);
    sessionStorage.setItem('ftrack_shots_project', id);
    sessionStorage.setItem('ftrack_reviews_project', id);
    sessionStorage.setItem('ftrack_chat_project', id);
  } catch { /* ignore */ }
}

/** Read shared project id (any surface). */
export function getSharedProjectId() {
  try {
    return (
      sessionStorage.getItem('ftrack_ae_project')
      || sessionStorage.getItem('ftrack_shots_project')
      || sessionStorage.getItem('ftrack_chat_project')
      || sessionStorage.getItem('ftrack_reviews_project')
      || ''
    );
  } catch {
    return '';
  }
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
