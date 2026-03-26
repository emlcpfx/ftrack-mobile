import { Session } from '@ftrack/api';

let _session = null;
let _userId = null;

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

export async function fetchShotStatuses(projectId) {
  const s = getSession();
  const result = await s.query(
    `select status.id, status.name, status.color
     from SchemaStatus
     where schema.object_type.name is "Shot"
     and schema.project_schema.project_id is "${projectId}"`
  );
  // Extract the nested status objects and deduplicate
  const seen = new Set();
  return result.data
    .map(ss => ss.status)
    .filter(st => st && !seen.has(st.id) && seen.add(st.id));
}

// ── Users & Assignments ──────────────────────────────────────────────────────

export async function fetchProjectMembers(projectId) {
  const s = getSession();
  const result = await s.query(
    `select resource.id, resource.first_name, resource.last_name, resource.username
     from Appointment
     where context_id is "${projectId}"`
  );
  const seen = new Set();
  return result.data
    .map(a => a.resource)
    .filter(u => u && !seen.has(u.id) && seen.add(u.id));
}

export async function assignUserToShot(shotId, userId) {
  const s = getSession();
  // Check if assignment already exists
  const existing = await s.query(
    `select id from Appointment
     where context_id is "${shotId}"
     and resource_id is "${userId}"`
  );
  if (existing.data.length > 0) return existing.data[0];
  return s.create('Appointment', {
    context_id: shotId,
    resource_id: userId,
    type: 'assignment',
  });
}

export async function bulkAssignUser(shotIds, userId) {
  return Promise.all(shotIds.map(id => assignUserToShot(id, userId)));
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

export async function createNote(parentId, parentType, text, { frameNumber, annotationBlob, categoryId } = {}) {
  const s = getSession();
  const noteData = {
    content: text,
    parent_id: parentId,
    parent_type: parentType,
    is_todo: true,
  };
  if (_userId) noteData.user_id = _userId;
  if (frameNumber != null) noteData.frame_number = frameNumber;
  if (categoryId) noteData.category_id = categoryId;
  const result = await s.create('Note', noteData);
  const noteId = result?.data?.id;

  // If there's an annotation image, upload it and attach to the note
  if (annotationBlob && noteId) {
    try {
      const fileName = `Annotated frame ${frameNumber ?? 0}.jpg`;
      const file = new File([annotationBlob], fileName, { type: 'image/jpeg' });
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

export async function fetchNoteCategories() {
  const s = getSession();
  const result = await s.query('select id, name from NoteCategory');
  return result.data;
}

export async function fetchNotes(parentId) {
  const s = getSession();
  const result = await s.query(
    `select id, content, date, frame_number,
            author.first_name, author.last_name,
            note_components.component_id,
            note_components.url,
            note_components.thumbnail_url
     from Note
     where parent_id is "${parentId}"
     order by date ascending`
  );
  return result.data;
}

export async function deleteNote(noteId) {
  return getSession().delete('Note', [noteId]);
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

/** Returns a same-origin proxied URL for a component (avoids CORS for video) */
export function getProxiedComponentUrl(componentId) {
  const directUrl = getComponentUrl(componentId);
  if (!directUrl) return null;
  return `/api/proxy?url=${encodeURIComponent(directUrl)}`;
}
