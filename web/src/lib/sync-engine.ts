import { api } from './api'
import { offlineDb } from './offline-db'
import { mergePendingManagedUploads } from './pending-managed-uploads'
import { mergePendingVoiceFileTree, mergePendingVoiceMemos } from './pending-voice'
import { getConnectivityState } from './platform'
import type {
  QueuedSyncConflict,
  QueuedSyncOperation,
  ResourceShare,
  SyncCursorSet,
  SyncEnvelope,
  SyncOperation,
  SyncPushResponse,
  WorkspaceSnapshot,
} from './types'

function createOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function operationKey(operation: SyncOperation): string {
  switch (operation.kind) {
    case 'create_note':
      return `create-note:${operation.title}`
    case 'update_note':
    case 'apply_note_operations':
    case 'delete_note':
      return operation.id
    case 'create_diagram':
      return `create-diagram:${operation.title}`
    case 'update_diagram':
      return operation.id
    case 'create_task':
      return `create-task:${operation.title}`
    case 'update_task':
    case 'delete_task':
      return operation.id
    case 'create_local_calendar':
      return `create-calendar:${operation.title}`
    case 'rename_calendar':
    case 'delete_calendar':
      return operation.id
    case 'create_calendar_event':
      return `${operation.connection_id}:${operation.title}`
    case 'update_calendar_event':
    case 'delete_calendar_event':
      return operation.event_id
    case 'create_message':
      return `${operation.room_id}:${operation.body}`
    case 'create_managed_folder':
      return `create-folder:${operation.path}`
    case 'move_managed_path':
      return `move-path:${operation.source_path}:${operation.destination_dir}`
    case 'rename_managed_path':
      return `rename-path:${operation.path}:${operation.new_name}`
    case 'delete_managed_path':
      return `delete-path:${operation.path}`
    case 'toggle_message_reaction':
      return `${operation.room_id}:${operation.message_id}:${operation.emoji}`
  }
}

function indexById<T extends { id: string }>(records: T[]) {
  return new Map(records.map((record) => [record.id, record] as const))
}

function mergeEntityCollection<T extends { id: string }>(
  current: T[],
  incoming: T[],
  deletedIds: Set<string>,
): T[] {
  const merged = indexById(current)
  for (const record of incoming) {
    merged.set(record.id, record)
  }
  for (const id of deletedIds) {
    merged.delete(id)
  }
  return Array.from(merged.values())
}

function mergeResourceShares(current: ResourceShare[], incoming: ResourceShare[]) {
  const merged = new Map(current.map((share) => [share.resource_key, share] as const))
  for (const share of incoming) {
    merged.set(share.resource_key, share)
  }
  return Array.from(merged.values())
}

function mergeFileTree(current: SyncEnvelope['file_tree'], incoming: SyncEnvelope['file_tree']) {
  return incoming.length > 0 ? incoming : current
}

