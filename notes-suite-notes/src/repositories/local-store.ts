import * as SecureStore from 'expo-secure-store'
import * as SQLite from 'expo-sqlite'
import {
  type LocalNoteRecord,
  type NoteBinding,
  type PendingNoteOperationRecord,
  type ServerAccount,
  type SyncConflictRecord,
} from 'notes-suite-contracts'

const DATABASE_NAME = 'notes-suite-notes.db'
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null

async function openDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME)
  }
  return databasePromise
}

async function ensureColumn(database: SQLite.SQLiteDatabase, table: string, column: string, definition: string) {
  try {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/duplicate column name/i.test(message) || /already exists/i.test(message)) {
      return
    }
    throw error
  }
}

function parseQueuedNotePayload(raw: string): PendingNoteOperationRecord['payload'] {
  const parsed = JSON.parse(raw) as
    | PendingNoteOperationRecord['payload']
    | { base_markdown?: string | null }

  if (parsed && typeof parsed === 'object' && 'kind' in parsed && parsed.kind === 'document_update') {
    return parsed
  }

  return {
    kind: 'document_update',
    editor_format: 'mobile_markdown',
    content_markdown:
      parsed && typeof parsed === 'object' && 'base_markdown' in parsed && typeof parsed.base_markdown === 'string'
        ? parsed.base_markdown
        : '',
    content_html: '',
  }
}

