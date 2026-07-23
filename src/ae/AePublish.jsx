import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchProjects,
  findShotsMatchingName,
  fetchTasksForShot,
  fetchTaskStatuses,
  publishFileToTask,
  findStatusByName,
} from '../api/ftrack';
import {
  isAePanel,
  getActiveComp,
  getSelectedFootagePaths,
  pickMediaFiles,
  fileFromPath,
} from './bridge.js';
import {
  resolveAeProject,
  persistSharedProjectId,
} from './projectContext.js';
import { resolvePublishFile } from './publishMatch.js';
import {
  formatPublishError,
  isEmptyOrTinyFile,
  isLargeFile,
} from './publishErrors.js';
import { AeSelect, aeSharedCss } from './ui.jsx';

const publishExtraCss = `
  .ae-file-row {
    display:flex; flex-direction:column; gap:2px; padding:8px 0;
    border-bottom:1px solid var(--border); font-size:11px;
  }
  .ae-file-row:last-child { border-bottom:none; }
  .ae-file-top { display:flex; align-items:center; gap:8px; }
  .ae-file-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
  .ae-file-rm {
    background:transparent; border:none; color:var(--muted); cursor:pointer;
    font-size:14px; padding:0 4px; font-family:inherit;
  }
  .ae-file-match { font-size:10px; color:var(--muted); padding-left:0; line-height:1.35; }
  .ae-file-match.ok { color:var(--green); }
  .ae-file-match.bad { color:var(--red); }
  .ae-file-match.pending { color:var(--amber); }
  .ae-file-match.uploading { color:var(--accent); }
  .ae-file-match.done { color:var(--green); }
  .ae-prog {
    margin-top:4px; height:3px; border-radius:2px; background:var(--border);
    overflow:hidden;
  }
  .ae-prog > span {
    display:block; height:100%; background:var(--accent);
    transition:width .15s ease-out;
  }
  .ae-warn { color:var(--amber); font-size:12px; margin-top:6px; }
`;

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified || 0}`;
}

export default function AePublish() {
  const [projects, setProjects] = useState([]);
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
  const [statuses, setStatuses] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [publishMsg, setPublishMsg] = useState('');
  const [publishErr, setPublishErr] = useState('');
  const [publishWarn, setPublishWarn] = useState('');
  const [publishFiles, setPublishFiles] = useState([]);
  const [dropActive, setDropActive] = useState(false);
  const [resolving, setResolving] = useState(false);
  const lastShowCode = useRef('');
  const resolveGen = useRef(0);
  const publishingRef = useRef(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const patchFile = useCallback((id, patch) => {
    setPublishFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }, []);

  useEffect(() => {
    fetchProjects()
      .then(async (projs) => {
        setProjects(projs);
        if (!projs.length) {
          setError('No ftrack projects available for this user.');
          return;
        }
        if (!isAePanel()) return;
        try {
          const { project } = await resolveAeProject(projs);
          if (project) {
            setProjectId(project.id);
            persistSharedProjectId(project.id);
          }
        } catch (e) {
          console.warn('[publish] auto project resolve failed:', e);
        }
      })
      .catch((e) => setError(formatPublishError(e, 'Projects')));
  }, []);

  useEffect(() => {
    if (!isAePanel() || projects.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { project, hints } = await resolveAeProject(projects);
        if (cancelled || !project) return;
        const code = hints.showCode || '';
        if (code && code !== lastShowCode.current) {
          lastShowCode.current = code;
          if (project.id !== projectId) {
            setProjectId(project.id);
            persistSharedProjectId(project.id);
          }
        } else if (!lastShowCode.current && code) {
          lastShowCode.current = code;
        }
      } catch {
        /* ignore polling errors */
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
    fetchTaskStatuses(projectId)
      .then(setStatuses)
      .catch((e) => {
        console.warn('[publish] task statuses failed:', e);
        setStatuses([]);
      });
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

  const resolveAllFiles = useCallback(async (files, pid) => {
    if (!pid || !files?.length) return files || [];
    const gen = ++resolveGen.current;
    setResolving(true);
    const deps = { findShotsMatchingName, fetchTasksForShot };
    const next = [];
    try {
      for (const item of files) {
        if (gen !== resolveGen.current) return files;
        try {
          // eslint-disable-next-line no-await-in-loop
          const resolved = await resolvePublishFile(pid, item.name, deps);
          next.push({
            ...item,
            status: resolved.ok ? 'matched' : 'error',
            uploadError: resolved.ok ? '' : (resolved.error || 'Unmatched'),
            match: resolved,
          });
        } catch (e) {
          next.push({
            ...item,
            status: 'error',
            uploadError: formatPublishError(e, 'Match'),
            match: {
              ok: false,
              error: formatPublishError(e, 'Match'),
              parsed: null,
              shot: null,
              task: null,
            },
          });
        }
      }
      return next;
    } finally {
      if (gen === resolveGen.current) setResolving(false);
    }
  }, []);

  useEffect(() => {
    if (!projectId || !publishFiles.length) return;
    const needs = publishFiles.some((f) => !f.match || f.match._projectId !== projectId);
    if (!needs) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveAllFiles(publishFiles, projectId);
        if (cancelled) return;
        setPublishFiles(
          resolved.map((f) => ({
            ...f,
            match: f.match ? { ...f.match, _projectId: projectId } : f.match,
          })),
        );
      } catch (e) {
        if (!cancelled) setPublishErr(formatPublishError(e, 'Match'));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, publishFiles.map((f) => f.id).join('|')]);

  const addPublishFiles = useCallback((fileList) => {
    const incoming = [...(fileList || [])].filter(Boolean);
    if (!incoming.length) return;

    const warnings = [];
    const skipped = [];
    setPublishFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (isEmptyOrTinyFile(file)) {
          skipped.push(`${file.name || 'file'} (empty)`);
          continue;
        }
        if (isLargeFile(file) && !(file._aePath || file.path)) {
          warnings.push(`${file.name} is very large — browser upload may be slow`);
        }
        const key = fileKey(file);
        if (next.some((f) => f.id === key)) continue;
        next.push({
          id: key,
          name: file.name,
          file,
          size: file.size,
          match: null,
          status: 'pending',
          uploadError: '',
        });
      }
      return next;
    });
    setPublishErr('');
    setPublishMsg('');
    if (skipped.length) {
      setPublishWarn(`Skipped: ${skipped.join(', ')}`);
    } else if (warnings.length) {
      setPublishWarn(warnings.join(' · '));
    } else {
      setPublishWarn('');
    }
  }, []);

  const removePublishFile = (id) => {
    setPublishFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearFailed = () => {
    setPublishFiles((prev) => prev.filter((f) => f.status !== 'error' && !f.uploadError));
    setPublishErr('');
  };

  const rematchAll = async () => {
    if (!projectId || !publishFiles.length) return;
    setPublishErr('');
    setPublishMsg('');
    setPublishFiles((prev) =>
      prev.map((f) => ({
        ...f,
        match: null,
        status: 'pending',
        uploadError: '',
      })),
    );
  };

  const onDropFiles = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) {
      setPublishErr('Drop contained no files.');
      return;
    }
    addPublishFiles(files);
  };

  const loadPathsAsFiles = async (paths, label) => {
    const files = [];
    const failures = [];
    for (const p of paths) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const file = await fileFromPath(p);
        files.push(file);
      } catch (e) {
        failures.push(`${String(p).split(/[/\\]/).pop()}: ${formatPublishError(e)}`);
      }
    }
    if (files.length) addPublishFiles(files);
    if (failures.length) {
      setPublishErr(
        formatPublishError(
          new Error(`${failures.length} failed to read${files.length ? `, ${files.length} added` : ''}. ${failures.slice(0, 3).join(' · ')}`),
          label,
        ),
      );
    } else if (files.length) {
      showToast(`Added ${files.length} file${files.length === 1 ? '' : 's'}`);
    }
    return files.length;
  };

  const onBrowseFiles = async () => {
    setPublishErr('');
    setBusy('browse');
    try {
      if (!isAePanel()) throw new Error('Browse requires the After Effects panel');
      const picked = await pickMediaFiles();
      if (!picked.ok) throw new Error(picked.error || 'File picker failed');
      if (picked.cancelled || !picked.paths?.length) return;
      await loadPathsAsFiles(picked.paths, 'Browse');
    } catch (e) {
      setPublishErr(formatPublishError(e, 'Browse'));
    } finally {
      setBusy('');
    }
  };

  const addFromAeSelection = async () => {
    setPublishErr('');
    setBusy('select');
    try {
      if (!isAePanel()) throw new Error('AE selection requires the After Effects panel');
      const sel = await getSelectedFootagePaths();
      if (!sel.ok) throw new Error(sel.error || 'Could not read selection');
      const paths = sel.paths || [];
      if (!paths.length) {
        setPublishErr('No file-based footage selected in the AE project panel.');
        return;
      }
      await loadPathsAsFiles(paths, 'AE selection');
    } catch (e) {
      setPublishErr(formatPublishError(e, 'AE selection'));
    } finally {
      setBusy('');
    }
  };

  const matchedFiles = publishFiles.filter((f) => f.match?.ok && f.status !== 'done');
  const unmatchedCount = publishFiles.filter((f) => f.match && !f.match.ok).length;
  const failedCount = publishFiles.filter((f) => f.status === 'error' && f.uploadError).length;

  const publishNative = async () => {
    if (publishingRef.current) return;
    if (!projectId) {
      setPublishErr('Pick a project first.');
      return;
    }
    if (!publishFiles.length) {
      setPublishErr('Add files via drop, browse, or AE selection.');
      return;
    }
    const queue = publishFiles.filter((f) => f.match?.ok && f.status !== 'done');
    if (!queue.length) {
      setPublishErr('No files matched a shot/task. Check naming (e.g. LLL_FA_010_comp_v001.mov).');
      return;
    }

    publishingRef.current = true;
    setPublishErr('');
    setPublishWarn('');
    setBusy('publish');

    // Resolve QC Ready like the Python uploader (global Status name, not schema-only list)
    let qcReady = statuses.find((s) => /^qc ready$/i.test(s.name));
    if (!qcReady) {
      try {
        qcReady = await findStatusByName(['QC Ready', 'QC ready', 'Ready for QC']);
      } catch (e) {
        console.warn('[publish] QC Ready lookup failed:', e);
      }
    }
    if (!qcReady) {
      setPublishWarn('QC Ready status not found — versions will upload without status change.');
    }

    const succeeded = [];
    const failed = [];
    const statusFails = [];

    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const { shot, task, parsed } = item.match;
        patchFile(item.id, { status: 'uploading', uploadError: '', progress: 0 });
        setPublishMsg(
          `Uploading ${i + 1}/${queue.length}: ${item.name} → ${shot.name} / ${task.type || task.name}…`,
        );
        try {
          // eslint-disable-next-line no-await-in-loop
          const published = await publishFileToTask({
            taskId: task.id,
            shotId: shot.id,
            file: item.file,
            version: parsed?.version,
            setTaskStatusId: qcReady?.id,
            onProgress: ({ percent, phase, msg }) => {
              patchFile(item.id, { progress: percent, progressPhase: phase });
              const label = phase === 'prepare'
                ? 'Preparing'
                : phase === 'encode'
                  ? 'Finishing'
                  : (msg || 'Uploading');
              setPublishMsg(
                `${label} ${i + 1}/${queue.length}: ${item.name} · ${percent}%`,
              );
            },
          });
          succeeded.push({ id: item.id, ...published, shotName: shot.name });
          if (published.statusWarning) {
            statusFails.push(`${item.name}: ${published.statusWarning}`);
          }
          patchFile(item.id, { status: 'done', uploadError: '', progress: 100 });
        } catch (e) {
          const msg = formatPublishError(e);
          console.error('[publish] file failed:', item.name, e);
          failed.push({ id: item.id, name: item.name, error: msg });
          patchFile(item.id, { status: 'error', uploadError: msg });
        }
      }

      const skipped = publishFiles.length - queue.length;
      const qcNote = qcReady && succeeded.some((s) => s.statusApplied)
        ? ' · QC Ready'
        : '';
      if (succeeded.length && !failed.length) {
        setPublishMsg(
          succeeded.length === 1
            ? `Published v${succeeded[0].version} → ${succeeded[0].shotName}${qcNote}`
            : `Published ${succeeded.length} files${qcNote}${skipped ? ` (${skipped} unmatched skipped)` : ''}`,
        );
        showToast(qcReady ? 'Published · QC Ready' : 'Publish complete');
        setPublishFiles((prev) => prev.filter((f) => f.status !== 'done'));
      } else if (succeeded.length && failed.length) {
        setPublishMsg(`Published ${succeeded.length}, failed ${failed.length}${qcNote}`);
        setPublishErr(
          failed.slice(0, 4).map((f) => `${f.name}: ${f.error}`).join(' · '),
        );
        showToast('Partial publish');
        setPublishFiles((prev) => prev.filter((f) => f.status !== 'done'));
      } else {
        setPublishMsg('');
        setPublishErr(
          failed.length
            ? `All ${failed.length} failed. ${failed[0].error}`
            : 'Nothing published.',
        );
      }
      if (statusFails.length) {
        setPublishWarn(`Status update issues: ${statusFails.slice(0, 3).join(' · ')}`);
      }
    } finally {
      publishingRef.current = false;
      setBusy('');
    }
  };

  const projectOptions = [
    { value: '', label: 'Project…' },
    ...projects.map((p) => ({ value: p.id, label: p.full_name || p.name })),
  ];

  const canPublish = matchedFiles.length > 0 && busy !== 'publish' && !resolving;
  const publishLabel = busy === 'publish'
    ? 'Publishing…'
    : resolving
      ? 'Matching files…'
      : matchedFiles.length
        ? `Publish ${matchedFiles.length} file${matchedFiles.length === 1 ? '' : 's'} to ftrack`
        : 'Publish to ftrack';

  let gateHint = '';
  if (!projectId) gateHint = 'Pick a project above.';
  else if (!publishFiles.length) gateHint = 'Add media via drop, browse, or AE selection.';
  else if (resolving) gateHint = 'Matching filenames to shots…';
  else if (!matchedFiles.length) gateHint = 'No files matched — need …_comp_v### naming like the Python uploader.';
  else if (unmatchedCount) gateHint = `${unmatchedCount} unmatched will be skipped.`;

  return (
    <div className="ae-ws" style={{ position: 'relative' }}>
      <style>{aeSharedCss + publishExtraCss}</style>

      <div className="ae-bar">
        <span className="ae-bar-label">Project</span>
        <span className="ae-bar-comp" title={comp?.ok ? comp.name : ''} style={{ maxWidth: 100 }}>
          {comp?.ok ? comp.name : ''}
        </span>
        <AeSelect
          value={projectId}
          options={projectOptions}
          placeholder="Project…"
          onChange={(id) => {
            setProjectId(id);
            persistSharedProjectId(id);
            setPublishErr('');
            setPublishMsg('');
            setPublishFiles((prev) =>
              prev.map((f) => ({
                ...f,
                match: null,
                status: 'pending',
                uploadError: '',
              })),
            );
          }}
        />
      </div>

      <div className="ae-ws-scroll">
        {error && (
          <div className="ae-section">
            <div className="ae-error">{error}</div>
          </div>
        )}

        <div className="ae-section">
          <div className="ae-section-title">Publish</div>
          <div className="ae-card">
            <div className="ae-meta" style={{ marginBottom: 8 }}>
              Filenames auto-match shot + task (same rules as the Python uploader). Drop, browse, or pull AE selection.
            </div>

            <div
              className={`ae-drop${dropActive ? ' active' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDropActive(false); }}
              onDrop={onDropFiles}
            >
              <strong>Drop media here</strong>
              from Explorer / Finder
            </div>

            <div className="ae-row">
              <button
                type="button"
                className="ae-btn ghost"
                disabled={!!busy}
                onClick={onBrowseFiles}
              >
                {busy === 'browse' ? 'Browsing…' : 'Browse…'}
              </button>
              <button
                type="button"
                className="ae-btn ghost"
                disabled={!!busy}
                onClick={addFromAeSelection}
              >
                {busy === 'select' ? 'Reading…' : 'From AE selection'}
              </button>
            </div>

            {publishFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {publishFiles.map((f) => {
                  const m = f.match;
                  let matchClass = 'pending';
                  let matchText = resolving || !m ? 'Matching…' : '';
                  if (f.status === 'uploading') {
                    matchClass = 'uploading';
                    const pct = typeof f.progress === 'number' ? f.progress : 0;
                    const phase = f.progressPhase === 'prepare'
                      ? 'Preparing'
                      : f.progressPhase === 'encode'
                        ? 'Finishing'
                        : 'Uploading';
                    matchText = `${phase} ${pct}%`;
                  } else if (f.status === 'done') {
                    matchClass = 'done';
                    matchText = 'Published';
                  } else if (f.status === 'error' && f.uploadError) {
                    matchClass = 'bad';
                    matchText = f.uploadError;
                  } else if (m?.ok) {
                    matchClass = 'ok';
                    matchText = `${m.shot.name} / ${m.task.type || m.task.name}${m.parsed?.version != null ? ` · v${m.parsed.version}` : ''}`;
                  } else if (m && !m.ok) {
                    matchClass = 'bad';
                    matchText = m.error || 'Unmatched';
                  }
                  return (
                    <div key={f.id} className="ae-file-row">
                      <div className="ae-file-top">
                        <span className="ae-file-name" title={f.name}>{f.name}</span>
                        <button
                          type="button"
                          className="ae-file-rm"
                          disabled={busy === 'publish'}
                          onClick={() => removePublishFile(f.id)}
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                      <div className={`ae-file-match ${matchClass}`}>{matchText}</div>
                      {f.status === 'uploading' && (
                        <div className="ae-prog" aria-hidden>
                          <span style={{ width: `${Math.max(2, f.progress || 0)}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {(failedCount > 0 || unmatchedCount > 0) && publishFiles.length > 0 && busy !== 'publish' && (
              <div className="ae-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="ae-btn ghost"
                  disabled={resolving || !!busy}
                  onClick={rematchAll}
                >
                  Rematch
                </button>
                {failedCount > 0 && (
                  <button
                    type="button"
                    className="ae-btn ghost"
                    disabled={!!busy}
                    onClick={clearFailed}
                  >
                    Clear failed
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              className="ae-btn block"
              style={{ marginTop: 12 }}
              disabled={!canPublish}
              onClick={publishNative}
            >
              {publishLabel}
            </button>
            {!canPublish && gateHint && busy !== 'publish' && (
              <div className="ae-hint">{gateHint}</div>
            )}
            {canPublish && unmatchedCount > 0 && (
              <div className="ae-hint">{gateHint}</div>
            )}
            {publishWarn && <div className="ae-warn">{publishWarn}</div>}
            {publishMsg && <div className="ae-ok">{publishMsg}</div>}
            {publishErr && <div className="ae-error">{publishErr}</div>}
          </div>
        </div>
      </div>

      {toast && <div className="ae-toast">{toast}</div>}
    </div>
  );
}
