import type { Dispatch, PropsWithChildren, SetStateAction } from 'react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LocalNoteRecord,
  NoteBinding,
  NoteShareState,
  PresenceSession,
  RealtimeEvent,
  RemoteCursor,
  ServerAccount,
  SyncConflictRecord,
} from 'notes-suite-contracts'
import {
  createId,
} from 'notes-suite-contracts'
import {
  deleteServerAccount as deleteStoredServerAccount,
  findBindingByRemoteNoteId,
  getBinding,
  getSetting,
  initializeLocalStore,
  compactQueuedOperations,
  listBindings,
  listConflicts,
  listNotes,
  listQueuedOperations,
  listServerAccounts,
  queueOperation,
  removeBinding,
  removeQueuedOperation,
  removeQueuedOperationsForNote,
  saveBinding,
  saveConflict,
  saveServerAccount,
  saveSetting,
  upsertNote,
} from '../repositories/local-store'
import {
  closeNoteSession,
  createRemoteNote,
  createServerAccount,
  getResourceShare,
  listServerUsers,
  loginWithOidc,
  loginWithPassword,
  listRemoteNotes,
  noteSocketUrl,
  openNoteSession,
  pullNoteDocument,
  pushNoteDocumentUpdates,
  type RemoteServerUser,
  updateResourceShare,
  updateRemoteNoteMetadata,
} from '../sync/api'
import { createMarkdownBinding, encodeStableTextCursor, replaceMarkdownContent, type LoroMarkdownBinding } from './loro-note'

type Appearance = {
  mode: 'system' | 'custom'
  accent: string
  font: 'system' | 'serif' | 'mono'
  backgroundStyle: 'color' | 'gradient' | 'image'
  backgroundValue: string
  gradientCorners: [string, string, string, string]
  enableAnimations: boolean
}

type ServerDraft = {
  label: string
  baseUrl: string
  identifier: string
  password: string
}

type NotesAppContextValue = {
  ready: boolean
  notes: LocalNoteRecord[]
  selectedNote: LocalNoteRecord | null
  selectedNoteId: string | null
  setSelectedNoteId: (value: string) => void
  createNote: () => Promise<void>
  createNoteWithPreferences: (options?: { syncToServer?: boolean }) => Promise<void>
  updateNoteTitle: (value: string) => Promise<void>
  updateSelectedNoteVisibility: (value: 'private' | 'org' | 'users') => Promise<void>
  saveSelectedNoteVisibilitySettings: (input: {
    serverIdentityId: string | null
    visibility: 'private' | 'org' | 'users'
    userIds: string[]
  }) => Promise<void>
  listSelectedNoteBindings: () => Promise<NoteBinding[]>
  setSelectedNoteServerSync: (input: { serverIdentityId: string; enabled: boolean }) => Promise<void>
  loadSelectedNoteShare: (serverIdentityId?: string | null) => Promise<NoteShareState | null>
  listUsersForServerIdentity: (serverIdentityId: string) => Promise<RemoteServerUser[]>
  updateMarkdown: (value: string) => Promise<void>
  sendCursor: (cursor: { offset: number | null; blockId?: string | null }) => void
  editorMode: 'rich' | 'markdown'
  setEditorMode: (value: 'rich' | 'markdown') => void
  presenceSessions: PresenceSession[]
  remoteCursors: RemoteCursor[]
  conflicts: SyncConflictRecord[]
  appearance: Appearance
  setAppearance: Dispatch<SetStateAction<Appearance>>
  serverAccounts: ServerAccount[]
  linkSelectedNoteToServer: (preferredIdentityId?: string | null) => Promise<void>
  serverDraft: ServerDraft
  setServerDraft: Dispatch<SetStateAction<ServerDraft>>
  savePasswordServer: () => Promise<void>
  startOidcLogin: () => Promise<void>
  upsertPasswordServer: (draft: ServerDraft, existingAccountId?: string | null) => Promise<ServerAccount>
  upsertOidcServer: (draft: ServerDraft, existingAccountId?: string | null) => Promise<ServerAccount>
  deleteServerAccount: (accountId: string) => Promise<void>
  connectingServer: boolean
  saveStatus: 'saved' | 'saving' | 'offline'
}

const NotesAppContext = createContext<NotesAppContextValue | null>(null)

const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  accent: '#f97316',
  font: 'system',
  backgroundStyle: 'gradient',
  backgroundValue: '#09131f',
  gradientCorners: ['#07111c', '#0d1d31', '#0b1622', '#14273b'],
  enableAnimations: false,
}

const DEFAULT_SERVER_DRAFT: ServerDraft = {
  label: '',
  baseUrl: '',
  identifier: '',
  password: '',
}

function normalizeAppearance(value: Partial<Appearance> | null | undefined): Appearance {
  if (!value) return DEFAULT_APPEARANCE
  return {
    ...DEFAULT_APPEARANCE,
    ...value,
    gradientCorners:
      Array.isArray(value.gradientCorners) && value.gradientCorners.length === 4
        ? [
            value.gradientCorners[0] ?? DEFAULT_APPEARANCE.gradientCorners[0],
            value.gradientCorners[1] ?? DEFAULT_APPEARANCE.gradientCorners[1],
            value.gradientCorners[2] ?? DEFAULT_APPEARANCE.gradientCorners[2],
            value.gradientCorners[3] ?? DEFAULT_APPEARANCE.gradientCorners[3],
          ]
        : DEFAULT_APPEARANCE.gradientCorners,
  }
}

function isMissingRemoteNoteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('HTTP 404') || /note not found|not found/i.test(message)
}

