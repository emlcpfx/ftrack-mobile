import { Session } from '@ftrack/api';

let _session = null;
let _userId = null;
let _creds = null; // { serverUrl, apiUser, apiKey } for CEP Python upload

export async function createSession({ serverUrl, apiUser, apiKey }) {
  const url = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`;
  _session = new Session(url, apiUser, apiKey, { autoConnectEventHub: false });
  await _session.initializing;
  _creds = { serverUrl: url, apiUser, apiKey };
  // Resolve and cache the current user's ID for note authorship etc.
  const me = await _session.query(`select id from User where username is "${apiUser}"`);
  _userId = me.data[0]?.id || null;
  return _session;
}

export function getCurrentUserId() {
  return _userId;
}

export function getSessionCreds() {
  return _creds;
}

export function getSession() {
  if (!_session) throw new Error('No active ftrack session');
  return _session;
}

/**
 * Publish a File/Blob (or CEP disk path) to a task as a new AssetVersion.
 * In AE panel, path-based uploads use Python encode_media (same as right-click uploader).
 */
export async function publishFileToTask({
  taskId,
  shotId,
  file,
  filePath: filePathArg,
  assetName,
  version: forcedVersion,
  setTaskStatusId,
  onProgress,
} = {}) {
  if (!taskId || !shotId) throw new Error('Need a matched shot and task to publish');
  if (!file && !filePathArg) throw new Error('No file to publish');
  if (file && typeof file.size === 'number' && file.size <= 0 && !filePathArg && !file._aePath && !file.path) {
    throw new Error('File is empty (0 bytes)');
  }

  const s = getSession();
  if (!s) throw new Error('Not logged in to ftrack');

  const report = (pct, phase = 'upload', msg) => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ percent: Math.max(0, Math.min(100, Math.round(pct))), phase, msg });
      } catch {
        /* ignore UI callback errors */
      }
    }
  };

  const diskPath = filePathArg || file?._aePath || file?.path || null;
  const baseName = assetName
    || String(file?.name || diskPath || 'upload')
      .split(/[/\\]/)
      .pop()
      .replace(/\.[^.]+$/, '')
      .replace(/_v\d+(?:_[LR]T)?$/i, '');

  try {
    report(0, 'prepare');

    // Asset type
    let typeResult = await s.query(`select id, name from AssetType where name is "Upload"`);
    let assetType = typeResult.data[0];
    if (!assetType) {
      typeResult = await s.query(`select id, name from AssetType limit 1`);
      assetType = typeResult.data[0];
    }
    if (!assetType) throw new Error('No AssetType found on this ftrack server');

    // Asset uses parent relationship (no parent_id). Pass real entities.
    let asset = (
      await s.query(
        `select id, name from Asset
         where parent.id is "${shotId}" and name is "${escapeFql(baseName)}"
         limit 1`,
      )
    ).data[0];

    if (!asset) {
      const shot = (
        await s.query(`select id, name from Shot where id is "${shotId}" limit 1`)
      ).data[0];
      if (!shot) throw new Error('Shot not found for publish');

      const created = await s.create('Asset', {
        name: baseName,
        type: assetType,
        parent: shot,
      });
      asset = created?.data ?? created;
    }
    if (!asset?.id) throw new Error('Failed to create Asset');

    let nextVersion = forcedVersion;
    if (nextVersion == null || Number.isNaN(Number(nextVersion))) {
      const latest = await s.query(
        `select version from AssetVersion
         where asset.id is "${asset.id}"
         order by version descending
         limit 1`,
      );
      nextVersion = (latest.data[0]?.version || 0) + 1;
    } else {
      nextVersion = Number(nextVersion);
      // If that version already exists on this asset+task, fail clearly
      const existing = await s.query(
        `select id, version from AssetVersion
         where asset.id is "${asset.id}" and version is ${nextVersion}
         limit 1`,
      );
      if (existing.data[0]) {
        throw new Error(
          `v${nextVersion} already exists on asset "${baseName}" — rename / bump version`,
        );
      }
    }

    const verResult = await s.create('AssetVersion', {
      asset_id: asset.id,
      task_id: taskId,
      version: nextVersion,
    });
    const versionId = verResult?.data?.id ?? verResult?.id;
    if (!versionId) throw new Error('Failed to create AssetVersion');

    let componentId = null;
    let viaPython = false;
    try {
      // CEP + disk path → Python encode_media (streams; matches right-click uploader speed)
      const usePython = !!(diskPath && _creds && typeof window !== 'undefined' && window.__adobe_cep__);
      if (usePython) {
        viaPython = true;
        report(5, 'upload', 'Streaming via Python…');
        const { encodeMediaViaPython } = await import('../ae/pythonEncode.js');
        const result = await encodeMediaViaPython({
          server: _creds.serverUrl,
          user: _creds.apiUser,
          apiKey: _creds.apiKey,
          versionId,
          filePath: diskPath,
          componentName: baseName,
          onProgress: ({ percent, phase, msg }) => report(percent, phase, msg),
        });
        componentId = result.componentId || null;
        report(100, 'encode');
      } else {
        let uploadFile = file;
        // Stub from path (size override, empty bytes) — load from disk for XHR fallback
        if (diskPath && typeof window !== 'undefined' && window.require) {
          const needsBytes = !uploadFile || uploadFile.size === 0 || uploadFile._aePath;
          if (needsBytes) {
            const fs = window.require('fs');
            const path = window.require('path');
            const buf = fs.readFileSync(diskPath);
            uploadFile = new File([buf], path.basename(diskPath));
          }
        }
        if (!uploadFile || uploadFile.size <= 0) {
          throw new Error('No file data to upload');
        }
        report(0, 'upload');
        const componentResults = await s.createComponent(uploadFile, {
          name: uploadFile.name || `${baseName}.mov`,
          data: { version_id: versionId },
          onProgress: (pct) => report(pct, 'upload'),
        });
        const compResult = Array.isArray(componentResults)
          ? componentResults[0]
          : componentResults;
        componentId = compResult?.data?.id ?? compResult?.id ?? null;
        if (!componentId) {
          throw new Error('createComponent returned no component id');
        }
        report(100, 'upload');

        try {
          report(100, 'encode');
          await s.call([
            {
              action: 'encode_media',
              component_id: componentId,
              version_id: versionId,
              keep_original: true,
            },
          ]);
        } catch (err) {
          console.warn('[publish] encode_media skipped:', err);
        }
      }
    } catch (uploadErr) {
      // Best-effort cleanup so we don't leave empty versions
      try {
        await s.delete('AssetVersion', [versionId]);
      } catch (cleanupErr) {
        console.warn('[publish] orphan version cleanup failed:', cleanupErr);
      }
      throw new Error(
        `File upload failed: ${uploadErr?.message || uploadErr}`,
      );
    }

    let statusApplied = null;
    let statusWarning = null;
    if (setTaskStatusId) {
      try {
        await s.update('Task', [taskId], { status_id: setTaskStatusId });
        statusApplied = setTaskStatusId;
      } catch (err) {
        statusWarning = err?.message || String(err);
        console.warn('[publish] status update failed:', err);
      }
    }

    return {
      versionId,
      version: nextVersion,
      componentId,
      assetId: asset.id,
      assetName: baseName,
      statusApplied,
      statusWarning,
      viaPython,
    };
  } catch (err) {
    // Re-throw with filename context when possible
    const label = file?.name || diskPath;
    const name = label ? ` (${label})` : '';
    const msg = err?.message || String(err);
    if (label && msg.includes(label)) throw err;
    const e = new Error(`${msg}${name}`);
    e.cause = err;
    throw e;
  }
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

function escapeFql(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Exact + fuzzy shot lookup for AE comp matching. */
export async function findShotsMatchingName(projectId, name) {
  const s = getSession();
  const escaped = escapeFql(name);
  const exact = await s.query(
    `select id, name, description,
            status.id, status.name, status.color,
            thumbnail_id
     from Shot
     where project.id is "${projectId}" and name is "${escaped}"
     limit 10`
  );
  if (exact.data.length) return exact.data;

  // First token LIKE (SH010_comp → SH010)
  const token = String(name || '')
    .trim()
    .replace(/\.(aep|aepx)$/i, '')
    .split(/[_\s.-]+/)
    .filter(Boolean)[0] || name;
  const like = await s.query(
    `select id, name, description,
            status.id, status.name, status.color,
            thumbnail_id
     from Shot
     where project.id is "${projectId}" and name like "%${escapeFql(token)}%"
     order by name ascending
     limit 40`
  );
  return like.data;
}

/** Tasks under a single shot. */
export async function fetchTasksForShot(shotId) {
  const s = getSession();
  const result = await s.query(
    `select id, name, type.name,
            status.id, status.name, status.color,
            assignments.resource.id, assignments.resource.first_name,
            assignments.resource.last_name, assignments.resource.username
     from Task
     where parent_id is "${shotId}"`
  );
  return result.data.map((task) => {
    const assignees = (task.assignments || []).map((a) => a.resource).filter(Boolean);
    return {
      id: task.id,
      name: task.name,
      type: task.type?.name || '',
      status: {
        id: task.status?.id,
        name: task.status?.name || 'Unknown',
        color: task.status?.color || '',
      },
      assignee: assignees.map((r) => r.first_name).filter(Boolean).join(', '),
      assigneeIds: assignees.map((r) => r.id).filter(Boolean),
    };
  });
}

/** Replace task assignments with a single user (or clear if userId is null). */
export async function setTaskAssignee(taskId, userId) {
  const s = getSession();
  const existing = await s.query(
    `select id, resource_id from Appointment
     where context_id is "${taskId}" and type is "assignment"`
  );
  for (const appt of existing.data) {
    if (!userId || appt.resource_id !== userId) {
      await s.delete('Appointment', [appt.id]);
    }
  }
  if (userId && !existing.data.some((a) => a.resource_id === userId)) {
    await s.create('Appointment', {
      context_id: taskId,
      resource_id: userId,
      type: 'assignment',
    });
  }
}

/**
 * Pick a component for AE import.
 * mode: 'original' | 'proxy'
 * Original NEVER falls back to review proxy — buttons must stay honest.
 */
export function pickAeImportComponent(components, mode = 'original') {
  if (!components?.length) return null;

  const isReview = (c) =>
    c.name === 'ftrackreview-mp4' ||
    c.name === 'ftrackreview-webm' ||
    c.name === 'ftrackreview-image' ||
    (c.name && String(c.name).startsWith('ftrackreview'));

  if (mode === 'proxy') {
    return (
      components.find((c) => c.name === 'ftrackreview-mp4') ||
      components.find(isReview) ||
      components.find((c) => c.file_type === '.mp4') ||
      components.find((c) => c.file_type === '.mov') ||
      null
    );
  }

  const originals = components.filter((c) => !isReview(c));
  const preferExt = [
    '.mov', '.mp4', '.mxf', '.avi', '.mkv',
    '.exr', '.dpx', '.jpg', '.jpeg', '.png', '.tif', '.tiff',
  ];
  for (const ext of preferExt) {
    const hit = originals.find(
      (c) => String(c.file_type || '').toLowerCase() === ext,
    );
    if (hit) return hit;
  }
  return originals[0] || null;
}

/** Assign user to task without removing existing assignees. */
export async function assignUserToTask(taskId, userId) {
  if (!taskId || !userId) return;
  const s = getSession();
  const existing = await s.query(
    `select id from Appointment
     where context_id is "${taskId}" and resource_id is "${userId}" and type is "assignment"`
  );
  if (existing.data.length === 0) {
    await s.create('Appointment', {
      context_id: taskId,
      resource_id: userId,
      type: 'assignment',
    });
  }
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

// Fetch custom attribute configurations for Task entities
export async function fetchCustomAttributeConfigs() {
  const s = getSession();
  const result = await s.query(
    `select id, key, label, type.name, entity_type, config
     from CustomAttributeConfiguration
     where entity_type is "task" or entity_type is "show"`
  );
  return result.data;
}

// Fetch custom attribute values for a set of entity IDs
export async function fetchCustomAttributeValues(entityIds) {
  if (!entityIds.length) return {};
  const s = getSession();
  // Query in batches to avoid URL length limits
  const batchSize = 50;
  const byEntity = {};
  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);
    const idList = batch.map(id => `"${id}"`).join(', ');
    const result = await s.query(
      `select value, configuration.key, configuration.label, entity_id
       from CustomAttributeValue
       where entity_id in (${idList})`
    );
    for (const row of result.data) {
      const eid = row.entity_id;
      if (!byEntity[eid]) byEntity[eid] = {};
      byEntity[eid][row.configuration?.key || row.configuration?.label] = row.value;
    }
  }
  return byEntity;
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
    `select id, object_type_id, object_type.name from Schema where project_schema_id is "${psId}"`
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

/**
 * Task types enabled on this project's schema (Roto, Comp, etc.).
 * Falls back to all Type rows if schema introspection fails.
 */
export async function fetchTaskTypes(projectId) {
  const s = getSession();
  const exclude = new Set([
    'Shot', 'Sequence', 'Episode', 'Folder', 'Project',
    'AssetBuild', 'Asset Version', 'AssetVersion', 'Asset',
  ]);

  if (projectId) {
    try {
      const proj = await s.query(
        `select project_schema.id from Project where id is "${projectId}"`,
      );
      const psId = proj.data[0]?.project_schema?.id;
      if (psId) {
        const schemas = await s.query(
          `select type.id, type.name, object_type.name
           from Schema where project_schema_id is "${psId}"`,
        );
        const seen = new Set();
        const types = [];
        for (const sc of schemas.data) {
          const id = sc.type?.id;
          const name = sc.type?.name;
          if (!id || !name || seen.has(id)) continue;
          if (exclude.has(sc.object_type?.name)) continue;
          seen.add(id);
          types.push({ id, name });
        }
        if (types.length) {
          types.sort((a, b) => a.name.localeCompare(b.name));
          return types;
        }
      }
    } catch (err) {
      console.warn('[fetchTaskTypes] schema lookup failed:', err);
    }
  }

  const all = await s.query(`select id, name from Type order by name`);
  return (all.data || [])
    .filter((t) => t.id && t.name)
    .map((t) => ({ id: t.id, name: t.name }));
}

/** Create a task under a shot (admin workflow). */
export async function createTaskOnShot({
  shotId,
  projectId,
  typeId,
  name,
  statusId,
} = {}) {
  if (!shotId) throw new Error('Need a shot to create a task');
  if (!typeId) throw new Error('Pick a task type');

  const s = getSession();

  let typeName = name;
  if (!typeName) {
    const t = await s.query(`select name from Type where id is "${typeId}"`);
    typeName = t.data[0]?.name || 'Task';
  }

  let sid = statusId;
  if (!sid && projectId) {
    const statuses = await fetchTaskStatuses(projectId);
    const preferred =
      statuses.find((st) => /not started|ready to start|awaiting|pending|todo/i.test(st.name))
      || statuses[0];
    sid = preferred?.id;
  }
  if (!sid) {
    const statuses = await s.query(`select id, name from Status limit 50`);
    const preferred =
      statuses.data.find((st) => /not started|ready|pending|todo/i.test(st.name))
      || statuses.data[0];
    sid = preferred?.id;
  }
  if (!sid) throw new Error('No status available for new tasks');

  const result = await s.create('Task', {
    name: typeName,
    type_id: typeId,
    parent_id: shotId,
    status_id: sid,
  });
  const task = result.data;
  if (!task?.id) throw new Error('Task create returned no id');

  return {
    id: task.id,
    name: task.name || typeName,
    type: typeName,
    status: {
      id: sid,
      name: task.status?.name || 'Unknown',
      color: task.status?.color || '',
    },
    assignee: '',
    assigneeIds: [],
  };
}

/** Look up a Status by exact name, then fuzzy QC Ready variants. */
export async function findStatusByName(names = ['QC Ready']) {
  const s = getSession();
  const wanted = (Array.isArray(names) ? names : [names]).filter(Boolean);
  for (const name of wanted) {
    const exact = await s.query(
      `select id, name, color from Status where name is "${escapeFql(name)}" limit 1`,
    );
    if (exact.data[0]) return exact.data[0];
  }
  // Fuzzy: any status matching /qc\s*ready/i
  const all = await s.query(`select id, name, color from Status`);
  const hit = (all.data || []).find((st) => /qc\s*ready/i.test(st.name || ''));
  return hit || null;
}

/** Statuses valid for Task schemas only (excludes Shot-only statuses). */
export async function fetchTaskStatuses(projectId) {
  const s = getSession();
  const proj = await s.query(
    `select project_schema.id from Project where id is "${projectId}"`
  );
  const psId = proj.data[0]?.project_schema?.id;
  if (!psId) return [];

  const schemas = await s.query(
    `select id, object_type.name from Schema where project_schema_id is "${psId}"`
  );
  const exclude = new Set([
    'Shot', 'Sequence', 'Episode', 'Folder', 'Project',
    'AssetBuild', 'Asset Version', 'AssetVersion', 'Asset',
  ]);
  const schemaIds = schemas.data
    .filter((sc) => !exclude.has(sc.object_type?.name))
    .map((sc) => sc.id);
  if (!schemaIds.length) return fetchShotStatuses(projectId);

  const ss = await s.query(
    `select status_id from SchemaStatus where schema_id in (${schemaIds.map((id) => `"${id}"`).join(',')})`
  );
  const statusIds = [...new Set(ss.data.map((x) => x.status_id).filter(Boolean))];
  if (!statusIds.length) return [];

  const statuses = await s.query(
    `select id, name, color from Status where id in (${statusIds.map((id) => `"${id}"`).join(',')})`
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

export async function createNote(parentId, parentType, text, { frameNumber, annotationBlob, categoryId, isTodo = true } = {}) {
  const s = getSession();
  const noteData = {
    content: text,
    parent_id: parentId,
    parent_type: parentType,
    is_todo: !!isTodo,
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

/**
 * Tasks assigned to a user (via Appointment).
 * Optional projectId scopes to one project.
 */
export async function fetchTasksAssignedToUser(userId, { projectId } = {}) {
  if (!userId) return [];
  const s = getSession();
  const appts = await s.query(
    `select context_id from Appointment
     where resource_id is "${userId}" and type is "assignment"
     limit 400`
  );
  const ids = [...new Set(appts.data.map((a) => a.context_id).filter(Boolean))];
  if (!ids.length) return [];

  const tasks = [];
  const projectFilter = projectId ? ` and project.id is "${projectId}"` : '';
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const idList = batch.map((id) => `"${id}"`).join(', ');
    const result = await s.query(
      `select id, name, type.name,
              parent.id, parent.name,
              status.id, status.name, status.color,
              project.id, project.name
       from Task
       where id in (${idList})${projectFilter}`
    );
    tasks.push(...result.data);
  }
  return tasks;
}

/** Fetch latest version for a task (used to add task's version to review) */
export async function fetchLatestVersionForTask(taskId) {
  const s = getSession();
  const result = await s.query(
    `select id, version, thumbnail_id
     from AssetVersion
     where task_id is "${taskId}"
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

// ── Clean & Sort Review ───────────────────────────────────────────────────────

const STATUSES_TO_REMOVE = [
  'Fix',
  'Editorial Review',
  'Needs Upload',
  'Omit',
  'Omit Prod',
  'Completed',
  'Approved for DI',
];

export async function cleanAndSortReview(reviewSessionId) {
  const s = getSession();

  const result = await s.query(
    `select id, asset_version.asset.name, asset_version.task.status.name
     from ReviewSessionObject
     where review_session_id is "${reviewSessionId}"`
  );

  const allItems = result.data;
  const toRemove = allItems.filter(item =>
    !item.asset_version ||
    STATUSES_TO_REMOVE.includes(item.asset_version?.task?.status?.name)
  );

  for (const item of toRemove) {
    await s.delete('ReviewSessionObject', [item.id]);
  }

  const remaining = await s.query(
    `select id, asset_version.asset.name
     from ReviewSessionObject
     where review_session_id is "${reviewSessionId}"`
  );

  const sorted = [...remaining.data].sort((a, b) => {
    const nameA = (a.asset_version?.asset?.name || '').toLowerCase();
    const nameB = (b.asset_version?.asset?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  for (let i = 0; i < sorted.length; i++) {
    await s.update('ReviewSessionObject', [sorted[i].id], { sort_order: i });
  }

  return { removed: toRemove.length, remaining: sorted.length };
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

/**
 * URL suitable for <video src>.
 * - Web (Vercel): same-origin /api/proxy to avoid CORS
 * - CEP / file / localhost: direct ftrack URL (includes apiKey query params)
 */
export function getPlayableComponentUrl(componentId) {
  const directUrl = getComponentUrl(componentId);
  if (!directUrl) return null;

  try {
    if (typeof window !== 'undefined') {
      if (window.__adobe_cep__) return directUrl;
      if (window.location?.protocol === 'file:') return directUrl;
      const host = window.location?.hostname || '';
      if (host === 'localhost' || host === '127.0.0.1') return directUrl;
    }
  } catch {
    return directUrl;
  }

  const base = String(import.meta.env.VITE_APP_URL || '').replace(/\/+$/, '');
  return `${base}/api/proxy?url=${encodeURIComponent(directUrl)}`;
}

/** @deprecated use getPlayableComponentUrl */
export function getProxiedComponentUrl(componentId) {
  return getPlayableComponentUrl(componentId);
}
