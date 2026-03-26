import { Session } from '@ftrack/api';

let _session = null;

export async function loginWithPassword({ serverUrl, username, password }) {
  const url = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`;
  const res = await fetch(`${url}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'credentials', username, password }),
  });
  if (!res.ok) throw new Error('Invalid username or password');
  const data = await res.json();
  if (!data.api_key) throw new Error('Login failed — no API key returned');
  return { apiUser: data.username || username, apiKey: data.api_key };
}

export async function createSession({ serverUrl, apiUser, apiKey }) {
  const url = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`;
  _session = new Session(url, apiUser, apiKey, { autoConnectEventHub: false });
  await _session.initializing;
  return _session;
}

export function getSession() {
  if (!_session) throw new Error('No active ftrack session');
  return _session;
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function fetchReviews() {
  const s = getSession();
  const result = await s.query(
    `select id, name, created_at
     from ReviewSession
     order by created_at descending
     limit 50`
  );
  return result.data;
}

export async function fetchReviewShots(reviewSessionId) {
  const s = getSession();
  const result = await s.query(
    `select id, name, sort,
            version.id, version.version,
            version.asset.parent.name,
            version.thumbnail_id,
            version.status.name, version.status.color,
            version.user.first_name
     from ReviewSessionObject
     where review_session_id is "${reviewSessionId}"
     order by sort ascending`
  );
  return result.data;
}

// ── Shots ─────────────────────────────────────────────────────────────────────

export async function fetchProjects() {
  const s = getSession();
  const result = await s.query(
    `select id, name, full_name
     from Project
     where status is active
     order by name ascending`
  );
  return result.data;
}

export async function fetchShots(projectId) {
  const s = getSession();
  const result = await s.query(
    `select id, name,
            status.id, status.name, status.color,
            thumbnail_id
     from Shot
     where project.id is "${projectId}"
     order by name ascending
     limit 200`
  );
  return result.data;
}

export async function fetchStatuses() {
  const s = getSession();
  const result = await s.query(
    `select id, name, color
     from Status
     order by sort ascending`
  );
  return result.data;
}

// ── Versions & Components ─────────────────────────────────────────────────────

export async function fetchVersionComponents(versionId) {
  const s = getSession();
  const result = await s.query(
    `select id, name, file_type
     from Component
     where version_id is "${versionId}"`
  );
  return result.data;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function updateShotStatus(shotId, statusId) {
  return getSession().update('Shot', [shotId], { status_id: statusId });
}

export async function bulkUpdateStatus(shotIds, statusId) {
  return Promise.all(
    shotIds.map(id => getSession().update('Shot', [id], { status_id: statusId }))
  );
}

export async function updateVersionStatus(versionId, statusId) {
  return getSession().update('AssetVersion', [versionId], { status_id: statusId });
}

export async function createNote(parentId, parentType, text) {
  return getSession().create('Note', {
    content: text,
    parent_id: parentId,
    parent_type: parentType,
  });
}

export async function fetchNotes(parentId) {
  const s = getSession();
  const result = await s.query(
    `select id, content, date,
            author.first_name, author.last_name
     from Note
     where parent_id is "${parentId}"
     order by date ascending`
  );
  return result.data;
}

// ── Media ─────────────────────────────────────────────────────────────────────

export function getThumbnailUrl(thumbnailId, size = 160) {
  if (!thumbnailId) return null;
  const s = getSession();
  if (typeof s.thumbnailUrl === 'function') {
    return s.thumbnailUrl(thumbnailId, { size });
  }
  return `${s.serverUrl}/component/thumbnail?id=${thumbnailId}&size=${size}`;
}

export async function getComponentUrl(componentId) {
  if (!componentId) return null;
  const s = getSession();
  try {
    const urls = await s.getComponentUrls([componentId]);
    return urls[componentId] || null;
  } catch {
    return `${s.serverUrl}/component/get?id=${componentId}`;
  }
}
