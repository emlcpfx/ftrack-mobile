# ftrack Mobile — Claude Code Context

Mobile-first React PWA for ftrack shot review and status management.
Built for CleanPlateFX internal use. Target: iOS Safari, "Add to Home Screen."

## What this is

A lightweight replacement for ftrack's broken mobile UI. Two tabs:
- **Reviews** — browse open review sessions, watch versions, annotate frames, approve/reject, leave notes
- **Shots** — full shot list, search, filter by status, single + bulk status editing

## Stack

- React 18 + Vite
- `@ftrack/api` JS SDK for all data
- No UI library — custom CSS with CSS variables (all in App.jsx `css` string)
- Font: Inter via Google Fonts (matches ftrack's Proxima Nova aesthetic)

## File structure

```
src/
  App.jsx          ← entire UI currently (monolith, split as needed)
  api/ftrack.js    ← all ftrack SDK calls live here
  main.jsx         ← entry point
public/
  manifest.json    ← PWA manifest
index.html         ← includes PWA meta tags
vite.config.js     ← host:true so phone can connect over WiFi
```

## Current state

App.jsx uses **mock data** (MOCK_SHOTS, MOCK_REVIEWS constants at top of file).
The api/ftrack.js file has all the real query/mutation functions ready.
Wire-up work needed:

1. LoginScreen — call `createSession()` from api/ftrack.js instead of mock timeout
2. ReviewsTab — replace MOCK_REVIEWS with `fetchReviews()` + `fetchReviewShots()`
3. ShotsTab — replace MOCK_SHOTS with `fetchShots(projectId)` + `fetchStatuses()`
4. StatusPicker — use real status IDs from ftrack instead of hardcoded STATUSES array
5. PlayerScreen — wire video src via `getComponentUrl()`, notes via `fetchNotes()` + `createNote()`
6. Thumbnails — use `getThumbnailUrl(thumbnailId)` from api/ftrack.js

## ftrack API notes

- ftrack uses a query language similar to SQL called FQL
- All queries go through `session.query(fqlString)`
- Status IDs are project-specific — always fetch don't hardcode
- Session must be initialized before any query: `await session.initializing`
- CORS: ftrack instance must whitelist the app's domain in System Settings → Security → Allowed Origins
- For local dev add: http://localhost:5173

## Key ftrack entity relationships

```
Project
  └── Shot
        ├── status (Status)
        ├── assignments → User
        ├── thumbnail_id
        └── assets → AssetVersion
              ├── version (number)
              ├── status (Status)
              ├── thumbnail_id
              ├── components (media files)
              └── notes → Note

ReviewSession
  └── ReviewSessionObject
        └── version → AssetVersion
```

## Dev commands

```bash
npm run dev          # start dev server (localhost:5173)
npm run dev -- --host  # expose on local network for phone testing
npm run build        # build for production → dist/
npm run preview      # preview production build locally
```

## Deploy

```bash
# Vercel (recommended)
npx vercel           # first time — follow prompts
npx vercel --prod    # subsequent deploys

# Or manual to Vultr VPS
npm run build
rsync -av dist/ user@YOUR_VPS_IP:/var/www/ftrack-mobile/
```

## Nginx config for Vultr self-host

```nginx
server {
    listen 80;
    server_name review.cleanplatefx.com;
    root /var/www/ftrack-mobile;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Then run: `certbot --nginx -d review.cleanplatefx.com` for SSL.

## Splitting App.jsx (when it gets too big)

Suggested component breakdown:
- `src/screens/LoginScreen.jsx`
- `src/screens/ReviewsTab.jsx`
- `src/screens/ReviewDetail.jsx`
- `src/screens/PlayerScreen.jsx`
- `src/screens/ShotsTab.jsx`
- `src/components/StatusPill.jsx`
- `src/components/StatusPicker.jsx`
- `src/components/AnnotationCanvas.jsx`
- `src/components/Toast.jsx`
- `src/styles/global.css` (extract the css template string)

## Design system (CSS variables)

Based on ftrack's actual brand aesthetic. Uses Inter (closest free alternative to ftrack's Proxima Nova).

```
--bg: #1a1d21           ← main background (dark neutral gray)
--surface: #22262b      ← elevated surface / header / nav
--card: #282d33         ← card background
--card2: #2f353c        ← secondary card / placeholder
--border: #3a4049       ← borders (subtle)
--accent: #0097CE       ← ftrack brand teal/cyan
--accent2: #00B4D8      ← lighter teal
--green: #4CAF50        ← approved
--red: #E74C3C          ← rejected / changes needed
--amber: #F5A623        ← pending review
--blue: #2196F3         ← in progress
--text: #E8EAED         ← primary text
--muted: #8B9298        ← secondary text
--font-body: 'Inter'    ← primary font (all UI)
```
