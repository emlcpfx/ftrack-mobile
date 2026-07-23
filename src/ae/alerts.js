/**
 * AE in-panel alerts via ftrack API poll (no Web Push).
 * Badge = assigned tasks in "needs artist action" statuses that aren't dismissed.
 */

import {
  fetchTasksAssignedToUser,
  getCurrentUserId,
} from '../api/ftrack.js';

const DISMISSED_KEY = 'ftrack_ae_alert_dismissed';
const STATUSES_KEY = 'ftrack_ae_alert_statuses';

/** Statuses that mean "come back and work" (QC Ready → Fix, etc.) */
export const DEFAULT_AE_ALERT_STATUSES = [
  'Fix',
  'Fixes',
  'Pending Fix',
  'Pending Fixes',
  'Changes Needed',
  'Change Requests',
  'Change Request',
  'Retake',
  'Rejected',
  'CBB',
];

export function getAeAlertStatusNames() {
  try {
    const raw = localStorage.getItem(STATUSES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_AE_ALERT_STATUSES;
}

export function setAeAlertStatusNames(names) {
  localStorage.setItem(STATUSES_KEY, JSON.stringify(names));
}

export function isAttentionStatus(statusName, watchList = getAeAlertStatusNames()) {
  const n = String(statusName || '').trim().toLowerCase();
  if (!n) return false;
  if (watchList.some((s) => String(s).trim().toLowerCase() === n)) return true;
  if (/\bfix(es)?\b/.test(n)) return true;
  if (/changes?\s*needed/.test(n)) return true;
  if (/retake/.test(n)) return true;
  return false;
}

function loadDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveDismissed(map) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
}

/** Dismiss a task alert until its status changes again. */
export function dismissAeAlert(taskId, statusId) {
  const map = loadDismissed();
  map[taskId] = statusId || true;
  saveDismissed(map);
}

export function dismissAllAeAlerts(tasks) {
  const map = loadDismissed();
  for (const t of tasks) {
    map[t.id] = t.status?.id || true;
  }
  saveDismissed(map);
}

function isDismissed(task, dismissed) {
  const d = dismissed[task.id];
  if (d == null) return false;
  // Re-alert if status changed since dismiss
  if (d === true) return true;
  return d === task.status?.id;
}

function normalizeTask(t) {
  return {
    id: t.id,
    name: t.name,
    type: t.type?.name || t.name || '',
    shotId: t.parent?.id || null,
    shotName: t.parent?.name || '',
    status: {
      id: t.status?.id,
      name: t.status?.name || 'Unknown',
      color: t.status?.color || '',
    },
    projectId: t.project?.id || null,
    projectName: t.project?.name || '',
  };
}

/**
 * Fetch attention alerts for the logged-in user.
 * @returns {{ alerts: array, count: number }}
 */
export async function fetchAeAlerts({ projectId } = {}) {
  const userId = getCurrentUserId();
  if (!userId) return { alerts: [], count: 0 };

  const tasks = await fetchTasksAssignedToUser(userId, { projectId: projectId || undefined });
  const watch = getAeAlertStatusNames();
  const dismissed = loadDismissed();

  const alerts = tasks
    .map(normalizeTask)
    .filter((t) => isAttentionStatus(t.status.name, watch))
    .filter((t) => !isDismissed(t, dismissed))
    .sort((a, b) =>
      String(a.shotName).localeCompare(String(b.shotName)) ||
      String(a.type).localeCompare(String(b.type)),
    );

  return { alerts, count: alerts.length };
}
