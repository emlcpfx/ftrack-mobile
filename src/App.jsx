import { useState, useRef, useEffect, useCallback } from "react";
import {
  createSession, loginWithPassword,
  fetchReviews, fetchReviewShots,
  fetchProjects, fetchShots, fetchStatuses, fetchShotVersions,
  updateShotStatus, bulkUpdateStatus, updateVersionStatus,
  createNote as apiCreateNote, fetchNotes as apiFetchNotes, deleteNote as apiDeleteNote,
  fetchNoteCategories,
  getThumbnailUrl, getComponentUrl, getProxiedComponentUrl, fetchVersionComponents,
} from "./api/ftrack";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const normalizeColor = (c) => {
  if (!c) return '#6b6b8a';
  if (c.startsWith('#')) return c;
  if (/^[0-9a-fA-F]{3,8}$/.test(c)) return '#' + c;
  return c;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=VT323&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #1e1a2a;
    --surface: #262235;
    --card: #2e2a3e;
    --card2: #353148;
    --border: #3d3855;
    --accent: #c77dba;
    --accent2: #d4a0c8;
    --green: #4CAF50;
    --red: #E74C3C;
    --amber: #F5A623;
    --blue: #7c6dd8;
    --text: #e8e6ef;
    --muted: #8a8599;
    --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-body); overflow: hidden; font-size:14px; -webkit-font-smoothing:antialiased; }

  .app { display: flex; flex-direction: column; height: 100dvh; max-width: 430px; margin: 0 auto; position: relative; background: var(--bg); padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }

  /* ── Login ── */
  .login { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100dvh; padding:32px; padding-top:calc(32px + env(safe-area-inset-top)); padding-bottom:calc(32px + env(safe-area-inset-bottom)); gap:24px; background: linear-gradient(180deg, #252038 0%, var(--bg) 60%); }
  .login-brand { display:flex; align-items:center; gap:14px; margin-bottom:8px; }
  .login-logo { display:flex; align-items:center; }
  .login-logo img { height:28px; filter: brightness(0) invert(1); }
  .login-divider { width:1px; height:24px; background:var(--border); }
  .login-sub { font-family:'VT323', monospace; font-size:1.4rem; font-weight:400; color:var(--muted); letter-spacing:0.12em; line-height:1; }
  .login-sub a { color:var(--muted); text-decoration:none; transition:color .2s; }
  .login-sub a:hover { color:var(--text); }
  .login-form { width:100%; display:flex; flex-direction:column; gap:14px; }
  .login-tabs { display:flex; background:var(--surface); border-radius:8px; padding:3px; gap:2px; }
  .login-tab { flex:1; padding:8px; text-align:center; font-size:13px; font-family:var(--font-body); font-weight:500; border-radius:6px; border:none; cursor:pointer; background:transparent; color:var(--muted); transition:all .2s; }
  .login-tab.active { background:var(--card); color:var(--text); }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-size:11px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; color:var(--muted); }
  .field input { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-family:var(--font-body); font-size:14px; color:var(--text); outline:none; transition:border-color .2s; }
  .field input:focus { border-color:var(--accent); }
  .btn-primary { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:14px; font-family:var(--font-body); font-size:15px; font-weight:600; cursor:pointer; letter-spacing:.3px; transition:opacity .2s, transform .1s; }
  .btn-primary:active { transform:scale(.98); opacity:.9; }
  .btn-primary:disabled { opacity:.4; cursor:not-allowed; }

  /* ── Header ── */
  .header { padding:14px 20px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); flex-shrink:0; background:var(--surface); }
  .header-title { font-family:var(--font-body); font-size:18px; font-weight:700; }
  .header-title span { color:var(--accent); }
  .header-right { display:flex; align-items:center; gap:10px; }
  .avatar { width:32px; height:32px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:#fff; }

  /* ── Scroll area ── */
  .scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding-bottom:80px; }
  .scroll::-webkit-scrollbar { display:none; }

  /* ── Bottom Nav ── */
  .bottom-nav { position:absolute; bottom:0; left:0; right:0; height:68px; background:var(--surface); border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-around; padding-bottom:env(safe-area-inset-bottom); z-index:100; }
  .nav-item { display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 20px; cursor:pointer; position:relative; }
  .nav-icon { font-size:20px; transition:transform .2s; }
  .nav-label { font-size:10px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; color:var(--muted); transition:color .2s; }
  .nav-item.active .nav-label { color:var(--accent); }
  .nav-item.active .nav-icon { transform:translateY(-2px); }
  .nav-pill { position:absolute; top:4px; right:12px; background:var(--accent); border-radius:10px; padding:1px 6px; font-size:9px; font-weight:700; color:#fff; }

  /* ── Reviews tab ── */
  .section-label { font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--muted); padding:16px 20px 8px; }
  .review-card { margin:0 16px 10px; background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; cursor:pointer; transition:transform .15s, border-color .15s; }
  .review-card:active { transform:scale(.98); border-color:var(--accent); }
  .review-card-inner { padding:14px 16px; }
  .review-name { font-size:15px; font-weight:600; margin-bottom:6px; line-height:1.3; }
  .review-meta { display:flex; gap:12px; align-items:center; }
  .review-date { font-size:12px; color:var(--muted); }
  .review-badge { background:rgba(0,151,206,.12); border-radius:6px; padding:3px 8px; font-size:11px; font-weight:600; color:var(--accent); }
  .review-thumbs { display:flex; gap:4px; padding:0 16px 14px; overflow:hidden; }
  .review-thumb { width:64px; height:36px; border-radius:6px; object-fit:cover; background:var(--card2); flex-shrink:0; }
  .review-thumb-more { width:40px; height:36px; border-radius:6px; background:var(--card2); display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--muted); flex-shrink:0; }

  /* ── Review Detail ── */
  .back-btn { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:500; color:var(--accent); cursor:pointer; padding:4px 0; }
  .shot-row { margin:0 16px 8px; background:var(--card); border:1px solid var(--border); border-radius:10px; overflow:hidden; cursor:pointer; transition:border-color .15s; }
  .shot-row:active { border-color:var(--accent); }
  .shot-row-inner { display:flex; align-items:center; gap:12px; padding:10px 12px; }
  .shot-thumb-sm { width:80px; height:45px; border-radius:6px; object-fit:cover; background:var(--card2); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:18px; }
  .shot-info { flex:1; min-width:0; }
  .shot-name-lg { font-size:14px; font-weight:600; }
  .shot-version { font-size:12px; color:var(--muted); margin-top:2px; }
  .status-pill { border-radius:4px; padding:3px 8px; font-size:11px; font-weight:600; letter-spacing:.3px; white-space:nowrap; }

  /* ── Player ── */
  .player-screen { position:absolute; inset:0; background:var(--bg); z-index:200; display:flex; flex-direction:column; padding-top:env(safe-area-inset-top); padding-bottom:env(safe-area-inset-bottom); }
  .player-header { display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--border); background:var(--surface); }
  .player-title { font-size:15px; font-weight:600; flex:1; min-width:0; }
  .player-title-sub { font-size:12px; color:var(--muted); margin-top:1px; }
  .video-area { position:relative; background:#111316; aspect-ratio:16/9; width:100%; flex-shrink:0; }
  .video-area video { width:100%; height:100%; object-fit:contain; }
  .video-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:8px; color:var(--muted); }
  .play-icon { font-size:48px; opacity:.3; }
  .canvas-overlay { position:absolute; inset:0; cursor:crosshair; touch-action:none; }
  .draw-toggle { position:absolute; top:8px; right:8px; background:rgba(0,0,0,.6); border:1px solid rgba(255,255,255,.15); border-radius:6px; padding:6px 10px; font-size:12px; color:var(--text); cursor:pointer; font-family:var(--font-body); display:flex; align-items:center; gap:5px; font-weight:500; }
  .draw-toggle.active { border-color:var(--accent); color:var(--accent); }
  .draw-tools { display:flex; gap:8px; align-items:center; padding:8px 16px; background:var(--surface); border-bottom:1px solid var(--border); }
  .color-dot { width:20px; height:20px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:border-color .15s; flex-shrink:0; }
  .color-dot.selected { border-color:#fff; }
  .brush-btn { padding:4px 10px; font-size:12px; font-weight:500; background:var(--card); border:1px solid var(--border); border-radius:6px; color:var(--text); cursor:pointer; font-family:var(--font-body); }
  .brush-btn.active { border-color:var(--accent); color:var(--accent); }
  .player-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
  .player-body::-webkit-scrollbar { display:none; }
  .notes-section { padding:16px; }
  .notes-title { font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--muted); margin-bottom:10px; }
  .note-item { background:var(--card); border-radius:8px; padding:10px 12px; margin-bottom:8px; }
  .note-clickable { cursor:pointer; transition:background .15s; }
  .note-clickable:active { background:var(--card2); }
  .note-author { font-size:11px; font-weight:600; color:var(--accent); margin-bottom:4px; }
  .note-frame { font-size:10px; font-family:monospace; color:var(--accent2); background:rgba(0,151,206,0.12); padding:2px 6px; border-radius:4px; }
  .note-delete { background:none; border:none; cursor:pointer; font-size:16px; padding:4px 6px; color:var(--red); opacity:0.7; transition:opacity .15s; }
  .note-delete:hover, .note-delete:active { opacity:1; }
  .note-annotation-thumb { width:100%; max-height:120px; object-fit:contain; border-radius:6px; margin:6px 0 4px; background:#000; }
  .note-text { font-size:13px; line-height:1.5; }
  .note-time { font-size:11px; color:var(--muted); margin-top:4px; }
  .note-input-row { display:flex; gap:8px; align-items:flex-end; margin-top:8px; }
  .note-input { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-family:var(--font-body); font-size:13px; color:var(--text); outline:none; resize:none; min-height:42px; max-height:100px; transition:border-color .2s; }
  .note-input:focus { border-color:var(--accent); }
  .send-btn { background:var(--accent); border:none; border-radius:8px; width:42px; height:42px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; color:#fff; flex-shrink:0; }
  .approval-row { display:flex; gap:8px; padding:0 16px 16px; }
  .approve-btn { flex:1; padding:12px; border-radius:8px; border:1px solid; font-family:var(--font-body); font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:6px; }
  .approve-btn.approve { border-color:var(--green); color:var(--green); background:rgba(76,175,80,.08); }
  .approve-btn.approve.active { background:var(--green); color:#fff; }
  .approve-btn.reject { border-color:var(--red); color:var(--red); background:rgba(231,76,60,.08); }
  .approve-btn.reject.active { background:var(--red); color:#fff; }

  /* ── Shots Tab ── */
  .shots-toolbar { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--border); }
  .search-input { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:9px 12px; font-family:var(--font-body); font-size:13px; color:var(--text); outline:none; }
  .search-input:focus { border-color:var(--accent); }
  .filter-btn { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:9px 12px; font-size:13px; font-weight:500; cursor:pointer; white-space:nowrap; color:var(--text); font-family:var(--font-body); }
  .filter-btn.active { border-color:var(--accent); color:var(--accent); }
  .bulk-bar { background:var(--accent); display:flex; align-items:center; gap:8px; padding:10px 16px; }
  .bulk-count { font-weight:600; font-size:14px; flex:1; color:#fff; }
  .bulk-action { background:rgba(255,255,255,.2); border:none; border-radius:6px; padding:6px 12px; font-family:var(--font-body); font-size:12px; font-weight:500; color:#fff; cursor:pointer; }
  .bulk-action:active { background:rgba(255,255,255,.35); }
  .shot-list-item { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s; user-select:none; }
  .shot-list-item.selected { background:rgba(0,151,206,.1); }
  .shot-list-item:active { background:var(--surface); }
  .select-circle { width:22px; height:22px; border-radius:50%; border:2px solid var(--border); flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .15s; }
  .select-circle.checked { background:var(--accent); border-color:var(--accent); }
  .shot-list-thumb { width:64px; height:36px; border-radius:6px; object-fit:cover; background:var(--card2); flex-shrink:0; }
  .shot-list-info { flex:1; min-width:0; }
  .shot-list-name { font-size:14px; font-weight:600; }
  .shot-list-artist { font-size:12px; color:var(--muted); margin-top:2px; }
  .shot-list-status { flex-shrink:0; }
  .status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:5px; }

  /* ── Status Picker ── */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:300; display:flex; align-items:flex-end; justify-content:center; backdrop-filter:blur(4px); }
  .modal-sheet { background:var(--surface); border-radius:16px 16px 0 0; width:100%; max-width:430px; padding:20px 0 40px; border-top:1px solid var(--border); max-height:70vh; overflow-y:auto; }
  .modal-handle { width:36px; height:4px; background:var(--border); border-radius:2px; margin:0 auto 16px; }
  .modal-title { font-size:16px; font-weight:600; padding:0 20px 14px; border-bottom:1px solid var(--border); }
  .status-option { display:flex; align-items:center; gap:12px; padding:14px 20px; cursor:pointer; transition:background .15s; }
  .status-option:active { background:var(--card); }
  .status-option-name { font-size:14px; }
  .status-option-check { margin-left:auto; color:var(--green); font-size:18px; }
  .modal-cancel { margin:8px 16px 0; padding:13px; background:var(--card); border:none; border-radius:8px; width:calc(100% - 32px); font-family:var(--font-body); font-size:15px; font-weight:600; color:var(--muted); cursor:pointer; }

  /* ── Project Picker ── */
  .project-picker { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:9px 12px; font-family:var(--font-body); font-size:13px; color:var(--text); outline:none; appearance:none; -webkit-appearance:none; cursor:pointer; width:100%; }
  .project-picker:focus { border-color:var(--accent); }
  .project-bar { padding:10px 16px; border-bottom:1px solid var(--border); }

  /* ── Loading ── */
  .loading { display:flex; align-items:center; justify-content:center; padding:60px 20px; color:var(--muted); font-size:13px; }
  .error-msg { color:var(--red); font-size:13px; text-align:center; padding:8px 16px; }

  /* ── Toast ── */
  .toast { position:absolute; top:80px; left:50%; transform:translateX(-50%); background:var(--card); border:1px solid var(--border); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:500; color:var(--text); z-index:500; white-space:nowrap; animation:fadeInOut 2.2s forwards; }
  @keyframes fadeInOut { 0%{opacity:0;transform:translateX(-50%) translateY(-8px)} 15%{opacity:1;transform:translateX(-50%) translateY(0)} 75%{opacity:1} 100%{opacity:0} }

  /* ── Shot Detail ── */
  .shot-detail { display:flex; flex-direction:column; flex:1; }
  .shot-detail-hero { padding:20px; display:flex; gap:14px; align-items:flex-start; border-bottom:1px solid var(--border); }
  .shot-detail-thumb { width:100px; height:56px; border-radius:8px; object-fit:cover; background:var(--card2); flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:24px; }
  .shot-detail-meta { flex:1; min-width:0; }
  .shot-detail-name { font-size:17px; font-weight:700; margin-bottom:4px; }
  .shot-detail-actions { display:flex; gap:8px; padding:12px 20px; border-bottom:1px solid var(--border); }
  .action-btn { flex:1; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--card); font-family:var(--font-body); font-size:13px; font-weight:500; color:var(--text); cursor:pointer; text-align:center; transition:border-color .15s; }
  .action-btn:active { border-color:var(--accent); }
  .version-item { display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s; }
  .version-item:active { background:var(--surface); }
  .version-num { width:40px; height:40px; border-radius:8px; background:var(--card); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:var(--accent); flex-shrink:0; }
  .version-info { flex:1; min-width:0; }
  .version-label { font-size:14px; font-weight:600; }
  .version-meta { font-size:12px; color:var(--muted); margin-top:2px; }
  .version-status { flex-shrink:0; }

  /* ── Misc ── */
  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--muted); gap:12px; }
  .empty-icon { font-size:40px; opacity:.3; }
  .empty-text { font-size:13px; text-align:center; line-height:1.6; }
