# Mobile Notes App Plan

## Purpose
Build a mobile-first notes app for iOS and Android that covers only the notes section of Home Suite Home, works offline on-device, and syncs back to the main server with concurrent editing support.

This plan extends the current shared mobile direction in [docs/unified-mobile-sync-plan.md](/Users/nathanjohnson/Documents/Projects/sweet/docs/unified-mobile-sync-plan.md) instead of replacing it.

## Stack decision

### Recommended phase 1
Use the native mobile app in `mobile/`:
- Expo / React Native shell
- shared server contracts
- mobile-owned local persistence and sync orchestration
- shared note domain concepts where they make sense

Reason:
- the repo now has a dedicated native mobile app target
- the old web-owned Android shell has been removed
- the offline and sync problems are the real hard part here, so mobile should reuse the server contracts without keeping a second web-wrapper app path alive

### What “native app” should mean here
For this repo, the practical interpretation should be:
- installable iOS app
- installable Android app
- native device integrations where needed
- mobile-specific layout and interaction model

Not:
- separate fully native UI stacks in SwiftUI and Jetpack Compose for v1

If strict native UI becomes mandatory later, keep the sync/domain contracts in shared APIs so the UI layer can be replaced without redoing the data model.

## Current baseline in this repo
- Offline workspace caching already exists in `web/src/lib/offline-db.ts`.
- Sync bootstrap/pull/push already exists in `web/src/lib/sync-engine.ts` and server sync routes.
- Native mobile work now lives under `mobile/`.
- Notes already have lightweight realtime behavior through websocket events for draft, patch, presence, and cursor activity.
- Current note conflict handling is still lightweight. The repo status explicitly says note collaboration uses websocket broadcast plus client reconciliation rather than a full CRDT engine.

## Product scope for the note app

### In scope
- note library
- note editor
- offline local-first storage
- optional server sync per note
- note sharing and visibility controls
- concurrent editing presence
- mobile appearance settings relevant to notes
- note import/open flow from local and server storage

### Out of scope for v1
- chat
- calls
- diagrams
- voice memos
- general-purpose drive/file manager beyond what notes need
- full custom plugin or extension system

## UX specification

### Primary editor layout
- Top bar stays pinned.
- Element bar stays pinned below top bar or docks above the software keyboard when practical.
- Editor body fills the rest of the screen.
- Remote presence avatars stack from the top-right downward when multiple users are active.
- Remote cursors render inline in the editor when a collaborator is focused in the same note.

### Top bar
- file name
- autosave indicator
- `MD` / `TXT` visual toggle
- table of contents button
- visibility/share button
- hamburger menu

### Element bar
- header selector
- undo / redo
- bold
- italic
- underline
- strikethrough
- quote block
- link editor
- table insert and table settings affordance
- code block with syntax highlighting
- list mode picker:
  - bullet
  - checkbox
  - dash

### Table of contents
- modal or bottom sheet
- headings indented by depth
- tap entry scrolls editor to heading
- current heading can be highlighted while scrolling

### Visibility dialog
- note visibility defaults to server-backed when a user is signed into a server
- new note flow includes a checkbox to disable server sync for a local-only note
- existing local-only note can later be attached to a server
- invite existing server users to the note
- show current access list and role

### Hamburger menu
- Open
- Servers
- Appearance

### Open flow
- full-screen picker
- root groups:
  - server
  - local
- search at top
- tap folder to drill in
- tap file to select
- `Open` action bottom-right
- `Cancel` action bottom-left

Each note should support storage policy:
- local only
- server only
- local + server

Default should be `local + server`.

### Servers screen
- list configured servers
- server status
- last sync time
- account identity
- per-server actions for future expansion

### Appearance screen
- follow system dark/light mode
- custom mode:
  - solid color
  - image background
  - four-corner gradient
- font selector
- accent color selector

## Sync and concurrency model

### Required model
Your requested behavior is stronger than the current repo model. The current sync layer queues entity-level operations, but note editing itself is still effectively whole-document oriented with lightweight merge behavior.

For the mobile notes app, notes should move to an action-log model:
- every local edit is recorded as an ordered note operation
- operations sync asynchronously
- the server stores the operation log and materialized note snapshot
- clients merge operations against a known base version
- unresolved overlap produces a conflict record instead of silent overwrite

### Recommended note operation types
- insert_text
- delete_range
- replace_range
- apply_mark
- remove_mark
- set_block_type
- insert_block
- delete_block
- move_block
- update_table
- set_title
- set_visibility

Each operation should include:
- operation id
- note id
- actor id
- device id
- base revision or vector
- timestamp
- payload

