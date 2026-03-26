import { useState, useRef, useEffect, useCallback } from "react";

// ─── Mock Data (replace with real ftrack API calls) ──────────────────────────
const STATUSES = [
  { name: "Not Started", color: "#6b6b8a" },
  { name: "In Progress", color: "#3b82f6" },
  { name: "Pending Review", color: "#f59e0b" },
  { name: "Approved", color: "#22c55e" },
  { name: "Changes Needed", color: "#ef4444" },
];

const MOCK_SHOTS = Array.from({ length: 18 }, (_, i) => ({
  id: `shot-${i}`,
  name: `SH${String((i + 1) * 10).padStart(4, "0")}`,
  status: STATUSES[i % STATUSES.length],
  artist: ["Juan", "Eric", "Sarah K.", "Mike T.", "—"][i % 5],
  thumb: `https://picsum.photos/seed/${i + 10}/160/90`,
  hasVersion: i % 3 !== 0,
  versionNum: Math.floor(Math.random() * 5) + 1,
}));

const MOCK_REVIEWS = [
  {
    id: "rev-1",
    name: "Bouffant – Beauty Pass v3",
    date: "Mar 24",
    shotCount: 6,
    shots: MOCK_SHOTS.slice(0, 6).map((s) => ({
      ...s,
      videoUrl: null,
      notes: [],
    })),
  },
  {
    id: "rev-2",
    name: "Bouffant – Hair Color Approvals",
    date: "Mar 20",
    shotCount: 4,
    shots: MOCK_SHOTS.slice(6, 10).map((s) => ({
      ...s,
      videoUrl: null,
      notes: [],
    })),
  },
  {
    id: "rev-3",
    name: "Comp Finals – Scene 12",
    date: "Mar 15",
    shotCount: 8,
    shots: MOCK_SHOTS.slice(10).map((s) => ({
      ...s,
      videoUrl: null,
      notes: [],
    })),
  },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #080810;
    --surface: #0f0f1a;
    --card: #15151f;
    --card2: #1c1c2a;
    --border: #252535;
    --accent: #7c6aff;
    --accent2: #ff6a9b;
    --green: #1fdf7a;
    --red: #ff4d6a;
    --amber: #ffb830;
    --blue: #3b9eff;
    --text: #ddddf0;
    --muted: #5a5a7a;
    --font-head: 'Syne', sans-serif;
    --font-mono: 'DM Mono', monospace;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-mono); overflow: hidden; }

  .app { display: flex; flex-direction: column; height: 100vh; max-width: 430px; margin: 0 auto; position: relative; background: var(--bg); }

  /* ── Login ── */
  .login { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; padding:32px; gap:24px; background: radial-gradient(ellipse at 50% 0%, #1a1040 0%, var(--bg) 70%); }
  .login-logo { font-family: var(--font-head); font-size:28px; font-weight:800; letter-spacing:-1px; }
  .login-logo span { color: var(--accent); }
  .login-sub { font-size:11px; color:var(--muted); letter-spacing:2px; text-transform:uppercase; }
  .login-form { width:100%; display:flex; flex-direction:column; gap:12px; }
  .login-tabs { display:flex; background:var(--surface); border-radius:10px; padding:3px; gap:3px; }
  .login-tab { flex:1; padding:8px; text-align:center; font-size:12px; font-family:var(--font-mono); border-radius:8px; border:none; cursor:pointer; background:transparent; color:var(--muted); transition:all .2s; }
  .login-tab.active { background:var(--card2); color:var(--text); }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--muted); }
  .field input { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; font-family:var(--font-mono); font-size:14px; color:var(--text); outline:none; transition:border-color .2s; }
  .field input:focus { border-color:var(--accent); }
  .btn-primary { background:var(--accent); color:#fff; border:none; border-radius:12px; padding:14px; font-family:var(--font-head); font-size:15px; font-weight:700; cursor:pointer; letter-spacing:.5px; transition:opacity .2s, transform .1s; }
  .btn-primary:active { transform:scale(.98); opacity:.9; }
  .btn-primary:disabled { opacity:.4; cursor:not-allowed; }

  /* ── Header ── */
  .header { padding:16px 20px 12px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); flex-shrink:0; }
  .header-title { font-family:var(--font-head); font-size:20px; font-weight:800; }
  .header-title span { color:var(--accent); }
  .header-right { display:flex; align-items:center; gap:10px; }
  .avatar { width:32px; height:32px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; font-family:var(--font-head); }

  /* ── Scroll area ── */
  .scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding-bottom:80px; }
  .scroll::-webkit-scrollbar { display:none; }

  /* ── Bottom Nav ── */
  .bottom-nav { position:absolute; bottom:0; left:0; right:0; height:72px; background:var(--surface); border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-around; padding-bottom:env(safe-area-inset-bottom); z-index:100; backdrop-filter:blur(12px); }
  .nav-item { display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 20px; cursor:pointer; position:relative; }
  .nav-icon { font-size:22px; transition:transform .2s; }
  .nav-label { font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); transition:color .2s; }
  .nav-item.active .nav-label { color:var(--accent); }
  .nav-item.active .nav-icon { transform:translateY(-2px); }
  .nav-pill { position:absolute; top:6px; right:14px; background:var(--accent2); border-radius:6px; padding:1px 5px; font-size:9px; font-weight:700; color:#fff; }

  /* ── Reviews tab ── */
  .section-label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); padding:16px 20px 8px; }
  .review-card { margin:0 16px 12px; background:var(--card); border:1px solid var(--border); border-radius:16px; overflow:hidden; cursor:pointer; transition:transform .15s, border-color .15s; }
  .review-card:active { transform:scale(.98); border-color:var(--accent); }
  .review-card-inner { padding:16px; }
  .review-name { font-family:var(--font-head); font-size:16px; font-weight:700; margin-bottom:6px; line-height:1.3; }
  .review-meta { display:flex; gap:12px; align-items:center; }
  .review-date { font-size:11px; color:var(--muted); }
  .review-badge { background:var(--card2); border-radius:6px; padding:3px 8px; font-size:11px; color:var(--accent); }
  .review-thumbs { display:flex; gap:4px; padding:0 16px 16px; overflow:hidden; }
  .review-thumb { width:64px; height:36px; border-radius:8px; object-fit:cover; background:var(--card2); flex-shrink:0; }
  .review-thumb-more { width:40px; height:36px; border-radius:8px; background:var(--card2); display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--muted); flex-shrink:0; }

  /* ── Review Detail ── */
  .back-btn { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--accent); cursor:pointer; padding:4px 0; font-family:var(--font-mono); }
  .shot-row { margin:0 16px 10px; background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; cursor:pointer; transition:border-color .15s; }
  .shot-row:active { border-color:var(--accent); }
  .shot-row-inner { display:flex; align-items:center; gap:12px; padding:12px; }
  .shot-thumb-sm { width:80px; height:45px; border-radius:8px; object-fit:cover; background:var(--card2); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:18px; }
  .shot-info { flex:1; min-width:0; }
  .shot-name-lg { font-family:var(--font-head); font-size:15px; font-weight:700; }
  .shot-version { font-size:11px; color:var(--muted); margin-top:2px; }
  .status-pill { border-radius:20px; padding:4px 10px; font-size:10px; font-weight:500; letter-spacing:.5px; white-space:nowrap; }

  /* ── Player ── */
  .player-screen { position:absolute; inset:0; background:var(--bg); z-index:200; display:flex; flex-direction:column; }
  .player-header { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--border); }
  .player-title { font-family:var(--font-head); font-size:16px; font-weight:700; flex:1; min-width:0; }
  .player-title-sub { font-size:11px; color:var(--muted); margin-top:1px; }
  .video-area { position:relative; background:#000; aspect-ratio:16/9; width:100%; flex-shrink:0; }
  .video-area video { width:100%; height:100%; object-fit:contain; }
  .video-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:8px; color:var(--muted); }
  .play-icon { font-size:48px; opacity:.4; }
  .canvas-overlay { position:absolute; inset:0; cursor:crosshair; touch-action:none; }
  .draw-toggle { position:absolute; top:8px; right:8px; background:rgba(0,0,0,.7); border:1px solid var(--border); border-radius:8px; padding:6px 10px; font-size:11px; color:var(--text); cursor:pointer; font-family:var(--font-mono); display:flex; align-items:center; gap:5px; }
  .draw-toggle.active { border-color:var(--accent2); color:var(--accent2); }
  .draw-tools { display:flex; gap:8px; align-items:center; padding:8px 16px; background:var(--surface); border-bottom:1px solid var(--border); }
  .color-dot { width:20px; height:20px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:border-color .15s; flex-shrink:0; }
  .color-dot.selected { border-color:#fff; }
  .brush-btn { padding:4px 10px; font-size:11px; background:var(--card); border:1px solid var(--border); border-radius:6px; color:var(--text); cursor:pointer; font-family:var(--font-mono); }
  .brush-btn.active { border-color:var(--accent); color:var(--accent); }
  .player-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
  .player-body::-webkit-scrollbar { display:none; }
  .notes-section { padding:16px; }
  .notes-title { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin-bottom:10px; }
  .note-item { background:var(--card); border-radius:10px; padding:10px 12px; margin-bottom:8px; }
  .note-author { font-size:10px; color:var(--accent); margin-bottom:4px; }
  .note-text { font-size:13px; line-height:1.5; }
  .note-time { font-size:10px; color:var(--muted); margin-top:4px; }
  .note-input-row { display:flex; gap:8px; align-items:flex-end; margin-top:8px; }
  .note-input { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-family:var(--font-mono); font-size:13px; color:var(--text); outline:none; resize:none; min-height:42px; max-height:100px; transition:border-color .2s; }
  .note-input:focus { border-color:var(--accent); }
  .send-btn { background:var(--accent); border:none; border-radius:10px; width:42px; height:42px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; flex-shrink:0; }
  .approval-row { display:flex; gap:8px; padding:0 16px 16px; }
  .approve-btn { flex:1; padding:12px; border-radius:12px; border:1px solid; font-family:var(--font-head); font-size:14px; font-weight:700; cursor:pointer; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:6px; }
  .approve-btn.approve { border-color:var(--green); color:var(--green); background:rgba(31,223,122,.08); }
  .approve-btn.approve.active { background:var(--green); color:#000; }
  .approve-btn.reject { border-color:var(--red); color:var(--red); background:rgba(255,77,106,.08); }
  .approve-btn.reject.active { background:var(--red); color:#fff; }

  /* ── Shots Tab ── */
  .shots-toolbar { display:flex; align-items:center; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border); }
  .search-input { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:9px 12px; font-family:var(--font-mono); font-size:13px; color:var(--text); outline:none; }
  .search-input:focus { border-color:var(--accent); }
  .filter-btn { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:9px 12px; font-size:13px; cursor:pointer; white-space:nowrap; color:var(--text); font-family:var(--font-mono); }
  .filter-btn.active { border-color:var(--accent); color:var(--accent); }
  .bulk-bar { background:var(--accent); display:flex; align-items:center; gap:8px; padding:10px 16px; }
  .bulk-count { font-family:var(--font-head); font-weight:700; font-size:14px; flex:1; }
  .bulk-action { background:rgba(255,255,255,.2); border:none; border-radius:8px; padding:6px 12px; font-family:var(--font-mono); font-size:12px; color:#fff; cursor:pointer; }
  .bulk-action:active { background:rgba(255,255,255,.35); }
  .shot-list-item { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s; user-select:none; }
  .shot-list-item.selected { background:rgba(124,106,255,.1); }
  .shot-list-item:active { background:var(--surface); }
  .select-circle { width:22px; height:22px; border-radius:50%; border:2px solid var(--border); flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .15s; }
  .select-circle.checked { background:var(--accent); border-color:var(--accent); }
  .shot-list-thumb { width:64px; height:36px; border-radius:8px; object-fit:cover; background:var(--card2); flex-shrink:0; }
  .shot-list-info { flex:1; min-width:0; }
  .shot-list-name { font-family:var(--font-head); font-size:14px; font-weight:700; }
  .shot-list-artist { font-size:11px; color:var(--muted); margin-top:2px; }
  .shot-list-status { flex-shrink:0; }
  .status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:5px; }

  /* ── Status Picker ── */
  .modal-overlay { position:absolute; inset:0; background:rgba(0,0,0,.7); z-index:300; display:flex; align-items:flex-end; backdrop-filter:blur(4px); }
  .modal-sheet { background:var(--surface); border-radius:20px 20px 0 0; width:100%; padding:20px 0 40px; border-top:1px solid var(--border); }
  .modal-handle { width:36px; height:4px; background:var(--border); border-radius:2px; margin:0 auto 16px; }
  .modal-title { font-family:var(--font-head); font-size:16px; font-weight:700; padding:0 20px 14px; border-bottom:1px solid var(--border); }
  .status-option { display:flex; align-items:center; gap:12px; padding:14px 20px; cursor:pointer; transition:background .15s; }
  .status-option:active { background:var(--card); }
  .status-option-name { font-size:14px; }
  .status-option-check { margin-left:auto; color:var(--green); font-size:18px; }
  .modal-cancel { margin:8px 16px 0; padding:13px; background:var(--card); border:none; border-radius:12px; width:calc(100% - 32px); font-family:var(--font-head); font-size:15px; font-weight:700; color:var(--muted); cursor:pointer; }

  /* ── Toast ── */
  .toast { position:absolute; top:80px; left:50%; transform:translateX(-50%); background:var(--card2); border:1px solid var(--border); border-radius:12px; padding:10px 18px; font-size:13px; color:var(--text); z-index:500; white-space:nowrap; animation:fadeInOut 2.2s forwards; }
  @keyframes fadeInOut { 0%{opacity:0;transform:translateX(-50%) translateY(-8px)} 15%{opacity:1;transform:translateX(-50%) translateY(0)} 75%{opacity:1} 100%{opacity:0} }

  /* ── Misc ── */
  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--muted); gap:12px; }
  .empty-icon { font-size:40px; opacity:.4; }
  .empty-text { font-size:13px; text-align:center; line-height:1.6; }
