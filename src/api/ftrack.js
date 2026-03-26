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
    `select id, name, description,
            status.id, status.name, status.color,
            thumbnail_id
     from Shot
     where project.id is "${projectId}"
     order by name ascending
     limit 200`
  );
  return result.data;
}

export async function fetchProjectTasks(projectId) {
  const s = getSession();
  const result = await s.query(
    `select id, name, parent_id, type.name,
            status.id, status.name, status.color,
            assignments.resource.id, assignments.resource.first_name
     from Task
     where project.id is "${projectId}"`
  );
  // Group tasks by parent shot ID
  const byShot = {};
  for (const task of result.data) {
    const shotId = task.parent_id;
    if (!shotId) continue;
    if (!byShot[shotId]) byShot[shotId] = [];
    const assignees = (task.assignments || [])
      .map(a => a.resource?.first_name)
      .filter(Boolean);
    byShot[shotId].push({
      id: task.id,
      name: task.name,
      type: task.type?.name || '',
      status: {
        id: task.status?.id,
        name: task.status?.name || 'Unknown',
        color: task.status?.color || '',
      },
      assignee: assignees.join(', '),
      assigneeIds: (task.assignments || []).map(a => a.resource?.id).filter(Boolean),
    });
  }
  return byShot;
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
  // 1. Get the project's schema ID
  const proj = await s.query(
    `select project_schema.id from Project where id is "${projectId}"`
  );
  const psId = proj.data[0]?.project_schema?.id;
  if (!psId) return [];

  // 2. Get the Shot ObjectType ID
  const ot = await s.query('select id from ObjectType where name is "Shot"');
  const shotTypeId = ot.data[0]?.id;
  if (!shotTypeId) return [];

  // 3. Find the Shot schema under this project schema
  const schemas = await s.query(
    `select id, object_type_id from Schema where project_schema_id is "${psId}"`
  );
  const shotSchema = schemas.data.find(sc => sc.object_type_id === shotTypeId);
  if (!shotSchema) return [];

  // 4. Get valid status IDs from SchemaStatus
  const ss = await s.query(
    `select status_id from SchemaStatus where schema_id is "${shotSchema.id}"`
  );
  const statusIds = ss.data.map(x => x.status_id).filter(Boolean);
  if (statusIds.length === 0) return [];

  // 5. Fetch the actual Status entities
  const statuses = await s.query(
    `select id, name, color from Status where id in (${statusIds.map(id => `"${id}"`).join(',')})`
  );
  return statuses.data;
}

// ── Users & Assignments ──────────────────────────────────────────────────────

export async function fetchProjectMembers() {
  const s = getSession();
  const result = await s.query(
    `select id, first_name, last_name, username
     from User where is_active is true`
  );
  // Filter out service accounts
  return result.data.filter(u =>
    u.username && !u.username.startsWith('__')
  );
}

export async function assignUserToShots(shotIds, userId) {
  const s = getSession();
  const tasks = await s.query(
    `select id from Task where parent_id in (${shotIds.map(id => `"${id}"`).join(',')})`
  );
  for (const task of tasks.data) {
    const existing = await s.query(
      `select id from Appointment where context_id is "${task.id}" and resource_id is "${userId}"`
    );
    if (existing.data.length === 0) {
      await s.create('Appointment', {
        context_id: task.id,
        resource_id: userId,
        type: 'assignment',
      });
    }
  }
}

export async function unassignUserFromShots(shotIds, userId) {
  const s = getSession();
  const tasks = await s.query(
    `select id from Task where parent_id in (${shotIds.map(id => `"${id}"`).join(',')})`
  );
  for (const task of tasks.data) {
    const existing = await s.query(
      `select id from Appointment where context_id is "${task.id}" and resource_id is "${userId}"`
    );
    for (const appt of existing.data) {
      await s.delete('Appointment', [appt.id]);
    }
  }
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
