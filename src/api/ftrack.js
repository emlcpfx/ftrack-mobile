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

export async function fetchReviews(projectId) {
  const s = getSession();
  if (projectId) {
    // Find reviews that contain versions belonging to this project
    const rsoResult = await s.query(
      `select review_session.id, review_session.name, review_session.created_at
       from ReviewSessionObject
       where asset_version.asset.parent.project.id is "${projectId}"
       order by review_session.created_at descending
       limit 200`
    );
    // Deduplicate by review session id
    const seen = new Set();
    const reviews = [];
    for (const rso of rsoResult.data) {
      const rs = rso.review_session;
      if (rs && !seen.has(rs.id)) {
        seen.add(rs.id);
        reviews.push({ id: rs.id, name: rs.name, created_at: rs.created_at });
      }
    }
    return reviews;
  }
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
            asset_version.asset.parent.id, asset_version.asset.parent.name,
            asset_version.task.id, asset_version.task.type.name,
            asset_version.task.status.id, asset_version.task.status.name, asset_version.task.status.color,
            asset_version.thumbnail_id,
            asset_version.status.name, asset_version.status.color,
            asset_version.user.first_name
     from ReviewSessionObject
     where review_session_id is "${reviewSessionId}"`
  );
  return result.data;
}

export async function fetchTaskStatusesByShots(shotIds) {
  if (shotIds.length === 0) return {};
  const s = getSession();
  const result = await s.query(
    `select parent_id, status.name, status.color, status.id
     from Task
     where parent_id in (${shotIds.map(id => `"${id}"`).join(',')})`
  );
  // Map shot ID → first task's status (most shots have one task)
  const byShot = {};
  for (const t of result.data) {
    if (!byShot[t.parent_id]) {
      byShot[t.parent_id] = {
        taskId: t.id,
        id: t.status?.id,
        name: t.status?.name || 'Unknown',
        color: t.status?.color || '',
      };
    }
  }
  return byShot;
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
    `select id, name, description, parent_id, type.name,
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
      description: task.description || '',
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

  // 2. Get all schemas under this project schema (Shot + all Task types)
  const schemas = await s.query(
    `select id, object_type_id from Schema where project_schema_id is "${psId}"`
  );
  if (schemas.data.length === 0) return [];

  // 3. Get valid status IDs from ALL schemas (not just Shot)
  const schemaIds = schemas.data.map(sc => sc.id);
  const ss = await s.query(
    `select status_id from SchemaStatus where schema_id in (${schemaIds.map(id => `"${id}"`).join(',')})`
  );
  const statusIds = [...new Set(ss.data.map(x => x.status_id).filter(Boolean))];
  if (statusIds.length === 0) return [];

  // 4. Fetch the actual Status entities
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

export async function fetchShotVersions(shotId, taskId) {
  const s = getSession();
  // If we have a task ID, query versions linked to that task
  // Otherwise fall back to versions under the shot's assets
  let query;
  if (taskId) {
    query = `select id, version, status.id, status.name, status.color,
            thumbnail_id, user.first_name, date, task_id
     from AssetVersion
     where task_id is "${taskId}"
     order by version descending`;
  } else {
    query = `select id, version, status.id, status.name, status.color,
            thumbnail_id, user.first_name, date, task_id
     from AssetVersion
     where asset.parent.id is "${shotId}"
     order by version descending`;
  }
  const result = await s.query(query);
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

export async function updateTaskStatus(taskId, statusId) {
  return getSession().update('Task', [taskId], { status_id: statusId });
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
            author.first_name, author.last_name, author.id,
            category.id, category.name,
            in_reply_to_id,
            note_components.component_id,
            note_components.url,
            note_components.thumbnail_url
     from Note
     where parent_id is "${parentId}"
     order by date ascending`
  );
  return result.data;
}

/** Create a reply to a note */
export async function createReply(parentNoteId, parentEntityId, parentEntityType, text, { categoryId } = {}) {
  const s = getSession();
  const noteData = {
    content: text,
    parent_id: parentEntityId,
    parent_type: parentEntityType,
    in_reply_to_id: parentNoteId,
    is_todo: false,
  };
  if (_userId) noteData.user_id = _userId;
  if (categoryId) noteData.category_id = categoryId;
  return s.create('Note', noteData);
}

export async function fetchNoteCounts(parentIds) {
  if (!parentIds.length) return {};
  const s = getSession();
  const result = await s.query(
    `select parent_id, id, content, date, frame_number,
            author.first_name, author.last_name,
            category.name
     from Note
     where parent_id in (${parentIds.map(id => `"${id}"`).join(',')})
     order by date ascending`
  );
  const byParent = {};
  for (const note of result.data) {
    if (!byParent[note.parent_id]) byParent[note.parent_id] = [];
    byParent[note.parent_id].push(note);
  }
  return byParent;
}

export async function deleteNote(noteId) {
  return getSession().delete('Note', [noteId]);
}

// ── Review Management ────────────────────────────────────────────────────────

/** Add an AssetVersion to a ReviewSession */
export async function addVersionToReview(reviewSessionId, versionId, sortOrder = 0) {
  const s = getSession();
  return s.create('ReviewSessionObject', {
    review_session_id: reviewSessionId,
    asset_version_id: versionId,
    name: '',
    version: 'auto',
    sort_order: sortOrder,
  });
}

/** Remove a ReviewSessionObject from a review */
export async function removeFromReview(reviewSessionObjectId) {
  return getSession().delete('ReviewSessionObject', [reviewSessionObjectId]);
}

/** Create a new ReviewSession */
export async function createReviewSession(name) {
  const s = getSession();
  return s.create('ReviewSession', { name });
}

/** Search for versions by shot name, optionally filtered by project */
export async function searchVersionsForReview(searchTerm, projectId) {
  const s = getSession();
  const projectFilter = projectId ? ` and asset.parent.project.id is "${projectId}"` : '';
  const result = await s.query(
    `select id, version, asset.parent.name, asset.parent.id,
            task.id, task.type.name,
            thumbnail_id, user.first_name,
            status.name, status.color
     from AssetVersion
     where asset.parent.name like "%${searchTerm}%"${projectFilter}
     order by asset.parent.name, version descending
     limit 50`
  );
  return result.data;
}

/** Fetch tasks by status name within a project (for Chat commands) */
export async function fetchTasksByStatus(projectId, statusName) {
  const s = getSession();
  const result = await s.query(
    `select id, name, parent.name, parent.id, type.name,
            status.id, status.name, status.color
     from Task
     where project.id is "${projectId}" and status.name is "${statusName}"
     limit 200`
  );
  return result.data;
}

/** Fetch latest version for a task (used to add task's version to review) */
export async function fetchLatestVersionForTask(taskId) {
  const s = getSession();
  const result = await s.query(
    `select id, version, thumbnail_id
     from AssetVersion
     where task.id is "${taskId}"
     order by version descending
     limit 1`
  );
  return result.data[0] || null;
}

/** Fetch latest version for a shot */
export async function fetchLatestVersionForShot(shotId) {
  const s = getSession();
  const result = await s.query(
    `select id, version, thumbnail_id
     from AssetVersion
     where asset.parent.id is "${shotId}"
     order by version descending
     limit 1`
  );
  return result.data[0] || null;
}

/** Transfer notes from one entity to another (copy notes from review version to task) */
export async function transferNotes(sourceId, targetId, targetType) {
  const s = getSession();
  // Fetch all notes from source
  const notes = await s.query(
    `select id, content, frame_number, category_id
     from Note
     where parent_id is "${sourceId}"
     order by date ascending`
  );
  let count = 0;
  for (const note of notes.data) {
    const noteData = {
      content: note.content,
      parent_id: targetId,
      parent_type: targetType,
      is_todo: true,
    };
    if (_userId) noteData.user_id = _userId;
    if (note.frame_number != null) noteData.frame_number = note.frame_number;
    if (note.category_id) noteData.category_id = note.category_id;
    await s.create('Note', noteData);
    count++;
  }
  return count;
}

/** Transfer notes with edited content (notes pre-fetched and possibly modified by user) */
export async function transferEditedNotes(notes, targetId, targetType) {
  const s = getSession();
  let count = 0;
  for (const note of notes) {
    if (!note.content || !note.content.trim()) continue;
    const noteData = {
      content: note.content,
      parent_id: targetId,
      parent_type: targetType,
      is_todo: true,
    };
    if (_userId) noteData.user_id = _userId;
    if (note.frame_number != null) noteData.frame_number = note.frame_number;
    if (note.category_id) noteData.category_id = note.category_id;
    await s.create('Note', noteData);
    count++;
  }
  return count;
}

/** Search reviews by name */
export async function searchReviews(searchTerm) {
  const s = getSession();
  const result = await s.query(
    `select id, name, created_at
     from ReviewSession
     where name like "%${searchTerm}%"
     order by created_at descending
     limit 20`
  );
  return result.data;
}

/** Fetch review session thumbnail previews (first 4 RSO thumbnails) */
export async function fetchReviewThumbnails(reviewSessionIds) {
  if (!reviewSessionIds.length) return {};
  const s = getSession();
  const result = await s.query(
    `select review_session_id, asset_version.thumbnail_id
     from ReviewSessionObject
     where review_session_id in (${reviewSessionIds.map(id => `"${id}"`).join(',')})
     order by sort_order ascending`
  );
  const byReview = {};
  for (const rso of result.data) {
    const rsId = rso.review_session_id;
    if (!byReview[rsId]) byReview[rsId] = [];
    const thumbId = rso.asset_version?.thumbnail_id;
    if (thumbId && byReview[rsId].length < 4) {
      byReview[rsId].push(getThumbnailUrl(thumbId));
    }
  }
  return byReview;
}

/** Get the shareable review URL for a review session */
export function getReviewUrl(reviewSessionId) {
  if (!_session) return null;
  const serverUrl = _session.serverUrl.replace(/\/+$/, '');
  return `${serverUrl}/#slideEntityId=${reviewSessionId}&slideEntityType=reviewsession&view=review_session`;
}

/** Bulk update version statuses */
export async function bulkUpdateVersionStatus(versionIds, statusId) {
  const s = getSession();
  return Promise.all(versionIds.map(id => s.update('AssetVersion', [id], { status_id: statusId })));
}

/** Bulk update task statuses */
export async function bulkUpdateTaskStatus(taskIds, statusId) {
  const s = getSession();
  return Promise.all(taskIds.map(id => s.update('Task', [id], { status_id: statusId })));
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
