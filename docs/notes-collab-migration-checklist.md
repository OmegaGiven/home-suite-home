# Notes Collaboration Migration Checklist

## Summary

This checklist audits the Loro + Tiptap migration plan against the current repo state. Each section below turns the plan into concrete checklist items and records what has already been implemented, what is partially done, and what still remains.

Status legend:

- `[x]` done
- `[ ]` not done
- `[~]` partial

Primary implementation references:

- Server document model and migration: `server/src/models.rs`, `server/src/state.rs`, `server/src/routes.rs`, `server/src/persistence.rs`
- Shared contracts: `packages/notes-suite-contracts/src/index.ts`
- Web API + editor: `web/src/lib/api.ts`, `web/src/lib/types.ts`, `web/src/lib/loro-note.ts`, `web/src/pages/NotesPage.tsx`
- Mobile sync surface: `notes-suite-notes/src/sync/api.ts`

## 1. New Note Architecture

- [x] Add durable note document fields for CRDT storage.
  Actions done: `Note` now stores `editor_format`, `loro_snapshot_b64`, `loro_updates_b64`, `loro_version`, and `loro_needs_migration` in `server/src/models.rs`, persisted through `server/src/persistence.rs`, and exposed through shared TS contracts.
- [x] Separate note metadata from note-body sync payloads.
  Actions done: `NoteDocumentState`, `NoteDocumentPullResponse`, and `PushNoteDocumentUpdatesResponse` were added to Rust and TS contracts to expose document state separately from note metadata.
- [x] Add opaque document update transport instead of relying only on legacy custom note operation batches.
  Actions done: `POST /api/v2/notes/{id}/document/updates` accepts CRDT update payloads and persists them.
- [x] Remove note-body authority from legacy Markdown/document/revision flows.
  Actions done: new `v2` document APIs and storage path exist; active web and mobile rich editors now write through the new Loro path; active note list/create/delete/session/document/metadata traffic has been moved to `v2`; `note_operations`, `note_patch`, and revision-based sync paths are no longer used by shipped clients; and the server now derives markdown back out of the Loro snapshot/update state for snapshot-only replacements and update-log compaction instead of treating incoming markdown as the canonical note-body source.
- [x] Keep presence/cursor state ephemeral instead of durable.
  Actions done: the new server document storage path does not write presence or cursor state into note document persistence.

## 2. Editor Stack Replacement

- [x] Replace the web `contentEditable` rich editor with a real editor foundation.
  Actions done: `web/src/pages/NotesPage.tsx` now uses `@tiptap/react` `EditorContent` with Tiptap extensions for headings, lists, tasks, code, and tables.
- [x] Keep the current notes page layout and toolbar placement while swapping the editor internals.
  Actions done: the existing notes page shell, toolbar position, TOC modal, context menu, and page layout were preserved while the editor surface changed.
- [x] Rebuild context-menu and toolbar commands against the new editor state.
  Actions done: toolbar actions, link/divider commands, element insertions, and table/context-menu mutations now dispatch directly to Tiptap commands in `web/src/pages/NotesPage.tsx`, and the old browser-side block-editor command layer has been removed.
- [x] Replace the mobile editor with the same Tiptap/ProseMirror-class document model.
  Actions done: `notes-suite-notes/src/components/notes-rich-editor.tsx` is now a WebView-hosted Tiptap editor surface with the same heading/list/quote/code/table/link command model as the web editor, while `notes-suite-notes/src/lib/app-context.tsx` continues to hydrate and persist synced notes through `pullNoteDocument(...)` / `pushNoteDocumentUpdates(...)` instead of the old block-op path.

## 3. Client Sync And Collaboration Redesign

- [x] Add a new client Loro document binding on web.
  Actions done: `web/src/lib/loro-note.ts` creates a Loro doc from snapshots/markdown and exports snapshot/update payloads.
- [x] Fetch note documents through a new document endpoint instead of only note operation polling.
  Actions done: `web/src/lib/api.ts` now exposes `pullNoteDocument` and `pushNoteDocumentUpdates`; `NotesPage` uses `pullNoteDocument`.
- [x] Push local editor changes as Loro updates.
  Actions done: `NotesPage` exports updates from the local Loro doc and posts them to `pushNoteDocumentUpdates`.
