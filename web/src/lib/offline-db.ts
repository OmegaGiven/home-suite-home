import type {
  PendingManagedUploadRecord,
  PendingVoiceUploadRecord,
  QueuedSyncConflict,
  QueuedSyncOperation,
  SyncEnvelope,
} from './types'

const DB_NAME = 'sweet-offline'
const DB_VERSION = 2
const IDB_TIMEOUT_MS = 1500
const WORKSPACE_STORE = 'workspace'
const OPERATIONS_STORE = 'operations'
const VOICE_UPLOADS_STORE = 'voice_uploads'
const MANAGED_UPLOADS_STORE = 'managed_uploads'
const SYNC_CONFLICTS_STORE = 'sync_conflicts'

function withIndexedDb<T>(task: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(fallback())
  }
  return Promise.race([
    task(),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('IndexedDB timed out.')), IDB_TIMEOUT_MS)
    }),
  ]).catch(() => fallback())
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Could not open offline database.'))
    request.onblocked = () => reject(new Error('Offline database is blocked by another open tab.'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
        database.createObjectStore(WORKSPACE_STORE)
      }
      if (!database.objectStoreNames.contains(OPERATIONS_STORE)) {
        database.createObjectStore(OPERATIONS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(VOICE_UPLOADS_STORE)) {
        database.createObjectStore(VOICE_UPLOADS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(MANAGED_UPLOADS_STORE)) {
        database.createObjectStore(MANAGED_UPLOADS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(SYNC_CONFLICTS_STORE)) {
        database.createObjectStore(SYNC_CONFLICTS_STORE, { keyPath: 'id' })
      }
      database.onversionchange = () => {
        database.close()
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
      }
      resolve(database)
    }
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

async function readWorkspaceFromIdb(): Promise<SyncEnvelope | null> {
  const database = await openDatabase()
  const transaction = database.transaction(WORKSPACE_STORE, 'readonly')
  const store = transaction.objectStore(WORKSPACE_STORE)
  const request = store.get('latest')
  const value = await new Promise<SyncEnvelope | null>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as SyncEnvelope | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Could not read cached workspace.'))
  })
  database.close()
  return value
}

async function writeWorkspaceToIdb(envelope: SyncEnvelope): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(WORKSPACE_STORE, 'readwrite')
  transaction.objectStore(WORKSPACE_STORE).put(envelope, 'latest')
  await transactionDone(transaction)
  database.close()
}

async function readQueuedOperationsFromIdb(): Promise<QueuedSyncOperation[]> {
  const database = await openDatabase()
  const transaction = database.transaction(OPERATIONS_STORE, 'readonly')
  const store = transaction.objectStore(OPERATIONS_STORE)
  const request = store.getAll()
  const values = await new Promise<QueuedSyncOperation[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as QueuedSyncOperation[] | undefined) ?? [])
    request.onerror = () => reject(request.error ?? new Error('Could not read queued operations.'))
  })
  database.close()
  return values.sort((left, right) => left.created_at.localeCompare(right.created_at))
}

async function putQueuedOperationToIdb(record: QueuedSyncOperation): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(OPERATIONS_STORE, 'readwrite')
  transaction.objectStore(OPERATIONS_STORE).put(record)
  await transactionDone(transaction)
  database.close()
}

async function deleteQueuedOperationFromIdb(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(OPERATIONS_STORE, 'readwrite')
  transaction.objectStore(OPERATIONS_STORE).delete(id)
  await transactionDone(transaction)
  database.close()
}

async function clearQueuedOperationsInIdb(): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(OPERATIONS_STORE, 'readwrite')
  transaction.objectStore(OPERATIONS_STORE).clear()
  await transactionDone(transaction)
  database.close()
}

async function readPendingVoiceUploadsFromIdb(): Promise<PendingVoiceUploadRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(VOICE_UPLOADS_STORE, 'readonly')
  const store = transaction.objectStore(VOICE_UPLOADS_STORE)
  const request = store.getAll()
  const values = await new Promise<PendingVoiceUploadRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as PendingVoiceUploadRecord[] | undefined) ?? [])
    request.onerror = () => reject(request.error ?? new Error('Could not read pending voice uploads.'))
  })
  database.close()
  return values.sort((left, right) => left.created_at.localeCompare(right.created_at))
}

async function putPendingVoiceUploadToIdb(record: PendingVoiceUploadRecord): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(VOICE_UPLOADS_STORE, 'readwrite')
  transaction.objectStore(VOICE_UPLOADS_STORE).put(record)
  await transactionDone(transaction)
  database.close()
}