`;

// ─── Utils ────────────────────────────────────────────────────────────────────
function StatusPill({ status, small }) {
  return (
    <span className="status-pill" style={{
      background: status.color + "22",
      color: status.color,
      fontSize: small ? "10px" : undefined,
    }}>
      <span className="status-dot" style={{ background: status.color }} />
      {status.name}
    </span>
  );
}

function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("apikey");
  const [server, setServer] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    onLogin({ server: server || "demo.ftrackapp.com", user: user || "eric" });
  };

  const ready = server && (mode === "apikey" ? apiKey : user && pass);

  return (
    <div className="login">
      <div>
        <div className="login-logo">f<span>track</span> mobile</div>
        <div className="login-sub" style={{ textAlign: "center", marginTop: 4 }}>by CleanPlateFX</div>
      </div>
      <div className="login-form">
        <div className="field">
          <label>Server URL</label>
          <input placeholder="yoursite.ftrackapp.com" value={server} onChange={e => setServer(e.target.value)} />
        </div>
        <div className="login-tabs">
          <button className={`login-tab ${mode === "apikey" ? "active" : ""}`} onClick={() => setMode("apikey")}>API Key</button>
          <button className={`login-tab ${mode === "password" ? "active" : ""}`} onClick={() => setMode("password")}>Password</button>
        </div>
        {mode === "apikey" ? (
          <div className="field">
            <label>API Key</label>
            <input placeholder="••••••••••••••••" value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" />
          </div>
        ) : (
          <>
            <div className="field">
              <label>Username</label>
              <input placeholder="you@studio.com" value={user} onChange={e => setUser(e.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} type="password" />
            </div>
          </>
        )}
        <button className="btn-primary" onClick={handleLogin} disabled={loading}>
          {loading ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  );
}

// ─── Player Screen ────────────────────────────────────────────────────────────
function PlayerScreen({ shot, onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [color, setColor] = useState("#ff4d6a");
  const [brushSize, setBrushSize] = useState("md");
  const [notes, setNotes] = useState(shot.notes || []);
  const [noteText, setNoteText] = useState("");
  const [approval, setApproval] = useState(null);
  const [toast, setToast] = useState("");
  const lastPos = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const brushPx = { sm: 2, md: 4, lg: 8 }[brushSize];

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = (e) => {
    if (!drawMode) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    lastPos.current = getPos(e, canvas);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawMode || !drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => setDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    showToast("Annotation cleared");
  };

  const sendNote = () => {
    if (!noteText.trim()) return;
    setNotes(n => [...n, { author: "Eric", text: noteText.trim(), time: "Just now" }]);
    setNoteText("");
    showToast("Note added");
  };

  const handleApproval = (type) => {
    setApproval(a => a === type ? null : type);
    showToast(type === "approve" ? "✓ Approved" : "✗ Changes requested");
  };

  return (
    <div className="player-screen">
      <Toast msg={toast} />
      <div className="player-header">
        <div className="back-btn" onClick={onClose}>← Back</div>
        <div style={{ flex: 1 }}>
          <div className="player-title">{shot.name}</div>
          <div className="player-title-sub">v{shot.versionNum} · {shot.artist}</div>
        </div>
        <StatusPill status={shot.status} small />
      </div>

      {/* Video / Canvas area */}
      <div className="video-area">
        <div className="video-placeholder">
          <div className="play-icon">▶</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>No version media</div>
        </div>
        <canvas
          ref={canvasRef}
          className="canvas-overlay"
          width={430}
          height={242}
          style={{ pointerEvents: drawMode ? "all" : "none" }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        <button className={`draw-toggle ${drawMode ? "active" : ""}`} onClick={() => setDrawMode(d => !d)}>
          ✏️ {drawMode ? "Drawing" : "Annotate"}
        </button>
      </div>

      {/* Draw tools */}
      {drawMode && (
        <div className="draw-tools">
          {["#ff4d6a", "#ffb830", "#1fdf7a", "#3b9eff", "#fff"].map(c => (
            <div key={c} className={`color-dot ${color === c ? "selected" : ""}`}
              style={{ background: c }} onClick={() => setColor(c)} />
          ))}
          <div style={{ flex: 1 }} />
          {["sm", "md", "lg"].map(s => (
            <button key={s} className={`brush-btn ${brushSize === s ? "active" : ""}`}
              onClick={() => setBrushSize(s)}>{s.toUpperCase()}</button>
          ))}
          <button className="brush-btn" onClick={clearCanvas} style={{ color: "var(--red)" }}>✕</button>
        </div>
      )}

      <div className="player-body">
        {/* Approval */}
        <div className="approval-row" style={{ paddingTop: 14 }}>
          <button className={`approve-btn approve ${approval === "approve" ? "active" : ""}`}
            onClick={() => handleApproval("approve")}>✓ Approve</button>
          <button className={`approve-btn reject ${approval === "reject" ? "active" : ""}`}
            onClick={() => handleApproval("reject")}>✕ Changes</button>
        </div>

        {/* Notes */}
        <div className="notes-section">
          <div className="notes-title">Notes ({notes.length})</div>
          {notes.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>No notes yet.</div>
          )}
          {notes.map((n, i) => (
            <div key={i} className="note-item">
              <div className="note-author">{n.author}</div>
              <div className="note-text">{n.text}</div>
              <div className="note-time">{n.time}</div>
            </div>
          ))}
          <div className="note-input-row">
            <textarea
              className="note-input"
              placeholder="Add a note…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={1}
            />
            <button className="send-btn" onClick={sendNote}>↑</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────
function ReviewsTab() {
  const [detail, setDetail] = useState(null);
  const [player, setPlayer] = useState(null);

  if (player) return <PlayerScreen shot={player} onClose={() => setPlayer(null)} />;

  if (detail) return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="header">
        <div className="back-btn" onClick={() => setDetail(null)}>← Reviews</div>
        <div className="header-title" style={{ fontSize: 15 }}>{detail.name}</div>
      </div>
      <div className="scroll">
        <div className="section-label">{detail.shotCount} shots</div>
        {detail.shots.map(shot => (
          <div key={shot.id} className="shot-row" onClick={() => setPlayer(shot)}>
            <div className="shot-row-inner">
              <div className="shot-thumb-sm">
                {shot.hasVersion
                  ? <img src={shot.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                  : "🎬"}
              </div>
              <div className="shot-info">
                <div className="shot-name-lg">{shot.name}</div>
                <div className="shot-version">v{shot.versionNum} · {shot.artist}</div>
              </div>
              <StatusPill status={shot.status} small />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="header">
        <div className="header-title">f<span style={{ color: "var(--accent)" }}>track</span></div>
        <div className="header-right">
          <div className="avatar">E</div>
        </div>
      </div>
      <div className="scroll">
        <div className="section-label">Active Reviews</div>
        {MOCK_REVIEWS.map(rev => (
          <div key={rev.id} className="review-card" onClick={() => setDetail(rev)}>
            <div className="review-card-inner">
              <div className="review-name">{rev.name}</div>
              <div className="review-meta">
                <span className="review-date">{rev.date}</span>
                <span className="review-badge">{rev.shotCount} shots</span>
              </div>
            </div>
            <div className="review-thumbs">
              {rev.shots.slice(0, 4).map(s => (
                <img key={s.id} className="review-thumb" src={s.thumb} alt="" />
              ))}
              {rev.shotCount > 4 && <div className="review-thumb-more">+{rev.shotCount - 4}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shots Tab ────────────────────────────────────────────────────────────────
function ShotsTab() {
  const [shots, setShots] = useState(MOCK_SHOTS);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [statusModal, setStatusModal] = useState(null); // "single"|"bulk"
  const [modalTarget, setModalTarget] = useState(null);
  const [toast, setToast] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const filtered = shots.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status.name === statusFilter;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleTap = (shot) => {
    if (multiSelect) {
      toggleSelect(shot.id);
    } else {
      // single status change on long-press emulated via tap when not in multi mode
      setModalTarget(shot.id);
      setStatusModal("single");
    }
  };

  const handleLongPress = (shot) => {
    if (!multiSelect) {
      setMultiSelect(true);
      setSelected(new Set([shot.id]));
    }
  };

  const applyStatus = (newStatus) => {
    if (statusModal === "bulk") {
      setShots(s => s.map(sh => selected.has(sh.id) ? { ...sh, status: newStatus } : sh));
      showToast(`${selected.size} shots → ${newStatus.name}`);
      setSelected(new Set());
      setMultiSelect(false);
    } else {
      setShots(s => s.map(sh => sh.id === modalTarget ? { ...sh, status: newStatus } : sh));
      showToast(`Status → ${newStatus.name}`);
    }
    setStatusModal(null);
  };

  const selectAll = () => setSelected(new Set(filtered.map(s => s.id)));
  const clearAll = () => { setSelected(new Set()); setMultiSelect(false); };

  // Long press
  const pressTimer = useRef(null);
  const startPress = (shot) => { pressTimer.current = setTimeout(() => handleLongPress(shot), 500); };
  const endPress = () => clearTimeout(pressTimer.current);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
      <Toast msg={toast} />

      <div className="header">
        <div className="header-title">Shots</div>
        <div className="header-right">
          {multiSelect ? (
            <button style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-mono)" }} onClick={clearAll}>Cancel</button>
          ) : (
            <button style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-mono)" }} onClick={() => setMultiSelect(true)}>Select</button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="shots-toolbar">
        <input className="search-input" placeholder="Search shots…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={`filter-btn ${statusFilter ? "active" : ""}`}
          onClick={() => { setModalTarget(null); setStatusModal(statusFilter ? null : "filter"); }}>
          {statusFilter ? statusFilter.split(" ")[0] : "Filter"}
        </button>
      </div>

      {/* Bulk bar */}
      {multiSelect && selected.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-count">{selected.size} selected</div>
          <button className="bulk-action" onClick={selectAll}>All</button>
          <button className="bulk-action" onClick={() => setStatusModal("bulk")}>Set Status</button>
        </div>
      )}

      <div className="scroll">
        {filtered.length === 0 && (
          <div className="empty">
            <div className="empty-icon">🔍</div>
            <div className="empty-text">No shots match your search.</div>
          </div>
        )}
        {filtered.map(shot => (
          <div
            key={shot.id}
            className={`shot-list-item ${selected.has(shot.id) ? "selected" : ""}`}
            onClick={() => handleTap(shot)}
            onMouseDown={() => startPress(shot)}
            onMouseUp={endPress}
            onTouchStart={() => startPress(shot)}
            onTouchEnd={endPress}
          >
            {multiSelect && (
              <div className={`select-circle ${selected.has(shot.id) ? "checked" : ""}`}>
                {selected.has(shot.id) && <span style={{ fontSize: 12, color: "#fff" }}>✓</span>}
              </div>
            )}
            {shot.hasVersion
              ? <img className="shot-list-thumb" src={shot.thumb} alt="" />
              : <div className="shot-list-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎬</div>
            }
            <div className="shot-list-info">
              <div className="shot-list-name">{shot.name}</div>
              <div className="shot-list-artist">{shot.artist}</div>
            </div>
            <div className="shot-list-status">
              <StatusPill status={shot.status} small />
            </div>
          </div>
        ))}
      </div>

      {/* Status Modal */}
      {(statusModal === "single" || statusModal === "bulk") && (
        <div className="modal-overlay" onClick={() => setStatusModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">
              {statusModal === "bulk" ? `Set status for ${selected.size} shots` : "Change Status"}
            </div>
            {STATUSES.map(s => (
              <div key={s.name} className="status-option" onClick={() => applyStatus(s)}>
                <span className="status-dot" style={{ background: s.color, width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                <span className="status-option-name">{s.name}</span>
              </div>
            ))}
            <button className="modal-cancel" onClick={() => setStatusModal(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {statusModal === "filter" && (
        <div className="modal-overlay" onClick={() => setStatusModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Filter by Status</div>
            <div className="status-option" onClick={() => { setStatusFilter(null); setStatusModal(null); }}>
              <span style={{ fontSize: 14 }}>All shots</span>
              {!statusFilter && <span className="status-option-check">✓</span>}
            </div>
            {STATUSES.map(s => (
              <div key={s.name} className="status-option" onClick={() => { setStatusFilter(s.name); setStatusModal(null); }}>
                <span className="status-dot" style={{ background: s.color, width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                <span className="status-option-name">{s.name}</span>
                {statusFilter === s.name && <span className="status-option-check">✓</span>}
              </div>
            ))}
            <button className="modal-cancel" onClick={() => setStatusModal(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(null);
  const [tab, setTab] = useState("reviews");

  if (!auth) return (
    <>
      <style>{css}</style>
      <div className="app"><LoginScreen onLogin={setAuth} /></div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {tab === "reviews" && <ReviewsTab />}
          {tab === "shots" && <ShotsTab />}
        </div>
        <div className="bottom-nav">
          <div className={`nav-item ${tab === "reviews" ? "active" : ""}`} onClick={() => setTab("reviews")}>
            <div className="nav-icon">🎬</div>
            <div className="nav-label">Reviews</div>
            <div className="nav-pill">{MOCK_REVIEWS.length}</div>
          </div>
          <div className={`nav-item ${tab === "shots" ? "active" : ""}`} onClick={() => setTab("shots")}>
            <div className="nav-icon">🎞</div>
            <div className="nav-label">Shots</div>
          </div>
        </div>
      </div>
    </>
  );
}
