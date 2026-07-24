import { useState, useEffect, useRef } from 'react';

/** Custom select — native <select> is broken in CEP Chromium */
export function AeSelect({ value, options, onChange, placeholder = 'Select…', disabled }) {
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

/** Shared AE panel layout / control styles */
export const aeSharedCss = `
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
    background:rgba(232,160,74,.15); color:var(--accent);
  }
  .ae-bar .ae-select { flex:1; min-width:120px; max-width:180px; }

  .ae-btn {
    background:var(--accent); color:#141210; border:none; border-radius:8px;
    padding:6px 12px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit;
  }
  .ae-btn:disabled { opacity:.45; cursor:default; }
  .ae-btn.ghost {
    background:transparent; color:var(--accent); border:1px solid var(--border);
  }
  .ae-btn.block { width:100%; padding:10px 12px; font-size:13px; }

  .ae-section { padding:12px 14px 0; }
  .ae-section-title {
    font-size:10px; font-weight:700; letter-spacing:.8px; text-transform:uppercase;
    color:var(--muted); margin-bottom:8px;
  }
  .ae-card {
    background:var(--card); border:1px solid var(--border); border-radius:10px;
    padding:12px; margin-bottom:10px; overflow:visible;
  }
  .ae-shot-name { font-size:15px; font-weight:600; margin-bottom:4px; font-family:var(--font-mono); letter-spacing:.02em; }
  .ae-meta { font-size:11px; color:var(--muted); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .ae-match-row {
    display:flex; align-items:center; gap:8px; padding:8px 10px;
    border-radius:8px; cursor:pointer; border:1px solid transparent;
  }
  .ae-match-row:hover { background:var(--card2); }
  .ae-match-row.active { border-color:var(--accent); background:rgba(232,160,74,.1); }
  .ae-match-score {
    font-size:10px; font-weight:700; color:var(--accent);
    background:rgba(232,160,74,.12); border-radius:6px; padding:2px 6px;
  }
  .ae-row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
  .ae-row .ae-btn { flex:1; min-width:110px; }
  .ae-field { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
  .ae-field-label { font-size:10px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
  .ae-error { color:var(--red); font-size:12px; margin-top:6px; }
  .ae-ok { color:var(--green); font-size:12px; margin-top:6px; }
  .ae-hint { color:var(--amber); font-size:12px; margin-top:8px; }
  .ae-toast {
    position:absolute; bottom:72px; left:50%; transform:translateX(-50%);
    background:#111; color:#fff; padding:8px 14px; border-radius:8px;
    font-size:12px; z-index:200; white-space:nowrap; max-width:90%;
    overflow:hidden; text-overflow:ellipsis; pointer-events:none;
  }
  .ae-drop {
    border:1px dashed var(--border); border-radius:10px; padding:18px 12px;
    text-align:center; color:var(--muted); font-size:12px; margin-bottom:10px;
    transition:border-color .15s, background .15s; cursor:default;
  }
  .ae-drop.active {
    border-color:var(--accent); background:rgba(232,160,74,.1); color:var(--accent);
  }
  .ae-drop strong { display:block; color:var(--text); font-size:13px; margin-bottom:4px; }
  .ae-file-row {
    display:flex; align-items:center; gap:8px; padding:6px 0;
    border-bottom:1px solid var(--border); font-size:11px;
  }
  .ae-file-row:last-child { border-bottom:none; }
  .ae-file-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ae-file-rm {
    background:transparent; border:none; color:var(--muted); cursor:pointer;
    font-size:14px; padding:0 4px; font-family:inherit;
  }
`;
