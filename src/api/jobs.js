/**
 * Poll ftrack Job until terminal state (encode_media, etc.).
 */

import { getSession } from './ftrack.js';

const DONE = new Set(['done', 'completed', 'success', 'finished', 'ok']);
const FAIL = new Set(['failed', 'error', 'cancelled', 'canceled', 'aborted']);

function normalizeStatus(job) {
  return String(job?.status || job?.state || '').toLowerCase();
}

export async function fetchJob(jobId) {
  if (!jobId) return null;
  const s = getSession();
  const result = await s.query(
    `select id, status, type, created_at, finished_at, data
     from Job where id is "${String(jobId).replace(/"/g, '\\"')}" limit 1`,
  );
  return result.data[0] || null;
}

/**
 * @returns {{ ok: boolean, job: object|null, timedOut?: boolean }}
 */
export async function waitForJob(jobId, {
  timeoutMs = 10 * 60 * 1000,
  intervalMs = 2000,
  onTick,
} = {}) {
  if (!jobId) return { ok: true, job: null };
  const start = Date.now();
  let job = null;
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    job = await fetchJob(jobId);
    const status = normalizeStatus(job);
    onTick?.(job, status);
    if (DONE.has(status)) return { ok: true, job };
    if (FAIL.has(status)) {
      const err = new Error(`Encode job ${status}`);
      err.job = job;
      throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, job, timedOut: true };
}

/** Extract job id from encode_media call response shapes. */
export function jobIdFromCallResult(results) {
  const row = Array.isArray(results) ? results[0] : results;
  return (
    row?.data?.id ||
    row?.data?.job_id ||
    row?.job_id ||
    row?.id ||
    null
  );
}
