import type { Dispatch, PropsWithChildren, SetStateAction } from 'react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LocalNoteRecord,
  NoteBinding,
  NoteDocumentOperationBatch,
  PresenceSession,
  RealtimeEvent,
  RemoteCursor,
  ServerAccount,
  SyncConflictRecord,
} from 'notes-suite-contracts'
import {
  applyOperationsToDocument,
  createEmptyDocument,
  createId,
  documentFromMarkdown,
  markdownFromDocument,
} from 'notes-suite-contracts'
import {
  deleteServerAccount as deleteStoredServerAccount,
  findBindingByRemoteNoteId,
  getBinding,
  getSetting,
  initializeLocalStore,
  listConflicts,
  listNotes,
  listQueuedOperations,
  listServerAccounts,
  queueOperation,
  removeQueuedOperation,
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
  loginWithOidc,
  loginWithPassword,
  listRemoteNotes,
  noteSocketUrl,
  openNoteSession,
  pullNoteOperations,
  pushNoteOperations,
  updateRemoteNote,
} from '../sync/api'

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
  replaceSelectedDocument: (document: LocalNoteRecord['document']) => Promise<void>
  updateMarkdown: (value: string) => Promise<void>
  updateBlockText: (blockId: string, text: string) => Promise<void>
  sendCursor: (cursor: { offset: number | null; blockId?: string | null }) => void
  editorMode: 'rich' | 'markdown'
  setEditorMode: (value: 'rich' | 'markdown') => void
  presenceSessions: PresenceSession[]
  remoteCursors: RemoteCursor[]
  conflicts: SyncConflictRecord[]
  appearance: Appearance
  setAppearance: Dispatch<SetStateAction<Appearance>>
  serverAccounts: ServerAccount[]
  linkSelectedNoteToServer: () => Promise<void>
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

