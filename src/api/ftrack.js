import { Session } from '@ftrack/api';

let _session = null;
let _userId = null;

export async function loginWithPassword({ serverUrl, username, password }) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverUrl, username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid username or password');
  if (!data.api_key) throw new Error('Login failed — no API key returned');
  return { apiUser: data.username || username, apiKey: data.api_key };
}

export async function createSession({ serverUrl, apiUser, apiKey }) {
  const url = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`;
  _session = new Session(url, apiUser, apiKey, { autoConnectEventHub: false });
  await _session.initializing;
  // Resolve and cache the current user's ID for note authorship etc.
  const me = await _session.query(`select id from User where username is "${apiUser}"`);
  _userId = me.data[0]?.id || null;
  return _session;
}

export function getCurrentUserId() {
  return _userId;
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
    `select id, name, sort_order,
            asset_version.id, asset_version.version,
            asset_version.asset.parent.name,
            asset_version.thumbnail_id,
            asset_version.status.name, asset_version.status.color,
            asset_version.user.first_name
     from ReviewSessionObject
     where review_session_id is "${reviewSessionId}"`
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
     from Status`
  );
  return result.data;
}

// ── Versions & Components ─────────────────────────────────────────────────────

export async function fetchShotVersions(shotId) {
  const s = getSession();
  const result = await s.query(
    `select id, version, status.id, status.name, status.color,
            thumbnail_id, user.first_name, date
     from AssetVersion
     where asset.parent.id is "${shotId}"
     order by version descending`
  );
  return result.data;
}

export async function fetchVersionComponents(versionId) {
  const s = getSession();
  const result = await s.query(
    `select id, name, file_type
     from Component
     where version.id is "${versionId}"`
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

export async function createNote(parentId, parentType, text, annotationBlob) {
  const s = getSession();
  const noteData = {
    content: text,
    parent_id: parentId,
    parent_type: parentType,
  };
  if (_userId) noteData.user_id = _userId;
  const result = await s.create('Note', noteData);
  const noteId = result?.data?.id;

  // If there's an annotation image, upload it and attach to the note
  if (annotationBlob && noteId) {
    try {
      const file = new File([annotationBlob], 'annotation.png', { type: 'image/png' });
      const [componentResult] = await s.createComponent(file);
      if (componentResult?.data?.id) {
        await s.create('NoteComponent', {
          note_id: noteId,
          component_id: componentResult.data.id,
        });
      }
    } catch (err) {
      console.warn('Failed to attach annotation image:', err);
    }
  }

  return result;
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

export function getComponentUrl(componentId) {
  if (!componentId) return null;
  const s = getSession();
  return s.getComponentUrl(componentId);
}
