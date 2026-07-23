import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchProjects,
  findShotsMatchingName,
  fetchTasksForShot,
  fetchShotStatuses,
  fetchLatestVersionForTask,
  fetchLatestVersionForShot,
  fetchVersionComponents,
  fetchNotes,
  createNote,
  updateTaskStatus,
  getComponentUrl,
  getThumbnailUrl,
  pickAeImportComponent,
  fetchProjectMembers,
  setTaskAssignee,
  getCurrentUserId,
} from '../api/ftrack';
import {
  isAePanel,
  getActiveComp,
  downloadAndImport,
} from './bridge.js';
import { rankShotMatches } from './match.js';
import {
  resolveAeProject,
  persistSharedProjectId,
} from './projectContext.js';

const normalizeColor = (c) => {
  if (!c) return '#6b7280';
  if (c.startsWith('#')) return c;
  if (/^[0-9a-fA-F]{3,8}$/.test(c)) return `#${c}`;
  return c;
};

const memberLabel = (u) => {
  if (!u) return 'Unknown';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
  return name || u.username || 'Unknown';
};

const aeCss = `
  .ae-ws { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; }
  .ae-ws-scroll {
    flex:1; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;
    padding-bottom:88px; min-height:0;
  }
  .ae-ws-scroll::-webkit-scrollbar { width:6px; }
  .ae-ws-scroll::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }

  .ae-bar {
    display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    padding:10px 14px; background:var(--surface); border-bottom:1px solid var(--border);
    flex-shrink:0; position:relative; z-index:20;
  }
  .ae-bar-label { font-size:10px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:var(--muted); }
  .ae-bar-comp { font-size:13px; font-weight:600; color:var(--text); max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Custom selects — native <select> is broken in CEP Chromium */
  .ae-select { position:relative; min-width:0; }
  .ae-select-trigger {
    width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px;
    background:var(--card); border:1px solid var(--border); color:var(--text);
    border-radius:8px; padding:8px 10px; font-size:12px; font-family:inherit;
    cursor:pointer; text-align:left;
  }
  .ae-select-trigger:disabled { opacity:.45; cursor:default; }
  .ae-select-caret { color:var(--muted); font-size:10px; flex-shrink:0; }
  .ae-select-menu {
    position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:50;
    background:var(--surface); border:1px solid var(--border); border-radius:8px;
    max-height:220px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,.45);
  }
  .ae-select-menu button {
    display:block; width:100%; text-align:left; background:transparent; border:none;
    color:var(--text); padding:9px 12px; font-size:12px; font-family:inherit; cursor:pointer;
  }
  .ae-select-menu button:hover, .ae-select-menu button.active {
    background:rgba(0,151,206,.15); color:var(--accent);
  }
  .ae-bar .ae-select { flex:1; min-width:120px; max-width:180px; }

  .ae-btn {
    background:var(--accent); color:#fff; border:none; border-radius:8px;
    padding:6px 12px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit;
  }
  .ae-btn:disabled { opacity:.45; cursor:default; }
  .ae-btn.ghost {
    background:transparent; color:var(--accent); border:1px solid var(--border);
  }
  .ae-btn.block { width:100%; }

  .ae-section { padding:12px 14px 0; }
  .ae-section-title {
    font-size:10px; font-weight:700; letter-spacing:.8px; text-transform:uppercase;
    color:var(--muted); margin-bottom:8px;
  }
  .ae-card {
    background:var(--card); border:1px solid var(--border); border-radius:10px;
    padding:12px; margin-bottom:10px; overflow:visible;
  }
  .ae-shot-name { font-size:15px; font-weight:600; margin-bottom:4px; }
  .ae-meta { font-size:11px; color:var(--muted); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .ae-thumb {
    width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:8px;
    background:var(--card2); margin-bottom:10px;
  }
  .ae-match-row {
    display:flex; align-items:center; gap:8px; padding:8px 10px;
    border-radius:8px; cursor:pointer; border:1px solid transparent;
  }
  .ae-match-row:hover { background:var(--card2); }
  .ae-match-row.active { border-color:var(--accent); background:rgba(0,151,206,.1); }
  .ae-match-score {
    font-size:10px; font-weight:700; color:var(--accent);
    background:rgba(0,151,206,.12); border-radius:6px; padding:2px 6px;
  }
  .ae-row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
  .ae-row .ae-btn { flex:1; min-width:110px; }
  .ae-field { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
  .ae-field-label { font-size:10px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
  .ae-field textarea {
    background:var(--card2); border:1px solid var(--border); color:var(--text);
    border-radius:8px; padding:8px 10px; font-size:12px; font-family:inherit;
    min-height:64px; resize:vertical;
  }
  .ae-status-grid { display:flex; flex-wrap:wrap; gap:6px; }
  .ae-status-chip {
    display:inline-flex; align-items:center; gap:5px;
    border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600;
    border:1px solid transparent; cursor:pointer; background:transparent;
    font-family:inherit; max-width:100%;
  }
  .ae-status-chip.active { border-color:currentColor; background:color-mix(in srgb, currentColor 12%, transparent); }
  .ae-status-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .ae-note {
    padding:8px 0; border-bottom:1px solid var(--border); font-size:12px;
  }
  .ae-note:last-child { border-bottom:none; }
  .ae-note-meta { font-size:10px; color:var(--muted); margin-bottom:3px; }
  .ae-note-body { white-space:pre-wrap; line-height:1.4; }
  .ae-toast {
    position:absolute; bottom:72px; left:50%; transform:translateX(-50%);
    background:#111; color:#fff; padding:8px 14px; border-radius:8px;
    font-size:12px; z-index:200; white-space:nowrap; max-width:90%;
    overflow:hidden; text-overflow:ellipsis; pointer-events:none;
  }
  .ae-empty { padding:24px 16px; text-align:center; color:var(--muted); font-size:13px; }
  .ae-error { color:var(--red); font-size:12px; margin-top:6px; }
`;

