import { useState, useEffect, useCallback } from 'react';
import {
  fetchAeAlerts,
  dismissAeAlert,
  dismissAllAeAlerts,
  getAeAlertStatusNames,
  setAeAlertStatusNames,
  DEFAULT_AE_ALERT_STATUSES,
} from './alerts.js';
import { subscribeAlertRefresh } from '../api/eventHub.js';

const normalizeColor = (c) => {
  if (!c) return '#6b7280';
  if (c.startsWith('#')) return c;
  if (/^[0-9a-fA-F]{3,8}$/.test(c)) return `#${c}`;
  return c;
};

const css = `
  .ae-alerts { display:flex; flex-direction:column; height:100%; min-height:0; }
  .ae-alerts-head {
    display:flex; align-items:center; gap:10px; padding:12px 14px;
    border-bottom:1px solid var(--border); background:var(--surface); flex-shrink:0;
  }
  .ae-alerts-head h2 { font-size:16px; font-weight:700; flex:1; margin:0; }
  .ae-alerts-back {
    background:transparent; border:none; color:var(--accent); font-size:13px;
    font-weight:600; cursor:pointer; font-family:inherit; padding:0;
  }
  .ae-alerts-scroll {
    flex:1; overflow-y:auto; padding:12px 14px 88px; min-height:0;
  }
  .ae-alerts-card {
    background:var(--card); border:1px solid var(--border); border-radius:10px;
    padding:12px; margin-bottom:8px; cursor:pointer;
  }
  .ae-alerts-card:hover { border-color:var(--accent); }
  .ae-alerts-shot { font-size:14px; font-weight:600; margin-bottom:4px; }
  .ae-alerts-meta { font-size:11px; color:var(--muted); margin-bottom:8px; }
  .ae-alerts-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ae-alerts-status {
    display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600;
  }
  .ae-alerts-dot { width:7px; height:7px; border-radius:50%; }
  .ae-alerts-btn {
    margin-left:auto; background:transparent; border:1px solid var(--border);
    color:var(--accent); border-radius:6px; padding:4px 10px; font-size:11px;
    font-weight:600; cursor:pointer; font-family:inherit;
  }
  .ae-alerts-btn.primary {
    background:var(--accent); color:#fff; border-color:var(--accent);
  }
  .ae-alerts-empty { text-align:center; color:var(--muted); padding:32px 16px; font-size:13px; }
  .ae-alerts-hint { font-size:11px; color:var(--muted); margin-bottom:12px; line-height:1.4; }
  .ae-alerts-actions { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
  .ae-alerts-actions button {
    background:var(--accent); color:#fff; border:none; border-radius:8px;
    padding:6px 12px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit;
  }
  .ae-alerts-actions button.ghost {
    background:transparent; color:var(--accent); border:1px solid var(--border);
  }
  .ae-alerts-watch {
    margin-top:16px; padding-top:12px; border-top:1px solid var(--border);
  }
  .ae-alerts-watch label {
    display:block; font-size:10px; font-weight:700; letter-spacing:.6px;
    text-transform:uppercase; color:var(--muted); margin-bottom:6px;
  }
  .ae-alerts-watch input {
    width:100%; background:var(--card); border:1px solid var(--border); color:var(--text);
    border-radius:8px; padding:8px 10px; font-size:12px; font-family:inherit;
    box-sizing:border-box;
  }
  .ae-alerts-watch-note { font-size:10px; color:var(--muted); margin-top:6px; }
`;

/**
 * In-panel alert inbox for AE (API poll, not Web Push).
 * projectId omitted = all projects (default).
 */
export default function AeAlerts({ onClose, projectId, onCountChange, onOpenAlert }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [watchInput, setWatchInput] = useState(() => getAeAlertStatusNames().join(', '));

  const refresh = useCallback(async () => {
    setError('');
    try {
      const { alerts: list, count } = await fetchAeAlerts({
        projectId: projectId || undefined,
      });
      setAlerts(list);
      onCountChange?.(count);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, onCountChange]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(refresh, 120000);
    const unsub = subscribeAlertRefresh(refresh, { debounceMs: 800 });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [refresh]);

  const onDismiss = (task, e) => {
    e?.stopPropagation?.();
    dismissAeAlert(task.id, task.status?.id);
    setAlerts((prev) => {
      const next = prev.filter((t) => t.id !== task.id);
      onCountChange?.(next.length);
      return next;
    });
  };

  const onDismissAll = () => {
    dismissAllAeAlerts(alerts);
    setAlerts([]);
    onCountChange?.(0);
  };

  const openAlert = (t, e) => {
    e?.stopPropagation?.();
    if (!t.shotId) return;
    onOpenAlert?.({
      shotId: t.shotId,
      shotName: t.shotName,
      taskId: t.id,
      projectId: t.projectId,
    });
  };

  const saveWatch = () => {
    const names = watchInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setAeAlertStatusNames(names.length ? names : DEFAULT_AE_ALERT_STATUSES);
    setWatchInput((names.length ? names : DEFAULT_AE_ALERT_STATUSES).join(', '));
    setLoading(true);
    refresh();
  };

  return (
    <div className="ae-alerts">
      <style>{css}</style>
      <div className="ae-alerts-head">
        <button type="button" className="ae-alerts-back" onClick={onClose}>← Back</button>
        <h2>Alerts</h2>
      </div>
      <div className="ae-alerts-scroll">
        <p className="ae-alerts-hint">
          Your assigned tasks in watched statuses (all projects). Tap Open to jump to the shot.
        </p>

        <div className="ae-alerts-actions">
          <button type="button" onClick={() => { setLoading(true); refresh(); }} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {alerts.length > 0 && (
            <button type="button" className="ghost" onClick={onDismissAll}>
              Dismiss all
            </button>
          )}
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        {!loading && alerts.length === 0 && (
          <div className="ae-alerts-empty">Nothing needs your attention right now.</div>
        )}

        {alerts.map((t) => {
          const color = normalizeColor(t.status.color);
          return (
            <div
              key={t.id}
              className="ae-alerts-card"
              onClick={(e) => openAlert(t, e)}
            >
              <div className="ae-alerts-shot">{t.shotName || t.name}</div>
              <div className="ae-alerts-meta">
                {t.type}{t.projectName ? ` · ${t.projectName}` : ''}
              </div>
              <div className="ae-alerts-row">
                <span className="ae-alerts-status" style={{ color }}>
                  <span className="ae-alerts-dot" style={{ background: color }} />
                  {t.status.name}
                </span>
                <button
                  type="button"
                  className="ae-alerts-btn primary"
                  onClick={(e) => openAlert(t, e)}
                >
                  Open
                </button>
                <button type="button" className="ae-alerts-btn" onClick={(e) => onDismiss(t, e)}>
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}

        <div className="ae-alerts-watch">
          <label>Watch statuses (comma-separated)</label>
          <input
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value)}
            onBlur={saveWatch}
            placeholder="Fix, Changes Needed, Retake"
          />
          <div className="ae-alerts-watch-note">
            Exact names only. Saved on blur. Re-alerts if status changes after dismiss.
          </div>
        </div>
      </div>
    </div>
  );
}
