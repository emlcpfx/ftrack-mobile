# ftrack After Effects panel (CEP)

HTML/React panel that packages this app for After Effects via Adobe CEP.

## Partner update (Windows)

Clone once, then whenever there’s a new version:

**Double-click** `update-ae-panel.cmd` in the repo root  
— or —

```powershell
npm run cep:update
```

That script: `git pull` → `npm install` → enable CEP debug → link extension → `build:cep`.

Then reopen **Window → Extensions (Legacy) → ftrack panel** (or restart AE).

Requires: Git, Node.js/npm, and a clone of this repo. **AE 2022+** (CEP 11).

## Features

1. **Shots** — match active comp → ftrack shot; import original/proxy by version; status; notes; assignees
2. **Publish** — drop / select renders → match → SDK upload + encode
3. **Reviews / Alerts / Chat** — same app surfaces as mobile

## One-time setup (Windows)

```powershell
npm run cep:debug
npm run cep:link
npm run build:cep
```

Or just run `update-ae-panel.cmd` once — it does all of the above after pull.

Restart After Effects → **Window → Extensions (Legacy) → ftrack panel**

DevTools: `http://localhost:8092`

## Dev loop

```powershell
npm run build:cep
# reload panel (or reopen) in AE
```

## Layout

| Path | Role |
|---|---|
| `ae-panel/CSXS/manifest.xml` | CEP registration (AE 22.0+, CSXS 11) |
| `ae-panel/jsx/host.jsx` | ExtendScript (import footage) |
| `src/ae/*` | CEP bridge, publish, alerts, match |
| `src/api/ftrack.js` | ftrack SDK session + queries |
| `src/api/diskUpload.js` | CEP disk streaming upload (no full RAM buffer) |
| `scripts/update-ae-panel.ps1` | Partner pull + deploy |

## Auth / downloads

- Panel login stores creds in the browser — that’s enough for Shots / Publish / Import / Alerts.
- Optional Vercel env `FTRACK_SERVER` / `FTRACK_API_USER` / `FTRACK_API_KEY`: used by push cron + Claude chat when set; otherwise those features fall back to the logged-in user’s key.
- CEP imports: signed URL or header-auth — no apiKey in the download query string.
- Temp downloads under `%TEMP%/ftrack-ae`, purged after import.
