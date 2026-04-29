import type { Dispatch, PropsWithChildren, SetStateAction } from 'react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LocalNoteRecord,
  NoteBinding,
  NoteDocumentOperationBatch,
  NoteShareState,
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
  compactQueuedOperations,
  listConflicts,
  listNotes,
  listQueuedOperations,
  listServerAccounts,
  queueOperation,
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
  pullNoteOperations,
  pushNoteOperations,
  type RemoteServerUser,
  updateResourceShare,
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
  saveSelectedNoteVisibilitySettings: (input: {
    serverIdentityId: string | null
    visibility: 'private' | 'org' | 'users'
    userIds: string[]
  }) => Promise<void>
  loadSelectedNoteShare: (serverIdentityId?: string | null) => Promise<NoteShareState | null>
  listUsersForServerIdentity: (serverIdentityId: string) => Promise<RemoteServerUser[]>
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

function splitMarkdownBlocks(markdown: string) {
  return markdown
    .split('\n\n')
    .map((raw) => raw.trimEnd())
    .filter((text, index, all) => text.length > 0 || all.length === 1 || index === 0)
}

function visibleBlocks(document: LocalNoteRecord['document']) {
  return [...document.blocks]
    .filter((block) => !block.deleted)
    .sort((left, right) => left.order - right.order)
}

type TargetBlockDraft = {
  text: string
  kind: LocalNoteRecord['document']['blocks'][number]['kind']
  attrs: Record<string, string>
}

function parseTargetBlock(rawText: string): TargetBlockDraft {
  const text = rawText.replace(/\u00a0/g, ' ')
  const headingMatch = text.match(/^(#{1,6})\s+(.*)$/)
  if (headingMatch) {
    return {
      kind: 'heading',
      text: headingMatch[2],
      attrs: { level: headingMatch[1] },
    }
  }
  if (/^>\s?/.test(text)) {
    return {
      kind: 'quote',
      text: text.replace(/^>\s?/, ''),
      attrs: {},
    }
  }
  if (/^- \[ \]\s?/.test(text)) {
    return {
      kind: 'checklist',
      text: text.replace(/^- \[ \]\s?/, ''),
      attrs: {},
    }
  }
  if (/^[-*]\s+/.test(text)) {
    return {
      kind: 'bullet_list',
      text: text.replace(/^[-*]\s+/, ''),
      attrs: {},
    }
  }
  if (/^\d+\.\s+/.test(text)) {
    return {
      kind: 'numbered_list',
      text: text.replace(/^\d+\.\s+/, ''),
      attrs: {},
    }
  }
  if (text.startsWith('```') && text.endsWith('```')) {
    return {
      kind: 'code',
      text: text.replace(/^```[\r\n]?/, '').replace(/[\r\n]?```$/, ''),
      attrs: {},
    }
  }
  if (/^\|/.test(text)) {
    return {
      kind: 'table',
      text,
      attrs: {},
    }
  }
  return {
    kind: 'paragraph',
    text,
    attrs: {},
  }
}

function buildTargetBlocks(markdown: string): TargetBlockDraft[] {
  return splitMarkdownBlocks(markdown).map((text) => parseTargetBlock(text))
}

type DiffStep =
  | { type: 'keep'; currentIndex: number; targetIndex: number }
  | { type: 'update'; currentIndex: number; targetIndex: number }
  | { type: 'delete'; currentIndex: number }
  | { type: 'insert'; targetIndex: number }

function buildBlockDiffSteps(
  currentBlocks: LocalNoteRecord['document']['blocks'],
  targetBlocks: TargetBlockDraft[],
): DiffStep[] | null {
  const rows = currentBlocks.length + 1
  const cols = targetBlocks.length + 1
  const costs = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i += 1) costs[i][0] = i
  for (let j = 0; j < cols; j += 1) costs[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const current = currentBlocks[i - 1]
      const target = targetBlocks[j - 1]
      const sameKind = current.kind === target.kind
      const sameAttrs = JSON.stringify(current.attrs ?? {}) === JSON.stringify(target.attrs ?? {})
      const exact = sameKind && sameAttrs && current.text === target.text
      const updateCost = sameKind ? (sameAttrs ? 1 : 2) : Number.POSITIVE_INFINITY
      costs[i][j] = Math.min(
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + (exact ? 0 : updateCost),
      )
    }
  }

  const steps: DiffStep[] = []
  let i = currentBlocks.length
  let j = targetBlocks.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const current = currentBlocks[i - 1]
      const target = targetBlocks[j - 1]
      const sameKind = current.kind === target.kind
      const sameAttrs = JSON.stringify(current.attrs ?? {}) === JSON.stringify(target.attrs ?? {})
      const exact = sameKind && sameAttrs && current.text === target.text
      const updateCost = sameKind ? (sameAttrs ? 1 : 2) : Number.POSITIVE_INFINITY
      if (costs[i][j] === costs[i - 1][j - 1] + (exact ? 0 : updateCost)) {
        steps.push({
          type: exact ? 'keep' : 'update',
          currentIndex: i - 1,
          targetIndex: j - 1,
        })
        i -= 1
        j -= 1
        continue
      }
    }
    if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      steps.push({ type: 'delete', currentIndex: i - 1 })
      i -= 1
      continue
    }
    if (j > 0 && costs[i][j] === costs[i][j - 1] + 1) {
      steps.push({ type: 'insert', targetIndex: j - 1 })
      j -= 1
      continue
    }
    return null
  }

  return steps.reverse()
}