- [x] Remove custom draft broadcast / patch / note operation reconciliation from web.
  Actions done: the active rich editing surface no longer depends on the old custom block editor; selected-note polling now uses `pullNoteDocument(...)`, mobile-originated `note_document_update` events are handled in `web/src/lib/realtime-effects.ts`, the online workspace-local note save path now writes through `pushNoteDocumentUpdates(...)`, `web/src/lib/note-actions.ts` no longer broadcasts legacy `note_operations`, the old browser-side `note_patch` / `note_draft` / `note_operations` realtime handlers and shared event variants have been removed from the browser runtime and types, the last browser batch-based note-operation rebase helpers were removed, stale block-editor `dataset.noteEditorModel === 'blocks'` branches were removed from `web/src/pages/NotesPage.tsx` and `web/src/lib/note-editor-effects.ts`, and the active web note runtime now treats `noteDraftRef` as the authoritative local markdown instead of reserializing live editor DOM HTML through the old compatibility path.
- [x] Move mobile note sync off the legacy note operation endpoint.
  Actions done: the mobile app context now uses `pullNoteDocument(...)` and `pushNoteDocumentUpdates(...)` for hydration, persistence, queued flushes, and `note_document_update` websocket handling. The unused mobile `pullNoteOperations(...)` and `pushNoteOperations(...)` client wrappers have been removed from `notes-suite-notes/src/sync/api.ts`, the app no longer calls the legacy note-operations endpoint at all, the mobile realtime note binding no longer handles `note_patch` / `note_operations`, the active note-save path no longer routes through local block-operation batches before syncing, mobile title/visibility metadata edits now go through `PUT /api/v2/notes/{id}/metadata`, and the last dead `updateRemoteNote(...)` helper for the old revision-based mobile note-update flow has been removed.
- [x] Switch remote cursor and selection rendering to stable CRDT cursor positions.
  Actions done: note realtime cursor payloads now carry a stable `cursor_b64` Loro cursor alongside the legacy numeric offset in shared contracts, server realtime models, web runtime types, and mobile sync handling. The web rich editor derives a markdown-position cursor from the current DOM selection, encodes it through `loro-crdt` stable cursors in `web/src/lib/loro-note.ts`, broadcasts it in `web/src/lib/realtime-effects.ts` / `web/src/lib/note-actions.ts`, and resolves remote stable cursors back into current document positions in `web/src/pages/NotesPage.tsx` before decorating them. The mobile app also depends on `loro-crdt`, maintains cached per-note Loro cursor bindings in `notes-suite-notes/src/lib/app-context.tsx`, and the new Tiptap-based rich editor now derives markdown-prefix cursor offsets from the structured selection so mobile rich-note sessions also emit stable `cursor_b64` payloads.
- [x] Complete offline note replica + pending update handling for the new Loro payloads on both web and mobile.
  Actions done: the mobile local store in `notes-suite-notes/src/repositories/local-store.ts` now persists `editor_format`, `loro_snapshot_b64`, `loro_updates_b64`, `loro_version`, and `loro_needs_migration` with a schema migration for existing installs, so synced notes retain document-state metadata across app restarts. The mobile queued note sync record now stores a `document_update` payload instead of a legacy note-operation batch, and the replay path in `notes-suite-notes/src/lib/app-context.tsx` flushes those queued document updates through `pushNoteDocumentUpdates(...)`. Legacy queued batch rows are still readable through a compatibility fallback. On the web side, offline note saves queued by `web/src/lib/workspace-local-actions.ts` now store a `update_note_document` sync operation with `snapshot_b64` and `update_b64`, replay through `syncPush` into the new document endpoint, and the editor hydration path in `web/src/pages/NotesPage.tsx` now restores cached `updates_b64` into the local Loro binding instead of snapshot-only fallback.

## 4. Server And API Redesign

- [x] Add document-oriented note APIs.
  Actions done: `GET /api/v2/notes/{id}/document` and `POST /api/v2/notes/{id}/document/updates` were added in `server/src/routes.rs`.
- [x] Add server-side note migration support for existing notes.
  Actions done: `ensure_note_loro_foundation` generates Loro snapshots from legacy Markdown and `POST /api/v2/admin/notes/migrate-loro` runs a bulk migration.