export async function initializeLocalStore() {
  const database = await openDatabase()
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      folder TEXT NOT NULL,
      markdown TEXT NOT NULL,
      document_json TEXT NOT NULL,
      storage_mode TEXT NOT NULL,
      visibility TEXT NOT NULL,
      selected_server_identity_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_bindings (
      local_note_id TEXT PRIMARY KEY NOT NULL,
      binding_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_bindings_v2 (
      binding_key TEXT PRIMARY KEY NOT NULL,
      local_note_id TEXT NOT NULL,
      server_identity_id TEXT,
      remote_note_id TEXT,
      binding_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queued_operations (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      server_account_id TEXT NOT NULL,
      server_identity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      batch_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      conflict_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      account_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL
    );
  `)
  await ensureColumn(database, 'notes', 'editor_format', 'TEXT')
  await ensureColumn(database, 'notes', 'loro_snapshot_b64', 'TEXT')
  await ensureColumn(database, 'notes', 'loro_updates_b64_json', 'TEXT')
  await ensureColumn(database, 'notes', 'loro_version', 'INTEGER')
  await ensureColumn(database, 'notes', 'loro_needs_migration', 'INTEGER')
  await database.execAsync(`
    INSERT OR IGNORE INTO note_bindings_v2 (binding_key, local_note_id, server_identity_id, remote_note_id, binding_json)
    SELECT
      local_note_id || '::legacy',
      local_note_id,
      NULL,
      NULL,
      binding_json
    FROM note_bindings;
  `)
}

export async function listNotes() {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{
    id: string
    title: string
    folder: string
    markdown: string
    document_json: string | null
    storage_mode: 'local' | 'synced'
    visibility: 'private' | 'org' | 'users'
    selected_server_identity_id: string | null
    editor_format: string | null
    loro_snapshot_b64: string | null
    loro_updates_b64_json: string | null
    loro_version: number | null
    loro_needs_migration: number | null
    created_at: string
    updated_at: string
  }>('SELECT * FROM notes ORDER BY updated_at DESC')
  const notes: LocalNoteRecord[] = []
  for (const row of rows) {
    try {
      notes.push({
        id: row.id,
        title: row.title,
        folder: row.folder,
        markdown: row.markdown,
        document: row.document_json ? JSON.parse(row.document_json) : undefined,
        storage_mode: row.storage_mode,
        visibility: row.visibility,
        selected_server_identity_id: row.selected_server_identity_id,
        editor_format: row.editor_format ?? undefined,
        loro_snapshot_b64: row.loro_snapshot_b64 ?? undefined,
        loro_updates_b64: row.loro_updates_b64_json ? (JSON.parse(row.loro_updates_b64_json) as string[]) : undefined,
        loro_version: row.loro_version ?? undefined,
        loro_needs_migration:
          row.loro_needs_migration === null || row.loro_needs_migration === undefined
            ? undefined
            : Boolean(row.loro_needs_migration),
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    } catch (error) {
      console.warn('Skipping unreadable local note row', row.id, error)
    }
  }
  return notes
}

export async function upsertNote(note: LocalNoteRecord) {
  const database = await openDatabase()
  await database.runAsync(
    `INSERT INTO notes
      (
        id, title, folder, markdown, document_json, storage_mode, visibility, selected_server_identity_id,
        editor_format, loro_snapshot_b64, loro_updates_b64_json, loro_version, loro_needs_migration,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        folder=excluded.folder,
        markdown=excluded.markdown,
        document_json=excluded.document_json,
        storage_mode=excluded.storage_mode,
        visibility=excluded.visibility,
        selected_server_identity_id=excluded.selected_server_identity_id,
        editor_format=excluded.editor_format,
        loro_snapshot_b64=excluded.loro_snapshot_b64,
        loro_updates_b64_json=excluded.loro_updates_b64_json,
        loro_version=excluded.loro_version,
        loro_needs_migration=excluded.loro_needs_migration,
        updated_at=excluded.updated_at`,
    [
      note.id,
      note.title,
      note.folder,
      note.markdown,
      note.document ? JSON.stringify(note.document) : '',
      note.storage_mode,
      note.visibility,
      note.selected_server_identity_id ?? null,
      note.editor_format ?? null,
      note.loro_snapshot_b64 ?? null,
      note.loro_updates_b64 ? JSON.stringify(note.loro_updates_b64) : null,
      note.loro_version ?? null,
      note.loro_needs_migration === undefined ? null : Number(note.loro_needs_migration),
      note.created_at,
      note.updated_at,
    ],
  )
}

export async function saveBinding(binding: NoteBinding) {
  const database = await openDatabase()
  const bindingKey = `${binding.local_note_id}::${binding.server_identity_id ?? binding.server_account_id}`
  await database.runAsync(
    `INSERT INTO note_bindings_v2 (binding_key, local_note_id, server_identity_id, remote_note_id, binding_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(binding_key) DO UPDATE SET
        local_note_id=excluded.local_note_id,
        server_identity_id=excluded.server_identity_id,
        remote_note_id=excluded.remote_note_id,
        binding_json=excluded.binding_json`,
    [
      bindingKey,
      binding.local_note_id,
      binding.server_identity_id ?? null,
      binding.remote_note_id ?? null,
      JSON.stringify(binding),
    ],
  )
}

export async function listBindings(localNoteId: string) {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{ binding_json: string }>(
    'SELECT binding_json FROM note_bindings_v2 WHERE local_note_id = ? ORDER BY server_identity_id ASC',
    [localNoteId],
  )
  return rows.map((row) => JSON.parse(row.binding_json) as NoteBinding)
}

export async function getBinding(localNoteId: string, serverIdentityId?: string | null) {
  const database = await openDatabase()
  const row = serverIdentityId
    ? await database.getFirstAsync<{ binding_json: string }>(
        'SELECT binding_json FROM note_bindings_v2 WHERE local_note_id = ? AND server_identity_id = ? LIMIT 1',
        [localNoteId, serverIdentityId],
      )
    : await database.getFirstAsync<{ binding_json: string }>(
        'SELECT binding_json FROM note_bindings_v2 WHERE local_note_id = ? ORDER BY server_identity_id ASC LIMIT 1',
        [localNoteId],
      )
  return row ? (JSON.parse(row.binding_json) as NoteBinding) : null
}

export async function findBindingByRemoteNoteId(remoteNoteId: string) {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{ binding_json: string }>('SELECT binding_json FROM note_bindings_v2')
  for (const row of rows) {
    try {
      const binding = JSON.parse(row.binding_json) as NoteBinding
      if (binding.remote_note_id === remoteNoteId) {
        return binding
      }
    } catch (error) {
      console.warn('Skipping unreadable binding row', error)
    }
  }
  return null
}

export async function removeBinding(localNoteId: string, serverIdentityId: string) {
  const database = await openDatabase()
  await database.runAsync(
    'DELETE FROM note_bindings_v2 WHERE local_note_id = ? AND server_identity_id = ?',
    [localNoteId, serverIdentityId],
  )
}

export async function queueOperation(record: PendingNoteOperationRecord) {
  const database = await openDatabase()
  await database.runAsync('DELETE FROM queued_operations WHERE note_id = ? AND server_identity_id = ?', [
    record.note_id,
    record.server_identity_id,
  ])
  await database.runAsync(
    `INSERT OR REPLACE INTO queued_operations
      (id, note_id, server_account_id, server_identity_id, created_at, batch_json)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.note_id,
      record.server_account_id,
      record.server_identity_id,
      record.created_at,
      JSON.stringify(record.payload),
    ],
  )
}

export async function listQueuedOperations() {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{
    id: string
    note_id: string
    server_account_id: string
    server_identity_id: string
    created_at: string
    batch_json: string
  }>('SELECT * FROM queued_operations ORDER BY created_at ASC')
  return rows.map((row) => ({
    id: row.id,
    note_id: row.note_id,
    server_account_id: row.server_account_id,
    server_identity_id: row.server_identity_id,
    created_at: row.created_at,
    payload: parseQueuedNotePayload(row.batch_json),
  })) satisfies PendingNoteOperationRecord[]
}

export async function compactQueuedOperations() {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{
    id: string
    note_id: string
    server_identity_id: string
    created_at: string
  }>('SELECT id, note_id, server_identity_id, created_at FROM queued_operations ORDER BY note_id ASC, server_identity_id ASC, created_at DESC')
  const keep = new Set<string>()
  const remove: string[] = []
  for (const row of rows) {
    const dedupeKey = `${row.note_id}::${row.server_identity_id}`
    if (keep.has(dedupeKey)) {
      remove.push(row.id)
      continue
    }
    keep.add(dedupeKey)
  }
  for (const id of remove) {
    await database.runAsync('DELETE FROM queued_operations WHERE id = ?', [id])
  }
}

export async function removeQueuedOperation(id: string) {
  const database = await openDatabase()
  await database.runAsync('DELETE FROM queued_operations WHERE id = ?', [id])
}

export async function removeQueuedOperationsForNote(noteId: string, serverIdentityId?: string | null) {
  const database = await openDatabase()
  if (serverIdentityId) {
    await database.runAsync('DELETE FROM queued_operations WHERE note_id = ? AND server_identity_id = ?', [
      noteId,
      serverIdentityId,
    ])
    return
  }
  await database.runAsync('DELETE FROM queued_operations WHERE note_id = ?', [noteId])
}

export async function saveConflict(conflict: SyncConflictRecord) {
  const database = await openDatabase()
  await database.runAsync(
    `INSERT OR REPLACE INTO sync_conflicts (id, note_id, conflict_json) VALUES (?, ?, ?)`,
    [conflict.id, conflict.note_id, JSON.stringify(conflict)],
  )
}

export async function listConflicts() {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{ conflict_json: string }>('SELECT conflict_json FROM sync_conflicts')
  return rows.map((row) => JSON.parse(row.conflict_json) as SyncConflictRecord)
}

export async function saveServerAccount(account: ServerAccount) {
  const database = await openDatabase()
  await database.runAsync(
    `INSERT OR REPLACE INTO server_accounts (id, account_json) VALUES (?, ?)`,
    [account.id, JSON.stringify(account)],
  )
  for (const identity of account.identities) {
    try {
      await SecureStore.setItemAsync(`server-token:${identity.id}`, identity.token)
    } catch (error) {
      console.warn('Unable to persist server token in secure store', identity.id, error)
    }
  }
}

export async function deleteServerAccount(accountId: string) {
  const database = await openDatabase()
  await database.runAsync('DELETE FROM server_accounts WHERE id = ?', [accountId])
}

export async function listServerAccounts() {
  const database = await openDatabase()
  const rows = await database.getAllAsync<{ account_json: string }>('SELECT account_json FROM server_accounts')
  const accounts: ServerAccount[] = []
  for (const row of rows) {
    try {
      accounts.push(JSON.parse(row.account_json) as ServerAccount)
    } catch (error) {
      console.warn('Skipping unreadable server account row', error)
    }
  }
  const hydrated = []
  for (const account of accounts) {
    const identities = []
    for (const identity of account.identities) {
      try {
        identities.push({
          ...identity,
          token: (await SecureStore.getItemAsync(`server-token:${identity.id}`)) ?? identity.token,
        })
      } catch (error) {
        console.warn('Unable to read secure-store token for server identity', identity.id, error)
        identities.push(identity)
      }
    }
    hydrated.push({
      ...account,
      identities,
    })
  }
  return hydrated
}

export async function saveSetting(key: string, value: unknown) {
  const database = await openDatabase()
  await database.runAsync(
    `INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)`,
    [key, JSON.stringify(value)],
  )
}

export async function getSetting<T>(key: string) {
  const database = await openDatabase()
  const row = await database.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', [key])
  if (!row) return null
  try {
    return JSON.parse(row.value_json) as T
  } catch (error) {
    console.warn('Skipping unreadable app setting', key, error)
    return null
  }
}
