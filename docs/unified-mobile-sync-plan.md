# Unified Server + Mobile Home Suite Home

## Goal
Home Suite Home runs as:
- a server-backed web app
- a Capacitor-wrapped iOS app
- a Capacitor-wrapped Android app

All three share the same React UI codebase and the same sync model.

## Implemented foundation

### Server
- Added sync API endpoints:
  - `POST /api/v1/sync/bootstrap`
  - `POST /api/v1/sync/pull`
  - `POST /api/v1/sync/push`
- Added shared sync payload types:
  - `SyncCursorSet`
  - `SyncEnvelope`
  - `SyncOperation`
  - `SyncConflict`
  - `SyncTombstone`
- Added tombstone persistence for deleted syncable entities.
- Added initial sync handling for:
  - notes
  - tasks
  - Home Suite Home calendars
  - Home Suite Home calendar events

### Web / shared client
- Added a platform abstraction in `web/src/lib/platform.ts` for:
  - session storage
  - native platform detection
  - connectivity status
- Added offline storage in `web/src/lib/offline-db.ts`:
  - IndexedDB first
  - `localStorage` fallback
- Added sync orchestration in `web/src/lib/sync-engine.ts`:
  - bootstrap from server
  - pull deltas
  - queue operations
  - flush queued operations
  - merge envelopes into local cache
- Added sync transport methods to `web/src/lib/api.ts`.
- Updated auth/bootstrap flow so the app can:
  - use a cached workspace offline
  - restore a prior signed-in session
  - persist the workspace locally as a backup
- Added a connection/sync banner to the app shell.

### Mobile shell
- Added Capacitor configuration:
  - `web/capacitor.config.json`
- Added mobile helper scripts:
  - `npm run mobile:sync --prefix web`
  - `npm run mobile:ios --prefix web`
  - `npm run mobile:android --prefix web`

## Current behavior
- Web remains the primary runtime.
- The client now keeps a durable local workspace cache for:
  - notes
  - diagrams
  - voice memos
  - rooms
  - messages
  - calendars
  - calendar events
  - tasks
  - file tree metadata
- On reconnect, the app can pull fresh data and flush queued sync operations.
- If the server is unavailable but a cached session and workspace exist, the app can still open in offline mode.

## Next implementation milestones

### 1. Route all writable entities through the sync queue
- Replace direct page mutations with repository-backed queued operations.
- Prioritize:
  - notes
  - tasks
  - Home Suite Home calendars
  - Home Suite Home calendar events

### 2. Expand sync coverage
- Add queued mutation support for:
  - diagrams
  - voice memo metadata
  - chat messages/reactions
  - files/folders metadata operations

### 3. Conflict UX
- Add explicit conflict UI for:
  - notes
  - tasks
  - calendar events
  - file rename/move conflicts

### 4. Native device integrations
- Add Capacitor plugins for:
  - secure storage
  - filesystem/blob caching
  - camera/photo/file picking
  - notifications

### 5. Mobile layout tuning
- Add touch-first layout behaviors, keyboard-safe composer spacing, and offline-first status affordances on mobile screens.

## Design rule
Future feature work should prefer:
- shared React components
- shared repositories/view models
- sync-backed mutations
- platform abstractions instead of browser-only direct APIs