function createFallbackNote(existingCount: number) {
  return {
    id: createId('note'),
    title: existingCount > 0 ? `Recovered note ${existingCount + 1}` : 'New note',
    folder: 'Inbox',
    markdown: '',
    document: createEmptyDocument('local-user'),
    storage_mode: 'local' as const,
    visibility: 'private' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies LocalNoteRecord
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
  const clientIdRef = useRef(createId('client'))
  const sessionIdRef = useRef<string | null>(null)
  const notesRef = useRef<LocalNoteRecord[]>([])
  const selectedNoteRef = useRef<LocalNoteRecord | null>(null)

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null,
    [notes, selectedNoteId],
  )

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
    }, 4000)
    return () => clearInterval(timer)
  }, [ready, serverAccounts, notes])

  useEffect(() => {
    if (!ready || serverAccounts.length === 0) return
    void syncRemoteLibraries(serverAccounts)
  }, [ready, serverAccounts])

  useEffect(() => {
    if (!selectedNote) return
    void hydrateAndConnectNote(selectedNote.id)
    return () => {
      void disconnectPresence(selectedNote.id)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [selectedNote?.id, serverAccounts])

  function upsertPresenceSession(nextSession: PresenceSession) {
    setPresenceSessions((current) => {
      const filtered = current.filter((entry) => entry.session_id !== nextSession.session_id)
      return [...filtered, nextSession].sort((left, right) => left.user_label.localeCompare(right.user_label))
    })
  }

  function upsertRemoteCursor(nextCursor: RemoteCursor) {
    setRemoteCursors((current) => {
      const filtered = current.filter(
        (entry) => !(entry.client_id === nextCursor.client_id && entry.note_id === nextCursor.note_id),
      )
      return [...filtered, nextCursor]
    })
  }

  async function hydrateAndConnectNote(noteId: string) {
    await hydrateFromServer(noteId)
    await connectPresence(noteId)
    connectRealtime(noteId)
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
          const nextNote: LocalNoteRecord = {
            id: localNoteId,
            title: remoteNote.title,
            folder: remoteNote.folder,
            markdown: remoteNote.markdown,
            document: remoteNote.document as LocalNoteRecord['document'],
            storage_mode: 'synced',
            visibility: remoteNote.visibility ?? 'private',
            selected_server_identity_id: identity?.id ?? existingLocal?.selected_server_identity_id ?? null,
            created_at: existingLocal?.created_at ?? remoteNote.updated_at,
            updated_at: remoteNote.updated_at,
          }
          await upsertNote(nextNote)
          await saveBinding({
            local_note_id: localNoteId,
            server_account_id: account.id,
            server_identity_id: identity?.id ?? null,
            remote_note_id: remoteNote.id,
            remote_revision: remoteNote.revision,
            last_pulled_at: remoteNote.updated_at,
            last_pushed_at: existingBinding?.last_pushed_at ?? null,
          })
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
    const binding = await getBinding(noteId)
    if (!binding?.remote_note_id || !binding.server_identity_id) return
    const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
    const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
    if (!account || !identity) return
    try {
      const response = await pullNoteOperations(account.base_url, identity.token, binding.remote_note_id, binding.remote_revision)
      const current = notesRef.current.find((entry) => entry.id === noteId)
      if (current) {
        const nextNote: LocalNoteRecord = {
          ...current,
          title: response.note.title,
          folder: response.note.folder,
          markdown: response.note.markdown,
          document: response.note.document,
          visibility: response.share.visibility,
          storage_mode: 'synced',
          selected_server_identity_id: identity.id,
          updated_at: response.note.updated_at,
        }
        await upsertNote(nextNote)
        setNotes((existing) => existing.map((entry) => (entry.id === noteId ? nextNote : entry)))
      }
      await saveBinding({
        ...binding,
        remote_revision: response.note.revision,
        last_pulled_at: response.note.updated_at,
      })
      for (const conflict of response.conflicts) {
        await saveConflict(conflict)
      }
      setConflicts(await listConflicts())
    } catch {
      // Offline or unreachable server; local note remains authoritative for now.
    }
  }

  async function connectPresence(noteId: string) {
    const binding = await getBinding(noteId)
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
      setPresenceSessions(response.sessions)
      setConflicts(response.conflicts)
    } catch {
      setPresenceSessions([])
    }
  }

  function connectRealtime(noteId: string) {
    void (async () => {
      const binding = await getBinding(noteId)
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
            block_id: payload.block_id ?? null,
            updated_at: payload.updated_at ?? new Date().toISOString(),
          })
          return
        }
        if ((payload.type === 'note_patch' || payload.type === 'note_operations') && payload.note_id === binding.remote_note_id) {
          if (payload.type === 'note_operations' && payload.client_id === clientIdRef.current) return
          const latestNote =
            notesRef.current.find((entry) => entry.id === noteId) ??
            (selectedNoteRef.current?.id === noteId ? selectedNoteRef.current : null)
          if (!latestNote) return
          const nextDocument = payload.document ?? latestNote.document
          const nextNote: LocalNoteRecord = {
            ...latestNote,
            title: payload.title,
            folder: payload.folder,
            markdown: payload.markdown,
            document: nextDocument,
            updated_at: new Date().toISOString(),
          }
          void upsertNote(nextNote)
          setNotes((existing) => existing.map((entry) => (entry.id === noteId ? nextNote : entry)))
        }
      }
      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
      }
    })()
  }

  async function disconnectPresence(noteId: string) {
    const binding = await getBinding(noteId)
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

  async function createNoteWithPreferences(options?: { syncToServer?: boolean }) {
    const note: LocalNoteRecord = {
      id: createId('note'),
      title: `Note ${notes.length + 1}`,
      folder: 'Inbox',
      markdown: '',
      document: createEmptyDocument('local-user'),
      storage_mode: 'local',
      visibility: 'private',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await upsertNote(note)
    setNotes((current) => [note, ...current])
    setSelectedNoteId(note.id)
    if (options?.syncToServer) {
      await linkNoteRecordToFirstServer(note)
    }
  }

  async function createNote() {
    await createNoteWithPreferences()
  }

  async function updateSelectedNoteVisibility(value: 'private' | 'org' | 'users') {
    if (!selectedNote) return
    const next = {
      ...selectedNote,
      visibility: value,
      updated_at: new Date().toISOString(),
    }
    await persistNote(next)
    const binding = await getBinding(selectedNote.id)
    if (!binding?.remote_note_id || !binding.server_identity_id) return
    const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
    const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
    if (!account || !identity) return
    try {
      const remote = await updateRemoteNote(account.base_url, identity.token, binding.remote_note_id, {
        revision: binding.remote_revision,
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
  }

  async function persistNote(next: LocalNoteRecord, batch?: NoteDocumentOperationBatch) {
    setSaveStatus('saving')
    await upsertNote(next)
    setNotes((current) => current.map((note) => (note.id === next.id ? next : note)))
    if (batch) {
      const binding = await getBinding(next.id)
      if (binding?.server_identity_id) {
        await queueOperation({
          id: createId('queued-op'),
          note_id: next.id,
          server_account_id: binding.server_account_id,
          server_identity_id: binding.server_identity_id,
          created_at: new Date().toISOString(),
          batch,
        })
      } else {
        setSaveStatus('offline')
        return
      }
    }
    setSaveStatus('saved')
  }

  async function updateNoteTitle(value: string) {
    if (!selectedNote) return
    const next = {
      ...selectedNote,
      title: value,
      updated_at: new Date().toISOString(),
    }
    await persistNote(next)
    const binding = await getBinding(selectedNote.id)
    if (!binding?.remote_note_id || !binding.server_identity_id) return
    const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
    const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
    if (!account || !identity) return
    try {
      const remote = await updateRemoteNote(account.base_url, identity.token, binding.remote_note_id, {
        title: value,
        revision: binding.remote_revision,
        document: next.document,
        markdown: next.markdown,
        visibility: next.visibility,
      })
      await saveBinding({
        ...binding,
        remote_revision: remote.revision,
        last_pushed_at: remote.updated_at,
      })
    } catch {
      // Leave local title change intact; sync engine will not roll it back.
    }
  }

  async function updateMarkdown(value: string) {
    if (!selectedNote) return
    const actorId = selectedNote.selected_server_identity_id ?? 'local-user'
    const document = documentFromMarkdown(value, actorId)
    const batch: NoteDocumentOperationBatch = {
      actor_id: actorId,
      client_id: createId('client'),
      operation_id: createId('op'),
      base_clock: selectedNote.document.clock,
      operations: [{ type: 'replace_document', blocks: document.blocks }],
    }
    await persistNote(
      {
        ...selectedNote,
        markdown: value,
        document,
        updated_at: new Date().toISOString(),
      },
      batch,
    )
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const binding = await getBinding(selectedNote.id)
      if (binding?.remote_note_id) {
        const event: RealtimeEvent = {
          type: 'note_operations',
          note_id: binding.remote_note_id,
          title: selectedNote.title,
          folder: selectedNote.folder,
          markdown: value,
          revision: 0,
          client_id: clientIdRef.current,
          user: 'You',
          batch,
          document,
        }
        wsRef.current.send(JSON.stringify(event))
      }
    }
  }

  async function replaceSelectedDocument(document: LocalNoteRecord['document']) {
    if (!selectedNote) return
    const batch: NoteDocumentOperationBatch = {
      actor_id: selectedNote.selected_server_identity_id ?? 'local-user',
      client_id: createId('client'),
      operation_id: createId('op'),
      base_clock: selectedNote.document.clock,
      operations: [{ type: 'replace_document', blocks: document.blocks }],
    }
    const markdown = markdownFromDocument(document)
    await persistNote(
      {
        ...selectedNote,
        document,
        markdown,
        updated_at: new Date().toISOString(),
      },
      batch,
    )
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const binding = await getBinding(selectedNote.id)
      if (binding?.remote_note_id) {
        const event: RealtimeEvent = {
          type: 'note_operations',
          note_id: binding.remote_note_id,
          title: selectedNote.title,
          folder: selectedNote.folder,
          markdown,
          revision: 0,
          client_id: clientIdRef.current,
          user: 'You',
          batch,
          document,
        }
        wsRef.current.send(JSON.stringify(event))
      }
    }
  }

  async function updateBlockText(blockId: string, text: string) {
    if (!selectedNote) return
    const batch: NoteDocumentOperationBatch = {
      actor_id: selectedNote.selected_server_identity_id ?? 'local-user',
      client_id: createId('client'),
      operation_id: createId('op'),
      base_clock: selectedNote.document.clock,
      operations: [{ type: 'update_block_text', block_id: blockId, text }],
    }
    const document = applyOperationsToDocument(selectedNote.document, batch)
    await persistNote(
      {
        ...selectedNote,
        document,
        markdown: markdownFromDocument(document),
        updated_at: new Date().toISOString(),
      },
      batch,
    )
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const binding = await getBinding(selectedNote.id)
      if (binding?.remote_note_id) {
        const event: RealtimeEvent = {
          type: 'note_operations',
          note_id: binding.remote_note_id,
          title: selectedNote.title,
          folder: selectedNote.folder,
          markdown: markdownFromDocument(document),
          revision: 0,
          client_id: clientIdRef.current,
          user: 'You',
          batch,
          document,
        }
        wsRef.current.send(JSON.stringify(event))
      }
    }
  }

  function sendCursor(cursor: { offset: number | null; blockId?: string | null }) {
    if (!selectedNote || wsRef.current?.readyState !== WebSocket.OPEN) return
    void (async () => {
      const binding = await getBinding(selectedNote.id)
      if (!binding?.remote_note_id) return
      const event: RealtimeEvent = {
        type: 'note_cursor',
        note_id: binding.remote_note_id,
        user: 'You',
        client_id: clientIdRef.current,
        offset: cursor.offset,
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

  async function linkNoteRecordToFirstServer(note: LocalNoteRecord) {
    const account = serverAccounts[0]
    const identity = account?.identities[0]
    if (!account || !identity) return
    const remote = await createRemoteNote(account.base_url, identity.token, {
      title: note.title,
      folder: note.folder,
      markdown: note.markdown,
      document: note.document,
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
    const nextNote: LocalNoteRecord = {
      ...note,
      storage_mode: 'synced',
      selected_server_identity_id: identity.id,
      updated_at: remote.updated_at,
    }
    await upsertNote(nextNote)
    setNotes((current) => current.map((entry) => (entry.id === nextNote.id ? nextNote : entry)))
  }

  async function linkSelectedNoteToServer() {
    if (!selectedNote) return
    await linkNoteRecordToFirstServer(selectedNote)
  }

  async function flushQueuedOperations() {
    const queued = await listQueuedOperations()
    if (queued.length === 0) return
    for (const operation of queued) {
      const account = serverAccounts.find((entry) => entry.id === operation.server_account_id)
      const identity = account?.identities.find((entry) => entry.id === operation.server_identity_id)
      const binding = await getBinding(operation.note_id)
      if (!account || !identity || !binding?.remote_note_id) continue
      try {
        const response = await pushNoteOperations(
          account.base_url,
          identity.token,
          binding.remote_note_id,
          operation.batch,
        )
        if (response.conflicts.length > 0) {
          for (const conflict of response.conflicts) {
            await saveConflict(conflict)
          }
          setConflicts(await listConflicts())
        }
        await removeQueuedOperation(operation.id)
        const note = notesRef.current.find((entry) => entry.id === operation.note_id)
        if (note) {
          const nextNote: LocalNoteRecord = {
            ...note,
            markdown: response.note.markdown,
            document: response.note.document,
            updated_at: response.note.updated_at,
          }
          const nextBinding: NoteBinding = {
            ...binding,
            remote_revision: response.note.revision,
            last_pushed_at: new Date().toISOString(),
          }
          await saveBinding(nextBinding)
          await upsertNote(nextNote)
          setNotes((current) => current.map((entry) => (entry.id === operation.note_id ? nextNote : entry)))
        }
      } catch {
        // Keep queued operation for retry.
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
        replaceSelectedDocument,
        updateMarkdown,
        updateBlockText,
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