- [x] Persist CRDT snapshots and updates in the main note store.
  Actions done: snapshots, version, and migration state are persisted on the `notes` record, and Postgres now also persists Loro updates in a dedicated `note_document_updates` table loaded through `server/src/persistence.rs`. File-snapshot persistence continues to carry the same data in serialized state snapshots, and server compaction coverage still passes against the new storage path.
- [x] Add server-side snapshot compaction / update-log compaction policy.
  Actions done: `server/src/state.rs` now compacts inline Loro updates back into a fresh snapshot after a threshold and clears the update list, with regression coverage in `note_document_updates_are_compacted_into_snapshot`.
- [x] Remove dependence on legacy note-body revision semantics for collaboration.
  Actions done: the new `v2` document update path does not use revision mismatch semantics, the active mobile client now uses `PUT /api/v2/notes/{id}/metadata` for title and visibility changes instead of routing those edits through the old revision-based note update endpoint, and the dead `update_note` sync operation has been removed from the web/server sync model entirely. The old `v1` note APIs still exist only as compatibility HTTP routes, but active collaboration no longer depends on their revision-mismatch semantics.
- [x] Remove note markdown file mirroring from managed storage and file tree.
  Actions done: note markdown mirroring has been removed from the server lifecycle in `server/src/state.rs`; startup now clears the legacy `notes/` managed root instead of regenerating markdown files, note create/update/move/rename/restore flows no longer write note bodies to storage, `server/src/storage.rs` no longer exposes `sync_note_markdown(...)`, `list_files()` no longer publishes notes into the managed file tree, and the web client strips any cached `notes/` nodes from the file browser in `web/src/lib/auth-actions.ts` and `web/src/lib/notes-runtime.ts`.

## 5. Data Migration And Cutover

- [x] Create a migration path from existing Markdown notes to Loro-backed notes.
  Actions done: server-side snapshot generation from Markdown exists and an admin migration endpoint can materialize it across all notes.
- [x] Preserve note ids, titles, folders, visibility, authorship, and timestamps during migration.
  Actions done: the migration keeps all existing note metadata, adds CRDT fields, archives legacy fork/conflict notes into an explicit `Legacy Conflicts/...` folder with a `[Legacy Conflict]` title prefix during admin migration, and now has regression coverage in `migration_preserves_note_metadata`.
- [x] Handle legacy conflict forks according to a defined archive or labeling policy.
  Actions done: `migrate_all_notes_to_loro()` now labels and folders fork/conflict notes under a legacy archive path, with regression coverage in `migration_archives_legacy_conflict_notes`.
- [x] Complete big-bang cutover by disabling legacy editing paths.
  Actions done: note file mirroring is gone; the web editor uses Tiptap + Loro document transport; the mobile rich editor now uses a Tiptap-based surface backed by the document endpoint; browser/mobile realtime now understand `note_document_update`; and active web/mobile note list/create/delete/session/document/metadata traffic now uses `v2` note APIs instead of the old revision-based note editing path. The remaining `v1` note routes are compatibility-only server shims and are no longer used by shipped clients.

## 6. Remaining High-Priority Work