function mergeEnvelope(current: SyncEnvelope | null, incoming: SyncEnvelope): SyncEnvelope {
  if (!current) {
    return incoming
  }

  const tombstones = [...current.tombstones]
  const seenTombstoneKeys = new Set(current.tombstones.map((entry) => `${entry.entity}:${entry.id}`))
  for (const tombstone of incoming.tombstones) {
    const key = `${tombstone.entity}:${tombstone.id}`
    if (seenTombstoneKeys.has(key)) continue
    seenTombstoneKeys.add(key)
    tombstones.push(tombstone)
  }

  const noteDeletes = new Set(tombstones.filter((entry) => entry.entity === 'notes').map((entry) => entry.id))
  const taskDeletes = new Set(tombstones.filter((entry) => entry.entity === 'tasks').map((entry) => entry.id))
  const calendarConnectionDeletes = new Set(
    tombstones.filter((entry) => entry.entity === 'calendar_connections').map((entry) => entry.id),
  )
  const calendarEventDeletes = new Set(
    tombstones.filter((entry) => entry.entity === 'calendar_events').map((entry) => entry.id),
  )

  return {
    cursors: incoming.cursors,
    notes: mergeEntityCollection(current.notes, incoming.notes, noteDeletes),
    diagrams: mergeEntityCollection(current.diagrams, incoming.diagrams, new Set()),
    voice_memos: mergeEntityCollection(current.voice_memos, incoming.voice_memos, new Set()),
    rooms: mergeEntityCollection(current.rooms, incoming.rooms, new Set()),
    messages: mergeEntityCollection(current.messages, incoming.messages, new Set()),
    calendar_connections: mergeEntityCollection(
      current.calendar_connections,
      incoming.calendar_connections,
      calendarConnectionDeletes,
    ),
    calendar_events: mergeEntityCollection(current.calendar_events, incoming.calendar_events, calendarEventDeletes),
    tasks: mergeEntityCollection(current.tasks, incoming.tasks, taskDeletes),
    file_tree: mergeFileTree(current.file_tree, incoming.file_tree),
    resource_shares: mergeResourceShares(current.resource_shares, incoming.resource_shares),
    tombstones,
  }
}

function toWorkspaceSnapshot(envelope: SyncEnvelope, source: WorkspaceSnapshot['source']): WorkspaceSnapshot {
  return {
    source,
    synced_at: new Date().toISOString(),
    cursors: envelope.cursors,
    notes: envelope.notes,
    diagrams: envelope.diagrams,
    voice_memos: envelope.voice_memos,
    rooms: envelope.rooms,
    messages: envelope.messages,
    calendar_connections: envelope.calendar_connections,
    calendar_events: envelope.calendar_events,
    tasks: envelope.tasks,
    file_tree: envelope.file_tree,
    resource_shares: envelope.resource_shares,
    tombstones: envelope.tombstones,
  }
}

async function withPendingVoiceUploads(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const pendingVoiceUploads = await offlineDb.listPendingVoiceUploads()
  if (pendingVoiceUploads.length === 0) {
    return snapshot
  }
  return {
    ...snapshot,
    voice_memos: mergePendingVoiceMemos(snapshot.voice_memos, pendingVoiceUploads),
    file_tree: mergePendingVoiceFileTree(snapshot.file_tree, pendingVoiceUploads),
  }
}

async function withPendingManagedUploads(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const pendingManagedUploads = await offlineDb.listPendingManagedUploads()
  if (pendingManagedUploads.length === 0) {
    return snapshot
  }
  return {
    ...snapshot,
    file_tree: mergePendingManagedUploads(snapshot.file_tree, pendingManagedUploads),
  }
}

async function cacheMergedEnvelope(incoming: SyncEnvelope) {
  const current = await offlineDb.loadWorkspace()
  const merged = mergeEnvelope(current, incoming)
  await offlineDb.saveWorkspace(merged)
  return merged
}

export async function loadCachedWorkspaceSnapshot(): Promise<WorkspaceSnapshot | null> {
  const envelope = await offlineDb.loadWorkspace()
  return envelope
    ? withPendingManagedUploads(await withPendingVoiceUploads(toWorkspaceSnapshot(envelope, 'cache')))
    : null
}

export async function bootstrapWorkspace(includeFileTree = true): Promise<WorkspaceSnapshot> {
  if (!getConnectivityState()) {
    const cached = await loadCachedWorkspaceSnapshot()
    if (!cached) {
      throw new Error('Offline and no cached workspace is available yet.')
    }
    return cached
  }

  const envelope = await api.syncBootstrap({ include_file_tree: includeFileTree })
  const merged = await cacheMergedEnvelope(envelope)
  return withPendingManagedUploads(await withPendingVoiceUploads(toWorkspaceSnapshot(merged, 'remote')))
}