function AeSelect({ value, options, onChange, placeholder = 'Select…', disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="ae-select" ref={ref}>
      <button
        type="button"
        className="ae-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label || placeholder}
        </span>
        <span className="ae-select-caret">▾</span>
      </button>
      {open && (
        <div className="ae-select-menu">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className={o.value === value ? 'active' : ''}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status, active, onClick }) {
  const color = normalizeColor(status?.color);
  return (
    <button
      type="button"
      className={`ae-status-chip${active ? ' active' : ''}`}
      style={{ color }}
      onClick={onClick}
    >
      <span className="ae-status-dot" style={{ background: color }} />
      {status?.name || 'Unknown'}
    </button>
  );
}

export default function AeWorkspace() {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [projectId, setProjectId] = useState(() => {
    try {
      return sessionStorage.getItem('ftrack_ae_project')
        || sessionStorage.getItem('ftrack_shots_project')
        || '';
    } catch {
      return '';
    }
  });
  const [comp, setComp] = useState(null);
  const [matches, setMatches] = useState([]);
  const [shot, setShot] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskId, setTaskId] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [version, setVersion] = useState(null);
  const [components, setComponents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteParent, setNoteParent] = useState(null); // { id, type }
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [matching, setMatching] = useState(false);
  const lastCompName = useRef('');
  const lastShowCode = useRef('');
  const meId = getCurrentUserId();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => {
    fetchProjects()
      .then(async (projs) => {
        setProjects(projs);
        if (!isAePanel() || !projs.length) return;
        const { project } = await resolveAeProject(projs);
        if (project) {
          setProjectId(project.id);
          persistSharedProjectId(project.id);
          lastCompName.current = '';
        }
      })
      .catch((e) => setError(e.message || String(e)));
    fetchProjectMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  // Re-pick ftrack project when AE .aep / show code changes
  useEffect(() => {
    if (!isAePanel() || projects.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      const { project, hints } = await resolveAeProject(projects);
      if (cancelled || !project) return;
      const code = hints.showCode || '';
      if (code && code !== lastShowCode.current) {
        lastShowCode.current = code;
        if (project.id !== projectId) {
          setProjectId(project.id);
          persistSharedProjectId(project.id);
          lastCompName.current = '';
          setShot(null);
          setMatches([]);
        }
      } else if (!lastShowCode.current && code) {
        lastShowCode.current = code;
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projects, projectId]);

  useEffect(() => {
    if (!projectId) return;
    persistSharedProjectId(projectId);
    fetchShotStatuses(projectId)
      .then(setStatuses)
      .catch(() => setStatuses([]));
  }, [projectId]);

  const refreshComp = useCallback(async () => {
    if (!isAePanel()) return null;
    try {
      const info = await getActiveComp();
      setComp(info);
      return info;
    } catch {
      setComp({ ok: false, error: 'Bridge unavailable' });
      return null;
    }
  }, []);

  useEffect(() => {
    refreshComp();
    const id = setInterval(refreshComp, 2000);
    return () => clearInterval(id);
  }, [refreshComp]);

  const loadNotesFor = useCallback(async (ver, tid) => {
    if (ver?.id) {
      setNoteParent({ id: ver.id, type: 'AssetVersion' });
      const list = await fetchNotes(ver.id);
      setNotes(list);
      return;
    }
    if (tid) {
      setNoteParent({ id: tid, type: 'Task' });
      const list = await fetchNotes(tid);
      setNotes(list);
      return;
    }
    setNoteParent(null);
    setNotes([]);
  }, []);

  const ensureAssignee = useCallback(async (task, tid) => {
    if (!tid || !meId) return task;
    if (task?.assigneeIds?.includes(meId)) return task;
    if (task?.assigneeIds?.length) return task; // already assigned to someone else
    try {
      await setTaskAssignee(tid, meId);
      return {
        ...task,
        assigneeIds: [meId],
        assignee: memberLabel(members.find((m) => m.id === meId)) || 'Me',
      };
    } catch (e) {
      console.warn('auto-assign failed', e);
      return task;
    }
  }, [meId, members]);

  const selectShot = useCallback(async (nextShot) => {
    setShot(nextShot);
    setError('');
    setVersion(null);
    setComponents([]);
    setNotes([]);
    setNoteParent(null);
    if (!nextShot) {
      setTasks([]);
      setTaskId('');
      return;
    }

    try {
      let tlist = await fetchTasksForShot(nextShot.id);
      const preferred =
        tlist.find((t) => /comp|roto|paint|fx|vfx/i.test(t.type || t.name)) ||
        tlist[0];
      const tid = preferred?.id || '';
      setTaskId(tid);

      if (preferred && tid) {
        const updated = await ensureAssignee(preferred, tid);
        tlist = tlist.map((t) => (t.id === tid ? updated : t));
      }
      setTasks(tlist);

      let ver = null;
      if (tid) ver = await fetchLatestVersionForTask(tid);
      if (!ver) ver = await fetchLatestVersionForShot(nextShot.id);
      setVersion(ver);

      if (ver?.id) {
        setComponents(await fetchVersionComponents(ver.id));
      } else {
        setComponents([]);
      }
      await loadNotesFor(ver, tid);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [ensureAssignee, loadNotesFor]);

  const runMatch = useCallback(async (compName) => {
    if (!projectId) {
      setError('Pick a project first');
      return;
    }
    if (!compName) {
      setError('No active composition');
      return;
    }
    setMatching(true);
    setError('');
    try {
      const shots = await findShotsMatchingName(projectId, compName);
      const ranked = rankShotMatches(compName, shots);
      setMatches(ranked);
      if (ranked[0] && ranked[0].score >= 60) {
        await selectShot(ranked[0].shot);
      } else if (!ranked.length) {
        setShot(null);
        setError(`No shots matching "${compName}"`);
      } else {
        setShot(null);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setMatching(false);
    }
  }, [projectId, selectShot]);

  useEffect(() => {
    if (!projectId || !comp?.ok || !comp.name) return;
    if (comp.name === lastCompName.current) return;
    lastCompName.current = comp.name;
    runMatch(comp.name);
  }, [comp, projectId, runMatch]);

  const onTaskChange = async (id) => {
    setTaskId(id);
    setBusy('version');
    setError('');
    try {
      let tlist = tasks;
      const task = tlist.find((t) => t.id === id);
      if (task) {
        const updated = await ensureAssignee(task, id);
        tlist = tlist.map((t) => (t.id === id ? updated : t));
        setTasks(tlist);
      }

      let ver = id ? await fetchLatestVersionForTask(id) : null;
      if (!ver && shot) ver = await fetchLatestVersionForShot(shot.id);
      setVersion(ver);
      if (ver?.id) {
        setComponents(await fetchVersionComponents(ver.id));
      } else {
        setComponents([]);
      }
      await loadNotesFor(ver, id);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const onAssigneeChange = async (userId) => {
    if (!taskId) return;
    setBusy('assign');
    setError('');
    try {
      await setTaskAssignee(taskId, userId || null);
      const user = members.find((m) => m.id === userId);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                assigneeIds: userId ? [userId] : [],
                assignee: user ? memberLabel(user) : '',
              }
            : t,
        ),
      );
      showToast(userId ? `Assigned → ${memberLabel(user)}` : 'Unassigned');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const doImport = async (mode) => {
    if (!isAePanel()) {
      setError('Import only works inside After Effects');
      return;
    }
    const component = pickAeImportComponent(components, mode);
    if (!component) {
      setError(`No ${mode} component on v${version?.version ?? '?'}`);
      return;
    }
    const url = getComponentUrl(component.id);
    if (!url) {
      setError('Could not resolve component URL');
      return;
    }

    setBusy(mode);
    setError('');
    try {
      const label = version?.version != null
        ? `${shot.name}_v${version.version}`
        : (component.name || shot?.name || 'ftrack');
      const result = await downloadAndImport(url, {
        name: label,
        fileType: component.file_type || '',
        intoActiveComp: true,
      });
      if (!result.ok) throw new Error(result.error || 'Import failed');
      showToast(
        result.addedLayer
          ? `Imported → layer "${result.layerName || result.name}"`
          : `Imported "${result.name}" (no active comp for layer)`,
      );
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const setStatus = async (statusId) => {
    if (!taskId) {
      setError('Select a task to change status');
      return;
    }
    setBusy('status');
    setError('');
    try {
      await updateTaskStatus(taskId, statusId);
      const st = statuses.find((s) => s.id === statusId);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: { id: statusId, name: st?.name || t.status.name, color: st?.color || t.status.color } }
            : t,
        ),
      );
      showToast(`Status → ${st?.name || 'updated'}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const postNote = async () => {
    const text = noteText.trim();
    if (!text || !noteParent) return;
    setBusy('note');
    setError('');
    try {
      await createNote(noteParent.id, noteParent.type, text);
      setNoteText('');
      setNotes(await fetchNotes(noteParent.id));
      showToast('Note posted');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const activeTask = tasks.find((t) => t.id === taskId);
  const assigneeId = activeTask?.assigneeIds?.[0] || '';
  const thumb = version?.thumbnail_id
    ? getThumbnailUrl(version.thumbnail_id, 480)
    : shot?.thumbnail_id
      ? getThumbnailUrl(shot.thumbnail_id, 480)
      : null;
  const hasOriginal = !!pickAeImportComponent(components, 'original');
  const hasProxy = !!pickAeImportComponent(components, 'proxy');

  const projectOptions = [
    { value: '', label: 'Project…' },
    ...projects.map((p) => ({ value: p.id, label: p.full_name || p.name })),
  ];
  const taskOptions = tasks.map((t) => ({
    value: t.id,
    label: `${t.type || t.name}${t.status?.name ? ` - ${t.status.name}` : ''}`,
  }));
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({
      value: m.id,
      label: memberLabel(m) + (m.id === meId ? ' (me)' : ''),
    })),
  ];

  return (
    <div className="ae-ws" style={{ position: 'relative' }}>
      <style>{aeCss}</style>

      <div className="ae-bar">
        <span className="ae-bar-label">Comp</span>
        <span className="ae-bar-comp" title={comp?.ok ? comp.name : ''}>
          {comp?.ok ? comp.name : (comp?.error || '—')}
        </span>
        <AeSelect
          value={projectId}
          options={projectOptions}
          placeholder="Project…"
          onChange={(id) => {
            setProjectId(id);
            persistSharedProjectId(id);
            lastCompName.current = '';
            setShot(null);
            setMatches([]);
          }}
        />
        <button
          type="button"
          className="ae-btn ghost"
          disabled={!projectId || matching}
          onClick={() => {
            lastCompName.current = '';
            refreshComp().then((info) => {
              if (info?.ok) runMatch(info.name);
            });
          }}
        >
          {matching ? 'Matching…' : 'Match'}
        </button>
      </div>

      <div className="ae-ws-scroll">
        {error && <div className="ae-section"><div className="ae-error">{error}</div></div>}

        {!projectId && (
          <div className="ae-empty">Select a project to match the active comp to an ftrack shot.</div>
        )}

        {projectId && matches.length > 1 && (
          <div className="ae-section">
            <div className="ae-section-title">Matches</div>
            <div className="ae-card" style={{ padding: 6 }}>
              {matches.slice(0, 8).map(({ shot: s, score }) => (
                <div
                  key={s.id}
                  className={`ae-match-row${shot?.id === s.id ? ' active' : ''}`}
                  onClick={() => selectShot(s)}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                  <span className="ae-match-score">{score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {shot && (
          <>
            <div className="ae-section">
              <div className="ae-section-title">Shot</div>
              <div className="ae-card">
                {thumb && <img className="ae-thumb" src={thumb} alt="" />}
                <div className="ae-shot-name">{shot.name}</div>
                <div className="ae-meta">
                  {version ? `v${version.version}` : 'No version'}
                  {activeTask && (
                    <span>
                      · {activeTask.type || activeTask.name}
                      {activeTask.status?.name ? ` · ${activeTask.status.name}` : ''}
                      {activeTask.assignee ? ` · ${activeTask.assignee}` : ''}
                    </span>
                  )}
                </div>

                {tasks.length > 0 && (
                  <div className="ae-field">
                    <div className="ae-field-label">Task</div>
                    <AeSelect
                      value={taskId}
                      options={taskOptions}
                      onChange={onTaskChange}
                      disabled={!!busy}
                    />
                  </div>
                )}

                {taskId && (
                  <div className="ae-field">
                    <div className="ae-field-label">Assigned to</div>
                    <AeSelect
                      value={assigneeId}
                      options={assigneeOptions}
                      placeholder="Assign…"
                      onChange={onAssigneeChange}
                      disabled={busy === 'assign'}
                    />
                  </div>
                )}

                <div className="ae-row">
                  <button
                    type="button"
                    className="ae-btn"
                    disabled={!hasOriginal || !!busy}
                    onClick={() => doImport('original')}
                  >
                    {busy === 'original' ? 'Importing…' : 'Import Original'}
                  </button>
                  <button
                    type="button"
                    className="ae-btn ghost"
                    disabled={!hasProxy || !!busy}
                    onClick={() => doImport('proxy')}
                  >
                    {busy === 'proxy' ? 'Importing…' : 'Import Proxy'}
                  </button>
                </div>
                {!version && (
                  <div className="ae-error">No published version on this shot/task.</div>
                )}
                {version && !hasOriginal && !hasProxy && (
                  <div className="ae-error">Version has no importable components.</div>
                )}
              </div>
            </div>

            <div className="ae-section">
              <div className="ae-section-title">Task status</div>
              <div className="ae-card">
                {!taskId ? (
                  <div className="ae-meta">No task on this shot</div>
                ) : (
                  <div className="ae-status-grid">
                    {statuses.map((st) => (
                      <StatusChip
                        key={st.id}
                        status={st}
                        active={activeTask?.status?.id === st.id}
                        onClick={() => setStatus(st.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="ae-section">
              <div className="ae-section-title">
                Notes
                {noteParent?.type === 'AssetVersion' && version
                  ? ` · v${version.version}`
                  : noteParent?.type === 'Task'
                    ? ' · task'
                    : ''}
              </div>
              <div className="ae-card">
                {!noteParent ? (
                  <div className="ae-meta">Select a task to leave notes.</div>
                ) : (
                  <>
                    {notes.length === 0 && (
                      <div className="ae-meta" style={{ marginBottom: 8 }}>No notes yet</div>
                    )}
                    {notes.map((n) => (
                      <div key={n.id} className="ae-note">
                        <div className="ae-note-meta">
                          {[n.author?.first_name, n.author?.last_name].filter(Boolean).join(' ') || 'User'}
                          {n.frame_number != null ? ` · f${n.frame_number}` : ''}
                          {n.category?.name ? ` · ${n.category.name}` : ''}
                        </div>
                        <div className="ae-note-body">{n.content}</div>
                      </div>
                    ))}
                    <div className="ae-field">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder={
                          noteParent.type === 'Task'
                            ? 'Leave a note on this task…'
                            : 'Leave a note on this version…'
                        }
                      />
                      <button
                        type="button"
                        className="ae-btn block"
                        disabled={!noteText.trim() || busy === 'note'}
                        onClick={postNote}
                      >
                        {busy === 'note' ? 'Posting…' : 'Post note'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {projectId && !shot && !matching && matches.length === 0 && !error && (
          <div className="ae-empty">
            {comp?.ok
              ? 'Hit Match to find an ftrack shot for this comp.'
              : 'Select a composition in After Effects.'}
          </div>
        )}
      </div>

      {toast && <div className="ae-toast">{toast}</div>}
    </div>
  );
}
