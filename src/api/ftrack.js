import { Session } from '@ftrack/api';

let _session = null;

export function createSession({ serverUrl, apiUser, apiKey }) {
  _session = new Session(
    serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`,
    apiUser,
    apiKey,
    { autoConnectEventHub: false }
  );
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
     where is_open is true
     order by created_at descending`
  );
  return result.data;
}

export async function fetchReviewShots(reviewSessionId) {
  const s = getSession();
  const result = await s.query(
    `select id, name, version.id, version.version,
            version.asset.parent.name,
            version.thumbnail_id,
            version.task.assignments.resource.first_name,
            version.status.name, version.status.color
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
            assignments.resource.first_name,
            thumbnail_id,
            assets.versions_count
     from Shot
     where project.id is "${projectId}"
     order by name ascending`
  );
  return result.data;
}

export async function fetchStatuses(objectTypeName = 'Shot') {
  const s = getSession();
  const result = await s.query(
    `select id, name, color
     from Status
     where schema.object_type.name is "${objectTypeName}"`
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
  return getSession().thumbnailUrl(thumbnailId, { size });
}

export async function getComponentUrl(componentId) {
  const s = getSession();
  const urls = await s.getComponentUrls([componentId]);
  return urls[componentId];
}