function buildGranularOperations(
  note: LocalNoteRecord,
  currentBlocks: LocalNoteRecord['document']['blocks'],
  targetBlocks: TargetBlockDraft[],
  actorId: string,
): NoteDocumentOperationBatch['operations'] | null {
  const steps = buildBlockDiffSteps(currentBlocks, targetBlocks)
  if (!steps) return null
  const operations: NoteDocumentOperationBatch['operations'] = []
  const simulated = currentBlocks.map((block) => ({ ...block }))
  let simulatedIndex = 0
  let nextCounter = (note.document.clock[actorId] ?? 0) + 1

  for (const step of steps) {
    if (step.type === 'keep') {
      simulatedIndex += 1
      continue
    }
    if (step.type === 'update') {
      const target = targetBlocks[step.targetIndex]
      const current = simulated[simulatedIndex]
      if (!current || current.kind !== target.kind) return null
      if (JSON.stringify(current.attrs ?? {}) !== JSON.stringify(target.attrs ?? {})) {
        operations.push({
          type: 'update_block_attrs',
          block_id: current.id,
          attrs: target.attrs,
        })
      }
      if (current.text !== target.text) {
        operations.push({
          type: 'update_block_text',
          block_id: current.id,
          text: target.text,
        })
      }
      simulatedIndex += 1
      continue
    }
    if (step.type === 'delete') {
      const current = simulated[simulatedIndex]
      if (!current) return null
      operations.push({
        type: 'delete_block',
        block_id: current.id,
      })
      simulated.splice(simulatedIndex, 1)
      continue
    }
    const target = targetBlocks[step.targetIndex]
    const insertedId = `${note.id}:block:${Date.now().toString(36)}:${step.targetIndex}`
    operations.push({
      type: 'insert_block',
      after_block_id: simulatedIndex > 0 ? simulated[simulatedIndex - 1]?.id ?? null : null,
      block: {
        id: insertedId,
        kind: target.kind,
        text: target.text,
        attrs: target.attrs,
        order: simulatedIndex,
        deleted: false,
        last_modified_by: actorId,
        last_modified_counter: nextCounter,
      },
    })
    simulated.splice(simulatedIndex, 0, {
      id: insertedId,
      kind: target.kind,
      text: target.text,
      attrs: target.attrs,
      order: simulatedIndex,
      deleted: false,
      last_modified_by: actorId,
      last_modified_counter: nextCounter,
    })
    simulatedIndex += 1
    nextCounter += 1
  }

  return operations
}