`;

// ─── Utils ────────────────────────────────────────────────────────────────────
function StatusPill({ status, small }) {
  const color = normalizeColor(status?.color);
  return (
    <span className="status-pill" style={{
      background: color + "22",
      color: color,
      fontSize: small ? "10px" : undefined,
    }}>
      <span className="status-dot" style={{ background: color }} />
      {status?.name || 'Unknown'}
    </span>
  );
}

function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("apikey");
  const [server, setServer] = useState("https://clean-plate-fx.ftrackapp.com");
  const [apiKey, setApiKey] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      let authUser = user;
      let authKey = apiKey;
      if (mode === "password") {
        const creds = await loginWithPassword({ serverUrl: server, username: user, password: pass });
        authUser = creds.apiUser;
        authKey = creds.apiKey;
      }
      await createSession({ serverUrl: server, apiUser: authUser, apiKey: authKey });
      onLogin({ server, user: authUser, apiKey: authKey });
    } catch (err) {
      setError(err.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const ready = server && user && (mode === "apikey" ? apiKey : pass);

  return (
    <div className="login">
      <div className="login-brand">
        <div className="login-logo"><img src="https://www.ftrack.com/wp-content/uploads/2025/04/FtrackBacklight-Black.svg" alt="ftrack" /></div>
        <div className="login-divider" />
        <div className="login-sub"><a href="https://www.thevfxtools.com" target="_blank" rel="noopener noreferrer">VFX Tools</a></div>
      </div>
      <form className="login-form" onSubmit={e => { e.preventDefault(); handleLogin(); }}>
        <div className="field">
          <label>Server URL</label>
          <input placeholder="yoursite.ftrackapp.com" value={server} onChange={e => setServer(e.target.value)} />
        </div>
        <div className="login-tabs">
          <button className={`login-tab ${mode === "apikey" ? "active" : ""}`} onClick={() => setMode("apikey")}>API Key</button>
          <button className={`login-tab ${mode === "password" ? "active" : ""}`} onClick={() => setMode("password")}>Password</button>
        </div>
        <div className="field">
          <label>Username</label>
          <input placeholder="you@studio.com" value={user} onChange={e => setUser(e.target.value)} />
        </div>
        {mode === "apikey" ? (
          <div className="field">
            <label>API Key</label>
            <input placeholder="Your ftrack API key" value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" />
          </div>
        ) : (
          <div className="field">
            <label>Password</label>
            <input placeholder="Your password" value={pass} onChange={e => setPass(e.target.value)} type="password" />
          </div>
        )}
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading || !ready}>
          {loading ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}

// ─── Player Screen ────────────────────────────────────────────────────────────
function PlayerScreen({ shot, onClose }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [color, setColor] = useState("#ff4d6a");
  const [brushSize, setBrushSize] = useState("md");
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [approval, setApproval] = useState(null);
  const [toast, setToast] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fps, setFps] = useState(24);
  const lastPos = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const getCurrentFrame = () => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return null;
    return Math.round(vid.currentTime * fps);
  };

  const formatFrameAsTimecode = (frame) => {
    if (frame == null) return '';
    const totalSeconds = frame / fps;
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    const f = frame % fps;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  };

  const seekToFrame = (frame) => {
    const vid = videoRef.current;
    if (!vid || frame == null) return;
    vid.currentTime = frame / fps;
    vid.pause();
  };

  // Fetch notes for this version
  useEffect(() => {
    if (!shot.versionId) { setNotesLoading(false); return; }
    apiFetchNotes(shot.versionId)
      .then(data => {
        setNotes(data.map(n => {
          const nc = n.note_components?.[0];
          return {
            id: n.id,
            author: [n.author?.first_name, n.author?.last_name].filter(Boolean).join(' ') || 'Unknown',
            text: n.content,
            time: formatTime(n.date),
            frame: n.frame_number,
            annotationUrl: nc?.url?.value || null,
            annotationThumb: nc?.thumbnail_url?.value || nc?.thumbnail_url?.url || null,
          };
        }));
      })
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [shot.versionId]);

  // Try to load video component
  useEffect(() => {
    if (!shot.versionId) return;
    fetchVersionComponents(shot.versionId)
      .then((components) => {
        // Prefer the transcoded review MP4, then any video file
        const reviewable =
          components.find(c => c.name === 'ftrackreview-mp4') ||
          components.find(c => c.file_type === '.mp4') ||
          components.find(c => c.file_type === '.mov' || c.file_type === '.webm');
        if (reviewable) {
          const url = getProxiedComponentUrl(reviewable.id);
          if (url) setVideoUrl(url);
        }
      })
      .catch(err => console.error('[Player] Component fetch error:', err));
  }, [shot.versionId]);

  // Fetch statuses and note categories
  useEffect(() => {
    fetchStatuses()
      .then(data => setStatuses(data.map(s => ({ ...s, color: normalizeColor(s.color) }))))
      .catch(() => {});
    fetchNoteCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

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

  const hasCanvasDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((v, i) => i % 4 === 3 && v > 0);
  };

  const sendNote = async () => {
    if (!noteText.trim() && !hasCanvasDrawing()) return;
    if (!noteText.trim() && hasCanvasDrawing()) {
      showToast("Add a note to go with the annotation");
      return;
    }
    if (!shot.versionId) {
      showToast("No version to attach note to");
      return;
    }
    try {
      const frame = getCurrentFrame();
      let annotationBlob = null;
      const canvas = canvasRef.current;
      if (canvas && hasCanvasDrawing()) {
        // Composite video frame + annotation strokes into a single JPEG
        const vid = videoRef.current;
        const compCanvas = document.createElement('canvas');
        compCanvas.width = vid?.videoWidth || canvas.width;
        compCanvas.height = vid?.videoHeight || canvas.height;
        const ctx = compCanvas.getContext('2d');
        if (vid && vid.videoWidth) {
          ctx.drawImage(vid, 0, 0, compCanvas.width, compCanvas.height);
        }
        // Scale annotation canvas to match video resolution
        ctx.drawImage(canvas, 0, 0, compCanvas.width, compCanvas.height);
        annotationBlob = await new Promise(resolve => compCanvas.toBlob(resolve, 'image/jpeg', 0.92));
      }
      const internalCat = categories.find(c => c.name === 'Internal');
      const localAnnotationDataUrl = annotationBlob
        ? URL.createObjectURL(annotationBlob) : null;
      await apiCreateNote(shot.versionId, 'AssetVersion', noteText.trim(), {
        frameNumber: frame,
        annotationBlob,
        categoryId: internalCat?.id,
      });
      setNotes(n => [...n, {
        id: null,
        author: "You",
        text: noteText.trim(),
        time: "Just now",
        frame,
        annotationUrl: localAnnotationDataUrl,
        annotationThumb: localAnnotationDataUrl,
      }]);
      setNoteText("");
      if (annotationBlob) {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        setDrawMode(false);
      }
      showToast(annotationBlob ? "Note + annotation added" : "Note added");
    } catch (err) {
      console.error('[sendNote] Error:', err);
      showToast("Failed: " + (err.message || err));
    }
  };

  const handleApproval = async (type) => {
    const newApproval = approval === type ? null : type;
    setApproval(newApproval);

    if (!shot.versionId || !newApproval) {
      showToast(type === "approve" ? "Approved" : "Changes requested");
      return;
    }

    // Find matching status by name
    const targetName = type === "approve" ? "approved" : null;
    const rejectNames = ["changes needed", "requires changes", "revise", "not approved", "changes requested"];
    const matched = type === "approve"
      ? statuses.find(s => s.name.toLowerCase() === targetName)
      : statuses.find(s => rejectNames.includes(s.name.toLowerCase()));

    if (matched) {
      try {
        await updateVersionStatus(shot.versionId, matched.id);
        showToast(type === "approve" ? "Approved" : "Changes requested");
      } catch {
        showToast("Status update failed");
      }
    } else {
      showToast(type === "approve" ? "Approved (local)" : "Changes requested (local)");
    }
  };

  return (
    <div className="player-screen">
      <Toast msg={toast} />
      <div className="player-header">
        <div className="back-btn" onClick={onClose}>&#8592; Back</div>
        <div style={{ flex: 1 }}>
          <div className="player-title">{shot.name}</div>
          <div className="player-title-sub">v{shot.versionNum}{shot.artist ? ` \u00B7 ${shot.artist}` : ''}</div>
        </div>
        <StatusPill status={shot.status} small />
      </div>

      {/* Video / Canvas area */}
      <div className="video-area">
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" />
        ) : (
          <div className="video-placeholder">
            <div className="play-icon">&#9654;</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {shot.versionId ? "Loading media..." : "No version media"}
            </div>
          </div>
        )}
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
          &#9999;&#65039; {drawMode ? "Drawing" : "Annotate"}
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
          <button className="brush-btn" onClick={clearCanvas} style={{ color: "var(--red)" }}>&#10005;</button>
        </div>
      )}

      <div className="player-body">
        {/* Approval */}
        <div className="approval-row" style={{ paddingTop: 14 }}>
          <button className={`approve-btn approve ${approval === "approve" ? "active" : ""}`}
            onClick={() => handleApproval("approve")}>&#10003; Approve</button>
          <button className={`approve-btn reject ${approval === "reject" ? "active" : ""}`}
            onClick={() => handleApproval("reject")}>&#10005; Changes</button>
        </div>

        {/* Notes */}
        <div className="notes-section">
          <div className="notes-title">Notes ({notes.length})</div>
          {notesLoading && <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>Loading notes...</div>}
          {!notesLoading && notes.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>No notes yet.</div>
          )}
          {notes.map((n, i) => (
            <div key={i} className={`note-item${n.frame != null ? ' note-clickable' : ''}`}
              onClick={() => {
                if (n.frame != null) seekToFrame(n.frame);
                if (n.annotationUrl) {
                  // Draw annotation on canvas overlay
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const ctx = canvas.getContext("2d");
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    img.src = n.annotationUrl;
                  }
                }
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="note-author">{n.author}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {n.frame != null && (
                    <div className="note-frame">{formatFrameAsTimecode(n.frame)}</div>
                  )}
                  <button className="note-delete" onClick={(e) => {
                    e.stopPropagation();
                    if (!n.id) { setNotes(ns => ns.filter((_, j) => j !== i)); return; }
                    apiDeleteNote(n.id)
                      .then(() => { setNotes(ns => ns.filter(x => x.id !== n.id)); showToast("Note deleted"); })
                      .catch(() => showToast("Delete failed"));
                  }}>&#128465;</button>
                </div>
              </div>
              {n.annotationThumb && (
                <img src={n.annotationThumb} alt="annotation" className="note-annotation-thumb" />
              )}
              <div className="note-text">{n.text}</div>
              <div className="note-time">{n.time}</div>
            </div>
          ))}
          <div className="note-input-row">
            <textarea
              className="note-input"
              placeholder="Add a note..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={1}
            />
            <button className="send-btn" onClick={sendNote}>&#8593;</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────
function ReviewsTab({ userInitial }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailShots, setDetailShots] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    fetchReviews()
      .then(setReviews)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Browser back button support
  useEffect(() => {
    const onPopState = (e) => {
      const view = e.state?.view;
      if (player) { setPlayer(null); }
      else if (detail) { setDetail(null); setDetailShots([]); }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });

  const openDetail = async (review) => {
    history.pushState({ view: "detail" }, "");
    setDetail(review);
    setDetailLoading(true);
    setError("");
    try {
      const rsos = await fetchReviewShots(review.id);
      setDetailShots(rsos.map(rso => ({
        id: rso.id,
        name: rso.asset_version?.asset?.parent?.name || rso.name || 'Unknown',
        status: {
          name: rso.asset_version?.status?.name || 'Unknown',
          color: normalizeColor(rso.asset_version?.status?.color),
        },
        artist: rso.asset_version?.user?.first_name || '',
        thumb: getThumbnailUrl(rso.asset_version?.thumbnail_id),
        hasVersion: !!rso.asset_version,
        versionNum: rso.asset_version?.version || 0,
        versionId: rso.asset_version?.id,
      })));
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openPlayer = (shot) => {
    history.pushState({ view: "player" }, "");
    setPlayer(shot);
  };

  const closePlayer = () => {
    setPlayer(null);
    history.back();
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailShots([]);
    history.back();
  };

  if (player) return <PlayerScreen shot={player} onClose={closePlayer} />;

  if (detail) return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="header">
        <div className="back-btn" onClick={closeDetail}>&#8592; Reviews</div>
        <div className="header-title" style={{ fontSize: 15 }}>{detail.name}</div>
      </div>
      <div className="scroll">
        {detailLoading ? (
          <div className="loading">Loading shots...</div>
        ) : error ? (
          <div className="error-msg">{error}</div>
        ) : (
          <>
            <div className="section-label">{detailShots.length} shots</div>
            {detailShots.map(shot => (
              <div key={shot.id} className="shot-row" onClick={() => openPlayer(shot)}>
                <div className="shot-row-inner">
                  <div className="shot-thumb-sm">
                    {shot.thumb
                      ? <img src={shot.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                      : "\uD83C\uDFAC"}
                  </div>
                  <div className="shot-info">
                    <div className="shot-name-lg">{shot.name}</div>
                    <div className="shot-version">v{shot.versionNum}{shot.artist ? ` \u00B7 ${shot.artist}` : ''}</div>
                  </div>
                  <StatusPill status={shot.status} small />
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="header">
        <div className="header-title">f<span style={{ color: "var(--accent)" }}>track</span></div>
        <div className="header-right">
          <div className="avatar">{userInitial}</div>
        </div>
      </div>
      <div className="scroll">
        <div className="section-label">Reviews</div>
        {loading && <div className="loading">Loading reviews...</div>}
        {error && <div className="error-msg">{error}</div>}
        {!loading && !error && reviews.length === 0 && (
          <div className="empty">
            <div className="empty-icon">&#127916;</div>
            <div className="empty-text">No review sessions found.</div>
          </div>
        )}
        {reviews.map(rev => (
          <div key={rev.id} className="review-card" onClick={() => openDetail(rev)}>
            <div className="review-card-inner">
              <div className="review-name">{rev.name}</div>
              <div className="review-meta">
                <span className="review-date">{formatDate(rev.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shots Tab ────────────────────────────────────────────────────────────────
function ShotsTab() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [shots, setShots] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shotsLoading, setShotsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [statusModal, setStatusModal] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  const [toast, setToast] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);
  // Shot detail state
  const [detailShot, setDetailShot] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [player, setPlayer] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // Load projects and statuses on mount (separately so one failing doesn't block the other)
  useEffect(() => {
    let done = 0;
    const checkDone = () => { if (++done >= 2) setLoading(false); };

    fetchProjects()
      .then(projs => {
        setProjects(projs);
        if (projs.length > 0) setSelectedProjectId(projs[0].id);
      })
      .catch(err => { console.error('[ShotsTab] Projects error:', err); setError(err.message); })
      .finally(checkDone);

    fetchStatuses()
      .then(stats => {
        console.log('[ShotsTab] Loaded', stats.length, 'statuses');
        setStatuses(stats.map(s => ({ ...s, color: normalizeColor(s.color) })));
      })
      .catch(err => console.error('[ShotsTab] Statuses error:', err))
      .finally(checkDone);
  }, []);

  // Load shots when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setShotsLoading(true);
    setError("");
    fetchShots(selectedProjectId)
      .then(data => {
        setShots(data.map(s => ({
          id: s.id,
          name: s.name,
          status: {
            id: s.status?.id,
            name: s.status?.name || 'Unknown',
            color: normalizeColor(s.status?.color),
          },
          thumb: getThumbnailUrl(s.thumbnail_id),
        })));
      })
      .catch(err => setError(err.message))
      .finally(() => setShotsLoading(false));
  }, [selectedProjectId]);

  const filtered = shots.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
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
      openShotDetail(shot);
    }
  };

  const handleLongPress = (shot) => {
    if (!multiSelect) {
      setMultiSelect(true);
      setSelected(new Set([shot.id]));
    }
  };

  const openShotDetail = async (shot) => {
    setDetailShot(shot);
    setVersionsLoading(true);
    try {
      const vers = await fetchShotVersions(shot.id);
      setVersions(vers.map(v => ({
        id: v.id,
        version: v.version,
        status: {
          id: v.status?.id,
          name: v.status?.name || 'Unknown',
          color: normalizeColor(v.status?.color),
        },
        artist: v.user?.first_name || '',
        date: formatDate(v.date),
        thumb: getThumbnailUrl(v.thumbnail_id),
      })));
    } catch (err) {
      showToast('Failed to load versions');
    } finally {
      setVersionsLoading(false);
    }
  };

  const openVersionInPlayer = (ver) => {
    setPlayer({
      id: detailShot.id,
      name: detailShot.name,
      status: ver.status,
      artist: ver.artist,
      versionNum: ver.version,
      versionId: ver.id,
      thumb: ver.thumb,
      hasVersion: true,
    });
  };

  const applyStatus = async (newStatus) => {
    const statusWithColor = { ...newStatus, color: normalizeColor(newStatus.color) };
    try {
      if (statusModal === "bulk") {
        await bulkUpdateStatus([...selected], newStatus.id);
        setShots(s => s.map(sh => selected.has(sh.id) ? { ...sh, status: statusWithColor } : sh));
        showToast(`${selected.size} shots \u2192 ${newStatus.name}`);
        setSelected(new Set());
        setMultiSelect(false);
      } else if (statusModal === "shot-status") {
        await updateShotStatus(detailShot.id, newStatus.id);
        setDetailShot(prev => ({ ...prev, status: statusWithColor }));
        setShots(s => s.map(sh => sh.id === detailShot.id ? { ...sh, status: statusWithColor } : sh));
        showToast(`Status \u2192 ${newStatus.name}`);
      }
    } catch (err) {
      showToast("Status update failed");
    }
    setStatusModal(null);
  };

  const selectAll = () => setSelected(new Set(filtered.map(s => s.id)));
  const clearAll = () => { setSelected(new Set()); setMultiSelect(false); };

  // Long press
  const pressTimer = useRef(null);
  const startPress = (shot) => { pressTimer.current = setTimeout(() => handleLongPress(shot), 500); };
  const endPress = () => clearTimeout(pressTimer.current);

  if (loading) return <div className="loading" style={{ flex: 1 }}>Loading...</div>;

  // ── Player view ──
  if (player) return <PlayerScreen shot={player} onClose={() => setPlayer(null)} />;

  // ── Shot detail view ──
  if (detailShot) return (
    <div className="shot-detail" style={{ position: "relative" }}>
      <Toast msg={toast} />
      <div className="header">
        <div className="back-btn" onClick={() => { setDetailShot(null); setVersions([]); }}>&#8592; Shots</div>
        <div className="header-title" style={{ fontSize: 15 }}>{detailShot.name}</div>
      </div>

      <div className="shot-detail-hero">
        {detailShot.thumb
          ? <img className="shot-detail-thumb" src={detailShot.thumb} alt="" style={{ width: 100, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          : <div className="shot-detail-thumb">&#127916;</div>
        }
        <div className="shot-detail-meta">
          <div className="shot-detail-name">{detailShot.name}</div>
          <StatusPill status={detailShot.status} />
        </div>
      </div>

      <div className="shot-detail-actions">
        <button className="action-btn" onClick={() => setStatusModal("shot-status")}>Change Status</button>
      </div>

      <div className="scroll">
        <div className="section-label">Versions ({versions.length})</div>
        {versionsLoading && <div className="loading">Loading versions...</div>}
        {!versionsLoading && versions.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 20px' }}>No versions published yet.</div>
        )}
        {versions.map(ver => (
          <div key={ver.id} className="version-item" onClick={() => openVersionInPlayer(ver)}>
            <div className="version-num">v{ver.version}</div>
            <div className="version-info">
              <div className="version-label">Version {ver.version}</div>
              <div className="version-meta">{[ver.artist, ver.date].filter(Boolean).join(' \u00B7 ')}</div>
            </div>
            <div className="version-status">
              <StatusPill status={ver.status} small />
            </div>
          </div>
        ))}
      </div>

      {/* Status Modal for shot */}
      {statusModal === "shot-status" && (
        <div className="modal-overlay" onClick={() => setStatusModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Change Status</div>
            {statuses.map(s => (
              <div key={s.id} className="status-option" onClick={() => applyStatus(s)}>
                <span className="status-dot" style={{ background: s.color, width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                <span className="status-option-name">{s.name}</span>
                {detailShot.status.id === s.id && <span className="status-option-check">&#10003;</span>}
              </div>
            ))}
            <button className="modal-cancel" onClick={() => setStatusModal(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Shot list view ──
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
      <Toast msg={toast} />

      <div className="header">
        <div className="header-title">Shots</div>
        <div className="header-right">
          {multiSelect ? (
            <button style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={clearAll}>Cancel</button>
          ) : (
            <button style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={() => setMultiSelect(true)}>Select</button>
          )}
        </div>
      </div>

      {/* Project Picker */}
      {projects.length > 1 && (
        <div className="project-bar">
          <select
            className="project-picker"
            value={selectedProjectId || ''}
            onChange={e => setSelectedProjectId(e.target.value)}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Toolbar */}
      <div className="shots-toolbar">
        <input className="search-input" placeholder="Search shots..." value={search} onChange={e => setSearch(e.target.value)} />
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
        {shotsLoading && <div className="loading">Loading shots...</div>}
        {error && <div className="error-msg">{error}</div>}
        {!shotsLoading && !error && filtered.length === 0 && (
          <div className="empty">
            <div className="empty-icon">&#128269;</div>
            <div className="empty-text">{shots.length === 0 ? "No shots in this project." : "No shots match your search."}</div>
          </div>
        )}
        {!shotsLoading && filtered.map(shot => (
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
                {selected.has(shot.id) && <span style={{ fontSize: 12, color: "#fff" }}>&#10003;</span>}
              </div>
            )}
            {shot.thumb
              ? <img className="shot-list-thumb" src={shot.thumb} alt="" />
              : <div className="shot-list-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>&#127916;</div>
            }
            <div className="shot-list-info">
              <div className="shot-list-name">{shot.name}</div>
            </div>
            <div className="shot-list-status">
              <StatusPill status={shot.status} small />
            </div>
          </div>
        ))}
      </div>

      {/* Bulk Status Modal */}
      {statusModal === "bulk" && (
        <div className="modal-overlay" onClick={() => setStatusModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Set status for {selected.size} shots</div>
            {statuses.map(s => (
              <div key={s.id} className="status-option" onClick={() => applyStatus(s)}>
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
              {!statusFilter && <span className="status-option-check">&#10003;</span>}
            </div>
            {statuses.map(s => (
              <div key={s.id} className="status-option" onClick={() => { setStatusFilter(s.name); setStatusModal(null); }}>
                <span className="status-dot" style={{ background: s.color, width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                <span className="status-option-name">{s.name}</span>
                {statusFilter === s.name && <span className="status-option-check">&#10003;</span>}
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
  const [restoring, setRestoring] = useState(true);

  // Restore saved session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ftrack_auth');
      if (saved) {
        const { server, user, apiKey } = JSON.parse(saved);
        if (server && user && apiKey) {
          createSession({ serverUrl: server, apiUser: user, apiKey })
            .then(() => setAuth({ server, user }))
            .catch(() => localStorage.removeItem('ftrack_auth'))
            .finally(() => setRestoring(false));
          return;
        }
      }
    } catch {}
    setRestoring(false);
  }, []);

  const handleLogin = (authData) => {
    setAuth(authData);
    // Save credentials for session persistence
    if (authData.apiKey) {
      localStorage.setItem('ftrack_auth', JSON.stringify({
        server: authData.server,
        user: authData.user,
        apiKey: authData.apiKey,
      }));
    }
  };

  const userInitial = auth?.user?.[0]?.toUpperCase() || "?";

  if (restoring) return (
    <>
      <style>{css}</style>
      <div className="app"><div className="loading" style={{ flex: 1 }}>Connecting...</div></div>
    </>
  );

  if (!auth) return (
    <>
      <style>{css}</style>
      <div className="app"><LoginScreen onLogin={handleLogin} /></div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {tab === "reviews" && <ReviewsTab userInitial={userInitial} />}
          {tab === "shots" && <ShotsTab />}
        </div>
        <div className="bottom-nav">
          <div className={`nav-item ${tab === "reviews" ? "active" : ""}`} onClick={() => setTab("reviews")}>
            <div className="nav-icon">&#127916;</div>
            <div className="nav-label">Reviews</div>
          </div>
          <div className={`nav-item ${tab === "shots" ? "active" : ""}`} onClick={() => setTab("shots")}>
            <div className="nav-icon">&#127902;</div>
            <div className="nav-label">Shots</div>
          </div>
        </div>
      </div>
    </>
  );
}
