# ftrack After Effects panel (CEP)

HTML/React panel that packages this app for After Effects via Adobe CEP.

## Features (AE tab)

1. **Match** — active comp name → ftrack shot (auto on comp change)
2. **Import** — download original or review proxy into the active comp (`ftrack` folder)
3. **Status** — set task status without leaving AE
4. **Notes** — read/post notes on the latest version

## One-time setup (Windows)

```powershell
npm run cep:debug
npm run cep:link
npm run build:cep
```

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
| `ae-panel/CSXS/manifest.xml` | CEP registration |
| `ae-panel/jsx/host.jsx` | ExtendScript (import footage) |
| `src/ae/AeWorkspace.jsx` | AE tab UI |
| `src/ae/bridge.js` | CEP ↔ ExtendScript |
| `src/ae/download.js` | Node download (bypasses CORS) |

## CORS / auth

Component URLs from `getComponentUrl` already include `username` + `apiKey`. Downloads use CEP Node `https`, so browser CORS does not apply.