function buildMarkdownBatch(
  note: LocalNoteRecord,
  markdown: string,
  clientId: string,
  actorId: string,
): NoteDocumentOperationBatch | null {
  const baseClock = { ...note.document.clock }
  const currentBlocks = visibleBlocks(note.document)
  const targetBlocks = buildTargetBlocks(markdown)
  const nextDocument = documentFromMarkdown(markdown, actorId)
  const granularOperations = buildGranularOperations(note, currentBlocks, targetBlocks, actorId)
  if (granularOperations && granularOperations.length > 0) {
    return {
      actor_id: actorId,
      client_id: clientId,
      operation_id: createId('op'),
      base_clock: baseClock,
      base_markdown: note.markdown,
      base_document: note.document,
      operations: granularOperations,
    }
  }

  if (note.markdown === markdown) {
    return null
  }

  return {
    actor_id: actorId,
    client_id: clientId,
    operation_id: createId('op'),
    base_clock: baseClock,
    base_markdown: note.markdown,
    base_document: note.document,
    operations: [{ type: 'replace_document', blocks: nextDocument.blocks }],
  }
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
  const lastCursorPayloadRef = useRef<{ noteId: string; offset: number | null; blockId: string | null } | null>(null)
  const lastCursorSentAtRef = useRef(0)

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
  }, [selectedNote?.id, selectedNote?.selected_server_identity_id, serverAccounts])

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
    const existingBinding = await getBinding(note.id)
    if (existingBinding?.server_identity_id === identity.id && existingBinding.remote_note_id) {
      const nextNote: LocalNoteRecord = {
        ...note,
        storage_mode: 'synced',
        selected_server_identity_id: identity.id,
      }
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
    await removeQueuedOperationsForNote(note.id)
    const nextNote: LocalNoteRecord = {
      ...note,
      storage_mode: 'synced',
      selected_server_identity_id: identity.id,
      updated_at: remote.updated_at,
    }
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
      document: note.document,
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
    await removeQueuedOperationsForNote(note.id)
    const repairedNote: LocalNoteRecord = {
      ...note,
      storage_mode: 'synced',
      selected_server_identity_id: identity.id,
      updated_at: remote.updated_at,
    }
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
      await linkNoteRecordToPreferredServer(note)
      await hydrateAndConnectNote(note.id)
    }
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
    const binding = await getBinding(note.id)
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

  async function loadSelectedNoteShare(serverIdentityId?: string | null) {
    const note = currentSelectedNote()
    if (!note) return null
    const targetIdentityId = serverIdentityId ?? note.selected_server_identity_id ?? null
    const binding = await getBinding(note.id)
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
    const effectiveServerIdentityId =
      resolvedTarget?.identity.id ?? (note.storage_mode === 'synced' ? note.selected_server_identity_id ?? null : null)
    const nextLocal: LocalNoteRecord = {
      ...note,
      visibility: input.visibility,
      selected_server_identity_id: effectiveServerIdentityId,
      storage_mode: resolvedTarget || note.storage_mode === 'synced' ? 'synced' : note.storage_mode,
      updated_at: new Date().toISOString(),
    }
    await upsertNote(nextLocal)
    setNotes((current) => current.map((entry) => (entry.id === nextLocal.id ? nextLocal : entry)))

    if (!resolvedTarget) {
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
        ...linked.note,
        visibility: share.visibility,
        selected_server_identity_id: linked.identity.id,
        storage_mode: 'synced',
        updated_at: new Date().toISOString(),
      }
      await upsertNote(savedNote)
      setNotes((current) => current.map((entry) => (entry.id === savedNote.id ? savedNote : entry)))
    } catch {
      // Leave local visibility choice in place until the next sync/save succeeds.
    }
  }

  async function persistNote(next: LocalNoteRecord, batch?: NoteDocumentOperationBatch) {
    setSaveStatus('saving')
    await upsertNote(next)
    setNotes((current) => current.map((note) => (note.id === next.id ? next : note)))
    if (batch) {
      const binding = await getBinding(next.id)
      if (binding?.server_identity_id) {
        const account = serverAccounts.find((entry) => entry.id === binding.server_account_id)
        const identity = account?.identities.find((entry) => entry.id === binding.server_identity_id)
        if (account && identity && binding.remote_note_id) {
          try {
            const response = await pushNoteOperations(account.base_url, identity.token, binding.remote_note_id, batch)
            if (response.conflicts.length > 0) {
              for (const conflict of response.conflicts) {
                await saveConflict(conflict)
              }
              setConflicts(await listConflicts())
            }
            const authoritativeNote: LocalNoteRecord = {
              ...next,
              title: response.note.title,
              folder: response.note.folder,
              markdown: response.note.markdown,
              document: response.note.document,
              updated_at: response.note.updated_at,
            }
            const nextBinding: NoteBinding = {
              ...binding,
              remote_revision: response.note.revision,
              last_pulled_at: response.note.updated_at,
              last_pushed_at: response.note.updated_at,
            }
            await saveBinding(nextBinding)
            await upsertNote(authoritativeNote)
            await removeQueuedOperationsForNote(next.id)
            setNotes((current) => current.map((note) => (note.id === authoritativeNote.id ? authoritativeNote : note)))
            setSaveStatus('saved')
            return
          } catch (error) {
            if (isMissingRemoteNoteError(error)) {
              try {
                await recreateRemoteBinding(next, binding, account, identity)
                setSaveStatus('saved')
                return
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
    const note = currentSelectedNote()
    if (!note) return
    const next = {
      ...note,
      title: value,
      updated_at: new Date().toISOString(),
    }
    await persistNote(next)
    const binding = await getBinding(note.id)
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
    const note = currentSelectedNote()
    if (!note) return
    if (value === note.markdown) return
    const actorId = actorIdForNote(note)
    const document = documentFromMarkdown(value, actorId)
    const batch = buildMarkdownBatch(note, value, clientIdRef.current, actorId)
    await persistNote(
      {
        ...note,
        markdown: value,
        document,
        updated_at: new Date().toISOString(),
      },
      batch ?? undefined,
    )
    if (batch && wsRef.current?.readyState === WebSocket.OPEN) {
      const binding = await getBinding(note.id)
      if (binding?.remote_note_id) {
        const identity = activeIdentityForNote(note)
        const event: RealtimeEvent = {
          type: 'note_operations',
          note_id: binding.remote_note_id,
          title: note.title,
          folder: note.folder,
          markdown: value,
          revision: 0,
          client_id: clientIdRef.current,
          user: identity?.user.display_name ?? 'You',
          batch,
          document,
        }
        wsRef.current.send(JSON.stringify(event))
      }
    }
  }

  async function replaceSelectedDocument(document: LocalNoteRecord['document']) {
    const note = currentSelectedNote()
    if (!note) return
    const markdown = markdownFromDocument(document)
    if (markdown === note.markdown) return
    const batch = buildMarkdownBatch(note, markdown, clientIdRef.current, actorIdForNote(note))
    await persistNote(
      {
        ...note,
        document,
        markdown,
        updated_at: new Date().toISOString(),
      },
      batch ?? undefined,
    )
    if (batch && wsRef.current?.readyState === WebSocket.OPEN) {
      const binding = await getBinding(note.id)
      if (binding?.remote_note_id) {
        const identity = activeIdentityForNote(note)
        const event: RealtimeEvent = {
          type: 'note_operations',
          note_id: binding.remote_note_id,
          title: note.title,
          folder: note.folder,
          markdown,
          revision: 0,
          client_id: clientIdRef.current,
          user: identity?.user.display_name ?? 'You',
          batch,
          document,
        }
        wsRef.current.send(JSON.stringify(event))
      }
    }
  }

  async function updateBlockText(blockId: string, text: string) {
    const note = currentSelectedNote()
    if (!note) return
    const actorId = actorIdForNote(note)
    const batch: NoteDocumentOperationBatch = {
      actor_id: actorId,
      client_id: clientIdRef.current,
      operation_id: createId('op'),
      base_clock: note.document.clock,
      base_markdown: note.markdown,
      base_document: note.document,
      operations: [{ type: 'update_block_text', block_id: blockId, text }],
    }
    const document = applyOperationsToDocument(note.document, batch)
    await persistNote(
      {
        ...note,
        document,
        markdown: markdownFromDocument(document),
        updated_at: new Date().toISOString(),
      },
      batch,
    )
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const binding = await getBinding(note.id)
      if (binding?.remote_note_id) {
        const identity = activeIdentityForNote(note)
        const event: RealtimeEvent = {
          type: 'note_operations',
          note_id: binding.remote_note_id,
          title: note.title,
          folder: note.folder,
          markdown: markdownFromDocument(document),
          revision: 0,
          client_id: clientIdRef.current,
          user: identity?.user.display_name ?? 'You',
          batch,
          document,
        }
        wsRef.current.send(JSON.stringify(event))
      }
    }
  }

  function sendCursor(cursor: { offset: number | null; blockId?: string | null }) {
    const note = currentSelectedNote()
    if (!note || wsRef.current?.readyState !== WebSocket.OPEN) return
    const normalized = {
      noteId: note.id,
      offset: cursor.offset,
      blockId: cursor.blockId ?? null,
    }
    const previous = lastCursorPayloadRef.current
    if (
      previous &&
      previous.noteId === normalized.noteId &&
      previous.offset === normalized.offset &&
      previous.blockId === normalized.blockId
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
      const binding = await getBinding(note.id)
      if (!binding?.remote_note_id) return
      const identity = activeIdentityForNote(note)
      const event: RealtimeEvent = {
        type: 'note_cursor',
        note_id: binding.remote_note_id,
        user: identity?.user.display_name ?? 'You',
        client_id: clientIdRef.current,
        offset: cursor.offset,
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

  async function flushQueuedOperations() {
    await compactQueuedOperations()
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
          const mergedMarkdown = mergeConcurrentMarkdown(
            operation.batch.base_markdown ?? note.markdown,
            note.markdown,
            response.note.markdown,
          )
          const mergedDocument =
            mergedMarkdown === response.note.markdown
              ? response.note.document
              : documentFromMarkdown(mergedMarkdown, actorIdForNote(note))
          const nextNote: LocalNoteRecord = {
            ...note,
            markdown: mergedMarkdown,
            document: mergedDocument,
            updated_at: response.note.updated_at,
          }
          const nextBinding: NoteBinding = {
            ...binding,
            remote_revision: response.note.revision,
            last_pushed_at: new Date().toISOString(),
          }
          await saveBinding(nextBinding)
          await upsertNote(nextNote)
          await removeQueuedOperationsForNote(operation.note_id)
          setNotes((current) => current.map((entry) => (entry.id === operation.note_id ? nextNote : entry)))
        }
      } catch (error) {
        if (isMissingRemoteNoteError(error)) {
          const note = notesRef.current.find((entry) => entry.id === operation.note_id)
          if (note) {
            try {
              await recreateRemoteBinding(note, binding, account, identity)
              await removeQueuedOperation(operation.id)
              continue
            } catch {
              // Keep queued operation for retry.
            }
          }
        }
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
        loadSelectedNoteShare,
        listUsersForServerIdentity,
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