function mergeRemoteDocumentState(
  note: LocalNoteRecord,
  input: {
    note: {
      title: string
      folder: string
      markdown: string
      updated_at: string
      editor_format?: string
      loro_snapshot_b64?: string
      loro_updates_b64?: string[]
      loro_version?: number
      loro_needs_migration?: boolean
    }
    visibility?: LocalNoteRecord['visibility']
  },
): LocalNoteRecord {
  return {
    ...note,
    title: input.note.title,
    folder: input.note.folder,
    markdown: input.note.markdown,
    editor_format: input.note.editor_format ?? note.editor_format,
    loro_snapshot_b64: input.note.loro_snapshot_b64 ?? note.loro_snapshot_b64,
    loro_updates_b64: input.note.loro_updates_b64 ?? note.loro_updates_b64,
    loro_version: input.note.loro_version ?? note.loro_version,
    loro_needs_migration: input.note.loro_needs_migration ?? note.loro_needs_migration,
    visibility: input.visibility ?? note.visibility,
    storage_mode: 'synced',
    selected_server_identity_id: note.selected_server_identity_id ?? null,
    updated_at: input.note.updated_at,
  }
}

function createFallbackNote(existingCount: number) {
  return {
    id: createId('note'),
    title: existingCount > 0 ? `Recovered note ${existingCount + 1}` : 'New note',
    folder: 'Inbox',
    markdown: '',
    storage_mode: 'local' as const,
    visibility: 'private' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies LocalNoteRecord
}

function mergeConcurrentMarkdown(baseMarkdown: string, localMarkdown: string, remoteMarkdown: string) {
  if (localMarkdown === remoteMarkdown) {
    return localMarkdown
  }
  if (localMarkdown === baseMarkdown) {
    return remoteMarkdown
  }
  if (remoteMarkdown === baseMarkdown) {
    return localMarkdown
  }

  const baseLines = baseMarkdown.split('\n')
  const localLines = localMarkdown.split('\n')
  const remoteLines = remoteMarkdown.split('\n')
  const maxLength = Math.max(baseLines.length, localLines.length, remoteLines.length)
  const merged: string[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const baseLine = baseLines[index]
    const localLine = localLines[index]
    const remoteLine = remoteLines[index]

    if (localLine === remoteLine) {
      if (localLine !== undefined) merged.push(localLine)
      continue
    }
    if (localLine === baseLine) {
      if (remoteLine !== undefined) merged.push(remoteLine)
      continue
    }
    if (remoteLine === baseLine) {
      if (localLine !== undefined) merged.push(localLine)
      continue
    }

    if (remoteLine !== undefined) merged.push(remoteLine)
    if (localLine !== undefined) merged.push(localLine)
  }

  return merged.join('\n')
}

function presenceSortKey(entry: PresenceSession) {
  const lastSeen = entry.last_seen_at ? new Date(entry.last_seen_at).getTime() : 0
  return Number.isFinite(lastSeen) ? lastSeen : 0
}

export function NotesAppProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState<LocalNoteRecord[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'rich' | 'markdown'>('rich')
  const [presenceSessions, setPresenceSessions] = useState<PresenceSession[]>([])
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([])
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([])
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE)
  const [serverAccounts, setServerAccounts] = useState<ServerAccount[]>([])
  const [serverDraft, setServerDraft] = useState(DEFAULT_SERVER_DRAFT)
  const [connectingServer, setConnectingServer] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved')
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const desiredRealtimeNoteIdRef = useRef<string | null>(null)
  const clientIdRef = useRef(createId('client'))
  const sessionIdRef = useRef<string | null>(null)
  const notesRef = useRef<LocalNoteRecord[]>([])
  const selectedNoteRef = useRef<LocalNoteRecord | null>(null)
  const lastCursorPayloadRef = useRef<{
    noteId: string
    offset: number | null
    blockId: string | null
    cursorB64: string | null
  } | null>(null)
  const lastCursorSentAtRef = useRef(0)
  const loroCursorBindingsRef = useRef<Record<string, { signature: string; binding: LoroMarkdownBinding }>>({})

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null,
    [notes, selectedNoteId],
  )

  function actorIdForNote(note: LocalNoteRecord) {
    if (note.selected_server_identity_id) {
      for (const account of serverAccounts) {
        const identity = account.identities.find((entry) => entry.id === note.selected_server_identity_id)
        if (identity?.user.id) {
          return identity.user.id
        }
      }
    }
    return 'local-user'
  }

  function currentSelectedNote() {
    return selectedNoteRef.current
  }

  function normalizedPresenceSessions(
    sessions: PresenceSession[],
    options?: {
      currentUserId?: string | null
      currentClientId?: string | null
    },
  ) {
    const deduped = new Map<string, PresenceSession>()
    for (const session of sessions) {
      if (options?.currentClientId && session.client_id === options.currentClientId) {
        continue
      }
      if (options?.currentUserId && session.user_id === options.currentUserId) {
        continue
      }
      const dedupeKey = session.user_id || session.user_label || session.session_id
      const existing = deduped.get(dedupeKey)
      if (!existing || presenceSortKey(session) >= presenceSortKey(existing)) {
        deduped.set(dedupeKey, session)
      }
    }
    return [...deduped.values()].sort((left, right) => left.user_label.localeCompare(right.user_label))
  }

  async function listBindingsForNote(noteId: string) {
    return listBindings(noteId)
  }

  async function primaryBindingForNote(noteId: string, preferredIdentityId?: string | null) {
    const bindings = await listBindingsForNote(noteId)
    if (bindings.length === 0) return null
    if (preferredIdentityId) {
      const preferred = bindings.find((binding) => binding.server_identity_id === preferredIdentityId)
      if (preferred) return preferred
    }
    return bindings[0] ?? null
  }

  function applyBindingState(note: LocalNoteRecord, bindings: NoteBinding[], preferredIdentityId?: string | null) {
    const selectedServerIdentityId =
      (preferredIdentityId && bindings.some((binding) => binding.server_identity_id === preferredIdentityId)
        ? preferredIdentityId
        : note.selected_server_identity_id && bindings.some((binding) => binding.server_identity_id === note.selected_server_identity_id)
          ? note.selected_server_identity_id
          : bindings[0]?.server_identity_id ?? null) ?? null
    return {
      ...note,
      storage_mode: bindings.length > 0 ? ('synced' as const) : ('local' as const),
      selected_server_identity_id: selectedServerIdentityId,
    }
  }

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    selectedNoteRef.current = selectedNote
  }, [selectedNote])

  useEffect(() => {
    void (async () => {
      try {
        await initializeLocalStore()
        await compactQueuedOperations()
        const [storedNotesResult, storedAccountsResult, storedAppearanceResult, storedConflictsResult] = await Promise.allSettled([
          listNotes(),
          listServerAccounts(),
          getSetting<Appearance>('appearance'),
          listConflicts(),
        ])

        const storedNotes = storedNotesResult.status === 'fulfilled' ? storedNotesResult.value : []
        const storedAccounts = storedAccountsResult.status === 'fulfilled' ? storedAccountsResult.value : []
        const storedAppearance = storedAppearanceResult.status === 'fulfilled' ? storedAppearanceResult.value : null
        const storedConflicts = storedConflictsResult.status === 'fulfilled' ? storedConflictsResult.value : []

        if (storedNotes.length === 0) {
          const note = createFallbackNote(0)
          await upsertNote(note)
          setNotes([note])
          setSelectedNoteId(note.id)
        } else {
          setNotes(storedNotes)
          setSelectedNoteId(storedNotes[0]?.id ?? null)
        }
        setServerAccounts(storedAccounts)
        setAppearance(normalizeAppearance(storedAppearance))
        setConflicts(storedConflicts)
      } catch (error) {
        console.error('Notes app boot failed', error)
        const fallbackNote = createFallbackNote(notes.length)
        try {
          await initializeLocalStore()
          await upsertNote(fallbackNote)
        } catch (persistError) {
          console.error('Unable to persist fallback note', persistError)
        }
        setNotes([fallbackNote])
        setSelectedNoteId(fallbackNote.id)
        setServerAccounts([])
        setAppearance(DEFAULT_APPEARANCE)
        setConflicts([])
      } finally {
        setReady(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!ready) return
    void saveSetting('appearance', appearance)
  }, [appearance, ready])

  useEffect(() => {
    if (!ready) return
    const timer = setInterval(() => {
      void flushQueuedOperations()
    }, 2000)
    return () => clearInterval(timer)
  }, [ready, serverAccounts, notes])

  useEffect(() => {
    if (!ready) return
      const timer = setInterval(() => {
        const now = Date.now()
        setPresenceSessions((current) =>
          current.filter((entry) => {
            const lastSeen = entry.last_seen_at ? new Date(entry.last_seen_at).getTime() : now
            return now - lastSeen < 30000
          }),
        )
        setRemoteCursors((current) =>
          current.filter((entry) => {
            const updatedAt = entry.updated_at ? new Date(entry.updated_at).getTime() : now
            return now - updatedAt < 12000
          }),
        )
      }, 3000)
    return () => clearInterval(timer)
  }, [ready])

  useEffect(() => {
    if (!ready || serverAccounts.length === 0) return
    void syncRemoteLibraries(serverAccounts)
  }, [ready, serverAccounts])

  useEffect(() => {
    if (!selectedNote) return
    desiredRealtimeNoteIdRef.current = selectedNote.id
    void hydrateAndConnectNote(selectedNote.id)
    return () => {
      desiredRealtimeNoteIdRef.current = null
      void disconnectPresence(selectedNote.id)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      reconnectAttemptRef.current = 0
      sessionIdRef.current = null
      setRemoteCursors([])
      setPresenceSessions([])
    }
  }, [selectedNote?.id, selectedNote?.selected_server_identity_id, serverAccounts])

  function upsertPresenceSession(nextSession: PresenceSession) {
    setPresenceSessions((current) => {
      const note = selectedNoteRef.current
      const identity = note ? activeIdentityForNote(note) : null
      const filtered = current.filter((entry) => entry.session_id !== nextSession.session_id)
      return normalizedPresenceSessions([...filtered, nextSession], {
        currentUserId: identity?.user.id ?? null,
        currentClientId: clientIdRef.current,
      })
    })
  }

  function upsertRemoteCursor(nextCursor: RemoteCursor) {
    setRemoteCursors((current) => {
      const filtered = current.filter(
        (entry) => !(entry.client_id === nextCursor.client_id && entry.note_id === nextCursor.note_id),
      )
      if (nextCursor.offset === null && !nextCursor.block_id) {
        return filtered
      }
      return [...filtered, nextCursor]
    })
  }

  function activeIdentityForNote(note: LocalNoteRecord) {
    if (!note.selected_server_identity_id) return null
    for (const account of serverAccounts) {
      const identity = account.identities.find((entry) => entry.id === note.selected_server_identity_id)
      if (identity) return identity
    }
    return null
  }

  function loroCursorSignature(note: LocalNoteRecord) {
    return [
      note.loro_version ?? 0,
      note.loro_snapshot_b64 ?? '',
      (note.loro_updates_b64 ?? []).join('|'),
    ].join('::')
  }

  function getLoroCursorBinding(note: LocalNoteRecord) {
    const signature = loroCursorSignature(note)
    const cached = loroCursorBindingsRef.current[note.id]
    if (!cached || cached.signature !== signature) {
      const binding = createMarkdownBinding(note.loro_snapshot_b64, note.markdown, note.loro_updates_b64)
      loroCursorBindingsRef.current[note.id] = { signature, binding }
    }
    const binding = loroCursorBindingsRef.current[note.id]!.binding
    replaceMarkdownContent(binding, note.markdown)
    return binding
  }

  function resolveIdentityById(identityId: string | null | undefined) {
    if (!identityId) return null
    for (const account of serverAccounts) {
      const identity = account.identities.find((entry) => entry.id === identityId)
      if (identity) return { account, identity }
    }
    return null
  }

  function defaultServerIdentity() {
    for (const account of serverAccounts) {
      const identity = account.identities[0]
      if (identity) return { account, identity }
    }
    return null
  }

  async function ensureNoteLinkedToIdentity(note: LocalNoteRecord, serverIdentityId: string) {
    const resolved = resolveIdentityById(serverIdentityId)
    if (!resolved) {
      throw new Error('Selected server identity is unavailable.')
    }
    const { account, identity } = resolved
    const existingBinding = await getBinding(note.id, identity.id)
    if (existingBinding?.server_identity_id === identity.id && existingBinding.remote_note_id) {
      const nextNote = applyBindingState(note, [...(await listBindingsForNote(note.id))], identity.id)
      await upsertNote(nextNote)
      setNotes((current) => current.map((entry) => (entry.id === nextNote.id ? nextNote : entry)))
      return {
        note: nextNote,
        binding: existingBinding,
        account,
        identity,
      }
    }

    const remote = await createRemoteNote(account.base_url, identity.token, {
      title: note.title,
      folder: note.folder,
      markdown: note.markdown,
      visibility: note.visibility,
    })
    const nextBinding: NoteBinding = {
      local_note_id: note.id,
      server_account_id: account.id,
      server_identity_id: identity.id,
      remote_note_id: remote.id,
      remote_revision: remote.revision,
      last_pulled_at: remote.updated_at,
      last_pushed_at: remote.updated_at,
    }
    await saveBinding(nextBinding)
    await removeQueuedOperationsForNote(note.id, identity.id)
    const nextNote = applyBindingState(
      {
      ...note,
      updated_at: remote.updated_at,
      },
      [...(await listBindingsForNote(note.id)), nextBinding],
      identity.id,
    )
    await upsertNote(nextNote)
    setNotes((current) => current.map((entry) => (entry.id === nextNote.id ? nextNote : entry)))
    return {
      note: nextNote,
      binding: nextBinding,
      account,
      identity,
    }
  }

  async function recreateRemoteBinding(
    note: LocalNoteRecord,
    binding: NoteBinding,
    account: ServerAccount,
    identity: ServerAccount['identities'][number],
  ) {
    const remote = await createRemoteNote(account.base_url, identity.token, {
      title: note.title,
      folder: note.folder,
      markdown: note.markdown,
      visibility: note.visibility,
    })
    const repairedBinding: NoteBinding = {
      ...binding,
      remote_note_id: remote.id,
      remote_revision: remote.revision,
      last_pulled_at: remote.updated_at,
      last_pushed_at: remote.updated_at,
    }
    await saveBinding(repairedBinding)
    await removeQueuedOperationsForNote(note.id, identity.id)
    const repairedNote = applyBindingState(
      {
      ...note,
      updated_at: remote.updated_at,
      },
      [...(await listBindingsForNote(note.id)).filter((entry) => entry.server_identity_id !== identity.id), repairedBinding],
      identity.id,
    )
    await upsertNote(repairedNote)
    setNotes((current) => current.map((entry) => (entry.id === repairedNote.id ? repairedNote : entry)))
    return {
      note: repairedNote,
      binding: repairedBinding,
      remote,
    }
  }

  async function hydrateAndConnectNote(noteId: string) {
    await hydrateFromServer(noteId)
    await connectPresence(noteId)
    connectRealtime(noteId)
  }

  function scheduleRealtimeReconnect(noteId: string) {
    if (desiredRealtimeNoteIdRef.current !== noteId) return
    if (reconnectTimerRef.current) return
    const attempt = reconnectAttemptRef.current + 1
    reconnectAttemptRef.current = attempt
    const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15000)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (desiredRealtimeNoteIdRef.current !== noteId) return
      void hydrateAndConnectNote(noteId)
    }, delay)
  }

  async function syncRemoteLibraries(targetAccounts: ServerAccount[]) {
    for (const account of targetAccounts) {
      try {
        const remoteNotes = await listRemoteNotes(account.base_url)
        const identity = account.identities[0]
        for (const remoteNote of remoteNotes) {
          const existingBinding = await findBindingByRemoteNoteId(remoteNote.id)
          const localNoteId = existingBinding?.local_note_id ?? remoteNote.id
          const existingLocal = notesRef.current.find((entry) => entry.id === localNoteId)
          const importedBinding: NoteBinding = {
            local_note_id: localNoteId,
            server_account_id: account.id,
            server_identity_id: identity?.id ?? null,
            remote_note_id: remoteNote.id,
            remote_revision: remoteNote.revision,
            last_pulled_at: remoteNote.updated_at,
            last_pushed_at: existingBinding?.last_pushed_at ?? null,
          }
          const nextNote = applyBindingState({
            id: localNoteId,
            title: remoteNote.title,
            folder: remoteNote.folder,
            markdown: remoteNote.markdown,
            document: remoteNote.document as LocalNoteRecord['document'] | undefined,
            editor_format: remoteNote.editor_format,
            loro_snapshot_b64: remoteNote.loro_snapshot_b64,
            loro_updates_b64: remoteNote.loro_updates_b64,
            loro_version: remoteNote.loro_version,
            loro_needs_migration: remoteNote.loro_needs_migration,
            visibility: remoteNote.visibility ?? 'private',
            storage_mode: existingLocal?.storage_mode ?? 'local',
            selected_server_identity_id: existingLocal?.selected_server_identity_id ?? identity?.id ?? null,
            created_at: existingLocal?.created_at ?? remoteNote.updated_at,
            updated_at: remoteNote.updated_at,
          }, [
            ...(await listBindingsForNote(localNoteId)).filter((entry) => entry.server_identity_id !== importedBinding.server_identity_id),
            importedBinding,
          ])
          await upsertNote(nextNote)
          await saveBinding(importedBinding)
          setNotes((current) => {
            const found = current.some((entry) => entry.id === localNoteId)
            if (found) {
              return current.map((entry) => (entry.id === localNoteId ? nextNote : entry))
            }
            return [nextNote, ...current]
          })
        }
      } catch (error) {
        console.warn('Unable to import remote notes for server', account.base_url, error)
      }
    }
  }

  async function hydrateFromServer(noteId: string) {
    const note = notesRef.current.find((entry) => entry.id === noteId)
    const binding = await primaryBindingForNote(noteId, note?.selected_server_identity_id)
    if (!binding?.remote_note_id || !binding.server_identity_id) return
    const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
    const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
    if (!account || !identity) return
    try {
      const response = await pullNoteDocument(account.base_url, identity.token, binding.remote_note_id)
      const current = notesRef.current.find((entry) => entry.id === noteId)
      if (current) {
        const nextNote = applyBindingState({
          ...mergeRemoteDocumentState(current, { note: response.note, visibility: response.share.visibility }),
        }, await listBindingsForNote(noteId), identity.id)
        await upsertNote(nextNote)
        setNotes((existing) => existing.map((entry) => (entry.id === noteId ? nextNote : entry)))
      }
      await saveBinding({
        ...binding,
        remote_revision: response.note.revision,
        last_pulled_at: response.note.updated_at,
      })
      setPresenceSessions(
        normalizedPresenceSessions(response.sessions, {
          currentUserId: identity.user.id,
          currentClientId: clientIdRef.current,
        }),
      )
    } catch (error) {
      if (isMissingRemoteNoteError(error)) {
        const current = notesRef.current.find((entry) => entry.id === noteId)
        if (current) {
          try {
            await recreateRemoteBinding(current, binding, account, identity)
          } catch {
            // Fall back to local-only behavior until the next retry.
          }
        }
      }
      // Offline or unreachable server; local note remains authoritative for now.
    }
  }

  async function connectPresence(noteId: string) {
    const note = notesRef.current.find((entry) => entry.id === noteId)
    const binding = await primaryBindingForNote(noteId, note?.selected_server_identity_id)
    if (!binding) {
      setPresenceSessions([])
      return
    }
    const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
    const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
    if (!account || !identity || !binding.remote_note_id) return
    try {
      const response = await openNoteSession(account.base_url, identity.token, binding.remote_note_id, clientIdRef.current)
      sessionIdRef.current =
        response.sessions.find((entry) => entry.client_id === clientIdRef.current)?.session_id ?? null
      setPresenceSessions(
        normalizedPresenceSessions(response.sessions, {
          currentUserId: identity.user.id,
          currentClientId: clientIdRef.current,
        }),
      )
      setConflicts(response.conflicts)
    } catch {
      setPresenceSessions([])
    }
  }

  function connectRealtime(noteId: string) {
    void (async () => {
      const note = notesRef.current.find((entry) => entry.id === noteId)
      const binding = await primaryBindingForNote(noteId, note?.selected_server_identity_id)
      if (!binding?.remote_note_id || !binding.server_identity_id) return
      const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
      const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
      const current = notesRef.current.find((entry) => entry.id === noteId)
      if (!account || !identity || !binding.remote_note_id || !current) return
      if (wsRef.current) {
        wsRef.current.close()
      }
      const socket = new WebSocket(noteSocketUrl(account.base_url, binding.remote_note_id))
      wsRef.current = socket
      socket.onopen = () => {
        reconnectAttemptRef.current = 0
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        const presenceEvent: RealtimeEvent = {
          type: 'note_presence',
          note_id: binding.remote_note_id!,
          user: identity.user.display_name,
          user_id: identity.user.id,
          avatar_path: identity.user.avatar_path ?? null,
          session_id: sessionIdRef.current,
          last_seen_at: new Date().toISOString(),
        }
        socket.send(JSON.stringify(presenceEvent))
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        heartbeatRef.current = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return
          socket.send(JSON.stringify({ ...presenceEvent, last_seen_at: new Date().toISOString() } satisfies RealtimeEvent))
        }, 15000)
        void flushQueuedOperations()
      }
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as RealtimeEvent
        if (payload.type === 'note_presence' && payload.note_id === binding.remote_note_id) {
          upsertPresenceSession({
            session_id: payload.session_id ?? `${payload.user}-${payload.last_seen_at ?? ''}`,
            note_id: payload.note_id,
            user_id: payload.user_id ?? '',
            user_label: payload.user,
            user_avatar_path: payload.avatar_path ?? null,
            client_id: payload.session_id ?? payload.user,
            opened_at: payload.last_seen_at ?? new Date().toISOString(),
            last_seen_at: payload.last_seen_at ?? new Date().toISOString(),
          })
          return
        }
        if (payload.type === 'note_cursor' && payload.note_id === binding.remote_note_id && payload.client_id !== clientIdRef.current) {
          upsertRemoteCursor({
            note_id: payload.note_id,
            client_id: payload.client_id,
            session_id: payload.session_id ?? null,
            user_id: payload.user_id ?? null,
            user: payload.user,
            avatar_path: payload.avatar_path ?? null,
            offset: payload.offset,
            cursor_b64: payload.cursor_b64 ?? null,
            block_id: payload.block_id ?? null,
            updated_at: payload.updated_at ?? new Date().toISOString(),
          })
          return
        }
        if (payload.type === 'note_document_update' && payload.note_id === binding.remote_note_id) {
          if (payload.client_id === clientIdRef.current) return
          void hydrateFromServer(noteId)
          return
        }
      }
      socket.onerror = () => {
        if (wsRef.current === socket) {
          setSaveStatus((current) => (current === 'saving' ? current : 'offline'))
        }
      }
      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
        sessionIdRef.current = null
        if (desiredRealtimeNoteIdRef.current === noteId) {
          scheduleRealtimeReconnect(noteId)
        }
      }
    })()
  }

  async function disconnectPresence(noteId: string) {
    const note = notesRef.current.find((entry) => entry.id === noteId)
    const binding = await primaryBindingForNote(noteId, note?.selected_server_identity_id)
    if (!binding) return
    const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
    const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
    const ownSession = presenceSessions.find((entry) => entry.note_id === (binding.remote_note_id ?? noteId))
    if (!account || !identity || !binding.remote_note_id || !ownSession) return
    try {
      await closeNoteSession(account.base_url, identity.token, binding.remote_note_id, ownSession.session_id)
    } catch {
      // Keep shutdown best-effort.
    }
  }

  async function createNoteWithPreferences(_options?: { syncToServer?: boolean }) {
    const note: LocalNoteRecord = {
      id: createId('note'),
      title: `Note ${notes.length + 1}`,
      folder: 'Inbox',
      markdown: '',
      storage_mode: 'local',
      visibility: 'private',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await upsertNote(note)
    setNotes((current) => [note, ...current])
    setSelectedNoteId(note.id)
  }

  async function createNote() {
    await createNoteWithPreferences()
  }

  async function updateSelectedNoteVisibility(value: 'private' | 'org' | 'users') {
    const note = currentSelectedNote()
    if (!note) return
    const next = {
      ...note,
      visibility: value,
      updated_at: new Date().toISOString(),
    }
    await persistNote(next)
    const bindings = await listBindingsForNote(note.id)
    await Promise.all(
      bindings.map(async (binding) => {
        if (!binding.remote_note_id || !binding.server_identity_id) return
        const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
        const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
        if (!account || !identity) return
        try {
          const remote = await updateRemoteNoteMetadata(account.base_url, identity.token, binding.remote_note_id, {
            visibility: value,
          })
          await saveBinding({
            ...binding,
            remote_revision: remote.revision,
            last_pushed_at: remote.updated_at,
          })
        } catch {
          // Keep local share state as the working copy until connectivity returns.
        }
      }),
    )
  }

  async function loadSelectedNoteShare(serverIdentityId?: string | null) {
    const note = currentSelectedNote()
    if (!note) return null
    const targetIdentityId = serverIdentityId ?? note.selected_server_identity_id ?? null
    const binding = await getBinding(note.id, targetIdentityId)
    if (!binding?.remote_note_id) return null
    const resolved = resolveIdentityById(targetIdentityId)
    if (!resolved || binding.server_identity_id !== resolved.identity.id) return null
    try {
      return await getResourceShare(
        resolved.account.base_url,
        resolved.identity.token,
        `note:${binding.remote_note_id}`,
      )
    } catch {
      return null
    }
  }

  async function listUsersForServerIdentity(serverIdentityId: string) {
    const resolved = resolveIdentityById(serverIdentityId)
    if (!resolved) return []
    try {
      const users = await listServerUsers(resolved.account.base_url, resolved.identity.token)
      return users.filter((user) => user.id !== resolved.identity.user.id)
    } catch {
      return []
    }
  }

  async function saveSelectedNoteVisibilitySettings(input: {
    serverIdentityId: string | null
    visibility: 'private' | 'org' | 'users'
    userIds: string[]
  }) {
    const note = currentSelectedNote()
    if (!note) return
    const resolvedTarget = input.serverIdentityId ? resolveIdentityById(input.serverIdentityId) : null
    const nextLocal: LocalNoteRecord = applyBindingState(
      {
        ...note,
        visibility: input.visibility,
        updated_at: new Date().toISOString(),
      },
      await listBindingsForNote(note.id),
      resolvedTarget?.identity.id ?? note.selected_server_identity_id ?? null,
    )
    await upsertNote(nextLocal)
    setNotes((current) => current.map((entry) => (entry.id === nextLocal.id ? nextLocal : entry)))

    if (!resolvedTarget || !input.serverIdentityId) {
      return
    }

    const linked = await ensureNoteLinkedToIdentity(nextLocal, resolvedTarget.identity.id)
    try {
      const share = await updateResourceShare(linked.account.base_url, linked.identity.token, {
        resource_key: `note:${linked.binding.remote_note_id}`,
        visibility: input.visibility,
        user_ids: input.visibility === 'users' ? input.userIds : [],
      })
      const savedNote: LocalNoteRecord = {
        ...applyBindingState(linked.note, await listBindingsForNote(linked.note.id), linked.identity.id),
        visibility: share.visibility,
        updated_at: new Date().toISOString(),
      }
      await upsertNote(savedNote)
      setNotes((current) => current.map((entry) => (entry.id === savedNote.id ? savedNote : entry)))
    } catch {
      // Leave local visibility choice in place until the next sync/save succeeds.
    }
  }

  async function persistNote(next: LocalNoteRecord, syncDocument = false) {
    setSaveStatus('saving')
    await upsertNote(next)
    setNotes((current) => current.map((note) => (note.id === next.id ? next : note)))
    if (syncDocument) {
      const bindings = await listBindingsForNote(next.id)
      if (bindings.length === 0) {
        setSaveStatus('saved')
        return
      }
      let syncedAny = false
      let queuedAny = false
      let authoritativeNote = next
      for (const binding of bindings) {
        if (!binding.server_identity_id) continue
        const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
        const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
        if (account && identity && binding.remote_note_id) {
          try {
            const response = await pushNoteDocumentUpdates(account.base_url, identity.token, binding.remote_note_id, {
              client_id: clientIdRef.current,
              update_b64: '',
              editor_format: 'mobile_markdown',
              content_markdown: next.markdown,
              content_html: '',
            })
            authoritativeNote = mergeRemoteDocumentState(authoritativeNote, { note: response.note })
            await saveBinding({
              ...binding,
              remote_revision: response.note.revision,
              last_pulled_at: response.note.updated_at,
              last_pushed_at: response.note.updated_at,
            })
            await removeQueuedOperationsForNote(next.id, binding.server_identity_id)
            syncedAny = true
            continue
          } catch (error) {
            if (isMissingRemoteNoteError(error)) {
              try {
                await recreateRemoteBinding(next, binding, account, identity)
                syncedAny = true
                await removeQueuedOperationsForNote(next.id, binding.server_identity_id)
                continue
              } catch {
                // Fall through to queued retry below.
              }
            }
          }
        }
        await queueOperation({
          id: createId('queued-op'),
          note_id: next.id,
          server_account_id: binding.server_account_id,
          server_identity_id: binding.server_identity_id,
          created_at: new Date().toISOString(),
          payload: {
            kind: 'document_update',
            editor_format: next.editor_format ?? 'mobile_markdown',
            content_markdown: next.markdown,
            content_html: '',
          },
        })
        queuedAny = true
      }
      if (syncedAny) {
        await upsertNote(authoritativeNote)
        setNotes((current) => current.map((note) => (note.id === authoritativeNote.id ? authoritativeNote : note)))
      }
      setSaveStatus(queuedAny ? 'offline' : 'saved')
      return
    }
    setSaveStatus('saved')
  }

  async function broadcastDocumentReplacement(noteId: string, markdown: string) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    const note = notesRef.current.find((entry) => entry.id === noteId)
    const binding = await primaryBindingForNote(noteId, note?.selected_server_identity_id)
    if (!binding?.remote_note_id) return
    const event: RealtimeEvent = {
      type: 'note_document_update',
      note_id: binding.remote_note_id,
      client_id: clientIdRef.current,
      update_b64: '',
      snapshot_b64: null,
      version: 0,
      editor_format: 'mobile_markdown',
      content_markdown: markdown,
      content_html: '',
    }
    wsRef.current.send(JSON.stringify(event))
  }

  async function updateNoteTitle(value: string) {
    const note = currentSelectedNote()
    if (!note) return
    const next = {
      ...note,
      title: value,
      updated_at: new Date().toISOString(),
    }
    await persistNote(next)
    const bindings = await listBindingsForNote(note.id)
    await Promise.all(
      bindings.map(async (binding) => {
        if (!binding.remote_note_id || !binding.server_identity_id) return
        const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
        const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
        if (!account || !identity) return
        try {
          const remote = await updateRemoteNoteMetadata(account.base_url, identity.token, binding.remote_note_id, {
            title: value,
          })
          await saveBinding({
            ...binding,
            remote_revision: remote.revision,
            last_pushed_at: remote.updated_at,
          })
        } catch {
          // Leave local title change intact; sync engine will not roll it back.
        }
      }),
    )
  }

  async function updateMarkdown(value: string) {
    const note = currentSelectedNote()
    if (!note) return
    if (value === note.markdown) return
    await persistNote({
      ...note,
      markdown: value,
      updated_at: new Date().toISOString(),
    }, true)
    await broadcastDocumentReplacement(note.id, value)
  }

  function sendCursor(cursor: { offset: number | null; blockId?: string | null }) {
    const note = currentSelectedNote()
    if (!note || wsRef.current?.readyState !== WebSocket.OPEN) return
    const cursorB64 =
      cursor.offset === null || cursor.offset === undefined
        ? null
        : encodeStableTextCursor(getLoroCursorBinding(note), cursor.offset)
    const normalized = {
      noteId: note.id,
      offset: cursor.offset,
      blockId: cursor.blockId ?? null,
      cursorB64,
    }
    const previous = lastCursorPayloadRef.current
    if (
      previous &&
      previous.noteId === normalized.noteId &&
      previous.offset === normalized.offset &&
      previous.blockId === normalized.blockId &&
      previous.cursorB64 === normalized.cursorB64
    ) {
      return
    }
    const now = Date.now()
    if (now - lastCursorSentAtRef.current < 60) {
      return
    }
    lastCursorPayloadRef.current = normalized
    lastCursorSentAtRef.current = now
    void (async () => {
      const binding = await primaryBindingForNote(note.id, note.selected_server_identity_id)
      if (!binding?.remote_note_id) return
      const identity = activeIdentityForNote(note)
      const event: RealtimeEvent = {
        type: 'note_cursor',
        note_id: binding.remote_note_id,
        user: identity?.user.display_name ?? 'You',
        client_id: clientIdRef.current,
        offset: cursor.offset,
        cursor_b64: cursorB64,
        user_id: identity?.user.id ?? null,
        avatar_path: identity?.user.avatar_path ?? null,
        session_id: sessionIdRef.current,
        block_id: cursor.blockId ?? null,
        updated_at: new Date().toISOString(),
      }
      wsRef.current?.send(JSON.stringify(event))
    })()
  }

  async function savePasswordServer() {
    await upsertPasswordServer(serverDraft)
  }

  async function upsertPasswordServer(draft: ServerDraft, existingAccountId?: string | null) {
    setConnectingServer(true)
    try {
      const session = await loginWithPassword(draft.baseUrl.replace(/\/$/, ''), draft.identifier, draft.password)
      const generated = createServerAccount(draft.baseUrl, draft.label, 'password', session)
      const existing = existingAccountId ? serverAccounts.find((entry) => entry.id === existingAccountId) ?? null : null
      const existingIdentityId = existing?.identities[0]?.id
      const account: ServerAccount = existing
        ? {
            ...generated,
            id: existing.id,
            created_at: existing.created_at,
            identities: generated.identities.map((identity) => ({
              ...identity,
              id: existingIdentityId ?? identity.id,
              server_account_id: existing.id,
            })),
          }
        : generated
      await saveServerAccount(account)
      setServerAccounts((current) => {
        if (existing) {
          return current.map((entry) => (entry.id === existing.id ? account : entry))
        }
        return [account, ...current]
      })
      if (!existing) setServerDraft(DEFAULT_SERVER_DRAFT)
      await syncRemoteLibraries(existing ? [account] : [account])
      return account
    } finally {
      setConnectingServer(false)
    }
  }

  async function startOidcLogin() {
    await upsertOidcServer(serverDraft)
  }

  async function upsertOidcServer(draft: ServerDraft, existingAccountId?: string | null) {
    setConnectingServer(true)
    try {
      const session = await loginWithOidc(draft.baseUrl.replace(/\/$/, ''))
      const generated = createServerAccount(draft.baseUrl, draft.label, 'oidc', session)
      const existing = existingAccountId ? serverAccounts.find((entry) => entry.id === existingAccountId) ?? null : null
      const existingIdentityId = existing?.identities[0]?.id
      const account: ServerAccount = existing
        ? {
            ...generated,
            id: existing.id,
            created_at: existing.created_at,
            identities: generated.identities.map((identity) => ({
              ...identity,
              id: existingIdentityId ?? identity.id,
              server_account_id: existing.id,
            })),
          }
        : generated
      await saveServerAccount(account)
      setServerAccounts((current) => {
        if (existing) {
          return current.map((entry) => (entry.id === existing.id ? account : entry))
        }
        return [account, ...current]
      })
      if (!existing) setServerDraft(DEFAULT_SERVER_DRAFT)
      await syncRemoteLibraries(existing ? [account] : [account])
      return account
    } finally {
      setConnectingServer(false)
    }
  }

  async function deleteServerAccount(accountId: string) {
    await deleteStoredServerAccount(accountId)
    setServerAccounts((current) => current.filter((entry) => entry.id !== accountId))
  }

  async function linkNoteRecordToPreferredServer(note: LocalNoteRecord, preferredIdentityId?: string | null) {
    const resolved =
      resolveIdentityById(preferredIdentityId ?? note.selected_server_identity_id ?? null) ?? defaultServerIdentity()
    if (!resolved) return
    await ensureNoteLinkedToIdentity(note, resolved.identity.id)
  }

  async function linkSelectedNoteToServer(preferredIdentityId?: string | null) {
    if (!selectedNote) return
    await linkNoteRecordToPreferredServer(selectedNote, preferredIdentityId)
    await hydrateAndConnectNote(selectedNote.id)
  }

  async function listSelectedNoteBindings() {
    const note = currentSelectedNote()
    if (!note) return []
    return listBindingsForNote(note.id)
  }

  async function setSelectedNoteServerSync(input: { serverIdentityId: string; enabled: boolean }) {
    const note = currentSelectedNote()
    if (!note) return
    if (input.enabled) {
      await linkSelectedNoteToServer(input.serverIdentityId)
      return
    }
    await removeBinding(note.id, input.serverIdentityId)
    await removeQueuedOperationsForNote(note.id, input.serverIdentityId)
    const remainingBindings = await listBindingsForNote(note.id)
    const nextNote = applyBindingState(
      {
        ...note,
        updated_at: new Date().toISOString(),
      },
      remainingBindings,
      note.selected_server_identity_id === input.serverIdentityId ? remainingBindings[0]?.server_identity_id ?? null : note.selected_server_identity_id ?? null,
    )
    await upsertNote(nextNote)
    setNotes((current) => current.map((entry) => (entry.id === note.id ? nextNote : entry)))
  }

  async function flushQueuedOperations() {
    await compactQueuedOperations()
    const queued = await listQueuedOperations()
    if (queued.length === 0) return
    let flushedAny = false
    for (const operation of queued) {
      const account = serverAccounts.find((entry) => entry.id === operation.server_account_id)
      const identity = account?.identities.find((entry) => entry.id === operation.server_identity_id)
      const binding = await getBinding(operation.note_id, operation.server_identity_id)
      if (!account || !identity || !binding?.remote_note_id) continue
      try {
        const note = notesRef.current.find((entry) => entry.id === operation.note_id)
        if (note) {
          const response = await pushNoteDocumentUpdates(account.base_url, identity.token, binding.remote_note_id, {
            client_id: clientIdRef.current,
            update_b64: '',
            editor_format: operation.payload.editor_format,
            content_markdown: operation.payload.content_markdown,
            content_html: operation.payload.content_html ?? '',
          })
          await removeQueuedOperation(operation.id)
          const nextNote = mergeRemoteDocumentState(note, { note: response.note })
          const nextBinding: NoteBinding = {
            ...binding,
            remote_revision: response.note.revision,
            last_pushed_at: new Date().toISOString(),
          }
          await saveBinding(nextBinding)
          await upsertNote(nextNote)
          await removeQueuedOperationsForNote(operation.note_id, operation.server_identity_id)
          setNotes((current) => current.map((entry) => (entry.id === operation.note_id ? nextNote : entry)))
          flushedAny = true
        }
      } catch (error) {
        if (isMissingRemoteNoteError(error)) {
          const note = notesRef.current.find((entry) => entry.id === operation.note_id)
          if (note) {
            try {
              await recreateRemoteBinding(note, binding, account, identity)
              await removeQueuedOperation(operation.id)
              flushedAny = true
              continue
            } catch {
              // Keep queued operation for retry.
            }
          }
        }
      }
    }
    if (flushedAny) {
      const remaining = await listQueuedOperations()
      if (remaining.length === 0) {
        setSaveStatus('saved')
      }
    }
  }

  return (
    <NotesAppContext.Provider
      value={{
        ready,
        notes,
        selectedNote,
        selectedNoteId,
        setSelectedNoteId,
        createNote,
        createNoteWithPreferences,
        updateNoteTitle,
        updateSelectedNoteVisibility,
        saveSelectedNoteVisibilitySettings,
        listSelectedNoteBindings,
        setSelectedNoteServerSync,
        loadSelectedNoteShare,
        listUsersForServerIdentity,
        updateMarkdown,
        sendCursor,
        editorMode,
        setEditorMode,
        presenceSessions,
        remoteCursors,
        conflicts,
        appearance,
        setAppearance,
        serverAccounts,
        linkSelectedNoteToServer,
        serverDraft,
        setServerDraft,
        savePasswordServer,
        startOidcLogin,
        upsertPasswordServer,
        upsertOidcServer,
        deleteServerAccount,
        connectingServer,
        saveStatus,
      }}
    >
      {children}
    </NotesAppContext.Provider>
  )
}

export function useNotesApp() {
  const value = useContext(NotesAppContext)
  if (!value) {
    throw new Error('useNotesApp must be used inside NotesAppProvider')
  }
  return value
}
