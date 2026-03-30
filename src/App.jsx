import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  createSession,
  fetchReviews, fetchReviewShots, fetchReviewThumbnails, fetchTaskStatusesByShots,
  fetchProjects, fetchShots, fetchProjectTasks, fetchStatuses, fetchShotStatuses, fetchShotVersions,
  fetchProjectMembers, assignUserToShots, unassignUserFromShots,
  updateShotStatus, bulkUpdateStatus, updateVersionStatus, updateTaskStatus,
  bulkUpdateTaskStatus, bulkUpdateVersionStatus,
  createNote as apiCreateNote, createReply as apiCreateReply,
  fetchNotes as apiFetchNotes, deleteNote as apiDeleteNote,
  fetchNoteCategories, fetchNoteCounts,
  getThumbnailUrl, getComponentUrl, getProxiedComponentUrl, fetchVersionComponents,
  addVersionToReview, removeFromReview, createReviewSession,
  searchVersionsForReview, transferNotes, transferEditedNotes,
  getReviewUrl,
  fetchCustomAttributeConfigs, fetchCustomAttributeValues,
} from "./api/ftrack";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const normalizeColor = (c) => {
  if (!c) return '#6b7280';
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
  html, body, #root { height: 100%; }

  :root {
    --bg: #1a1d21;
    --surface: #222628;
    --card: #2a2e32;
    --card2: #32373c;
    --border: #3a3f44;
    --accent: #c77dba;
    --accent2: #d4a0c8;
    --green: #4CAF50;
    --red: #E74C3C;
    --amber: #F5A623;
    --blue: #2196F3;
    --text: #e8eaed;
    --muted: #8b9298;
    --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-body); overflow: hidden; font-size:14px; -webkit-font-smoothing:antialiased; }

  .app { display: flex; flex-direction: column; height: 100vh; height: 100dvh; max-width: 430px; margin: 0 auto; position: relative; background: var(--bg); padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); overflow: hidden; }

  /* ── Login ── */
  .login { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100dvh; padding:32px; padding-top:calc(32px + env(safe-area-inset-top)); padding-bottom:calc(32px + env(safe-area-inset-bottom)); gap:24px; background: linear-gradient(180deg, #1f2225 0%, var(--bg) 60%); }
  .brand-logo { display:flex; align-items:center; gap:12px; }
  .brand-logo img { filter: brightness(0) invert(1); }
  .brand-logo .brand-divider { width:1px; align-self:stretch; background:var(--border); }
  .brand-logo .brand-vfxtools { font-family:'VT323', monospace; font-weight:400; color:#fff; letter-spacing:-0.01em; line-height:1; text-decoration:none; border:1px solid rgba(255,255,255,0.3); border-radius:4px; display:flex; align-items:center; box-sizing:border-box; }
  .brand-logo--lg img { height:32px; }
  .brand-logo--lg .brand-vfxtools { font-size:1.55rem; padding:5px 10px; height:32px; }
  .brand-logo--sm img { height:26px; }
  .brand-logo--sm .brand-vfxtools { font-size:1.25rem; padding:4px 8px; height:26px; }
  .login-brand { margin-bottom:8px; }
  .login-form { width:100%; display:flex; flex-direction:column; gap:14px; }
  .api-key-link { display:block; font-size:12px; color:var(--accent); text-decoration:none; margin-top:6px; }
  .api-key-link:active { color:var(--accent2); }
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
  .scroll { flex:1; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; padding-bottom:80px; min-height:0; }
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
  .status-pill-clickable { transition: opacity .15s; -webkit-tap-highlight-color: transparent; }
  .status-pill-clickable:active { opacity: .6; }

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

  /* ── Note Category & Mention ── */
  .note-cat-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
  .note-cat-chip { padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid var(--border); background:var(--card); color:var(--muted); font-family:var(--font-body); white-space:nowrap; }
  .note-cat-chip.active { border-color:var(--accent); color:var(--accent); background:rgba(199,125,186,.1); }
  .note-category-label { font-size:10px; font-weight:600; background:rgba(33,150,243,.1); color:var(--blue); padding:1px 6px; border-radius:4px; }
  .mention-dropdown { position:absolute; bottom:100%; left:0; right:0; background:var(--surface); border:1px solid var(--border); border-radius:8px 8px 0 0; max-height:150px; overflow-y:auto; z-index:10; box-shadow:0 -4px 12px rgba(0,0,0,.3); }
  .mention-dropdown::-webkit-scrollbar { display:none; }
  .mention-item { padding:10px 14px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border); }
  .mention-item:active { background:var(--card); }
  .mention-item-name { font-weight:600; }
  .mention-item-user { font-size:11px; color:var(--muted); }

  /* ── Note Replies ── */
  .note-reply-btn { background:none; border:none; cursor:pointer; font-size:11px; color:var(--accent); font-family:var(--font-body); font-weight:500; padding:2px 0; }
  .note-reply-btn:active { opacity:.7; }
  .note-replies { margin-top:6px; padding-left:12px; border-left:2px solid var(--border); display:flex; flex-direction:column; gap:6px; }
  .note-reply { background:var(--bg); border-radius:6px; padding:6px 8px; }
  .note-reply-author { font-size:10px; font-weight:600; color:var(--accent); }
  .note-reply-text { font-size:12px; line-height:1.4; margin-top:2px; }
  .note-reply-time { font-size:10px; color:var(--muted); margin-top:2px; }
  .note-reply-input-row { display:flex; gap:6px; margin-top:6px; align-items:flex-end; }
  .note-reply-input { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:6px 8px; font-family:var(--font-body); font-size:12px; color:var(--text); outline:none; resize:none; min-height:32px; }
  .note-reply-input:focus { border-color:var(--accent); }
  .note-reply-send { background:var(--accent); border:none; border-radius:6px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px; color:#fff; flex-shrink:0; }
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
  .shot-list-item { display:flex; flex-wrap:wrap; align-items:center; gap:10px 12px; padding:12px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s; user-select:none; }
  .shot-list-item.selected { background:rgba(0,151,206,.1); }
  .shot-list-item:active { background:var(--surface); }
  .select-circle { width:22px; height:22px; border-radius:50%; border:2px solid var(--border); flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .15s; }
  .select-circle.checked { background:var(--accent); border-color:var(--accent); }
  .shot-list-thumb { width:64px; height:36px; border-radius:6px; object-fit:cover; background:var(--card2); flex-shrink:0; }
  .shot-list-info { flex:1; min-width:0; overflow:hidden; }
  .shot-list-name { font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .shot-list-artist { font-size:12px; color:var(--muted); margin-top:2px; }
  .shot-list-tasks { width:100%; padding-left:76px; display:flex; flex-direction:column; gap:4px; margin-top:-2px; }
  .shot-task-row { display:flex; align-items:center; justify-content:space-between; }
  .shot-task-name { font-size:12px; color:var(--muted); }
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

  /* ── Review Edit Mode ── */
  .edit-bar { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--border); background:var(--surface); }
  .edit-bar-title { flex:1; font-size:13px; font-weight:600; color:var(--muted); }
  .edit-btn { background:none; border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-family:var(--font-body); font-size:12px; font-weight:500; color:var(--text); cursor:pointer; }
  .edit-btn:active { border-color:var(--accent); }
  .edit-btn--accent { border-color:var(--accent); color:var(--accent); }
  .edit-btn--danger { border-color:var(--red); color:var(--red); }
  .shot-row-edit { display:flex; align-items:center; gap:0; }
  .shot-row-delete { width:44px; height:100%; display:flex; align-items:center; justify-content:center; color:var(--red); font-size:20px; cursor:pointer; flex-shrink:0; padding:10px 0; }
  .shot-row-delete:active { opacity:.6; }
  .transfer-btn { display:flex; align-items:center; gap:6px; background:rgba(33,150,243,.1); border:1px solid var(--blue); border-radius:8px; padding:10px 14px; margin:0 16px 8px; cursor:pointer; font-family:var(--font-body); font-size:13px; font-weight:500; color:var(--blue); }
  .transfer-btn:active { opacity:.7; }

  /* ── Transfer Feedback Modal ── */
  .transfer-modal { background:var(--surface); border-radius:16px 16px 0 0; width:100%; max-width:430px; max-height:85vh; display:flex; flex-direction:column; border-top:1px solid var(--border); }
  .transfer-modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); }
  .transfer-modal-title { font-size:16px; font-weight:700; }
  .transfer-modal-close { font-size:24px; color:var(--muted); cursor:pointer; padding:0 4px; line-height:1; }
  .transfer-modal-close:active { color:var(--text); }
  .transfer-modal-info { padding:12px 20px; font-size:12px; color:var(--muted); border-bottom:1px solid var(--border); line-height:1.5; }
  .transfer-select-all { display:flex; align-items:center; gap:10px; padding:12px 20px; border-bottom:1px solid var(--border); cursor:pointer; }
  .transfer-select-all:active { background:var(--card); }
  .transfer-modal-list { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; min-height:0; }
  .transfer-modal-list::-webkit-scrollbar { display:none; }
  .transfer-modal-item-wrap { border-bottom:1px solid var(--border); }
  .transfer-modal-item-wrap.selected { background:rgba(199,125,186,.06); }
  .transfer-modal-item { display:flex; align-items:center; gap:10px; padding:10px 20px; cursor:pointer; transition:background .15s; }
  .transfer-modal-item:active { background:var(--card); }
  .transfer-note-badge { font-size:11px; font-weight:600; padding:3px 8px; border-radius:10px; background:var(--card); color:var(--muted); white-space:nowrap; flex-shrink:0; }
  .transfer-note-badge.has-notes { background:rgba(33,150,243,.12); color:var(--blue); }
  .transfer-notes-list { padding:0 20px 10px 52px; display:flex; flex-direction:column; gap:8px; }
  .transfer-note-item { background:var(--card); border-radius:8px; padding:8px 10px; }
  .transfer-note-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:6px; }
  .transfer-note-author { font-size:11px; font-weight:600; color:var(--accent); }
  .transfer-note-cat { font-size:10px; background:rgba(33,150,243,.1); color:var(--blue); padding:1px 6px; border-radius:4px; }
  .transfer-note-frame { font-size:10px; font-family:monospace; color:var(--accent2); background:rgba(199,125,186,.12); padding:1px 6px; border-radius:4px; }
  .transfer-note-date { font-size:10px; color:var(--muted); margin-left:auto; }
  .transfer-note-edit { width:100%; background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:8px 10px; font-family:var(--font-body); font-size:12px; color:var(--text); outline:none; resize:vertical; min-height:40px; line-height:1.5; transition:border-color .2s; }
  .transfer-note-edit:focus { border-color:var(--accent); }
  .transfer-note-edit:disabled { opacity:.5; }
  .transfer-modal-actions { display:flex; gap:10px; padding:16px 20px; border-top:1px solid var(--border); padding-bottom:calc(16px + env(safe-area-inset-bottom)); }

  /* ── Add to Review Modal ── */
  .add-review-search { padding:12px 16px; border-bottom:1px solid var(--border); }
  .add-review-results { padding:8px 0; }
  .add-review-item { display:flex; align-items:center; gap:12px; padding:10px 16px; cursor:pointer; transition:background .15s; }
  .add-review-item:active { background:var(--card); }
  .add-review-item .shot-thumb-sm { width:64px; height:36px; }
  .add-review-check { width:24px; height:24px; border-radius:50%; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .add-review-check.added { background:var(--green); border-color:var(--green); }

  /* ── Chat Tab ── */
  .chat-container { display:flex; flex-direction:column; flex:1; min-height:0; }
  .chat-messages { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:16px; display:flex; flex-direction:column; gap:12px; }
  .chat-messages::-webkit-scrollbar { display:none; }
  .chat-msg { max-width:85%; padding:10px 14px; border-radius:12px; font-size:13px; line-height:1.5; word-wrap:break-word; }
  .chat-msg--user { align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
  .chat-msg--bot { align-self:flex-start; background:var(--card); color:var(--text); border-bottom-left-radius:4px; }
  .chat-msg--bot code { background:var(--bg); padding:1px 4px; border-radius:3px; font-size:12px; }
  .chat-msg--system { align-self:center; background:rgba(33,150,243,.1); color:var(--blue); font-size:12px; padding:6px 12px; border-radius:20px; }
  .chat-msg--error { align-self:center; background:rgba(231,76,60,.1); color:var(--red); font-size:12px; padding:6px 12px; border-radius:20px; }
  .chat-input-row { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--border); background:var(--surface); padding-bottom:calc(12px + env(safe-area-inset-bottom)); }
  .chat-input { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:20px; padding:10px 16px; font-family:var(--font-body); font-size:13px; color:var(--text); outline:none; resize:none; min-height:40px; max-height:100px; }
  .chat-input:focus { border-color:var(--accent); }
  .chat-send { background:var(--accent); border:none; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; color:#fff; flex-shrink:0; }
  .chat-send:disabled { opacity:.4; }
  .chat-suggestions { display:flex; flex-wrap:wrap; gap:6px; padding:8px 16px; }
  .chat-suggestion { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:6px 12px; font-size:12px; color:var(--muted); cursor:pointer; font-family:var(--font-body); }
  .chat-suggestion:active { border-color:var(--accent); color:var(--accent); }
  .chat-action-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-top:8px; }
  .chat-action-row { display:flex; gap:8px; margin-top:8px; }
  .chat-action-btn { padding:6px 14px; border-radius:6px; border:none; font-family:var(--font-body); font-size:12px; font-weight:600; cursor:pointer; }
  .chat-action-btn--primary { background:var(--accent); color:#fff; }
  .chat-action-btn--secondary { background:var(--card); color:var(--muted); border:1px solid var(--border); }
  .chat-typing { display:flex; gap:4px; align-items:center; padding:4px 0; }
  .chat-typing span { width:6px; height:6px; border-radius:50%; background:var(--muted); animation:chatBounce .6s infinite alternate; }
  .chat-typing span:nth-child(2) { animation-delay:.2s; }
  .chat-typing span:nth-child(3) { animation-delay:.4s; }
  @keyframes chatBounce { 0%{opacity:.3;transform:translateY(0)} 100%{opacity:1;transform:translateY(-4px)} }

  /* ── Review Thumbnails ── */
  .review-card-thumbs { display:flex; gap:4px; padding:0 16px 12px; }
  .review-card-thumb { width:56px; height:32px; border-radius:4px; object-fit:cover; background:var(--card2); flex-shrink:0; }
  .review-card-count { display:flex; align-items:center; justify-content:center; min-width:40px; height:32px; border-radius:4px; background:var(--card2); font-size:10px; color:var(--muted); flex-shrink:0; padding:0 6px; }

  /* ── Create Review ── */
  .create-review-btn { display:flex; align-items:center; justify-content:center; gap:6px; margin:0 16px 10px; padding:12px; background:var(--card); border:1px dashed var(--border); border-radius:12px; cursor:pointer; color:var(--accent); font-size:13px; font-weight:600; font-family:var(--font-body); }
  .create-review-btn:active { background:var(--card2); }
  .create-review-input { margin:0 16px 10px; display:flex; gap:8px; }
  .create-review-input input { flex:1; }

  /* ── Bulk Status Bar ── */
  .review-bulk-bar { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--border); background:var(--surface); }
  .review-bulk-count { flex:1; font-size:13px; font-weight:600; color:var(--muted); }
  .review-bulk-btn { border:1px solid; border-radius:6px; padding:6px 12px; font-family:var(--font-body); font-size:12px; font-weight:600; cursor:pointer; background:none; }
  .review-bulk-btn--approve { border-color:var(--green); color:var(--green); }
  .review-bulk-btn--approve:active { background:var(--green); color:#fff; }
  .review-bulk-btn--reject { border-color:var(--red); color:var(--red); }
  .review-bulk-btn--reject:active { background:var(--red); color:#fff; }
  .review-bulk-btn--status { border-color:var(--accent); color:var(--accent); }
  .review-bulk-btn--status:active { background:var(--accent); color:#fff; }

  /* ── Share Modal ── */
  .share-url-row { display:flex; gap:8px; align-items:center; padding:16px 20px; }
  .share-url-input { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-family:var(--font-body); font-size:12px; color:var(--text); outline:none; }
  .share-copy-btn { background:var(--accent); border:none; border-radius:8px; padding:10px 14px; font-size:12px; font-weight:600; color:#fff; cursor:pointer; font-family:var(--font-body); white-space:nowrap; }
  .share-copy-btn:active { opacity:.8; }

  /* ── Reviews search ── */
  .reviews-toolbar { padding:10px 16px; border-bottom:1px solid var(--border); display:flex; gap:8px; }
  .reviews-sort-btn { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:9px 12px; font-size:12px; cursor:pointer; color:var(--text); font-family:var(--font-body); white-space:nowrap; }
  .reviews-sort-btn:active { border-color:var(--accent); }

  /* ── Notes badge ── */
  .notes-badge { position:absolute; top:2px; right:2px; background:var(--blue); border-radius:8px; padding:1px 5px; font-size:9px; font-weight:700; color:#fff; min-width:16px; text-align:center; }

  /* ── Transfer destination ── */
  .transfer-dest-row { display:flex; gap:8px; padding:8px 20px; border-bottom:1px solid var(--border); }
  .transfer-dest-btn { flex:1; padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--card); font-family:var(--font-body); font-size:12px; font-weight:600; color:var(--muted); cursor:pointer; text-align:center; }
  .transfer-dest-btn.active { border-color:var(--accent); color:var(--accent); background:rgba(199,125,186,.08); }

  /* ── Misc ── */
  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--muted); gap:12px; }
  .empty-icon { font-size:40px; opacity:.3; }
  .empty-text { font-size:13px; text-align:center; line-height:1.6; }
`;

// ─── Utils ────────────────────────────────────────────────────────────────────
function StatusPill({ status, small, onClick }) {
  const color = normalizeColor(status?.color);
  return (
    <span className={`status-pill${onClick ? ' status-pill-clickable' : ''}`} style={{
      background: color + "22",
      color: color,
      fontSize: small ? "10px" : undefined,
      cursor: onClick ? 'pointer' : undefined,
    }} onClick={onClick}>
      <span className="status-dot" style={{ background: color }} />
      {status?.name || 'Unknown'}
    </span>
  );
}

function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

function BrandLogo({ size = "sm" }) {
  return (
    <div className={`brand-logo brand-logo--${size}`}>
      <img src="https://www.ftrack.com/wp-content/uploads/2025/04/FtrackBacklight-Black.svg" alt="ftrack" />
      <div className="brand-divider" />
      <a className="brand-vfxtools" href="https://www.thevfxtools.com" target="_blank" rel="noopener noreferrer">VFX Tools</a>
    </div>
  );
}

// ─── Domain → Server mapping ──────────────────────────────────────────────────
const DOMAIN_SERVER_MAP = {
  'review.cleanplatefx.com': 'https://clean-plate-fx.ftrackapp.com',
};

function getDefaultServerUrl() {
  return DOMAIN_SERVER_MAP[window.location.hostname] || '';
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const defaultServer = getDefaultServerUrl();
  const [server, setServer] = useState(defaultServer);
  const [apiKey, setApiKey] = useState("");
  const [user, setUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await createSession({ serverUrl: server, apiUser: user, apiKey });
      onLogin({ server, user, apiKey });
    } catch (err) {
      setError(err.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const apiKeysUrl = server
    ? `${server.replace(/\/+$/, '')}/#view=my_account&tab=api_keys`
    : null;

  const ready = server && user && apiKey;

  return (
    <div className="login">
      <div className="login-brand">
        <BrandLogo size="lg" />
      </div>
      <form className="login-form" onSubmit={e => { e.preventDefault(); handleLogin(); }}>
        {!defaultServer && (
          <div className="field">
            <label>Server URL</label>
            <input placeholder="yoursite.ftrackapp.com" value={server} onChange={e => setServer(e.target.value)} autoComplete="url" />
          </div>
        )}
        <div className="field">
          <label>Username</label>
          <input placeholder="you@studio.com" value={user} onChange={e => setUser(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>API Key</label>
          <input placeholder="Your ftrack API key" value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" autoComplete="current-password" />
          {apiKeysUrl && (
            <a href={apiKeysUrl} target="_blank" rel="noopener noreferrer" className="api-key-link">
              Get your API key from ftrack →
            </a>
          )}
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading || !ready}>
          {loading ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}

// ─── Player Screen ────────────────────────────────────────────────────────────
function PlayerScreen({ shot, onClose, shots, onSwitch, onStatusChange }) {
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
  const [statusPicker, setStatusPicker] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(shot.status);
  const [toast, setToast] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [fps, setFps] = useState(24);
  const lastPos = useRef(null);
  // @mentions
  const [members, setMembers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionResults, setMentionResults] = useState([]);
  const noteInputRef = useRef(null);
  // Replies
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');

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

  // Fetch notes for this version (with reply threading)
  useEffect(() => {
    if (!shot.versionId) { setNotesLoading(false); return; }
    apiFetchNotes(shot.versionId)
      .then(data => {
        const allNotes = data.map(n => {
          const nc = n.note_components?.[0];
          return {
            id: n.id,
            author: [n.author?.first_name, n.author?.last_name].filter(Boolean).join(' ') || 'Unknown',
            text: n.content,
            time: formatTime(n.date),
            frame: n.frame_number,
            category: n.category?.name || null,
            inReplyToId: n.in_reply_to_id || null,
            annotationUrl: nc?.url?.value || null,
            annotationThumb: nc?.thumbnail_url?.value || nc?.thumbnail_url?.url || null,
          };
        });
        // Separate top-level notes and replies
        const replyMap = {};
        const topLevel = [];
        for (const n of allNotes) {
          if (n.inReplyToId) {
            if (!replyMap[n.inReplyToId]) replyMap[n.inReplyToId] = [];
            replyMap[n.inReplyToId].push(n);
          } else {
            topLevel.push(n);
          }
        }
        // Attach replies to their parent
        setNotes(topLevel.map(n => ({ ...n, replies: replyMap[n.id] || [] })));
      })
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [shot.versionId]);

  // Fetch project members for @mentions
  useEffect(() => {
    fetchProjectMembers().then(setMembers).catch(() => {});
  }, []);

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
      const catId = selectedCategory || categories.find(c => c.name === 'Internal')?.id || null;
      const catName = categories.find(c => c.id === catId)?.name || null;
      const localAnnotationDataUrl = annotationBlob
        ? URL.createObjectURL(annotationBlob) : null;
      await apiCreateNote(shot.versionId, 'AssetVersion', noteText.trim(), {
        frameNumber: frame,
        annotationBlob,
        categoryId: catId,
      });
      setNotes(n => [...n, {
        id: null,
        author: "You",
        text: noteText.trim(),
        time: "Just now",
        frame,
        category: catName,
        replies: [],
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

  // @mention handling
  const handleNoteInput = (e) => {
    const val = e.target.value;
    setNoteText(val);
    // Check for @ trigger
    const cursorPos = e.target.selectionStart;
    const textBefore = val.substring(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      setMentionQuery(atMatch[0]);
      setMentionResults(members.filter(m => {
        const name = [m.first_name, m.last_name].filter(Boolean).join(' ').toLowerCase();
        return name.includes(query) || (m.username || '').toLowerCase().includes(query);
      }).slice(0, 5));
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  const insertMention = (member) => {
    const name = [member.first_name, member.last_name].filter(Boolean).join(' ');
    const newText = noteText.replace(/@\w*$/, `@${name} `);
    setNoteText(newText);
    setMentionQuery(null);
    setMentionResults([]);
    noteInputRef.current?.focus();
  };

  // Reply to note
  const sendReply = async (parentNote) => {
    if (!replyText.trim() || !parentNote.id) return;
    try {
      await apiCreateReply(parentNote.id, shot.versionId, 'AssetVersion', replyText.trim(), {
        categoryId: selectedCategory || null,
      });
      setNotes(prev => prev.map(n => {
        if (n.id !== parentNote.id) return n;
        return { ...n, replies: [...(n.replies || []), { id: null, author: 'You', text: replyText.trim(), time: 'Just now' }] };
      }));
      setReplyText('');
      setReplyingTo(null);
      showToast('Reply added');
    } catch (err) {
      showToast('Reply failed: ' + (err.message || err));
    }
  };

  // handleApproval removed — replaced by status picker

  if (statusPicker) {
    return (
      <div className="player-screen">
        <div className="header">
          <div className="back-btn" onClick={() => setStatusPicker(false)}>&#8592; Back</div>
          <div className="header-title" style={{ fontSize: 15 }}>Change Status</div>
        </div>
        <div className="scroll">
          {statuses.map(s => (
            <div key={s.id} className="shot-list-item" onClick={async () => {
              const newStatus = { id: s.id, name: s.name, color: normalizeColor(s.color) };
              try {
                // Always update the Task status — version status is not used
                if (shot.taskId) {
                  console.log('[Player] Updating Task status:', shot.taskId, '→', s.name, s.id);
                  await updateTaskStatus(shot.taskId, s.id);
                } else {
                  // Fallback: update version status if no task is linked
                  console.log('[Player] No taskId, falling back to version status:', shot.versionId, '→', s.name, s.id);
                  await updateVersionStatus(shot.versionId, s.id);
                }
                setCurrentStatus(newStatus);
                if (onStatusChange) onStatusChange(shot.id, newStatus);
                showToast(`Status \u2192 ${s.name}`);
              } catch (err) {
                console.error('[Player] Status update error:', err);
                showToast(`Failed: ${err.message || 'Status update failed'}`);
              }
              setStatusPicker(false);
            }}>
              <span style={{ background: normalizeColor(s.color), width: 12, height: 12, borderRadius: '50%', flexShrink: 0 }} />
              <div className="shot-list-info"><div className="shot-list-name">{s.name}</div></div>
              {currentStatus?.id === s.id && <span style={{ color: 'var(--green)', fontSize: 18 }}>&#10003;</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="player-screen">
      <Toast msg={toast} />
      <div className="player-header">
        <div className="back-btn" onClick={onClose}>&#8592; Back</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="player-title">{shot.name}</div>
          <div className="player-title-sub">v{shot.versionNum}{shot.artist ? ` \u00B7 ${shot.artist}` : ''}</div>
        </div>
        {shots && shots.length > 1 && onSwitch && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, width: 32, height: 32, color: 'var(--text)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => { const i = shots.findIndex(s => s.id === shot.id); if (i > 0) onSwitch(shots[i - 1]); }}
              disabled={shots.findIndex(s => s.id === shot.id) === 0}>&#9664;</button>
            <button style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, width: 32, height: 32, color: 'var(--text)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => { const i = shots.findIndex(s => s.id === shot.id); if (i < shots.length - 1) onSwitch(shots[i + 1]); }}
              disabled={shots.findIndex(s => s.id === shot.id) === shots.length - 1}>&#9654;</button>
          </div>
        )}
        <div>
          <StatusPill status={currentStatus} small onClick={() => setStatusPicker(true)} />
        </div>
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
        {/* Status */}
        <div style={{ padding: '14px 16px 0' }}>
          <StatusPill status={currentStatus} onClick={(shot.taskId || shot.versionId) ? () => setStatusPicker(true) : undefined} />
        </div>

        {/* Notes */}
        <div className="notes-section">
          <div className="notes-title">Notes ({notes.length})</div>
          {notesLoading && <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>Loading notes...</div>}
          {!notesLoading && notes.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>No notes yet.</div>
          )}
          {notes.map((n, i) => (
            <div key={n.id || i} className="note-item">
              <div className={n.frame != null ? 'note-clickable' : ''} onClick={() => {
                if (n.frame != null) seekToFrame(n.frame);
                if (n.annotationUrl) {
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
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div className="note-author">{n.author}</div>
                    {n.category && <span className="note-category-label">{n.category}</span>}
                  </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <div className="note-time">{n.time}</div>
                  {n.id && <button className="note-reply-btn" onClick={(e) => { e.stopPropagation(); setReplyingTo(replyingTo === n.id ? null : n.id); setReplyText(''); }}>Reply{n.replies?.length ? ` (${n.replies.length})` : ''}</button>}
                </div>
              </div>

              {/* Replies */}
              {(n.replies?.length > 0 || replyingTo === n.id) && (
                <div className="note-replies">
                  {(n.replies || []).map((r, ri) => (
                    <div key={r.id || ri} className="note-reply">
                      <div className="note-reply-author">{r.author}</div>
                      <div className="note-reply-text">{r.text}</div>
                      <div className="note-reply-time">{r.time}</div>
                    </div>
                  ))}
                  {replyingTo === n.id && (
                    <div className="note-reply-input-row">
                      <textarea className="note-reply-input" placeholder="Write a reply..." value={replyText} onChange={e => setReplyText(e.target.value)} rows={1} autoFocus />
                      <button className="note-reply-send" onClick={() => sendReply(n)} disabled={!replyText.trim()}>&#8593;</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Category picker */}
          {categories.length > 0 && (
            <div className="note-cat-row">
              {categories.map(c => (
                <button key={c.id} className={`note-cat-chip ${selectedCategory === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(selectedCategory === c.id ? null : c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Note input with @mention dropdown */}
          <div style={{ position: 'relative' }}>
            {mentionResults.length > 0 && (
              <div className="mention-dropdown">
                {mentionResults.map(m => (
                  <div key={m.id} className="mention-item" onClick={() => insertMention(m)}>
                    <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{(m.first_name || '?')[0]}</div>
                    <div>
                      <span className="mention-item-name">{[m.first_name, m.last_name].filter(Boolean).join(' ')}</span>
                      <span className="mention-item-user"> {m.username}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="note-input-row">
              <textarea
                ref={noteInputRef}
                className="note-input"
                placeholder="Add a note... (use @ to mention)"
                value={noteText}
                onChange={handleNoteInput}
                rows={1}
              />
              <button className="send-btn" onClick={sendNote}>&#8593;</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────
function ReviewsTab({ userInitial }) {
  const [reviews, setReviews] = useState([]);
  const [reviewThumbs, setReviewThumbs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailShots, setDetailShots] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [player, setPlayer] = useState(null);
  const [toast, setToast] = useState("");
  // Edit mode
  const [editMode, setEditMode] = useState(false);
  // Add-to-review
  const [addMode, setAddMode] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addedIds, setAddedIds] = useState(new Set());
  // Project filter
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    try { return sessionStorage.getItem('ftrack_reviews_project') || ''; } catch { return ''; }
  });
  // Search & sort
  const [reviewSearch, setReviewSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  // Create review
  const [creating, setCreating] = useState(false);
  const [newReviewName, setNewReviewName] = useState('');
  // Share modal
  const [shareModal, setShareModal] = useState(null);
  // Bulk status in review detail
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkStatusPicker, setBulkStatusPicker] = useState(false);
  const [statuses, setStatuses] = useState([]);
  // Note counts for badge
  const [noteCountMap, setNoteCountMap] = useState({});
  // Transfer feedback modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferItems, setTransferItems] = useState([]);
  const [transferSelected, setTransferSelected] = useState(new Set());
  const [transferNotesByVersion, setTransferNotesByVersion] = useState({});
  const [transferExpanded, setTransferExpanded] = useState(new Set());
  const [transferDest, setTransferDest] = useState('task');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState('');
  // Transfer history
  const [transferredReviews, setTransferredReviews] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('transferred_reviews') || '[]')); } catch { return new Set(); }
  });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const markTransferred = (reviewId) => {
    setTransferredReviews(prev => {
      const next = new Set(prev);
      next.add(reviewId);
      localStorage.setItem('transferred_reviews', JSON.stringify([...next]));
      return next;
    });
  };

  // Load projects and statuses on mount
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
    fetchStatuses().then(s => setStatuses(s.map(st => ({ ...st, color: normalizeColor(st.color) })))).catch(() => {});
  }, []);

  // Persist selected project
  useEffect(() => {
    try { sessionStorage.setItem('ftrack_reviews_project', selectedProjectId); } catch {}
  }, [selectedProjectId]);

  // Load reviews (filtered by project when selected)
  useEffect(() => {
    setLoading(true);
    setError("");
    fetchReviews(selectedProjectId || undefined)
      .then(revs => {
        setReviews(revs);
        // Fetch thumbnails for review cards
        if (revs.length > 0) {
          fetchReviewThumbnails(revs.map(r => r.id))
            .then(setReviewThumbs)
            .catch(() => {});
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  // Browser back button support
  useEffect(() => {
    const onPopState = (e) => {
      if (addMode) { setAddMode(false); return; }
      if (bulkStatusPicker) { setBulkStatusPicker(false); return; }
      if (player) { setPlayer(null); }
      else if (detail) { setDetail(null); setDetailShots([]); setEditMode(false); setBulkMode(false); setBulkSelected(new Set()); }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });

  const loadDetail = async (review) => {
    setDetailLoading(true);
    setError("");
    try {
      const rsos = await fetchReviewShots(review.id);
      setDetailShots(rsos.map(rso => {
        const task = rso.asset_version?.task;
        return {
          id: rso.id,
          name: rso.asset_version?.asset?.parent?.name || rso.name || 'Unknown',
          status: task?.status ? {
            id: task.status.id,
            name: task.status.name,
            color: normalizeColor(task.status.color),
          } : {
            name: rso.asset_version?.status?.name || 'Unknown',
            color: normalizeColor(rso.asset_version?.status?.color),
          },
          artist: rso.asset_version?.user?.first_name || '',
          thumb: getThumbnailUrl(rso.asset_version?.thumbnail_id),
          hasVersion: !!rso.asset_version,
          versionNum: rso.asset_version?.version || 0,
          versionId: rso.asset_version?.id,
          taskId: task?.id || null,
          taskType: task?.type?.name || '',
          shotId: rso.asset_version?.asset?.parent?.id || null,
        };
      }));
      // Fetch note counts for badges
      const vIds = rsos.map(r => r.asset_version?.id).filter(Boolean);
      if (vIds.length) {
        fetchNoteCounts(vIds).then(byParent => {
          const counts = {};
          for (const [pid, notes] of Object.entries(byParent)) {
            counts[pid] = notes.length;
          }
          setNoteCountMap(counts);
        }).catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (review) => {
    history.pushState({ view: "detail" }, "");
    setDetail(review);
    setBulkMode(false);
    setBulkSelected(new Set());
    await loadDetail(review);
  };

  const openPlayer = (shot) => {
    history.pushState({ view: "player" }, "");
    setPlayer(shot);
  };

  const closePlayer = () => setPlayer(null);

  // ── Create review session ──
  const handleCreateReview = async () => {
    if (!newReviewName.trim()) return;
    try {
      const result = await createReviewSession(newReviewName.trim());
      const newReview = { id: result.data?.id || result.id, name: newReviewName.trim(), created_at: new Date().toISOString() };
      setReviews(prev => [newReview, ...prev]);
      setNewReviewName('');
      setCreating(false);
      showToast('Review created');
    } catch (err) {
      showToast('Create failed: ' + (err.message || err));
    }
  };

  // ── Share review ──
  const handleShare = (review) => {
    const url = getReviewUrl(review.id);
    setShareModal({ review, url });
  };

  const copyShareUrl = async () => {
    if (!shareModal?.url) return;
    try {
      await navigator.clipboard.writeText(shareModal.url);
      showToast('Link copied!');
    } catch {
      // Fallback for iOS
      const input = document.querySelector('.share-url-input');
      if (input) { input.select(); document.execCommand('copy'); showToast('Link copied!'); }
    }
  };

  // ── Bulk status in review detail ──
  const toggleBulkItem = (id) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkSelectAll = () => setBulkSelected(new Set(detailShots.map(s => s.id)));

  const handleBulkStatus = async (statusId, statusName, statusColor) => {
    const selected = detailShots.filter(s => bulkSelected.has(s.id));
    const taskIds = selected.map(s => s.taskId).filter(Boolean);
    const versionIds = selected.filter(s => !s.taskId && s.versionId).map(s => s.versionId);
    try {
      if (taskIds.length) await bulkUpdateTaskStatus(taskIds, statusId);
      if (versionIds.length) await bulkUpdateVersionStatus(versionIds, statusId);
      const newStatus = { id: statusId, name: statusName, color: normalizeColor(statusColor) };
      setDetailShots(prev => prev.map(s => bulkSelected.has(s.id) ? { ...s, status: newStatus } : s));
      showToast(`${selected.length} items → ${statusName}`);
      setBulkSelected(new Set());
      setBulkMode(false);
      setBulkStatusPicker(false);
    } catch (err) {
      showToast('Status update failed');
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailShots([]);
    setEditMode(false);
    history.back();
  };

  // ── Remove shot from review ──
  const handleRemoveShot = async (shot) => {
    try {
      await removeFromReview(shot.id);
      setDetailShots(prev => prev.filter(s => s.id !== shot.id));
      showToast(`Removed ${shot.name}`);
    } catch (err) {
      showToast("Remove failed: " + (err.message || err));
    }
  };

  // ── Add to review: search ──
  const searchTimer = useRef(null);
  const handleAddSearch = (term) => {
    setAddSearch(term);
    clearTimeout(searchTimer.current);
    if (term.trim().length < 2) { setAddResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setAddSearching(true);
      try {
        const versions = await searchVersionsForReview(term.trim());
        // Group by shot, keep latest version per shot
        const byShot = {};
        for (const v of versions) {
          const shotName = v.asset?.parent?.name || 'Unknown';
          const shotId = v.asset?.parent?.id;
          if (!byShot[shotId] || v.version > byShot[shotId].version) {
            byShot[shotId] = {
              versionId: v.id,
              shotId,
              shotName,
              version: v.version,
              taskType: v.task?.type?.name || '',
              artist: v.user?.first_name || '',
              thumb: getThumbnailUrl(v.thumbnail_id),
              status: { name: v.status?.name || '', color: normalizeColor(v.status?.color) },
            };
          }
        }
        setAddResults(Object.values(byShot));
      } catch (err) {
        showToast("Search failed");
      } finally {
        setAddSearching(false);
      }
    }, 400);
  };

  const handleAddVersion = async (item) => {
    if (addedIds.has(item.versionId)) return;
    try {
      await addVersionToReview(detail.id, item.versionId, detailShots.length);
      setAddedIds(prev => new Set([...prev, item.versionId]));
      showToast(`Added ${item.shotName}`);
      // Reload the detail to get the new RSO with proper id
      await loadDetail(detail);
    } catch (err) {
      showToast("Add failed: " + (err.message || err));
    }
  };

  // ── Transfer feedback modal ──
  const openTransferModal = async () => {
    setTransferModalOpen(true);
    setTransferLoading(true);
    setTransferProgress('');
    setTransferExpanded(new Set());
    try {
      const eligibleShots = detailShots.filter(s => s.versionId && s.taskId);
      const versionIds = eligibleShots.map(s => s.versionId);
      const notesByParent = await fetchNoteCounts(versionIds);
      // Store editable notes keyed by versionId
      const editableNotes = {};
      for (const [parentId, notes] of Object.entries(notesByParent)) {
        editableNotes[parentId] = notes.map(n => ({
          id: n.id,
          content: n.content || '',
          frame_number: n.frame_number,
          category_id: n.category_id,
          author: [n.author?.first_name, n.author?.last_name].filter(Boolean).join(' '),
          date: n.date,
          category: n.category?.name || '',
        }));
      }
      setTransferNotesByVersion(editableNotes);
      const items = eligibleShots.map(s => ({
        ...s,
        noteCount: (editableNotes[s.versionId] || []).length,
      }));
      setTransferItems(items);
      setTransferSelected(new Set(items.filter(i => i.noteCount > 0).map(i => i.id)));
    } catch (err) {
      showToast("Failed to load notes: " + (err.message || err));
      setTransferModalOpen(false);
    } finally {
      setTransferLoading(false);
    }
  };

  const toggleTransferItem = (id) => {
    setTransferSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTransferAll = () => {
    if (transferSelected.size === transferItems.length) {
      setTransferSelected(new Set());
    } else {
      setTransferSelected(new Set(transferItems.map(i => i.id)));
    }
  };

  const toggleTransferExpand = (id) => {
    setTransferExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateTransferNote = (versionId, noteIndex, newContent) => {
    setTransferNotesByVersion(prev => {
      const notes = [...(prev[versionId] || [])];
      notes[noteIndex] = { ...notes[noteIndex], content: newContent };
      return { ...prev, [versionId]: notes };
    });
  };

  const executeTransfer = async () => {
    const selected = transferItems.filter(i => transferSelected.has(i.id));
    if (selected.length === 0) return;
    setTransferring(true);
    let totalTransferred = 0;
    try {
      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        setTransferProgress(`Transferring ${i + 1}/${selected.length}: ${item.name}...`);
        const editedNotes = transferNotesByVersion[item.versionId] || [];
        const targetId = transferDest === 'shot' ? item.shotId : item.taskId;
        const targetType = transferDest === 'shot' ? 'Shot' : 'Task';
        if (!targetId) continue;
        const count = await transferEditedNotes(editedNotes, targetId, targetType);
        totalTransferred += count;
      }
      setTransferProgress('');
      setTransferModalOpen(false);
      if (detail) markTransferred(detail.id);
      const dest = transferDest === 'shot' ? 'shots' : 'tasks';
      showToast(`Transferred ${totalTransferred} note${totalTransferred !== 1 ? 's' : ''} to ${selected.length} ${dest}`);
    } catch (err) {
      showToast("Transfer failed: " + (err.message || err));
    } finally {
      setTransferring(false);
    }
  };

  if (player) return <PlayerScreen shot={player} onClose={closePlayer} shots={detailShots} onSwitch={setPlayer} onStatusChange={(shotId, newStatus) => {
    setDetailShots(prev => prev.map(s => s.id === shotId ? { ...s, status: newStatus } : s));
  }} />;

  // ── Bulk status picker ──
  if (bulkStatusPicker) return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="header">
        <div className="back-btn" onClick={() => setBulkStatusPicker(false)}>&#8592; Back</div>
        <div className="header-title" style={{ fontSize: 15 }}>Set Status ({bulkSelected.size} items)</div>
      </div>
      <div className="scroll">
        {statuses.map(s => (
          <div key={s.id} className="shot-list-item" onClick={() => handleBulkStatus(s.id, s.name, s.color)}>
            <span style={{ background: normalizeColor(s.color), width: 12, height: 12, borderRadius: '50%', flexShrink: 0 }} />
            <div className="shot-list-info"><div className="shot-list-name">{s.name}</div></div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Add-to-review search view ──
  if (addMode) return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Toast msg={toast} />
      <div className="header">
        <div className="back-btn" onClick={() => { setAddMode(false); setAddSearch(""); setAddResults([]); setAddedIds(new Set()); }}>&#8592; Back</div>
        <div className="header-title" style={{ fontSize: 15 }}>Add to Review</div>
      </div>
      <div className="add-review-search">
        <input
          className="search-input"
          placeholder="Search shots by name..."
          value={addSearch}
          onChange={e => handleAddSearch(e.target.value)}
          autoFocus
          style={{ width: '100%' }}
        />
      </div>
      <div className="scroll">
        {addSearching && <div className="loading">Searching...</div>}
        {!addSearching && addSearch.length >= 2 && addResults.length === 0 && (
          <div className="empty"><div className="empty-text">No versions found matching "{addSearch}"</div></div>
        )}
        {addResults.map(item => (
          <div key={item.versionId} className="add-review-item" onClick={() => handleAddVersion(item)}>
            <div className="shot-thumb-sm" style={{ width: 64, height: 36, borderRadius: 6, background: 'var(--card2)', overflow: 'hidden', flexShrink: 0 }}>
              {item.thumb ? <img src={item.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
            <div className="shot-info" style={{ flex: 1, minWidth: 0 }}>
              <div className="shot-name-lg">{item.shotName}{item.taskType ? ` / ${item.taskType}` : ''}</div>
              <div className="shot-version">v{item.version}{item.artist ? ` \u00B7 ${item.artist}` : ''}</div>
            </div>
            <div className={`add-review-check ${addedIds.has(item.versionId) ? 'added' : ''}`}>
              {addedIds.has(item.versionId) && <span style={{ fontSize: 12, color: '#fff' }}>&#10003;</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Review detail view ──
  if (detail) return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Toast msg={toast} />
      <div className="header">
        <div className="back-btn" onClick={closeDetail}>&#8592; Reviews</div>
        <div className="header-title" style={{ fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail.name}</div>
        <div className="header-right">
          <button className="edit-btn" onClick={() => handleShare(detail)} style={{ fontSize: 14, padding: '4px 8px' }}>&#128279;</button>
          {editMode ? (
            <button className="edit-btn edit-btn--accent" onClick={() => setEditMode(false)}>Done</button>
          ) : bulkMode ? (
            <button className="edit-btn edit-btn--accent" onClick={() => { setBulkMode(false); setBulkSelected(new Set()); }}>Done</button>
          ) : (
            <>
              <button className="edit-btn" onClick={() => setBulkMode(true)}>Select</button>
              <button className="edit-btn" onClick={() => setEditMode(true)}>Edit</button>
            </>
          )}
        </div>
      </div>

      {/* Action bar */}
      {editMode && (
        <div className="edit-bar">
          <div className="edit-bar-title">{detailShots.length} items</div>
          <button className="edit-btn edit-btn--accent" onClick={() => { setAddMode(true); history.pushState({ view: "add" }, ""); }}>+ Add</button>
        </div>
      )}

      {/* Bulk status bar */}
      {bulkMode && (
        <div className="review-bulk-bar">
          <div className="review-bulk-count">{bulkSelected.size} selected</div>
          <button className="edit-btn" onClick={bulkSelectAll} style={{ fontSize: 11 }}>All</button>
          {bulkSelected.size > 0 && (
            <button className="review-bulk-btn review-bulk-btn--status" onClick={() => { history.pushState({ view: "bulkstatus" }, ""); setBulkStatusPicker(true); }}>Status</button>
          )}
        </div>
      )}

      <div className="scroll">
        {detailLoading ? (
          <div className="loading">Loading shots...</div>
        ) : error ? (
          <div className="error-msg">{error}</div>
        ) : (
          <>
            {/* Transfer feedback button */}
            {!editMode && !bulkMode && detailShots.some(s => s.versionId) && (
              <div className="transfer-btn" onClick={openTransferModal} style={{ position: 'relative' }}>
                &#128228; Transfer feedback
                {transferredReviews.has(detail.id) && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>&#10003; Transferred</span>
                )}
              </div>
            )}

            <div className="section-label">{detailShots.length} shots</div>
            {detailShots.map(shot => (
              <div key={shot.id} className="shot-row">
                <div className="shot-row-edit">
                  {editMode && (
                    <div className="shot-row-delete" onClick={(e) => { e.stopPropagation(); handleRemoveShot(shot); }}>
                      &#9866;
                    </div>
                  )}
                  {bulkMode && (
                    <div style={{ padding: '10px 8px 10px 12px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggleBulkItem(shot.id); }}>
                      <div className={`select-circle ${bulkSelected.has(shot.id) ? 'checked' : ''}`}>
                        {bulkSelected.has(shot.id) && <span style={{ fontSize: 12, color: '#fff' }}>&#10003;</span>}
                      </div>
                    </div>
                  )}
                  <div className="shot-row-inner" style={{ flex: 1 }} onClick={() => bulkMode ? toggleBulkItem(shot.id) : (!editMode && openPlayer(shot))}>
                    <div className="shot-thumb-sm" style={{ position: 'relative' }}>
                      {shot.thumb
                        ? <img src={shot.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                        : "\uD83C\uDFAC"}
                      {noteCountMap[shot.versionId] > 0 && (
                        <div className="notes-badge">{noteCountMap[shot.versionId]}</div>
                      )}
                    </div>
                    <div className="shot-info">
                      <div className="shot-name-lg">{shot.name}{shot.taskType ? ` / ${shot.taskType}` : ''}</div>
                      <div className="shot-version">v{shot.versionNum}{shot.artist ? ` \u00B7 ${shot.artist}` : ''}</div>
                    </div>
                    <StatusPill status={shot.status} small onClick={(e) => { e.stopPropagation(); openPlayer(shot); }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Share Modal */}
      {shareModal && (
        <div className="modal-overlay" onClick={() => setShareModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ paddingTop: 0 }}>
            <div className="modal-handle" style={{ marginTop: 12 }} />
            <div className="modal-title">Share Review</div>
            <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--muted)' }}>{shareModal.review.name}</div>
            <div className="share-url-row">
              <input className="share-url-input" value={shareModal.url || ''} readOnly onClick={e => e.target.select()} />
              <button className="share-copy-btn" onClick={copyShareUrl}>Copy</button>
            </div>
            {navigator.share && (
              <div style={{ padding: '0 20px 16px' }}>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => {
                  navigator.share({ title: shareModal.review.name, url: shareModal.url }).catch(() => {});
                  setShareModal(null);
                }}>Share via...</button>
              </div>
            )}
            <button className="modal-cancel" onClick={() => setShareModal(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Transfer Feedback Modal */}
      {transferModalOpen && (
        <div className="modal-overlay" onClick={() => !transferring && setTransferModalOpen(false)}>
          <div className="transfer-modal" onClick={e => e.stopPropagation()}>
            <div className="transfer-modal-header">
              <div className="transfer-modal-title">Transfer Feedback</div>
              <div className="transfer-modal-close" onClick={() => !transferring && setTransferModalOpen(false)}>&times;</div>
            </div>
            {transferLoading ? (
              <div className="loading" style={{ padding: '40px 20px' }}>Loading notes...</div>
            ) : (
              <>
                <div className="transfer-modal-info">
                  <span>Select items and edit notes before transferring.</span>
                </div>
                <div className="transfer-dest-row">
                  <button className={`transfer-dest-btn ${transferDest === 'task' ? 'active' : ''}`} onClick={() => setTransferDest('task')}>To Tasks</button>
                  <button className={`transfer-dest-btn ${transferDest === 'shot' ? 'active' : ''}`} onClick={() => setTransferDest('shot')}>To Shots</button>
                </div>
                <div className="transfer-select-all" onClick={toggleTransferAll}>
                  <div className={`select-circle ${transferSelected.size === transferItems.length ? 'checked' : ''}`}>
                    {transferSelected.size === transferItems.length && <span style={{ fontSize: 11, color: '#fff' }}>&#10003;</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {transferSelected.size === transferItems.length ? 'Deselect all' : 'Select all'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {transferSelected.size} of {transferItems.length} selected
                  </span>
                </div>
                <div className="transfer-modal-list">
                  {transferItems.map(item => {
                    const notes = transferNotesByVersion[item.versionId] || [];
                    const isExpanded = transferExpanded.has(item.id);
                    return (
                      <div key={item.id} className={`transfer-modal-item-wrap ${transferSelected.has(item.id) ? 'selected' : ''}`}>
                        <div className="transfer-modal-item" onClick={() => !transferring && toggleTransferItem(item.id)}>
                          <div className={`select-circle ${transferSelected.has(item.id) ? 'checked' : ''}`}>
                            {transferSelected.has(item.id) && <span style={{ fontSize: 11, color: '#fff' }}>&#10003;</span>}
                          </div>
                          <div className="shot-thumb-sm" style={{ width: 56, height: 32, borderRadius: 4, flexShrink: 0, overflow: 'hidden' }}>
                            {item.thumb ? <img src={item.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}{item.taskType ? ` / ${item.taskType}` : ''}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>v{item.versionNum}{item.artist ? ` \u00B7 ${item.artist}` : ''}</div>
                          </div>
                          {notes.length > 0 && (
                            <div
                              className={`transfer-note-badge has-notes`}
                              onClick={(e) => { e.stopPropagation(); toggleTransferExpand(item.id); }}
                              style={{ cursor: 'pointer' }}
                            >
                              {notes.length} {notes.length === 1 ? 'note' : 'notes'} {isExpanded ? '\u25B2' : '\u25BC'}
                            </div>
                          )}
                          {notes.length === 0 && (
                            <div className="transfer-note-badge">0 notes</div>
                          )}
                        </div>
                        {isExpanded && notes.length > 0 && (
                          <div className="transfer-notes-list">
                            {notes.map((note, ni) => (
                              <div key={note.id} className="transfer-note-item">
                                <div className="transfer-note-meta">
                                  <span className="transfer-note-author">{note.author}</span>
                                  {note.category && <span className="transfer-note-cat">{note.category}</span>}
                                  {note.frame_number != null && <span className="transfer-note-frame">f{note.frame_number}</span>}
                                  <span className="transfer-note-date">{formatTime(note.date)}</span>
                                </div>
                                <textarea
                                  className="transfer-note-edit"
                                  value={note.content}
                                  onChange={(e) => updateTransferNote(item.versionId, ni, e.target.value)}
                                  disabled={transferring}
                                  rows={Math.max(2, (note.content || '').split('\n').length)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {transferItems.length === 0 && (
                    <div className="empty" style={{ padding: '30px 20px' }}>
                      <div className="empty-text">No items with linked tasks to transfer feedback to.</div>
                    </div>
                  )}
                </div>
                {transferProgress && (
                  <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--accent)', textAlign: 'center' }}>{transferProgress}</div>
                )}
                <div className="transfer-modal-actions">
                  <button className="modal-cancel" onClick={() => !transferring && setTransferModalOpen(false)} disabled={transferring}>Cancel</button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={executeTransfer}
                    disabled={transferring || transferSelected.size === 0}
                  >
                    {transferring ? 'Transferring...' : `Transfer ${transferSelected.size} item${transferSelected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Filter & sort reviews
  const filteredReviews = reviews
    .filter(r => !reviewSearch || r.name.toLowerCase().includes(reviewSearch.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortOrder === 'name') return (a.name || '').localeCompare(b.name || '');
      return new Date(b.created_at) - new Date(a.created_at); // newest
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Toast msg={toast} />
      <div className="header">
        <BrandLogo />
        <div className="header-right">
          <div className="avatar">{userInitial}</div>
        </div>
      </div>
      {/* Project filter */}
      {projects.length > 1 && (
        <div className="project-bar">
          <select
            className="project-picker"
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      {/* Search & sort */}
      <div className="reviews-toolbar">
        <input className="search-input" placeholder="Search reviews..." value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} />
        <button className="reviews-sort-btn" onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : s === 'oldest' ? 'name' : 'newest')}>
          {sortOrder === 'newest' ? 'Newest' : sortOrder === 'oldest' ? 'Oldest' : 'A-Z'}
        </button>
      </div>
      <div className="scroll">
        {/* Create review */}
        {creating ? (
          <div className="create-review-input">
            <input className="search-input" placeholder="Review name..." value={newReviewName} onChange={e => setNewReviewName(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreateReview(); }} />
            <button className="edit-btn edit-btn--accent" onClick={handleCreateReview}>Create</button>
            <button className="edit-btn" onClick={() => { setCreating(false); setNewReviewName(''); }}>Cancel</button>
          </div>
        ) : (
          <div className="create-review-btn" onClick={() => setCreating(true)}>+ New Review Session</div>
        )}

        <div className="section-label">{filteredReviews.length} review{filteredReviews.length !== 1 ? 's' : ''}{selectedProjectId ? '' : ' (all projects)'}</div>
        {loading && <div className="loading">Loading reviews...</div>}
        {error && <div className="error-msg">{error}</div>}
        {!loading && !error && filteredReviews.length === 0 && (
          <div className="empty">
            <div className="empty-icon">&#127916;</div>
            <div className="empty-text">{reviewSearch ? 'No reviews match your search.' : 'No review sessions found.'}</div>
          </div>
        )}
        {filteredReviews.map(rev => {
          const thumbs = reviewThumbs[rev.id] || [];
          return (
            <div key={rev.id} className="review-card" onClick={() => openDetail(rev)}>
              <div className="review-card-inner">
                <div className="review-name">{rev.name}</div>
                <div className="review-meta">
                  <span className="review-date">{formatDate(rev.created_at)}</span>
                  {transferredReviews.has(rev.id) && (
                    <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>&#10003; Transferred</span>
                  )}
                </div>
              </div>
              {thumbs.length > 0 && (
                <div className="review-card-thumbs">
                  {thumbs.map((url, i) => <img key={i} className="review-card-thumb" src={url} alt="" />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shots Tab ────────────────────────────────────────────────────────────────
function ShotsTab() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    try { return sessionStorage.getItem('ftrack_shots_project') || null; } catch { return null; }
  });
  const [shots, setShots] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shotsLoading, setShotsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  // Advanced filtering: { status: string[], type: string[], artist: string[], custom: { [key]: string[] } }
  const [filters, setFilters] = useState({ status: [], type: [], artist: [], custom: {} });
  const [filterPanel, setFilterPanel] = useState(null); // null | 'main' | 'status' | 'type' | 'artist' | 'custom:key' | 'views'
  const [savedViews, setSavedViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ftrack_saved_views') || '[]'); } catch { return []; }
  });
  const [customAttrConfigs, setCustomAttrConfigs] = useState([]);
  const [customAttrValues, setCustomAttrValues] = useState({}); // { entityId: { key: value } }
  const [statusModal, setStatusModal] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [toast, setToast] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);
  // Shot detail state
  const [detailShot, setDetailShot] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [player, setPlayer] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const saveViewName = useRef('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // Load projects and statuses on mount (separately so one failing doesn't block the other)
  useEffect(() => {
    let done = 0;
    const checkDone = () => { if (++done >= 2) setLoading(false); };

    fetchProjects()
      .then(projs => {
        setProjects(projs);
        // Restore saved project or default to first
        const saved = sessionStorage.getItem('ftrack_shots_project');
        const match = saved && projs.find(p => p.id === saved);
        if (match) setSelectedProjectId(match.id);
        else if (projs.length > 0) setSelectedProjectId(projs[0].id);
      })
      .catch(err => { console.error('[ShotsTab] Projects error:', err); setError(err.message); })
      .finally(checkDone);

    fetchStatuses()
      .then(stats => {
        setStatuses(stats.map(s => ({ ...s, color: normalizeColor(s.color) })));
      })
      .catch(err => console.error('[ShotsTab] Statuses error:', err))
      .finally(checkDone);
  }, []);

  // Persist selected project
  useEffect(() => {
    if (selectedProjectId) {
      try { sessionStorage.setItem('ftrack_shots_project', selectedProjectId); } catch {}
    }
  }, [selectedProjectId]);

  // Load shots, shot-specific statuses, and project members when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setShotsLoading(true);
    setError("");

    // Fetch shot-valid statuses for this project (overrides generic ones)
    fetchShotStatuses(selectedProjectId)
      .then(stats => {
        if (stats.length > 0) {
          console.log('[ShotsTab] Loaded', stats.length, 'shot-specific statuses');
          setStatuses(stats.map(s => ({ ...s, color: normalizeColor(s.color) })));
        }
      })
      .catch(err => console.warn('[ShotsTab] Shot statuses fallback:', err));

    // Fetch project members for assignee picker
    fetchProjectMembers()
      .then(users => {
        console.log('[ShotsTab] Loaded', users.length, 'project members');
        setMembers(users);
      })
      .catch(err => console.warn('[ShotsTab] Members error:', err));

    // Fetch custom attribute configurations
    fetchCustomAttributeConfigs()
      .then(configs => {
        console.log('[ShotsTab] Loaded', configs.length, 'custom attribute configs');
        setCustomAttrConfigs(configs.filter(c => c.entity_type === 'task'));
      })
      .catch(err => console.warn('[ShotsTab] Custom attrs error:', err));

    Promise.all([fetchShots(selectedProjectId), fetchProjectTasks(selectedProjectId).catch(() => ({}))])
      .then(([data, tasksByShot]) => {
        // Build a flat task list — each entry is a task carrying its parent shot info
        const shotMap = {};
        for (const s of data) {
          shotMap[s.id] = { name: s.name, thumb: getThumbnailUrl(s.thumbnail_id) };
        }
        const flat = [];
        for (const s of data) {
          const tasks = tasksByShot[s.id] || [];
          if (tasks.length === 0) {
            // Shot with no tasks — show shot itself
            flat.push({
              id: s.id,
              shotId: s.id,
              name: s.name,
              type: '',
              status: { id: s.status?.id, name: s.status?.name || 'Unknown', color: normalizeColor(s.status?.color) },
              thumb: shotMap[s.id]?.thumb,
              artist: '',
              tasks: [],
              assigneeIds: [],
            });
          } else {
            for (const t of tasks) {
              flat.push({
                id: t.id,
                shotId: s.id,
                name: s.name,
                type: t.type,
                description: t.description,
                status: { id: t.status.id, name: t.status.name, color: normalizeColor(t.status.color) },
                thumb: shotMap[s.id]?.thumb,
                artist: t.assignee,
                tasks: tasks,
                assigneeIds: t.assigneeIds || [],
              });
            }
          }
        }
        setShots(flat);
        // Merge statuses found on actual tasks into the status list
        setStatuses(prev => {
          const existing = new Set(prev.map(s => s.id));
          const extra = [];
          for (const item of flat) {
            if (item.status?.id && !existing.has(item.status.id)) {
              existing.add(item.status.id);
              extra.push({ id: item.status.id, name: item.status.name, color: item.status.color });
            }
          }
          return extra.length ? [...prev, ...extra] : prev;
        });
        // Fetch custom attribute values for all tasks
        const taskIds = flat.map(f => f.id);
        if (taskIds.length) {
          fetchCustomAttributeValues(taskIds)
            .then(vals => setCustomAttrValues(vals))
            .catch(err => console.warn('[ShotsTab] Custom attr values error:', err));
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setShotsLoading(false));
  }, [selectedProjectId]);

  // Compute unique values for each filterable field
  const filterOptions = useMemo(() => {
    const statusSet = new Map();
    const typeSet = new Set();
    const artistSet = new Set();
    const customSets = {}; // key → Set of values
    for (const s of shots) {
      if (s.status?.name) statusSet.set(s.status.name, s.status);
      if (s.type) typeSet.add(s.type);
      if (s.artist) s.artist.split(', ').forEach(a => a && artistSet.add(a));
      // Custom attributes
      const cv = customAttrValues[s.id];
      if (cv) {
        for (const [k, v] of Object.entries(cv)) {
          if (v != null && v !== '') {
            if (!customSets[k]) customSets[k] = new Set();
            customSets[k].add(String(v));
          }
        }
      }
    }
    return {
      statuses: [...statusSet.values()],
      types: [...typeSet].sort(),
      artists: [...artistSet].sort(),
      custom: customSets,
    };
  }, [shots, customAttrValues]);

  const hasActiveFilters = filters.status.length > 0 || filters.type.length > 0 || filters.artist.length > 0 || Object.values(filters.custom).some(v => v.length > 0);

  const filtered = shots.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filters.status.length === 0 || filters.status.includes(s.status.name);
    const matchType = filters.type.length === 0 || filters.type.includes(s.type);
    const matchArtist = filters.artist.length === 0 || filters.artist.some(a => (s.artist || '').includes(a));
    // Custom attribute filters
    let matchCustom = true;
    const cv = customAttrValues[s.id];
    for (const [key, vals] of Object.entries(filters.custom)) {
      if (vals.length === 0) continue;
      const actual = cv?.[key];
      if (!vals.includes(String(actual ?? ''))) { matchCustom = false; break; }
    }
    return matchSearch && matchStatus && matchType && matchArtist && matchCustom;
  });

  const saveView = (name) => {
    const view = { name, filters: { ...filters, custom: { ...filters.custom } }, date: Date.now() };
    const updated = [...savedViews.filter(v => v.name !== name), view];
    setSavedViews(updated);
    localStorage.setItem('ftrack_saved_views', JSON.stringify(updated));
  };

  const loadView = (view) => {
    setFilters(view.filters);
    setFilterPanel(null);
  };

  const deleteView = (name) => {
    const updated = savedViews.filter(v => v.name !== name);
    setSavedViews(updated);
    localStorage.setItem('ftrack_saved_views', JSON.stringify(updated));
  };

  const clearFilters = () => setFilters({ status: [], type: [], artist: [], custom: {} });

  const toggleFilterValue = (field, value) => {
    if (field.startsWith('custom:')) {
      const key = field.slice(7);
      setFilters(prev => {
        const cur = prev.custom[key] || [];
        const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
        return { ...prev, custom: { ...prev.custom, [key]: next } };
      });
    } else {
      setFilters(prev => {
        const cur = prev[field] || [];
        const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
        return { ...prev, [field]: next };
      });
    }
  };

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
    // Load versions — use task ID if this is a task entry, otherwise shot ID
    {
      setVersionsLoading(true);
      try {
        const isTask = !!shot.type; // tasks have a type like "Compositing"
        const vers = await fetchShotVersions(shot.shotId, isTask ? shot.id : null);
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
          taskId: v.task_id || null,
        })));
      } catch (err) {
        showToast('Failed to load versions');
      } finally {
        setVersionsLoading(false);
      }
    }
  };

  const openVersionInPlayer = (ver) => {
    setPlayer({
      id: detailShot.id,
      name: detailShot.name,
      status: detailShot.status,
      artist: ver.artist,
      versionNum: ver.version,
      versionId: ver.id,
      thumb: ver.thumb,
      hasVersion: true,
      taskId: ver.taskId || detailShot.id, // version's task, or fall back to the task entry itself
      shotId: detailShot.shotId || detailShot.id,
    });
  };

  const applyStatus = async (newStatus) => {
    const statusWithColor = { ...newStatus, color: normalizeColor(newStatus.color) };
    try {
      if (statusModal === "bulk") {
        const taskIds = [...selected];
        await Promise.all(taskIds.map(id => updateTaskStatus(id, newStatus.id)));
        setShots(s => s.map(sh => selected.has(sh.id) ? { ...sh, status: statusWithColor } : sh));
        showToast(`${selected.size} shots \u2192 ${newStatus.name}`);
        setSelected(new Set());
        setMultiSelect(false);
      } else if (statusModal === "shot-status") {
        await updateTaskStatus(detailShot.id, newStatus.id);
        setDetailShot(prev => ({ ...prev, status: statusWithColor }));
        setShots(s => s.map(sh => sh.id === detailShot.id ? { ...sh, status: statusWithColor } : sh));
        showToast(`Status \u2192 ${newStatus.name}`);
      } else if (statusModal === "task-status" && editingTask) {
        await updateTaskStatus(editingTask.taskId, newStatus.id);
        setShots(s => s.map(sh => {
          if (sh.id !== editingTask.shotId) return sh;
          const updatedTasks = (sh.tasks || []).map(t =>
            t.id === editingTask.taskId ? { ...t, status: statusWithColor } : t
          );
          // If single-task shot, also update the shot-level status display
          const merged = updatedTasks.length === 1 ? updatedTasks[0] : null;
          return {
            ...sh,
            tasks: updatedTasks,
            ...(merged ? { status: statusWithColor } : {}),
          };
        }));
        showToast(`${editingTask.taskName} \u2192 ${newStatus.name}`);
        setEditingTask(null);
      }
    } catch (err) {
      showToast("Status update failed");
    }
    setStatusModal(null);
  };

  // Compute which users are assigned to ANY selected tasks
  const getAssignedUserIds = () => {
    const selectedItems = shots.filter(s => selected.has(s.id));
    if (selectedItems.length === 0) return new Set();
    const all = new Set();
    for (const item of selectedItems) {
      for (const id of (item.assigneeIds || [])) {
        all.add(id);
      }
    }
    return all;
  };

  const toggleAssignee = async (user) => {
    const assignedIds = getAssignedUserIds();
    const isAssigned = assignedIds.has(user.id);
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    // Get unique shot IDs from selected tasks
    const shotIds = [...new Set(shots.filter(s => selected.has(s.id)).map(s => s.shotId))];
    try {
      if (isAssigned) {
        await unassignUserFromShots(shotIds, user.id);
        // Update local data
        setShots(prev => prev.map(sh => {
          if (!selected.has(sh.id)) return sh;
          return {
            ...sh,
            assigneeIds: (sh.assigneeIds || []).filter(id => id !== user.id),
            artist: sh.artist.split(', ').filter(n => n !== user.first_name).join(', '),
          };
        }));
        showToast(`Unassigned ${name}`);
      } else {
        await assignUserToShots(shotIds, user.id);
        // Update local data
        setShots(prev => prev.map(sh => {
          if (!selected.has(sh.id)) return sh;
          return {
            ...sh,
            assigneeIds: [...(sh.assigneeIds || []), user.id],
            artist: [sh.artist, user.first_name].filter(Boolean).join(', '),
          };
        }));
        showToast(`Assigned ${name}`);
      }
    } catch (err) {
      showToast(isAssigned ? "Unassign failed" : "Assign failed");
    }
  };

  const selectAll = () => setSelected(new Set(filtered.map(s => s.id)));
  const clearAll = () => { setSelected(new Set()); setMultiSelect(false); };

  // Long press
  const pressTimer = useRef(null);
  const startPress = (shot) => { pressTimer.current = setTimeout(() => handleLongPress(shot), 500); };
  const endPress = () => clearTimeout(pressTimer.current);

  if (loading) return <div className="loading" style={{ flex: 1 }}>Loading...</div>;

  // ── Player view ──
  if (player) return <PlayerScreen shot={player} onClose={() => setPlayer(null)} onStatusChange={(id, newStatus) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    if (detailShot?.id === id) setDetailShot(prev => ({ ...prev, status: newStatus }));
  }} />;

  // ── Filter panel (full screen) ──
  if (filterPanel) {

    // Sub-panel for a specific field
    if (filterPanel === 'status' || filterPanel === 'type' || filterPanel === 'artist' || filterPanel.startsWith('custom:')) {
      const isCustom = filterPanel.startsWith('custom:');
      const field = filterPanel;
      const label = isCustom
        ? (customAttrConfigs.find(c => c.key === filterPanel.slice(7))?.label || filterPanel.slice(7))
        : filterPanel.charAt(0).toUpperCase() + filterPanel.slice(1);

      let options = [];
      if (filterPanel === 'status') options = filterOptions.statuses.map(s => ({ value: s.name, color: s.color }));
      else if (filterPanel === 'type') options = filterOptions.types.map(t => ({ value: t }));
      else if (filterPanel === 'artist') options = filterOptions.artists.map(a => ({ value: a }));
      else if (isCustom) {
        const key = filterPanel.slice(7);
        options = [...(filterOptions.custom[key] || [])].sort().map(v => ({ value: v }));
      }

      const selected_ = isCustom ? (filters.custom[filterPanel.slice(7)] || []) : (filters[filterPanel] || []);

      return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className="header">
            <div className="back-btn" onClick={() => setFilterPanel('main')}>&#8592; Back</div>
            <div className="header-title" style={{ fontSize: 15 }}>Filter: {label}</div>
          </div>
          <div className="scroll">
            {options.map(opt => {
              const active = selected_.includes(opt.value);
              return (
                <div key={opt.value} className="shot-list-item" onClick={() => toggleFilterValue(field, opt.value)}
                  style={active ? { background: 'rgba(0,151,206,.1)' } : {}}>
                  {opt.color && <span style={{ background: opt.color, width: 12, height: 12, borderRadius: '50%', flexShrink: 0 }} />}
                  <div className="shot-list-info"><div className="shot-list-name">{opt.value}</div></div>
                  {active && <span style={{ color: 'var(--accent)', fontSize: 18 }}>&#10003;</span>}
                </div>
              );
            })}
            {options.length === 0 && (
              <div className="empty"><div className="empty-text">No values found.</div></div>
            )}
          </div>
        </div>
      );
    }

    // Views sub-panel
    if (filterPanel === 'views') {
      return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className="header">
            <div className="back-btn" onClick={() => setFilterPanel('main')}>&#8592; Back</div>
            <div className="header-title" style={{ fontSize: 15 }}>Saved Views</div>
          </div>
          <div className="scroll">
            {/* Save current */}
            {hasActiveFilters && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Save current filters as view</div>
                <form onSubmit={e => { e.preventDefault(); const name = saveViewName.current.trim(); if (name) { saveView(name); saveViewName.current = ''; showToast(`View "${name}" saved`); } }} style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="search-input"
                    placeholder="View name..."
                    style={{ flex: 1, margin: 0 }}
                    onChange={e => { saveViewName.current = e.target.value; }}
                  />
                  <button type="submit" className="action-btn" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>Save</button>
                </form>
              </div>
            )}
            {savedViews.length === 0 && !hasActiveFilters && (
              <div className="empty"><div className="empty-text">No saved views. Apply some filters first, then save them as a view.</div></div>
            )}
            {savedViews.map(v => {
              const summary = [
                ...(v.filters.status || []),
                ...(v.filters.type || []).map(t => `Type: ${t}`),
                ...(v.filters.artist || []).map(a => `Artist: ${a}`),
                ...Object.entries(v.filters.custom || {}).flatMap(([k, vals]) => vals.map(val => `${k}: ${val}`)),
              ].join(', ') || 'No filters';
              return (
                <div key={v.name} className="shot-list-item" onClick={() => loadView(v)}>
                  <div className="shot-list-info">
                    <div className="shot-list-name">{v.name}</div>
                    <div className="shot-list-artist" style={{ fontSize: 11, marginTop: 2 }}>{summary}</div>
                  </div>
                  <span onClick={e => { e.stopPropagation(); deleteView(v.name); showToast(`View "${v.name}" deleted`); }}
                    style={{ color: 'var(--red)', fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}>&#10005;</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Main filter panel — show all filterable fields
    const activeCount = (field) => {
      if (field.startsWith('custom:')) return (filters.custom[field.slice(7)] || []).length;
      return (filters[field] || []).length;
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div className="header">
          <div className="back-btn" onClick={() => setFilterPanel(null)}>&#8592; Back</div>
          <div className="header-title" style={{ fontSize: 15 }}>Filters</div>
          <div className="header-right" style={{ gap: 8 }}>
            {hasActiveFilters && (
              <button style={{ background: "none", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={clearFilters}>Clear All</button>
            )}
            <button style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={() => setFilterPanel('views')}>Views</button>
          </div>
        </div>
        <div className="scroll">
          {/* Active filter chips */}
          {hasActiveFilters && (
            <div style={{ padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {filters.status.map(v => (
                <span key={`s:${v}`} onClick={() => toggleFilterValue('status', v)}
                  style={{ background: 'var(--accent)', color: '#fff', borderRadius: 12, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {v} &#10005;
                </span>
              ))}
              {filters.type.map(v => (
                <span key={`t:${v}`} onClick={() => toggleFilterValue('type', v)}
                  style={{ background: 'var(--blue)', color: '#fff', borderRadius: 12, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {v} &#10005;
                </span>
              ))}
              {filters.artist.map(v => (
                <span key={`a:${v}`} onClick={() => toggleFilterValue('artist', v)}
                  style={{ background: 'var(--green)', color: '#fff', borderRadius: 12, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {v} &#10005;
                </span>
              ))}
              {Object.entries(filters.custom).flatMap(([k, vals]) => vals.map(v => (
                <span key={`c:${k}:${v}`} onClick={() => toggleFilterValue(`custom:${k}`, v)}
                  style={{ background: 'var(--amber)', color: '#000', borderRadius: 12, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {k}: {v} &#10005;
                </span>
              )))}
            </div>
          )}

          <div style={{ padding: '12px 16px 4px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Filter by</div>

          {/* Status */}
          <div className="shot-list-item" onClick={() => setFilterPanel('status')}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <div className="shot-list-info"><div className="shot-list-name">Status</div></div>
            {activeCount('status') > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{activeCount('status')}</span>}
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>&#8250;</span>
          </div>

          {/* Type */}
          {filterOptions.types.length > 0 && (
            <div className="shot-list-item" onClick={() => setFilterPanel('type')}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--blue)', flexShrink: 0 }} />
              <div className="shot-list-info"><div className="shot-list-name">Task Type</div></div>
              {activeCount('type') > 0 && <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{activeCount('type')}</span>}
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>&#8250;</span>
            </div>
          )}

          {/* Artist */}
          {filterOptions.artists.length > 0 && (
            <div className="shot-list-item" onClick={() => setFilterPanel('artist')}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
              <div className="shot-list-info"><div className="shot-list-name">Artist</div></div>
              {activeCount('artist') > 0 && <span style={{ background: 'var(--green)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{activeCount('artist')}</span>}
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>&#8250;</span>
            </div>
          )}

          {/* Custom Attributes */}
          {Object.keys(filterOptions.custom).length > 0 && (
            <div style={{ padding: '12px 16px 4px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Custom Attributes</div>
          )}
          {Object.entries(filterOptions.custom).map(([key, valSet]) => {
            const config = customAttrConfigs.find(c => c.key === key);
            const label = config?.label || key;
            return (
              <div key={key} className="shot-list-item" onClick={() => setFilterPanel(`custom:${key}`)}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--amber)', flexShrink: 0 }} />
                <div className="shot-list-info">
                  <div className="shot-list-name">{label}</div>
                  <div className="shot-list-artist" style={{ fontSize: 10 }}>{valSet.size} values</div>
                </div>
                {activeCount(`custom:${key}`) > 0 && <span style={{ background: 'var(--amber)', color: '#000', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{activeCount(`custom:${key}`)}</span>}
                <span style={{ color: 'var(--muted)', fontSize: 14 }}>&#8250;</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Picker views (full screen) — status change + assignee ──
  if (statusModal === "bulk" || statusModal === "shot-status" || statusModal === "task-status" || statusModal === "assignee") {
    const isAssignee = statusModal === "assignee";
    const title = isAssignee ? `Assign ${selected.size} shots`
      : statusModal === "bulk" ? `Set status for ${selected.size} shots`
      : statusModal === "task-status" && editingTask ? editingTask.taskName
      : "Change Status";

    const items = isAssignee ? members : statuses;
    const assignedIds = isAssignee ? getAssignedUserIds() : new Set();

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div className="header">
          <div className="back-btn" onClick={() => setStatusModal(null)}>&#8592; Back</div>
          <div className="header-title" style={{ fontSize: 15 }}>{title}</div>
        </div>
        <div className="scroll">
          {isAssignee && members.map(u => (
            <div key={u.id} className="shot-list-item" onClick={() => toggleAssignee(u)} style={assignedIds.has(u.id) ? { background: 'rgba(76,175,80,.1)' } : {}}>
              <div className={`select-circle ${assignedIds.has(u.id) ? "checked" : ""}`} style={{ width: 28, height: 28, borderRadius: '50%' }}>
                {assignedIds.has(u.id) && <span style={{ fontSize: 12, color: "#fff" }}>&#10003;</span>}
              </div>
              <div className="shot-list-info">
                <div className="shot-list-name">{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}</div>
                {u.username && <div className="shot-list-artist">{u.username}</div>}
              </div>
            </div>
          ))}
          {!isAssignee && statuses.map(s => (
            <div key={s.id} className="shot-list-item" onClick={() => applyStatus(s)}>
              <span style={{ background: s.color, width: 12, height: 12, borderRadius: '50%', flexShrink: 0 }} />
              <div className="shot-list-info"><div className="shot-list-name">{s.name}</div></div>
              {statusModal === "shot-status" && detailShot?.status?.id === s.id && <span style={{ color: 'var(--green)', fontSize: 18 }}>&#10003;</span>}
              {statusModal === "task-status" && editingTask?.currentStatusId === s.id && <span style={{ color: 'var(--green)', fontSize: 18 }}>&#10003;</span>}
            </div>
          ))}
          {items.length === 0 && (
            <div className="empty">
              <div className="empty-text">{isAssignee ? "No project members found." : "No statuses available."}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
          <StatusPill status={detailShot.status} onClick={() => setStatusModal("shot-status")} />
        </div>
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
            <div className="version-status" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <StatusPill status={ver.status} small onClick={(e) => { e.stopPropagation(); setStatusModal("shot-status"); }} />
            </div>
          </div>
        ))}
      </div>

      {/* Status Modal for shot */}
    </div>
  );

  // ── Shot list view ──
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <Toast msg={toast} />

      <div className="header">
        {multiSelect ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
            <div className="header-right" style={{ gap: 8 }}>
              <button style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={clearAll}>None</button>
              <button style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={selectAll}>All</button>
              {selected.size > 0 && (<>
                <button style={{ background: "var(--accent)", border: "none", borderRadius: 6, padding: '6px 12px', color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600 }} onClick={() => setStatusModal("bulk")}>Status</button>
                <button style={{ background: "var(--accent)", border: "none", borderRadius: 6, padding: '6px 12px', color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600 }} onClick={() => setStatusModal("assignee")}>Assign</button>
              </>)}
            </div>
          </>
        ) : (
          <>
            <BrandLogo />
            <div className="header-right">
              <button style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }} onClick={() => setMultiSelect(true)}>Select</button>
            </div>
          </>
        )}
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
        <button className={`filter-btn ${hasActiveFilters ? "active" : ""}`}
          onClick={() => setFilterPanel('main')}>
          {hasActiveFilters ? `Filter (${filters.status.length + filters.type.length + filters.artist.length + Object.values(filters.custom).reduce((a, v) => a + v.length, 0)})` : "Filter"}
        </button>
      </div>
      {/* Active filter chips below toolbar */}
      {hasActiveFilters && (
        <div style={{ padding: '4px 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {filters.status.map(v => (
            <span key={`s:${v}`} onClick={() => toggleFilterValue('status', v)}
              style={{ background: 'rgba(0,151,206,.15)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 12, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {v} &#10005;
            </span>
          ))}
          {filters.type.map(v => (
            <span key={`t:${v}`} onClick={() => toggleFilterValue('type', v)}
              style={{ background: 'rgba(33,150,243,.15)', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 12, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {v} &#10005;
            </span>
          ))}
          {filters.artist.map(v => (
            <span key={`a:${v}`} onClick={() => toggleFilterValue('artist', v)}
              style={{ background: 'rgba(76,175,80,.15)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 12, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {v} &#10005;
            </span>
          ))}
          {Object.entries(filters.custom).flatMap(([k, vals]) => vals.map(v => (
            <span key={`c:${k}:${v}`} onClick={() => toggleFilterValue(`custom:${k}`, v)}
              style={{ background: 'rgba(245,166,35,.15)', color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 12, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {k}: {v} &#10005;
            </span>
          )))}
          <span onClick={clearFilters} style={{ color: 'var(--muted)', fontSize: 10, cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' }}>Clear</span>
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
              <div className="shot-list-name">{shot.name}{shot.type ? ` / ${shot.type}` : ''}</div>
              {shot.artist && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>{shot.artist}</div>}
              {shot.description && <div className="shot-list-artist" style={{ marginTop: 2, fontStyle: 'italic', opacity: 0.7, lineHeight: 1.4 }}>{shot.description}</div>}
            </div>
            <div className="shot-list-status" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} style={{ flexShrink: 0, padding: '8px 0 8px 8px' }}>
              <StatusPill status={shot.status} small onClick={(e) => { e.stopPropagation(); setDetailShot(shot); setStatusModal("shot-status"); }} />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ─── Chat Tab ────────────────────────────────────────────────────────────────

function getLlmSettings() {
  try {
    const raw = localStorage.getItem('llm_settings');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLlmSettings(settings) {
  localStorage.setItem('llm_settings', JSON.stringify(settings));
}

function getFtrackCreds() {
  try {
    const raw = localStorage.getItem('ftrack_auth');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getChatHistory() {
  try { return JSON.parse(localStorage.getItem('chat_history') || '[]'); } catch { return []; }
}

function saveChatHistory(messages, conversation) {
  try {
    localStorage.setItem('chat_history', JSON.stringify(messages.slice(-100)));
    localStorage.setItem('chat_conversation', JSON.stringify(conversation.slice(-50)));
  } catch {}
}

function getChatConversation() {
  try { return JSON.parse(localStorage.getItem('chat_conversation') || '[]'); } catch { return []; }
}

function getCustomPrompt() {
  try { return localStorage.getItem('chat_custom_prompt') || ''; } catch { return ''; }
}

function ChatTab() {
  const savedMessages = getChatHistory();
  const [messages, setMessages] = useState(savedMessages.length ? savedMessages : []);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [llmSettings, setLlmSettings] = useState(getLlmSettings);
  const [settingsProvider, setSettingsProvider] = useState(llmSettings?.provider || 'gemini');
  const [settingsKey, setSettingsKey] = useState(llmSettings?.apiKey || '');
  const [customPrompt, setCustomPrompt] = useState(getCustomPrompt);
  const [settingsPrompt, setSettingsPrompt] = useState(customPrompt);
  const scrollRef = useRef(null);
  // Conversation history for the LLM (role/content pairs)
  const conversationRef = useRef(getChatConversation());

  const hasSettings = llmSettings?.provider && llmSettings?.apiKey;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Persist messages when they change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages, conversationRef.current);
    }
  }, [messages]);

  // Show welcome message only if no saved history
  useEffect(() => {
    if (savedMessages.length > 0) return; // already have history
    if (!hasSettings) {
      setMessages([{ type: 'system', text: 'Set up your AI provider to get started. Tap the gear icon above.' }]);
    } else {
      const providerName = llmSettings.provider === 'claude' ? 'Claude Haiku' : 'Gemini Flash';
      setMessages([{ type: 'bot', text: `Connected to ${providerName}. I can manage your ftrack reviews, tasks, statuses, notes, and more. Just ask in plain English.` }]);
    }
  }, [hasSettings]);

  const suggestions = [
    'Put all "Client Review" tasks into a review',
    'Create a new review session called "Dailies"',
    'Show me tasks with status "In Progress"',
    'List all review sessions',
    'What projects do I have?',
  ];

  const addMsg = (type, text) => setMessages(prev => [...prev, { type, text }]);

  const handleSaveSettings = () => {
    if (!settingsKey.trim()) return;
    const settings = { provider: settingsProvider, apiKey: settingsKey.trim() };
    saveLlmSettings(settings);
    setLlmSettings(settings);
    // Save custom prompt
    const prompt = settingsPrompt.trim();
    setCustomPrompt(prompt);
    if (prompt) localStorage.setItem('chat_custom_prompt', prompt);
    else localStorage.removeItem('chat_custom_prompt');
    setShowSettings(false);
    conversationRef.current = [];
    const providerName = settings.provider === 'claude' ? 'Claude Haiku' : 'Gemini Flash';
    setMessages([{ type: 'bot', text: `Connected to ${providerName}. I can manage your ftrack reviews, tasks, statuses, notes, and more. Just ask in plain English.` }]);
  };

  const clearChatHistory = () => {
    conversationRef.current = [];
    localStorage.removeItem('chat_history');
    localStorage.removeItem('chat_conversation');
    const providerName = llmSettings?.provider === 'claude' ? 'Claude Haiku' : 'Gemini Flash';
    setMessages([{ type: 'bot', text: `Chat cleared. Connected to ${providerName}.` }]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || processing || !hasSettings) return;
    addMsg('user', text);
    setInput('');
    setProcessing(true);

    // Add to conversation history
    conversationRef.current.push({ role: 'user', content: text });

    try {
      const ftrackCreds = getFtrackCreds();
      if (!ftrackCreds) throw new Error('Not logged in to ftrack');

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationRef.current,
          provider: llmSettings.provider,
          llmApiKey: llmSettings.apiKey,
          ftrackServer: ftrackCreds.server,
          ftrackUser: ftrackCreds.user,
          ftrackApiKey: ftrackCreds.apiKey,
          customPrompt: customPrompt || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Request failed');

      const botText = data.response || 'Done.';
      conversationRef.current.push({ role: 'assistant', content: botText });
      addMsg('bot', botText);
    } catch (err) {
      addMsg('error', err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Simple markdown rendering (bold, code, lists)
  const renderText = (text) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  // ── Settings screen ──
  if (showSettings) return (
    <div className="chat-container">
      <div className="header">
        <div className="back-btn" onClick={() => setShowSettings(false)}>&#8592; Back</div>
        <div className="header-title" style={{ fontSize: 15 }}>AI Settings</div>
      </div>
      <div className="scroll" style={{ padding: 20 }}>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>AI Provider</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['gemini', 'Gemini Flash'], ['claude', 'Claude Haiku']].map(([val, label]) => (
              <button key={val}
                className={`edit-btn ${settingsProvider === val ? 'edit-btn--accent' : ''}`}
                style={{ flex: 1, padding: '12px 8px', fontSize: 13 }}
                onClick={() => setSettingsProvider(val)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>{settingsProvider === 'claude' ? 'Anthropic API Key' : 'Google AI API Key'}</label>
          <input
            type="password"
            placeholder={settingsProvider === 'claude' ? 'sk-ant-...' : 'AIza...'}
            value={settingsKey}
            onChange={e => setSettingsKey(e.target.value)}
            autoComplete="off"
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
            {settingsProvider === 'claude'
              ? 'Get your key at console.anthropic.com. Uses Haiku 4.5 (~$0.001/msg).'
              : 'Get your key at aistudio.google.com. Uses Gemini 2.5 Flash (~$0.0001/msg).'}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Custom Instructions (optional)</label>
          <textarea
            className="note-input"
            placeholder="e.g. Always respond in bullet points. Focus on compositing tasks. Use my studio's status names..."
            value={settingsPrompt}
            onChange={e => setSettingsPrompt(e.target.value)}
            rows={3}
            style={{ resize: 'vertical', minHeight: 60 }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
            Extra instructions appended to the AI's system prompt.
          </div>
        </div>
        <button className="btn-primary" onClick={handleSaveSettings} disabled={!settingsKey.trim()}
          style={{ width: '100%' }}>
          Save & Connect
        </button>
        {hasSettings && (
          <button className="modal-cancel" style={{ marginTop: 12, width: '100%' }} onClick={clearChatHistory}>
            Clear Chat History
          </button>
        )}
        {llmSettings?.apiKey && (
          <button className="modal-cancel" style={{ marginTop: 12, width: '100%' }}
            onClick={() => {
              localStorage.removeItem('llm_settings');
              localStorage.removeItem('chat_history');
              localStorage.removeItem('chat_conversation');
              localStorage.removeItem('chat_custom_prompt');
              setLlmSettings(null);
              setSettingsKey('');
              setShowSettings(false);
              setMessages([{ type: 'system', text: 'AI disconnected. Tap the gear icon to set up a new provider.' }]);
              conversationRef.current = [];
            }}>
            Disconnect AI
          </button>
        )}
      </div>
    </div>
  );

  // ── Main chat view ──
  return (
    <div className="chat-container">
      <div className="header">
        <BrandLogo />
        <div className="header-title" style={{ fontSize: 15 }}>Chat</div>
        <div className="header-right">
          {hasSettings && (
            <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {llmSettings.provider === 'claude' ? 'Haiku' : 'Gemini'}
            </span>
          )}
          <button className="edit-btn" onClick={() => setShowSettings(true)} style={{ fontSize: 16, padding: '4px 8px', lineHeight: 1 }}>
            &#9881;
          </button>
        </div>
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg--${msg.type}`}>
            {msg.text.split('\n').map((line, j) => (
              <div key={j}>{renderText(line)}</div>
            ))}
          </div>
        ))}
        {processing && (
          <div className="chat-msg chat-msg--bot">
            <div className="chat-typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      {messages.length <= 2 && hasSettings && !processing && (
        <div className="chat-suggestions">
          {suggestions.map((s, i) => (
            <div key={i} className="chat-suggestion" onClick={() => setInput(s)}>{s}</div>
          ))}
        </div>
      )}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          placeholder={hasSettings ? "Tell me what to do..." : "Set up AI provider first..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          rows={1}
          disabled={!hasSettings}
        />
        <button className="chat-send" onClick={handleSend} disabled={processing || !input.trim() || !hasSettings}>&#8593;</button>
      </div>
    </div>
  );
}

// ─── Push Notification Helpers ──────────────────────────────────────────────
const VAPID_PUBLIC_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VAPID_PUBLIC_KEY) || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

function NotificationSettings({ onClose }) {
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [watchStatuses, setWatchStatuses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ftrack_watch_statuses') || '["QC Ready"]'); } catch { return ['QC Ready']; }
  });
  const [newStatus, setNewStatus] = useState('');
  const [toast, setToast] = useState('');
  const [projectId, setProjectId] = useState(() => {
    try { return sessionStorage.getItem('ftrack_shots_project') || ''; } catch { return ''; }
  });
  const [projects, setProjects] = useState([]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  // Check existing subscription
  useEffect(() => {
    (async () => {
      try {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          setSubscribed(!!sub);
        }
        fetchProjects().then(setProjects).catch(() => {});
      } catch {}
      setLoading(false);
    })();
  }, []);

  const subscribe = async () => {
    try {
      if (!VAPID_PUBLIC_KEY) {
        showToast('VAPID key not configured — see setup instructions');
        return;
      }
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        showToast('Notification permission denied');
        return;
      }

      setLoading(true);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Send subscription to server
      const auth = JSON.parse(localStorage.getItem('ftrack_auth') || '{}');
      const resp = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          ftrackServer: auth.server,
          ftrackUser: auth.user,
          ftrackApiKey: auth.apiKey,
          watchStatuses,
          projectId: projectId || null,
        }),
      });

      if (!resp.ok) throw new Error('Server error');
      setSubscribed(true);
      localStorage.setItem('ftrack_watch_statuses', JSON.stringify(watchStatuses));
      showToast('Notifications enabled!');
    } catch (err) {
      console.error('[Notifications] Subscribe error:', err);
      showToast(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    try {
      setLoading(true);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      showToast('Notifications disabled');
    } catch (err) {
      showToast(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addStatus = () => {
    const s = newStatus.trim();
    if (s && !watchStatuses.includes(s)) {
      const updated = [...watchStatuses, s];
      setWatchStatuses(updated);
      localStorage.setItem('ftrack_watch_statuses', JSON.stringify(updated));
      setNewStatus('');
    }
  };

  const removeStatus = (s) => {
    const updated = watchStatuses.filter(v => v !== s);
    setWatchStatuses(updated);
    localStorage.setItem('ftrack_watch_statuses', JSON.stringify(updated));
  };

  const isSupported = typeof Notification !== 'undefined' && 'PushManager' in window;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="header">
        <div className="back-btn" onClick={onClose}>&#8592; Back</div>
        <div className="header-title" style={{ fontSize: 15 }}>Notifications</div>
      </div>
      <div className="scroll" style={{ padding: 16 }}>
        <Toast msg={toast} />

        {/* iOS standalone check */}
        {isIOS && !isStandalone && (
          <div style={{ background: 'rgba(245,166,35,.15)', border: '1px solid var(--amber)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--amber)' }}>
            Push notifications on iOS require the app to be added to your Home Screen. Open Safari, tap Share, then "Add to Home Screen".
          </div>
        )}

        {!isSupported && (
          <div style={{ background: 'rgba(231,76,60,.15)', border: '1px solid var(--red)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
            Push notifications are not supported on this browser/device.
          </div>
        )}

        {!VAPID_PUBLIC_KEY && (
          <div style={{ background: 'rgba(245,166,35,.15)', border: '1px solid var(--amber)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--amber)' }}>
            VAPID keys not configured. Set VITE_VAPID_PUBLIC_KEY in your environment. See setup instructions below.
          </div>
        )}

        {/* Status */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Status</div>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            {subscribed ? (
              <span style={{ color: 'var(--green)' }}>Notifications active</span>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Not subscribed</span>
            )}
          </div>
        </div>

        {/* Watch statuses */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Notify me when a task becomes</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {watchStatuses.map(s => (
              <span key={s} onClick={() => removeStatus(s)}
                style={{ background: 'var(--accent)', color: '#fff', borderRadius: 12, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {s} &#10005;
              </span>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); addStatus(); }} style={{ display: 'flex', gap: 8 }}>
            <input className="search-input" placeholder="Add status name..." value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ flex: 1, margin: 0 }} />
            <button type="submit" className="action-btn" style={{ padding: '8px 14px' }}>Add</button>
          </form>
        </div>

        {/* Project scope */}
        {projects.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Project (optional)</div>
            <select className="project-picker" value={projectId} onChange={e => setProjectId(e.target.value)} style={{ width: '100%' }}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* Subscribe/Unsubscribe */}
        <div style={{ display: 'flex', gap: 10 }}>
          {!subscribed ? (
            <button className="action-btn" style={{ flex: 1, padding: 12, fontSize: 14, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8 }}
              onClick={subscribe} disabled={loading || !isSupported || !VAPID_PUBLIC_KEY}>
              {loading ? 'Setting up...' : 'Enable Notifications'}
            </button>
          ) : (
            <>
              <button className="action-btn" style={{ flex: 1, padding: 12, fontSize: 14, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8 }}
                onClick={subscribe} disabled={loading}>
                {loading ? 'Updating...' : 'Update Settings'}
              </button>
              <button className="action-btn" style={{ padding: '12px 16px', fontSize: 14, background: 'var(--card)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8 }}
                onClick={unsubscribe} disabled={loading}>
                Disable
              </button>
            </>
          )}
        </div>

        {/* Setup instructions */}
        <div style={{ marginTop: 24, padding: 16, background: 'var(--card)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Setup (one-time)</div>
          <div>1. Set these environment variables in Vercel:</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg)', padding: '6px 8px', borderRadius: 4, margin: '4px 0 8px', wordBreak: 'break-all' }}>
            VAPID_PUBLIC_KEY=your_public_key<br/>
            VAPID_PRIVATE_KEY=your_private_key<br/>
            VITE_VAPID_PUBLIC_KEY=same_public_key<br/>
            VAPID_EMAIL=mailto:you@email.com
          </div>
          <div>2. Set up Vercel KV storage in your project dashboard</div>
          <div>3. Redeploy after adding env vars</div>
          <div style={{ marginTop: 8 }}>Generate VAPID keys: <span style={{ fontFamily: 'monospace', fontSize: 11 }}>npx web-push generate-vapid-keys</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(null);
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('ftrack_tab') || 'reviews'; } catch { return 'reviews'; }
  });
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [restoring, setRestoring] = useState(true);

  // Persist active tab
  useEffect(() => {
    try { sessionStorage.setItem('ftrack_tab', tab); } catch {}
  }, [tab]);

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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", minHeight: 0 }}>
          {showNotifSettings ? (
            <NotificationSettings onClose={() => setShowNotifSettings(false)} />
          ) : (
            <>
              {tab === "reviews" && <ReviewsTab userInitial={userInitial} />}
              {tab === "shots" && <ShotsTab />}
              {tab === "chat" && <ChatTab />}
            </>
          )}
        </div>
        <div className="bottom-nav">
          <div className={`nav-item ${tab === "reviews" ? "active" : ""}`} onClick={() => { setShowNotifSettings(false); setTab("reviews"); }}>
            <div className="nav-icon">&#127916;</div>
            <div className="nav-label">Reviews</div>
          </div>
          <div className={`nav-item ${tab === "shots" ? "active" : ""}`} onClick={() => { setShowNotifSettings(false); setTab("shots"); }}>
            <div className="nav-icon">&#127902;</div>
            <div className="nav-label">Shots</div>
          </div>
          <div className={`nav-item ${tab === "chat" ? "active" : ""}`} onClick={() => { setShowNotifSettings(false); setTab("chat"); }}>
            <div className="nav-icon">&#128172;</div>
            <div className="nav-label">Chat</div>
          </div>
          <div className={`nav-item ${showNotifSettings ? "active" : ""}`} onClick={() => setShowNotifSettings(true)}>
            <div className="nav-icon">&#128276;</div>
            <div className="nav-label">Alerts</div>
          </div>
        </div>
      </div>
    </>
  );
}