### Practical merge strategy
Recommended implementation order:
1. move from whole-note save to operation batches for note edits
2. keep a materialized markdown snapshot for rendering and export
3. use structured merge for block/range operations
4. keep explicit conflict records when two edits touch overlapping ranges and cannot be safely rebased

For v1, this is more realistic than promising a perfect CRDT immediately.

### Presence and cursor behavior
Realtime presence should stay websocket-based even if durable note sync is async:
- presence heartbeat when note is open
- cursor updates throttled aggressively
- ephemeral collaborator list per note session
- presence does not need to be written to the durable sync log

Presence payload should include:
- note id
- user id
- display name
- avatar URL or avatar version
- client id
- cursor anchor/focus or collapsed caret position
- last seen timestamp

### Sync split
Treat the system as two channels:
- durable sync channel:
  - note operations
  - visibility changes
  - title changes
  - server attachment state
- ephemeral realtime channel:
  - presence
  - cursor
  - current active editing session

## Local storage model

### On-device stores
- note metadata index
- materialized note snapshots
- per-note pending operation log
- sync cursor state
- conflict queue
- cached collaborator metadata
- appearance preferences
- server connection metadata

### Storage technology
Near term:
- keep SQLite/local mobile storage in the native mobile runtime

Follow-up hardening:
- move sensitive auth/session material into native secure storage
- consider filesystem-backed document blobs for large notes and attachments

## Server changes required

### Notes API
Add or evolve endpoints for:
- note session open/close
- note operation push
- note operation pull
- note snapshot fetch
- note conflict resolution
- note visibility membership updates

### Persistence
Add durable tables for:
- note_operations
- note_sessions
- note_memberships
- note_conflicts

Keep the existing `notes` table as the materialized latest state for fast load.

### Realtime
Extend websocket contracts so clients can subscribe by note and receive:
- presence updates
- cursor updates
- optional remote operation hints for lower-latency reconciliation

## Mobile editor requirements

### Editing model
- support rich editing with markdown-compatible serialization
- support plain text / markdown source view toggle
- preserve selection across toolbar actions
- keep keyboard-safe spacing on iOS and Android
- support long notes without freezing on older devices

### Table support
Tables need their own editor affordance, not only raw markdown text:
- add row
- add column
- delete row
- delete column
- alignment options later

### Code blocks
- syntax-highlight locally
- avoid server-side dependency for core viewing

## Implementation phases

### Phase 1: note-only mobile shell
- create a note-only mobile route set
- strip non-notes sections from the mobile entry experience
- implement pinned top bar and mobile element bar
- implement note library open flow
- implement appearance screen

### Phase 2: local-first note repository
- wrap note reads/writes in a repository interface
- stop saving notes directly from page code
- persist note snapshots and pending note operations locally
- support local-only, server-only, and dual-storage policy per note

### Phase 3: concurrent editing foundation
- add server note operation log
- add note membership and visibility APIs
- add websocket presence/cursor sessions
- render remote cursors and avatar stack in mobile editor

### Phase 4: conflict workflow
- add explicit conflict queue for overlapping note operations
- add conflict review UI
- allow retry, accept-local, accept-remote, and manual merge

### Phase 5: hardening
- secure storage for auth/session
- offline stress testing
- background sync behavior tuning
- large-note performance tuning

## Key repo-level decisions

### Decision 1
Do not build this as a separate app repo yet.

Build it as a note-focused mobile target within this repo so it can reuse:
- current auth
- current sync transport
- current note editor logic
- native mobile packaging in `mobile/`

### Decision 2
Do not market the current merge behavior as full concurrent editing.

Current behavior is closer to:
- offline queueing
- websocket draft broadcast
- lightweight reconciliation

Your requested app needs a stronger note-operation model before the concurrency claim is credible.

### Decision 3
Keep presence ephemeral and note content durable.

Trying to put cursors and active sessions into the durable sync queue will create unnecessary churn and conflict noise.

## Immediate next build steps
1. Create a `mobile-notes` app mode that only exposes notes flows on mobile.
2. Introduce a note repository abstraction so page code stops writing directly to note entities.
3. Define note operation types and server persistence schema.
4. Implement per-note storage policy: local only, server only, local + server.
5. Replace whole-note autosave with queued note edit operations.
6. Add presence avatars and cursor overlays to the mobile editor UI.

## Acceptance criteria for v1
- A user can create and edit notes fully offline.
- A user can mark a note local-only or sync it to a server.
- Reconnect flushes pending note operations without losing local edits.
- Multiple users can open the same note and see live presence and cursor position.
- Concurrent edits no longer rely on simple whole-document overwrite.
- Conflicts that cannot be safely merged are surfaced explicitly to the user.