- [x] Cut over `web/src/App.tsx` and the surrounding note action/realtime pipeline so the new Tiptap + Loro path is the only rich-note editing flow.
  Actions done: the active editor surface is Tiptap-based, selected-note sync pulls from the `v2` document endpoint, online workspace-local note saves use `pushNoteDocumentUpdates(...)`, offline workspace-local note saves now queue `update_note_document` sync operations instead of `apply_note_operations`, rich-mode browser edits no longer emit legacy `note_operations` broadcasts from `web/src/lib/note-actions.ts`, the old browser batch-based note-operation rebase/apply helpers were removed, the entire browser-side `web/src/lib/note-document.ts` compatibility module and its `NoteBlock` / `NoteDocument` type island were deleted, `web/src/lib/notes-runtime.ts` no longer rebuilds selected-note compatibility document state, the old contenteditable note-editor action layer was reduced to context-menu open/copy/paste support in `web/src/lib/note-editor-actions.ts` instead of still handling toolbar inserts, block transforms, table edits, or key/input events, the dead block-editor implementation was removed from `web/src/pages/NotesPage.tsx` and its page-prop wiring, the notes page action bundle in `web/src/lib/library-page-actions.ts` / `web/src/lib/app-page-props.ts` now updates selected notes through markdown instead of page-level `NoteDocument` plumbing, the active note save, note tree move, next-selected-note delete, and realtime authoritative-note reconciliation flows now use `applySelectedNoteMarkdown(...)` when authoritative markdown is already available instead of pushing document objects through the selected-note runtime, the app-level shadow `selectedNoteDocument` state/ref was removed from `web/src/lib/note-ui-state.ts`, `web/src/lib/app-ui-effects.ts`, `web/src/lib/note-editor-effects.ts`, `web/src/lib/app-effects-bundle.ts`, `web/src/lib/app-context-builders.ts`, and `web/src/App.tsx`, the active web client no longer sends legacy `document` payloads through `api.createNote(...)` / `api.updateNote(...)` or threads `markdownFromNoteDocument` through the app-page props context, the active mobile client no longer sends legacy `document` payloads through `createRemoteNote(...)` / `updateRemoteNote(...)` on the old `/api/v1/notes` path, active mobile title/visibility metadata edits now use `PUT /api/v2/notes/{id}/metadata` instead of the old revision-based note update route, the server-side `CreateNoteRequest` / `UpdateNoteRequest` models and handlers in `server/src/models.rs` / `server/src/state.rs` no longer accept or branch on legacy `document` request payloads, the active web selected-note update path no longer passes `document` through `applySelectedNoteMarkdown(...)` or uses `note.document` as a local-state fallback when regenerating the compatibility note model, the web `Note.document` field is now an unstructured optional fallback instead of a live browser-side compatibility model, the active web local-first note creation/update and selected-note runtime paths no longer eagerly write that compatibility field, the shared/mobile note contracts now also treat `document` as optional for local note records and note document pull/push/session payloads, the server `Note` model plus Postgres persistence now also treat `document` as optional while the main create/update path no longer eagerly rebuilds or persists a compatibility `NoteDocument` on every note write, the mobile local store plus app context no longer fabricate fallback compatibility documents for every note row, blank local note, or plain markdown edit, the dead mobile `replaceSelectedDocument(...)` compatibility export is gone, and remote note merges on mobile no longer carry `document` forward through the active merge path.
- [x] Remove or deprecate legacy note operation endpoints and custom note merge code after both clients are switched.
  Actions done: browser and mobile clients no longer use the legacy note-operations endpoint, browser offline note replay uses `update_note_document` instead of `apply_note_operations`, rich-mode browser edits no longer emit legacy `note_operations` broadcasts, `server/src/routes.rs` no longer exposes `/api/v1/notes/{id}/operations`, the dead server-side note-operations request/response handlers and in-memory `note_operations` state were removed, the `ApplyNoteOperations` sync variant and old server merge helper block were removed, `update_note` now emits `note_document_update` instead of `note_patch`, the shared/browser/server legacy note event variants were removed, persistence no longer reads, writes, or initializes `note_operations` state in snapshots, the active mobile save path no longer depends on `NoteDocumentOperationBatch` diffs, `packages/notes-suite-contracts/src/index.ts` no longer exports the dead mobile note-operation batch/pull/apply helpers, and `server/src/persistence.rs` now drops the obsolete `note_operations` table during database initialization.
- [x] Replace mobile note editing and persistence with the new document model.
  Actions done: the active mobile editor surface in `notes-suite-notes/src/components/notes-rich-editor.tsx` is now Tiptap-based, while hydration, save, queued replay, metadata updates, and session traffic all flow through the new `v2` note document and metadata endpoints in `notes-suite-notes/src/lib/app-context.tsx` / `notes-suite-notes/src/sync/api.ts`.
- [x] Remove filesystem-backed note mirroring and update file-tree behavior so notes are no longer treated as managed Markdown files.
- [x] Add explicit tests for migration, CRDT update replay, offline resume, and websocket awareness on the new path.
  Actions done: `server/src/state.rs` now has regression coverage for note migration/materialization, metadata preservation during migration, legacy conflict archival during migration, snapshot-only document replacement from Loro state, snapshot compaction, note-file mirroring removal, and offline CRDT replay through `sync_push_replays_note_document_crdt_payloads`. Websocket awareness of the new path is covered through `push_note_document_updates_emits_realtime_event`, and `server/src/ws.rs` has dedicated cursor-delivery coverage in `serialize_note_socket_event_filters_and_serializes_cursor_events`.