async function deletePendingVoiceUploadFromIdb(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(VOICE_UPLOADS_STORE, 'readwrite')
  transaction.objectStore(VOICE_UPLOADS_STORE).delete(id)
  await transactionDone(transaction)
  database.close()
}

async function readPendingManagedUploadsFromIdb(): Promise<PendingManagedUploadRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(MANAGED_UPLOADS_STORE, 'readonly')
  const store = transaction.objectStore(MANAGED_UPLOADS_STORE)
  const request = store.getAll()
  const values = await new Promise<PendingManagedUploadRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as PendingManagedUploadRecord[] | undefined) ?? [])
    request.onerror = () => reject(request.error ?? new Error('Could not read pending managed uploads.'))
  })
  database.close()
  return values.sort((left, right) => left.created_at.localeCompare(right.created_at))
}

async function putPendingManagedUploadToIdb(record: PendingManagedUploadRecord): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(MANAGED_UPLOADS_STORE, 'readwrite')
  transaction.objectStore(MANAGED_UPLOADS_STORE).put(record)
  await transactionDone(transaction)
  database.close()
}

async function deletePendingManagedUploadFromIdb(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(MANAGED_UPLOADS_STORE, 'readwrite')
  transaction.objectStore(MANAGED_UPLOADS_STORE).delete(id)
  await transactionDone(transaction)
  database.close()
}

async function readSyncConflictsFromIdb(): Promise<QueuedSyncConflict[]> {
  const database = await openDatabase()
  const transaction = database.transaction(SYNC_CONFLICTS_STORE, 'readonly')
  const store = transaction.objectStore(SYNC_CONFLICTS_STORE)
  const request = store.getAll()
  const values = await new Promise<QueuedSyncConflict[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as QueuedSyncConflict[] | undefined) ?? [])
    request.onerror = () => reject(request.error ?? new Error('Could not read queued sync conflicts.'))
  })
  database.close()
  return values.sort((left, right) => right.created_at.localeCompare(left.created_at))
}

async function putSyncConflictToIdb(record: QueuedSyncConflict): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(SYNC_CONFLICTS_STORE, 'readwrite')
  transaction.objectStore(SYNC_CONFLICTS_STORE).put(record)
  await transactionDone(transaction)
  database.close()
}

async function deleteSyncConflictFromIdb(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(SYNC_CONFLICTS_STORE, 'readwrite')
  transaction.objectStore(SYNC_CONFLICTS_STORE).delete(id)
  await transactionDone(transaction)
  database.close()
}

function readWorkspaceFromStorage(): SyncEnvelope | null {
  const raw = window.localStorage.getItem('sweet.offline.workspace')
  if (!raw) return null
  try {
    return JSON.parse(raw) as SyncEnvelope
  } catch {
    window.localStorage.removeItem('sweet.offline.workspace')
    return null
  }
}

function writeWorkspaceToStorage(envelope: SyncEnvelope) {
  window.localStorage.setItem('sweet.offline.workspace', JSON.stringify(envelope))
}

function readQueuedOperationsFromStorage(): QueuedSyncOperation[] {
  const raw = window.localStorage.getItem('sweet.offline.operations')
  if (!raw) return []
  try {
    return (JSON.parse(raw) as QueuedSyncOperation[]).sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    )
  } catch {
    window.localStorage.removeItem('sweet.offline.operations')
    return []
  }
}

function writeQueuedOperationsToStorage(records: QueuedSyncOperation[]) {
  window.localStorage.setItem('sweet.offline.operations', JSON.stringify(records))
}

function readPendingVoiceUploadsFromStorage(): PendingVoiceUploadRecord[] {
  const raw = window.localStorage.getItem('sweet.offline.voice_uploads')
  if (!raw) return []
  try {
    return (JSON.parse(raw) as PendingVoiceUploadRecord[]).sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    )
  } catch {
    window.localStorage.removeItem('sweet.offline.voice_uploads')
    return []
  }
}

function writePendingVoiceUploadsToStorage(records: PendingVoiceUploadRecord[]) {
  window.localStorage.setItem('sweet.offline.voice_uploads', JSON.stringify(records))
}

function readPendingManagedUploadsFromStorage(): PendingManagedUploadRecord[] {
  const raw = window.localStorage.getItem('sweet.offline.managed_uploads')
  if (!raw) return []
  try {
    return (JSON.parse(raw) as PendingManagedUploadRecord[]).sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    )
  } catch {
    window.localStorage.removeItem('sweet.offline.managed_uploads')
    return []
  }
}