export async function refreshWorkspace(cursors?: SyncCursorSet, includeFileTree = true): Promise<WorkspaceSnapshot> {
  if (!getConnectivityState()) {
    const cached = await loadCachedWorkspaceSnapshot()
    if (!cached) {
      throw new Error('Offline and no cached workspace is available yet.')
    }
    return cached
  }

  const effectiveCursors = cursors ?? (await offlineDb.loadWorkspace())?.cursors
  const envelope = await api.syncPull({
    cursors: effectiveCursors ?? {
      generated_at: new Date(0).toISOString(),
    },
    include_file_tree: includeFileTree,
  })
  const merged = await cacheMergedEnvelope(envelope)
  return withPendingManagedUploads(await withPendingVoiceUploads(toWorkspaceSnapshot(merged, 'remote')))
}

export async function persistWorkspaceSnapshot(snapshot: Pick<WorkspaceSnapshot, keyof WorkspaceSnapshot>) {
  const current = await offlineDb.loadWorkspace()
  const envelope: SyncEnvelope = {
    cursors: snapshot.cursors,
    notes: snapshot.notes,
    diagrams: snapshot.diagrams,
    voice_memos: snapshot.voice_memos,
    rooms: snapshot.rooms,
    messages: snapshot.messages,
    calendar_connections: snapshot.calendar_connections,
    calendar_events: snapshot.calendar_events,
    tasks: snapshot.tasks,
    file_tree: snapshot.file_tree,
    resource_shares: snapshot.resource_shares.length > 0 ? snapshot.resource_shares : (current?.resource_shares ?? []),
    tombstones: snapshot.tombstones.length > 0 ? snapshot.tombstones : (current?.tombstones ?? []),
  }
  await offlineDb.saveWorkspace(envelope)
}

export async function queueSyncOperation(operation: SyncOperation) {
  const record: QueuedSyncOperation = {
    id: createOperationId(),
    operation,
    created_at: new Date().toISOString(),
    attempts: 0,
  }
  await offlineDb.enqueueOperation(record)
  return record
}

export async function flushQueuedOperations(): Promise<SyncPushResponse | null> {
  if (!getConnectivityState()) return null
  const queuedOperations = await offlineDb.listQueuedOperations()
  if (queuedOperations.length === 0) return null

  const response = await api.syncPush({
    operations: queuedOperations.map((record) => record.operation),
  })
  const conflictIds = new Set(response.conflicts.map((conflict) => conflict.id))
  const conflictedRecords = queuedOperations.filter((record) => conflictIds.has(operationKey(record.operation)))
  const successfulRecords = queuedOperations.filter((record) => !conflictIds.has(operationKey(record.operation)))
  for (const record of successfulRecords) {
    await offlineDb.removeQueuedOperation(record.id)
  }
  for (const record of conflictedRecords) {
    const conflict = response.conflicts.find((entry) => entry.id === operationKey(record.operation))
    if (!conflict) continue
    const storedConflict: QueuedSyncConflict = {
      id: record.id,
      created_at: new Date().toISOString(),
      queued_operation: record,
      conflict,
    }
    await offlineDb.saveSyncConflict(storedConflict)
    await offlineDb.removeQueuedOperation(record.id)
  }
  await cacheMergedEnvelope(response.envelope)
  return response
}

export async function listQueuedSyncConflicts() {
  return offlineDb.listSyncConflicts()
}

export async function retryQueuedSyncConflict(id: string) {
  const conflicts = await offlineDb.listSyncConflicts()
  const conflict = conflicts.find((entry) => entry.id === id)
  if (!conflict) {
    throw new Error('Queued conflict could not be found.')
  }
  await offlineDb.enqueueOperation({
    ...conflict.queued_operation,
    created_at: new Date().toISOString(),
    attempts: conflict.queued_operation.attempts + 1,
  })
  await offlineDb.removeSyncConflict(id)
}

export async function discardQueuedSyncConflict(id: string) {
  await offlineDb.removeSyncConflict(id)
}