function writePendingManagedUploadsToStorage(records: PendingManagedUploadRecord[]) {
  window.localStorage.setItem('sweet.offline.managed_uploads', JSON.stringify(records))
}

function readSyncConflictsFromStorage(): QueuedSyncConflict[] {
  const raw = window.localStorage.getItem('sweet.offline.sync_conflicts')
  if (!raw) return []
  try {
    return (JSON.parse(raw) as QueuedSyncConflict[]).sort((left, right) => right.created_at.localeCompare(left.created_at))
  } catch {
    window.localStorage.removeItem('sweet.offline.sync_conflicts')
    return []
  }
}

function writeSyncConflictsToStorage(records: QueuedSyncConflict[]) {
  window.localStorage.setItem('sweet.offline.sync_conflicts', JSON.stringify(records))
}

export const offlineDb = {
  loadWorkspace() {
    return withIndexedDb(() => readWorkspaceFromIdb(), () => readWorkspaceFromStorage())
  },

  saveWorkspace(envelope: SyncEnvelope) {
    return withIndexedDb(() => writeWorkspaceToIdb(envelope), () => writeWorkspaceToStorage(envelope))
  },

  listQueuedOperations() {
    return withIndexedDb(() => readQueuedOperationsFromIdb(), () => readQueuedOperationsFromStorage())
  },

  enqueueOperation(record: QueuedSyncOperation) {
    return withIndexedDb(
      () => putQueuedOperationToIdb(record),
      async () => {
        const next = [...readQueuedOperationsFromStorage(), record]
        writeQueuedOperationsToStorage(next)
      },
    )
  },

  removeQueuedOperation(id: string) {
    return withIndexedDb(
      () => deleteQueuedOperationFromIdb(id),
      async () => {
        const next = readQueuedOperationsFromStorage().filter((record) => record.id !== id)
        writeQueuedOperationsToStorage(next)
      },
    )
  },

  clearQueuedOperations() {
    return withIndexedDb(
      () => clearQueuedOperationsInIdb(),
      async () => {
        window.localStorage.removeItem('sweet.offline.operations')
      },
    )
  },

  listPendingVoiceUploads() {
    return withIndexedDb(() => readPendingVoiceUploadsFromIdb(), () => readPendingVoiceUploadsFromStorage())
  },

  savePendingVoiceUpload(record: PendingVoiceUploadRecord) {
    return withIndexedDb(
      () => putPendingVoiceUploadToIdb(record),
      async () => {
        const next = [...readPendingVoiceUploadsFromStorage().filter((entry) => entry.id !== record.id), record]
        writePendingVoiceUploadsToStorage(next)
      },
    )
  },

  removePendingVoiceUpload(id: string) {
    return withIndexedDb(
      () => deletePendingVoiceUploadFromIdb(id),
      async () => {
        const next = readPendingVoiceUploadsFromStorage().filter((record) => record.id !== id)
        writePendingVoiceUploadsToStorage(next)
      },
    )
  },

  listPendingManagedUploads() {
    return withIndexedDb(() => readPendingManagedUploadsFromIdb(), () => readPendingManagedUploadsFromStorage())
  },

  savePendingManagedUpload(record: PendingManagedUploadRecord) {
    return withIndexedDb(
      () => putPendingManagedUploadToIdb(record),
      async () => {
        const next = [...readPendingManagedUploadsFromStorage().filter((entry) => entry.id !== record.id), record]
        writePendingManagedUploadsToStorage(next)
      },
    )
  },

  removePendingManagedUpload(id: string) {
    return withIndexedDb(
      () => deletePendingManagedUploadFromIdb(id),
      async () => {
        const next = readPendingManagedUploadsFromStorage().filter((record) => record.id !== id)
        writePendingManagedUploadsToStorage(next)
      },
    )
  },

  listSyncConflicts() {
    return withIndexedDb(() => readSyncConflictsFromIdb(), () => readSyncConflictsFromStorage())
  },

  saveSyncConflict(record: QueuedSyncConflict) {
    return withIndexedDb(
      () => putSyncConflictToIdb(record),
      async () => {
        const next = [...readSyncConflictsFromStorage().filter((entry) => entry.id !== record.id), record]
        writeSyncConflictsToStorage(next)
      },
    )
  },

  removeSyncConflict(id: string) {
    return withIndexedDb(
      () => deleteSyncConflictFromIdb(id),
      async () => {
        const next = readSyncConflictsFromStorage().filter((record) => record.id !== id)
        writeSyncConflictsToStorage(next)
      },
    )
  },
}
