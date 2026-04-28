import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import './App.css'
import { ActionNotice } from './components/ActionNotice'
import { AppPageRenderer } from './components/AppPageRenderer'
import { ConnectionBanner } from './components/ConnectionBanner'
import { getDrawioBaseUrl, getStandaloneDrawioUrl, type DrawioDiagramEditorHandle } from './components/DrawioDiagramEditor'
import { FloatingActivityPanels } from './components/FloatingActivityPanels'
import { ShareModal } from './components/ShareModal'
import { ShortcutsPopover } from './components/ShortcutsPopover'
import { SyncConflictsPanel } from './components/SyncConflictsPanel'
import { TopNav } from './components/TopNav'
import { api } from './lib/api'
import { diagramIdFromPath as diagramIdFromManagedPath, noteIdFromPath, noteTitleFromPath } from './lib/file-display'
import {
  importedFolderForPath,
  type FileColumnKey,
} from './lib/file-browser'
import { createFileMutationActions } from './lib/file-mutations'
import { createFileNavigationActions } from './lib/file-navigation'
import { applyNoteOperationBatch, buildReplaceDocumentBatch, markdownFromNoteDocument, noteDocumentFromMarkdown } from './lib/note-document'
import { createNoteActions, type NotePresenceEntry } from './lib/note-actions'
import { createAdminActions } from './lib/admin-actions'
import { createVoiceActions } from './lib/voice-actions'
import { createRtcActions, type SignalPayload } from './lib/rtc-actions'
import { createNoteEditorActions } from './lib/note-editor-actions'
import { createAuthActions } from './lib/auth-actions'
import { createShareActions, type ShareTarget } from './lib/share-actions'
import { createDiagramActions } from './lib/diagram-actions'
import { createComsActions } from './lib/coms-actions'
import { createOptimisticDirectoryNode, insertFileTreeNode, moveFileTreeNode, removeFileTreeNode, renameFileTreeNode, replaceFileTreeNode } from './lib/file-tree-state'
import { offlineDb } from './lib/offline-db'
import { pendingManagedUploadToFileNode } from './lib/pending-managed-uploads'
import { pendingVoiceUploadToFileNode, pendingVoiceUploadToMemo } from './lib/pending-voice'
import { isNativePlatform, serverBaseStore, sessionStore, subscribeToConnectivity, getConnectivityState } from './lib/platform'
import {
  discardQueuedSyncConflict,
  flushQueuedOperations,
  listQueuedSyncConflicts,
  loadCachedWorkspaceSnapshot,
  persistWorkspaceSnapshot,
  queueSyncOperation,
  refreshWorkspace,
  retryQueuedSyncConflict,
} from './lib/sync-engine'
import {
  activateRelativeFile as activateRelativeFileAction,
  beginFileColumnResize as beginFileColumnResizeAction,
  beginFileDrag as beginFileDragAction,
  cycleRoutePath,
  displayNameForManagedFileNode,
  handleDirectoryDrop as handleDirectoryDropAction,
  moveRouteFocus as moveRouteFocusAction,
  renderManagedFileCell,
  routeJumpFromShortcut as routeJumpFromShortcutAction,
  toggleFileColumnVisibility as toggleFileColumnVisibilityAction,
  toggleFilePreviewPane as toggleFilePreviewPaneAction,
} from './lib/app-shell'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_NAV_ORDER,
  DEFAULT_SHORTCUTS,
  NAV_ITEMS,
  buildAppearanceStyle,
  demoMarkdown,
  normalizeRoute,
  type ActionNotice as ActionNoticeState,
  type AppearanceSettings,
  type DiagramEditorMode,
  type NavItemPath,
  type NoteContextMenuState,
  type NoteContextSubmenu,
  type NoteEditorMode,
  type RoutePath,
  type ShortcutSettings,
} from './lib/app-config'
import {
  editableHtmlToMarkdown,
  markdownToEditableHtml,
} from './lib/markdown-editor'
import {
  eventShortcutStroke,
  normalizeShortcutBinding,
  type BrowserSpeechRecognition,
} from './lib/shortcuts'
import type {
  AdminSettings,
  CalendarConnection,
  CalendarEvent,
  Diagram,
  FileNode,
  GoogleCalendarConfig,
  Message,
  Note,
  OidcConfig,
  ResourceShare,
  RealtimeEvent,
  Room,
  RtcConfig,
  SetupStatusResponse,
  SessionResponse,
  SyncCursorSet,
  SystemUpdateStatus,
  TaskItem,
  UserProfile,
  VoiceMemo,
  NoteDocument,
} from './lib/types'
import {
  createEmptyDrawioDiagramXml,
  parseDrawioDiagramXml,
  type ParsedDrawioDiagram,
} from './lib/drawio-diagram'
import {
  blurEditableTarget,
  buildDiagramTree,
  buildNoteTree,
  colorForPresenceLabel,
  defaultNoteTitle,
  deriveDirectoryPath,
  deriveParentPath,
  diagramDisplayName,
  findFileNode,
  flattenFileNodes,
  getCaretOffsetInContentEditable,
  isEditableTarget,
  managedPathForDiagramFolder,
  managedPathForNoteFolder,
  managedPathForVoiceFolder,
  mergeConcurrentMarkdown,
  mergeFolderPaths,
  normalizeDiagramDirectoryPath,
  normalizeDiagramFolderPath,
  normalizeDiagramTitlePath,
  normalizeFolderPath,
  normalizeVoiceDirectoryPath,
} from './lib/ui-helpers'
import { AuthPage } from './pages/AuthPage'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type RemoteNoteCursor = {
  clientId: string
  user: string
  offset: number
  seenAt: number
  color: string
}

type FileColumnVisibility = Record<FileColumnKey, boolean>

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createEntityId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).slice(-12).padStart(12, '0')}`
}

function normalizeServerConnectionUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}

function slugForNoteTitle(title: string) {
  const slug = title
    .split('')
    .map((char) => (/[a-z0-9]/i.test(char) ? char.toLowerCase() : '-'))
    .join('')
    .split('-')
    .filter(Boolean)
    .join('-')
  return slug || 'note'
}

function slugForDiagramTitle(title: string) {
  const display = diagramDisplayName(title)
  const slug = display
    .split('')
    .map((char) => (/[a-z0-9]/i.test(char) ? char.toLowerCase() : '-'))
    .join('')
    .split('-')
    .filter(Boolean)
    .join('-')
  return slug || 'diagram'
}

function noteManagedFilePath(note: Note) {
  return `${managedPathForNoteFolder(note.folder || 'Inbox')}/${slugForNoteTitle(note.title)}-${note.id}.md`
}

function diagramManagedFilePath(diagram: Diagram) {
  const normalizedTitle = normalizeDiagramTitlePath(diagram.title)
  const parts = normalizedTitle.split('/').filter(Boolean)
  const leaf = parts[parts.length - 1] || 'Untitled'
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const prefix = folder ? `diagrams/${folder}` : 'diagrams'
  return `${prefix}/${slugForDiagramTitle(leaf)}-${diagram.id}.drawio`
}

function upsertVoiceMemo(records: VoiceMemo[], nextRecord: VoiceMemo) {
  const withoutExisting = records.filter((record) => record.id !== nextRecord.id)
  return [nextRecord, ...withoutExisting].sort((left, right) => right.created_at.localeCompare(left.created_at))
}

function App() {
  const [route, setRoute] = useState<RoutePath>(normalizeRoute(window.location.pathname))
  const [locationSearch, setLocationSearch] = useState(window.location.search)
  const [authMode, setAuthMode] = useState<'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'>('boot')
  const [serverUrl, setServerUrl] = useState('')
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null)
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [oidc, setOidc] = useState<OidcConfig | null>(null)
  const [googleCalendarConfig, setGoogleCalendarConfig] = useState<GoogleCalendarConfig | null>(null)
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null)
  const [adminUsers, setAdminUsers] = useState<import('./lib/types').AdminUserSummary[]>([])
  const [adminStorageOverview, setAdminStorageOverview] = useState<import('./lib/types').AdminStorageOverview | null>(null)
  const [adminDatabaseOverview, setAdminDatabaseOverview] = useState<import('./lib/types').AdminDatabaseOverview | null>(null)
  const [systemUpdateStatus, setSystemUpdateStatus] = useState<SystemUpdateStatus | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState(demoMarkdown)
  const [selectedNoteDocument, setSelectedNoteDocument] = useState<NoteDocument>(() =>
    noteDocumentFromMarkdown('local-draft', demoMarkdown, 'local'),
  )
  const [noteEditorMode, setNoteEditorMode] = useState<NoteEditorMode>('rich')
  const [noteContextMenu, setNoteContextMenu] = useState<NoteContextMenuState>(null)
  const [noteContextSubmenu, setNoteContextSubmenu] = useState<NoteContextSubmenu>(null)
  const [noteClipboardText, setNoteClipboardText] = useState('')
  const [noteContextMenuOpenLeft, setNoteContextMenuOpenLeft] = useState(false)
  const [noteContextSubmenuOpenUp, setNoteContextSubmenuOpenUp] = useState(false)
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(true)
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>(normalizeFolderPath('Getting Started'))
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const [customDiagramFolders, setCustomDiagramFolders] = useState<string[]>([])
  const [filesTree, setFilesTree] = useState<FileNode[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string>('drive')
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [newDriveFolderName, setNewDriveFolderName] = useState('')
  const [creatingDriveFolder, setCreatingDriveFolder] = useState(false)
  const [renamingFilePath, setRenamingFilePath] = useState<string | null>(null)
  const [renameFileName, setRenameFileName] = useState('')
  const [convertingFilePath, setConvertingFilePath] = useState<string | null>(null)
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([])
  const [draggingFilePath, setDraggingFilePath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [draggingNoteTreePath, setDraggingNoteTreePath] = useState<string | null>(null)
  const [noteTreeDropTargetPath, setNoteTreeDropTargetPath] = useState<string | null>(null)
  const [draggingDiagramTreePath, setDraggingDiagramTreePath] = useState<string | null>(null)
  const [diagramTreeDropTargetPath, setDiagramTreeDropTargetPath] = useState<string | null>(null)
  const [draggingVoiceTreePath, setDraggingVoiceTreePath] = useState<string | null>(null)
  const [voiceTreeDropTargetPath, setVoiceTreeDropTargetPath] = useState<string | null>(null)
  const [markedFilePaths, setMarkedFilePaths] = useState<string[]>([])
  const [fileHelpOpen, setFileHelpOpen] = useState(false)
  const [pendingFileKey, setPendingFileKey] = useState<string | null>(null)
  const [pendingAppKey, setPendingAppKey] = useState<string | null>(null)
  const [filePaneWidths, setFilePaneWidths] = useState({ left: 180, right: 240 })
  const [filePaneHeights, setFilePaneHeights] = useState({ top: 220, middle: 320 })
  const [filePreviewOpen, setFilePreviewOpen] = useState(true)
  const [activeSplitter, setActiveSplitter] = useState<'left' | 'right' | null>(null)
  const [fileColumnWidths, setFileColumnWidths] = useState({ name: 260, directory: 220, type: 56, size: 56, modified: 150, created: 150 })
  const [fileColumnVisibility, setFileColumnVisibility] = useState<FileColumnVisibility>({
    name: true,
    directory: true,
    type: true,
    size: true,
    modified: true,
    created: true,
  })
  const [fileColumnViewOpen, setFileColumnViewOpen] = useState(false)
  const [activeFileColumnSplitter, setActiveFileColumnSplitter] = useState<FileColumnKey | null>(null)
  const [notePaneSize, setNotePaneSize] = useState({ width: 280, height: 220 })
  const [activeNoteSplitter, setActiveNoteSplitter] = useState(false)
  const [noteFullscreen, setNoteFullscreen] = useState(false)
  const [diagramPaneSize, setDiagramPaneSize] = useState({ width: 280, height: 220 })
  const [activeDiagramSplitter, setActiveDiagramSplitter] = useState(false)
  const [diagramDrawerOpen, setDiagramDrawerOpen] = useState(true)
  const [diagramFullscreen, setDiagramFullscreen] = useState(false)
  const [voicePaneSize, setVoicePaneSize] = useState({ width: 280, height: 220 })
  const [activeVoiceSplitter, setActiveVoiceSplitter] = useState(false)
  const [voiceDrawerOpen, setVoiceDrawerOpen] = useState(true)
  const [chatPaneSize, setChatPaneSize] = useState({ width: 280, height: 220 })
  const [activeChatSplitter, setActiveChatSplitter] = useState(false)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(true)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutSettings>(DEFAULT_SHORTCUTS)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [navOrder, setNavOrder] = useState<NavItemPath[]>(DEFAULT_NAV_ORDER)
  const [diagrams, setDiagrams] = useState<Diagram[]>([])
  const [selectedDiagramId, setSelectedDiagramId] = useState<string | null>(null)
  const [diagramDraft, setDiagramDraft] = useState(createEmptyDrawioDiagramXml())
  const [diagramEditorMode, setDiagramEditorMode] = useState<DiagramEditorMode>('diagram')
  const [diagramSourceFormat, setDiagramSourceFormat] = useState<ParsedDrawioDiagram['sourceFormat']>('empty')
  const [diagramLoadVersion, setDiagramLoadVersion] = useState(0)
  const [memos, setMemos] = useState<VoiceMemo[]>([])
  const [selectedVoiceMemoId, setSelectedVoiceMemoId] = useState<string | null>(null)
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([])
  const [selectedCalendarConnectionIds, setSelectedCalendarConnectionIds] = useState<string[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [comsParticipants, setComsParticipants] = useState<UserProfile[]>([])
  const [roomUnreadCounts, setRoomUnreadCounts] = useState<Record<string, number>>({})
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [rtcConfig, setRtcConfig] = useState<RtcConfig | null>(null)
  const [recording, setRecording] = useState(false)
  const [voiceInputLevel, setVoiceInputLevel] = useState(0)
  const [status, setStatus] = useState('Bootstrapping workspace')
  const [actionNotice, setActionNotice] = useState<ActionNoticeState | null>(null)
  const [syncNotice, setSyncNotice] = useState<{ tone: 'offline' | 'error'; message: string } | null>(null)
  const [syncConflicts, setSyncConflicts] = useState<import('./lib/types').QueuedSyncConflict[]>([])
  const [syncConflictsOpen, setSyncConflictsOpen] = useState(false)
  const [syncCursors, setSyncCursors] = useState<SyncCursorSet>({ generated_at: new Date(0).toISOString() })
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
  const [shareDraft, setShareDraft] = useState<ResourceShare | null>(null)
  const [shareUserQuery, setShareUserQuery] = useState('')
  const [shareSaving, setShareSaving] = useState(false)
  const [noteTitleModalOpen, setNoteTitleModalOpen] = useState(false)
  const [isCompactViewport, setIsCompactViewport] = useState(false)
  const [noteSaveState, setNoteSaveState] = useState<'idle' | 'saving'>('idle')
  const [, setNoteDirtyVersion] = useState(0)
  const [callJoined, setCallJoined] = useState(false)
  const [activeCallRoomId, setActiveCallRoomId] = useState<string | null>(null)
  const [callMediaMode, setCallMediaMode] = useState<'audio' | 'video' | null>(null)
  const [screenSharing, setScreenSharing] = useState(false)
  const [notePresence, setNotePresence] = useState<Record<string, NotePresenceEntry[]>>({})
  const [noteCursors, setNoteCursors] = useState<Record<string, RemoteNoteCursor[]>>({})
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingAudioContextRef = useRef<AudioContext | null>(null)
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null)
  const recordingLevelFrameRef = useRef<number | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const speechTranscriptRef = useRef('')
  const fileManagerRef = useRef<HTMLDivElement | null>(null)
  const noteManagerRef = useRef<HTMLDivElement | null>(null)
  const notesSectionRef = useRef<HTMLElement | null>(null)
  const diagramManagerRef = useRef<HTMLDivElement | null>(null)
  const chatManagerRef = useRef<HTMLDivElement | null>(null)
  const diagramsSectionRef = useRef<HTMLElement | null>(null)
  const noteEditorRef = useRef<HTMLDivElement | null>(null)
  const drawioEditorRef = useRef<DrawioDiagramEditorHandle | null>(null)
  const noteContextMenuRef = useRef<HTMLDivElement | null>(null)
  const noteContextRangeRef = useRef<Range | null>(null)
  const noteContextTableRef = useRef<HTMLTableElement | null>(null)
  const noteContextCellRef = useRef<HTMLTableCellElement | null>(null)
  const noteDraftBroadcastTimeoutRef = useRef<number | null>(null)
  const noteLiveSaveTimeoutRef = useRef<number | null>(null)
  const pendingLiveSaveNoteIdRef = useRef<string | null>(null)
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const fileSearchInputRef = useRef<HTMLInputElement | null>(null)
  const fileColumnViewRef = useRef<HTMLDivElement | null>(null)
  const filePreviewWidthRef = useRef(240)
  const fileColumnResizeRef = useRef<{
    splitter: FileColumnKey
    startX: number
    startWidths: { name: number; directory: number; type: number; size: number; modified: number; created: number }
  } | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const selectedRoomIdRef = useRef<string | null>(null)
  const routeRef = useRef<RoutePath>(route)
  const sessionUserIdRef = useRef<string | null>(session?.user.id ?? null)
  const selectedNoteIdRef = useRef<string | null>(null)
  const selectedNoteRef = useRef<Note | null>(null)
  const noteSessionIdRef = useRef<string | null>(null)
  const noteEditorModeRef = useRef<NoteEditorMode>('rich')
  const selectedFolderPathRef = useRef(selectedFolderPath)
  const noteDraftRef = useRef(noteDraft)
  const selectedNoteDocumentRef = useRef<NoteDocument | null>(selectedNoteDocument)
  const notesRef = useRef<Note[]>([])
  const diagramsRef = useRef<Diagram[]>([])
  const memosRef = useRef<VoiceMemo[]>([])
  const syncNoticeTimeoutRef = useRef<number | null>(null)
  const persistedNoteStateRef = useRef<Record<string, { title: string; folder: string; markdown: string }>>({})
  const realtimeDraftBaseRef = useRef<Record<string, string>>({})
  const locallyDirtyNoteIdsRef = useRef<Set<string>>(new Set())
  const pendingLocalDraftRestoreRef = useRef<{ noteId: string; markdown: string } | null>(null)
  const noteSavePromiseRef = useRef<Promise<boolean> | null>(null)
  const rtcConfigRef = useRef<RtcConfig | null>(null)
  const callJoinedRef = useRef(false)
  const activeCallRoomIdRef = useRef<string | null>(null)
  const clientIdRef = useRef(createClientId())
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const standaloneDrawioWindowRef = useRef<Window | null>(null)
  const standaloneDrawioEditingIdRef = useRef<string | null>(null)

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const selectedNoteFolderPath = selectedNote ? normalizeFolderPath(selectedNote.folder || 'Inbox') : null
  const selectedDiagram = diagrams.find((diagram) => diagram.id === selectedDiagramId) ?? null
  const standaloneDrawio = route === '/diagrams' && new URLSearchParams(locationSearch).get('drawio') === '1'
  const standaloneDrawioDiagramId = standaloneDrawio ? new URLSearchParams(locationSearch).get('diagram') : null
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const activeCallRoom = rooms.find((room) => room.id === activeCallRoomId) ?? null
  const selectedVoiceMemo = memos.find((memo) => memo.id === selectedVoiceMemoId) ?? null

  function buildSelectedNoteDocumentState(markdown: string, note: Note | null | undefined, previous?: NoteDocument | null) {
    const actorId = session?.user.id ?? note?.last_editor_id ?? 'local'
    return noteDocumentFromMarkdown(note?.id ?? 'local-draft', markdown, actorId, previous ?? note?.document ?? undefined)
  }

  function applySelectedNoteDocument(
    document: NoteDocument | null | undefined,
    options?: { note?: Note | null; markdown?: string },
  ) {
    const note = options?.note ?? selectedNoteRef.current
    const nextDocument =
      document ??
      buildSelectedNoteDocumentState(options?.markdown ?? '', note, selectedNoteDocumentRef.current)
    const nextMarkdown = options?.markdown ?? markdownFromNoteDocument(nextDocument)
    setSelectedNoteDocument(nextDocument)
    setNoteDraft(nextMarkdown)
    if (note && note.id === selectedNoteIdRef.current) {
      const nextNote = {
        ...note,
        markdown: nextMarkdown,
        document: nextDocument,
      }
      selectedNoteRef.current = nextNote
      notesRef.current = notesRef.current.map((entry) => (entry.id === nextNote.id ? nextNote : entry))
      setNotes((current) => current.map((entry) => (entry.id === nextNote.id ? nextNote : entry)))
    }
  }

  function applySelectedNoteMarkdown(markdown: string, options?: { note?: Note | null; document?: NoteDocument | null }) {
    const note = options?.note ?? selectedNoteRef.current
    const nextDocument =
      options?.document ??
      buildSelectedNoteDocumentState(markdown, note, selectedNoteDocumentRef.current)
    applySelectedNoteDocument(nextDocument, { note, markdown })
  }

  const {
    saveAdminSettings,
    createAdminUser,
    resetAdminUserPassword,
    updateAdminUserAccess,
    resolveAdminUserCredentialRequest,
    refreshAdminDatabaseOverview,
    refreshSystemUpdateStatus,
    runSystemUpdate,
  } = createAdminActions({
    session,
    setAdminSettings,
    setAdminStorageOverview,
    setAdminDatabaseOverview,
    setSystemUpdateStatus,
    setAdminUsers,
    setSetupStatus,
    setComsParticipants,
    setMessages,
    applyUpdatedUserProfile,
    showActionNotice,
  })
  const {
    stopRecordingLevelTracking,
    toggleRecording,
    openRecorderPanel,
    pollTranscript,
    uploadAudioFile,
  } = createVoiceActions({
    recording,
    memos,
    mediaRecorderRef,
    recordingStreamRef,
    recordingAudioContextRef,
    recordingAnalyserRef,
    recordingLevelFrameRef,
    audioChunksRef,
    speechRecognitionRef,
    speechTranscriptRef,
    setRecording,
    setVoiceInputLevel,
    setMemos,
    setSelectedVoiceMemoId,
    uploadVoiceMemoRecord: uploadVoiceMemoLocalFirst,
    listVoiceMemos: api.listVoiceMemos,
    getVoiceJob: api.getVoiceJob,
    retryVoiceJob: api.retryVoiceJob,
    showActionNotice,
  })
  const activePresence = selectedNoteId ? notePresence[selectedNoteId] ?? [] : []
  const activeRemoteNoteCursors = useMemo(
    () => (selectedNoteId ? noteCursors[selectedNoteId] ?? [] : []),
    [noteCursors, selectedNoteId],
  )
  const clientLabel = session
    ? `${session.user.display_name} (${clientIdRef.current.slice(0, 6)})`
    : `Guest (${clientIdRef.current.slice(0, 6)})`
  const notePresenceLabel = session?.user.username || session?.user.display_name || 'Guest'
  const {
    handleSignal,
    cleanupCallState,
    joinCall,
    startScreenShare,
    stopScreenShare,
    leaveCall,
  } = createRtcActions({
    selectedRoomId,
    callJoined,
    callMediaMode,
    clientLabel,
    localVideoRef,
    localStreamRef,
    screenStreamRef,
    socketRef,
    activeCallRoomIdRef,
    callJoinedRef,
    rtcConfigRef,
    clientIdRef,
    peerConnectionsRef,
    setRemoteParticipants,
    setActiveCallRoomId,
    setCallMediaMode,
    setScreenSharing,
    setCallJoined,
    pushCallLog,
  })
  const {
    currentNoteMarkdown,
    clearNoteLocallyDirty,
    rememberPersistedNotes,
    currentNoteIsDirty,
    noteHasPendingPersistence,
    registerPresence,
    prunePresence,
    broadcastPresence,
    broadcastNoteCursor,
    scheduleNoteDraftBroadcast,
    createNote,
    saveNote,
    autosaveCurrentNoteBeforeSwitch,
    openNoteInNotes,
    openMarkdownInNotes,
  } = createNoteActions({
    noteEditorMode,
    noteEditorRef,
    noteDraftRef,
    currentNoteDocumentRef: selectedNoteDocumentRef,
    selectedNoteRef,
    selectedNoteIdRef,
    selectedFolderPathRef,
    notesRef,
    persistedNoteStateRef,
    realtimeDraftBaseRef,
    locallyDirtyNoteIdsRef,
    noteSavePromiseRef,
    noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef,
    pendingLiveSaveNoteIdRef,
    socketRef,
    clientIdRef,
    notePresenceLabel,
    noteSaveState,
    route,
    notes,
    selectedFolderPath,
    setNoteDirtyVersion,
    setNotePresence,
    setNoteSaveState,
    setNotes,
    setNoteDraft,
    applySelectedNoteMarkdown,
    applySelectedNoteDocument,
    setCustomFolders,
    setSelectedNoteId,
    setSelectedFolderPath,
    setStatus,
    setRoute,
    createNoteRecord: createNoteLocalFirst,
    updateNoteRecord: updateNoteLocalFirst,
    buildNoteDocument: (note, markdown) =>
      note.id === selectedNoteRef.current?.id && selectedNoteDocumentRef.current
        ? noteDocumentFromMarkdown(
            note.id,
            markdown,
            session?.user.id ?? note.last_editor_id,
            selectedNoteDocumentRef.current,
          )
        : noteDocumentFromMarkdown(note.id, markdown, session?.user.id ?? note.last_editor_id, note.document),
    refreshFilesTree,
    showActionNotice,
    normalizeFolderPath,
    mergeFolderPaths,
    defaultNoteTitle,
    noteIdFromPath,
    noteTitleFromPath,
    importedFolderForPath,
    editableHtmlToMarkdown,
    displayNameForFileNode,
  })
  const { createDiagram, persistDiagramXml, saveDiagram, setDiagramMode } = createDiagramActions({
    diagrams,
    selectedDiagram,
    diagramDraft,
    diagramEditorMode,
    drawioEditorRef,
    setDiagrams,
    setSelectedDiagramId,
    setDiagramSourceFormat,
    setDiagramDraft,
    setDiagramLoadVersion,
    setDiagramEditorMode,
    createDiagramRecord: createDiagramLocalFirst,
    updateDiagramRecord: updateDiagramLocalFirst,
    showActionNotice,
  })
  const { createRoom, createDirectRoom, renameRoom, updateRoomParticipants, deleteRoom, sendMessage, toggleMessageReaction } =
    createComsActions({
      rooms,
      comsParticipants,
      selectedRoomId,
      selectedRoomIdRef,
      activeCallRoomIdRef,
      callJoinedRef,
      setMessages,
      refreshRooms,
      createMessageRecord: createMessageLocalFirst,
      toggleMessageReactionRecord: toggleMessageReactionLocalFirst,
      leaveCall,
      showActionNotice,
    })
  const {
    insertNoteElement,
    addTableRowFromContext,
    addTableColumnFromContext,
    copyNoteSelection,
    pasteIntoNoteFromClipboard,
    runToolbarAction,
    openNoteContextMenu,
    handleNoteEditorKeyDown,
    handleNoteEditorInput,
    handleNoteEditorClick,
  } = createNoteEditorActions({
    selectedNote,
    noteEditorMode,
    noteEditorRef,
    noteContextRangeRef,
    noteContextTableRef,
    noteContextCellRef,
    noteClipboardText,
    applySelectedNoteMarkdown,
    setStatus,
    setNoteClipboardText,
    setNoteContextMenu,
    setNoteContextSubmenu,
    scheduleNoteDraftBroadcast,
  })
  const noteTree = useMemo(() => buildNoteTree(notes, customFolders), [notes, customFolders])
  const diagramTree = useMemo(() => buildDiagramTree(diagrams, customDiagramFolders), [diagrams, customDiagramFolders])

  function rebaseFolderEntries(paths: string[], sourcePath: string, renamedPath: string) {
    return Array.from(
      new Set(
        paths.map((entry) =>
          entry === sourcePath || entry.startsWith(`${sourcePath}/`)
            ? `${renamedPath}${entry.slice(sourcePath.length)}`
            : entry,
        ),
      ),
    ).sort((left, right) => left.localeCompare(right))
  }
  const floatingCallParticipants = useMemo(
    () =>
      callJoined
        ? [
            { id: session?.user.id ?? 'local', label: session?.user.display_name ?? 'You' },
            ...remoteParticipants.map((participant) => ({ id: participant.id, label: participant.label })),
          ]
        : [],
    [callJoined, remoteParticipants, session?.user.display_name, session?.user.id],
  )
  const fileRootNode = useMemo(
    () =>
      ({
        name: 'root',
        path: '',
        kind: 'directory',
        size_bytes: null,
        created_at: null,
        updated_at: null,
        children: filesTree,
      }) satisfies FileNode,
    [filesTree],
  )
  const selectedFileNode = useMemo(
    () => (selectedFilePath === '' ? fileRootNode : findFileNode(filesTree, selectedFilePath) ?? filesTree[0] ?? fileRootNode),
    [fileRootNode, filesTree, selectedFilePath],
  )
  const currentDirectoryPath = useMemo(
    () => deriveDirectoryPath(selectedFileNode?.path ?? '', selectedFileNode?.kind === 'directory'),
    [selectedFileNode?.path, selectedFileNode?.kind],
  )
  const currentDirectoryNode = useMemo(
    () => (currentDirectoryPath === '' ? fileRootNode : findFileNode(filesTree, currentDirectoryPath)),
    [fileRootNode, filesTree, currentDirectoryPath],
  )
  const voiceTreeNode = useMemo(
    () => findFileNode(filesTree, 'voice') ?? null,
    [filesTree],
  )
  const diagramsTreeNode = useMemo(
    () => findFileNode(filesTree, 'diagrams') ?? null,
    [filesTree],
  )
  const selectedVoiceMemoNode = useMemo(
    () => (selectedVoiceMemo ? findFileNode(filesTree, selectedVoiceMemo.audio_path) : null),
    [filesTree, selectedVoiceMemo],
  )
  const currentVoiceFolderPath = useMemo(() => {
    const selectedPath = selectedVoiceMemo?.audio_path ?? selectedFilePath
    if (!selectedPath || !selectedPath.startsWith('voice')) return 'voice'
    const selectedNode = findFileNode(filesTree, selectedPath)
    const basePath =
      selectedNode?.kind === 'directory'
        ? selectedNode.path
        : deriveDirectoryPath(selectedPath, false)
    return normalizeVoiceDirectoryPath(basePath || 'voice')
  }, [filesTree, selectedFilePath, selectedVoiceMemo?.audio_path])
  const selectedVoicePath = useMemo(() => {
    if (selectedVoiceMemo?.audio_path) return selectedVoiceMemo.audio_path
    return selectedFilePath.startsWith('voice') ? selectedFilePath : null
  }, [selectedFilePath, selectedVoiceMemo?.audio_path])
  const directoryNodes = currentDirectoryNode?.children ?? []
  const allFileNodes = useMemo(() => flattenFileNodes(filesTree), [filesTree])
  const selectedDiagramPath = useMemo(
    () =>
      selectedDiagramId
        ? (allFileNodes.find(
            (node) =>
              node.kind === 'file' &&
              node.path.startsWith('diagrams/') &&
              diagramIdFromManagedPath(node.path) === selectedDiagramId,
          )?.path ?? null)
        : null,
    [allFileNodes, selectedDiagramId],
  )
  const trimmedFileSearchQuery = fileSearchQuery.trim().toLowerCase()
  const displayedFileNodes = useMemo(() => {
    if (!trimmedFileSearchQuery) return directoryNodes
    return allFileNodes.filter(
      (node) =>
        displayNameForFileNode(node).toLowerCase().includes(trimmedFileSearchQuery) ||
        node.path.toLowerCase().includes(trimmedFileSearchQuery),
    )
  }, [allFileNodes, directoryNodes, trimmedFileSearchQuery, notes, diagrams])
  const activeFileNode = useMemo(
    () => findFileNode(filesTree, activeFilePath ?? '') ?? displayedFileNodes[0] ?? selectedFileNode,
    [filesTree, activeFilePath, displayedFileNodes, selectedFileNode],
  )
  const {
    selectVoicePath,
    diagramIdFromPath,
    openFileNode,
    downloadManagedPath,
    downloadManagedPaths,
    goToParentDirectory: goToParentDirectoryAction,
    selectFileTreeNode,
    toggleMarkedPath,
  } = createFileNavigationActions({
    memos,
    diagrams,
    route,
    filesTree,
    fileRootNode,
    setSelectedVoiceMemoId,
    setSelectedDiagramId,
    setDiagramSourceFormat,
    setDiagramDraft,
    setDiagramMode,
    setDiagramDrawerOpen,
    setRoute,
    setStatus,
    setSelectedFilePath,
    setActiveFilePath,
    setMarkedFilePaths,
    deriveParentPath,
    diagramDisplayName,
    parseDrawioDiagramXml,
    findFileNode,
    openMarkdownInNotes,
    showActionNotice,
  })
  const visibleFileColumns = useMemo(() => {
    const columns: Array<{
      key: FileColumnKey
      label: string
      width: number
      min: number
      max: number
      resizable: boolean
      visible: boolean
      className?: string
    }> = [
      {
        key: 'name',
        label: 'Name',
        width: fileColumnWidths.name,
        min: 160,
        max: 960,
        resizable: true,
        visible: true,
      },
      {
        key: 'directory',
        label: 'Directory',
        width: fileColumnWidths.directory,
        min: 140,
        max: 520,
        resizable: true,
        visible: !!trimmedFileSearchQuery && fileColumnVisibility.directory,
        className: 'file-directory-cell',
      },
      {
        key: 'type',
        label: 'Type',
        width: fileColumnWidths.type,
        min: 40,
        max: 180,
        resizable: true,
        visible: fileColumnVisibility.type,
      },
      {
        key: 'size',
        label: 'Size',
        width: fileColumnWidths.size,
        min: 44,
        max: 220,
        resizable: true,
        visible: fileColumnVisibility.size,
        className: 'file-size-cell',
      },
      {
        key: 'modified',
        label: 'Modified',
        width: fileColumnWidths.modified,
        min: 120,
        max: 260,
        resizable: true,
        visible: fileColumnVisibility.modified,
        className: 'file-modified-cell',
      },
      {
        key: 'created',
        label: 'Created',
        width: fileColumnWidths.created,
        min: 120,
        max: 260,
        resizable: true,
        visible: fileColumnVisibility.created,
        className: 'file-created-cell',
      },
    ]
    return columns.filter((column) => column.visible)
  }, [fileColumnVisibility, fileColumnWidths, trimmedFileSearchQuery])
  const fileGridTemplateColumns = useMemo(
    () => visibleFileColumns.map((column) => `minmax(${column.min}px, ${column.width}px)`).join(' '),
    [visibleFileColumns],
  )
  const pendingDeleteNodes = useMemo(
    () => pendingDeletePaths.map((path) => findFileNode(filesTree, path)).filter(Boolean) as FileNode[],
    [filesTree, pendingDeletePaths],
  )
  const currentRoleKeys = useMemo(() => {
    const assigned = session?.user.roles?.length ? session.user.roles : session?.user.role ? [session.user.role] : []
    const normalized = Array.from(new Set(assigned))
    return normalized.length ? normalized : ['member']
  }, [session?.user.role, session?.user.roles])
  const currentRolePolicy = useMemo(
    () =>
      currentRoleKeys.reduce(
        (merged, roleKey) => {
          const fallbackAdmin = roleKey === 'admin'
          const policy = adminSettings?.role_policies?.[roleKey as keyof NonNullable<typeof adminSettings>['role_policies']] ?? {
            tool_scope: { notes: true, files: true, diagrams: true, voice: true, coms: true },
            admin_panel: fallbackAdmin,
            manage_users: fallbackAdmin,
            manage_org_settings: fallbackAdmin,
            customize_appearance: true,
          }
          return {
            tool_scope: {
              notes: merged.tool_scope.notes || policy.tool_scope.notes,
              files: merged.tool_scope.files || policy.tool_scope.files,
              diagrams: merged.tool_scope.diagrams || policy.tool_scope.diagrams,
              voice: merged.tool_scope.voice || policy.tool_scope.voice,
              coms: merged.tool_scope.coms || policy.tool_scope.coms,
            },
            admin_panel: merged.admin_panel || policy.admin_panel,
            manage_users: merged.manage_users || policy.manage_users,
            manage_org_settings: merged.manage_org_settings || policy.manage_org_settings,
            customize_appearance: merged.customize_appearance || policy.customize_appearance,
          }
        },
        {
          tool_scope: { notes: false, files: false, diagrams: false, voice: false, coms: false },
          admin_panel: false,
          manage_users: false,
          manage_org_settings: false,
          customize_appearance: false,
        },
      ),
    [adminSettings?.role_policies, currentRoleKeys],
  )
  const {
    deleteVoiceMemo,
    createDriveFolderFromSelection,
    handleDriveUpload,
    moveDriveItem,
    canDeleteFilePath,
    normalizedDeletePaths,
    requestDeletePaths,
    canRenameFilePath,
    canConvertFilePath,
    beginRenameCurrentFile,
    convertManagedTextFile,
    renameManagedPath,
    deleteManagedPaths,
  } = createFileMutationActions({
    notes,
    memos,
    diagrams,
    currentDirectoryPath,
    selectedFileNode,
    selectedFilePath,
    activeFilePath,
    currentRoleIsAdmin: currentRolePolicy.admin_panel,
    confirmFileDelete: adminSettings?.confirm_file_delete ?? true,
    newDriveFolderName,
    activeFileNode,
    setStatus,
    setMemos,
    setSelectedVoiceMemoId,
    setNewDriveFolderName,
    setCreatingDriveFolder,
    setSelectedFilePath,
    setPendingDeletePaths,
    setRenamingFilePath,
    setRenameFileName,
    setConvertingFilePath,
    setActiveFilePath,
    setMarkedFilePaths,
    setNotes,
    setCustomFolders,
    setSelectedNoteId,
    setDiagrams,
    setSelectedDiagramId,
    createManagedFolderRecord: createManagedFolderLocalFirst,
    moveManagedPathRecord: moveManagedPathLocalFirst,
    renameManagedPathRecord: renameManagedPathLocalFirst,
    deleteManagedPathRecord: deleteManagedPathLocalFirst,
    uploadManagedFileRecord: uploadManagedFileLocalFirst,
    refreshFilesTree,
    rememberPersistedNotes,
    mergeFolderPaths,
    noteIdFromPath,
    diagramIdFromPath,
    diagramDisplayName,
    deriveParentPath,
    showActionNotice,
  })
  const canAccessRoute = useMemo(
    () => (path: RoutePath) => {
      switch (path) {
        case '/notes':
          return currentRolePolicy.tool_scope.notes
        case '/files':
          return currentRolePolicy.tool_scope.files
        case '/diagrams':
          return currentRolePolicy.tool_scope.diagrams
        case '/voice':
          return currentRolePolicy.tool_scope.voice
        case '/calendar':
          return true
        case '/coms':
          return currentRolePolicy.tool_scope.coms
        case '/admin':
          return currentRolePolicy.admin_panel
        case '/settings':
          return true
        default:
          return true
      }
    },
    [currentRolePolicy],
  )

  async function refreshRooms(options?: { preferredSelectedRoomId?: string | null }) {
    const nextRooms = await api.listRooms()
    setRooms(nextRooms)
    setSelectedRoomId((current) => {
      const preferred = options?.preferredSelectedRoomId ?? current
      if (preferred && nextRooms.some((room) => room.id === preferred)) return preferred
      return nextRooms[0]?.id ?? null
    })
    return nextRooms
  }

  async function refreshCalendarConnections(options?: { preferredSelectedConnectionIds?: string[] | null }) {
    const nextConnections = await api.listCalendarConnections()
    setCalendarConnections(nextConnections)
    setSelectedCalendarConnectionIds((current) => {
      const preferred = options?.preferredSelectedConnectionIds ?? current
      const valid = (preferred ?? []).filter((id) => nextConnections.some((connection) => connection.id === id))
      if (valid.length > 0) return valid
      return nextConnections[0] ? [nextConnections[0].id] : []
    })
    return nextConnections
  }

  async function refreshTasks(options?: { preferredSelectedTaskId?: string | null }) {
    const nextTasks = await api.listTasks()
    setTasks(nextTasks)
    setSelectedTaskId((current) => {
      const preferred = options?.preferredSelectedTaskId ?? current
      if (preferred && nextTasks.some((task) => task.id === preferred)) {
        return preferred
      }
      return nextTasks[0]?.id ?? null
    })
    return nextTasks
  }

  async function refreshCalendarEvents(connectionIds: string[]) {
    if (connectionIds.length === 0) {
      setCalendarEvents([])
      return []
    }
    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + 30)
    const grouped = await Promise.all(
      connectionIds.map((connectionId) => api.listCalendarEvents(connectionId, start.toISOString(), end.toISOString())),
    )
    const nextEvents = grouped
      .flat()
      .sort((left, right) => {
        const byStart = left.start_at.localeCompare(right.start_at)
        return byStart !== 0 ? byStart : left.title.localeCompare(right.title)
      })
    setCalendarEvents(nextEvents)
    return nextEvents
  }

  async function createNoteLocalFirst(title: string, folder?: string, markdown?: string) {
    const noteMarkdown = markdown ?? '# New note\n\nStart writing.'
    if (getConnectivityState()) {
      return api.createNote(title, folder, noteMarkdown)
    }
    if (!session) {
      throw new Error('You must be signed in to create notes offline.')
    }
    const now = new Date().toISOString()
    const noteId = createEntityId()
    const noteDocument = noteDocumentFromMarkdown(noteId, noteMarkdown, session.user.id, null)
    const note: Note = {
      id: noteId,
      object_id: `note:${noteId}`,
      namespace: {
        root: `users/${session.user.id}/synced`,
        owner_id: session.user.id,
        kind: 'synced',
        label: 'Synced',
      },
      visibility: 'private',
      shared_user_ids: [],
      title,
      folder: folder || 'Inbox',
      markdown: noteMarkdown,
      rendered_html: '',
      document: noteDocument,
      forked_from_note_id: null,
      conflict_tag: null,
      revision: 1,
      created_at: now,
      updated_at: now,
      author_id: session.user.id,
      last_editor_id: session.user.id,
    }
    await queueSyncOperation({
      kind: 'create_note',
      client_generated_id: note.id,
      title: note.title,
      folder: note.folder,
      markdown: note.markdown,
    })
    return note
  }

  async function updateNoteLocalFirst(note: Note, payload: { markdown: string; folder: string }, _options?: { keepalive?: boolean }) {
    const actorId = session?.user.id ?? note.last_editor_id
    const nextDocument = noteDocumentFromMarkdown(note.id, payload.markdown, actorId, note.document)
    const updated: Note = {
      ...note,
      markdown: payload.markdown,
      folder: payload.folder,
      document: nextDocument,
      revision: note.revision + 1,
      updated_at: new Date().toISOString(),
      last_editor_id: session?.user.id ?? note.last_editor_id,
    }
    if (getConnectivityState()) {
      const response = await api.pushNoteOperations(
        note.id,
        buildReplaceDocumentBatch(
          note,
          updated,
          payload.markdown,
          actorId,
          clientIdRef.current,
        ),
      )
      if (!response.applied) {
        throw new Error('note forked due to conflicting block edits')
      }
      return response.note
    }
    await queueSyncOperation({
      kind: 'apply_note_operations',
      id: note.id,
      batch: buildReplaceDocumentBatch(note, updated, updated.markdown, actorId, clientIdRef.current),
    })
    return updated
  }

  async function deleteNoteLocalFirst(note: Note) {
    if (getConnectivityState()) {
      await api.deleteNote(note.id)
      return
    }
    await queueSyncOperation({ kind: 'delete_note', id: note.id })
  }

  async function createLocalCalendarConnectionLocalFirst(title: string) {
    if (getConnectivityState()) {
      return api.createLocalCalendarConnection(title)
    }
    if (!session) {
      throw new Error('You must be signed in to create calendars offline.')
    }
    const now = new Date().toISOString()
    const connection: CalendarConnection = {
      id: createEntityId(),
      owner_id: session.user.id,
      owner_display_name: session.user.display_name,
      title,
      provider: 'sweet',
      external_id: '',
      calendar_id: `sweet:${title.toLowerCase().replace(/\s+/g, '-')}`,
      account_label: 'Home Suite Home calendar',
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      ics_url: null,
      created_at: now,
      updated_at: now,
    }
    await queueSyncOperation({ kind: 'create_local_calendar', client_generated_id: connection.id, title })
    return connection
  }

  async function renameCalendarConnectionLocalFirst(id: string, title: string) {
    if (getConnectivityState()) {
      return api.updateCalendarConnection(id, title)
    }
    const current = calendarConnections.find((connection) => connection.id === id)
    if (!current) {
      throw new Error('Calendar not found.')
    }
    const updated: CalendarConnection = { ...current, title, updated_at: new Date().toISOString() }
    await queueSyncOperation({ kind: 'rename_calendar', id, title })
    return updated
  }

  async function deleteCalendarConnectionLocalFirst(id: string) {
    if (getConnectivityState()) {
      await api.deleteCalendarConnection(id)
      return
    }
    await queueSyncOperation({ kind: 'delete_calendar', id })
  }

  async function createCalendarEventLocalFirst(
    connectionId: string,
    payload: { title: string; description: string; location: string; start_at: string; end_at: string; all_day: boolean },
  ) {
    if (getConnectivityState()) {
      return api.createCalendarEvent(connectionId, payload)
    }
    const event: CalendarEvent = {
      id: createEntityId(),
      connection_id: connectionId,
      title: payload.title,
      description: payload.description,
      location: payload.location,
      start_at: payload.start_at,
      end_at: payload.end_at,
      all_day: payload.all_day,
      source_url: '',
      organizer: session?.user.display_name ?? 'You',
      updated_at: new Date().toISOString(),
    }
    await queueSyncOperation({ kind: 'create_calendar_event', client_generated_id: event.id, connection_id: connectionId, ...payload })
    return event
  }

  async function updateCalendarEventLocalFirst(
    connectionId: string,
    eventId: string,
    payload: { title: string; description: string; location: string; start_at: string; end_at: string; all_day: boolean },
  ) {
    if (getConnectivityState()) {
      return api.updateCalendarEvent(connectionId, eventId, payload)
    }
    const current = calendarEvents.find((event) => event.id === eventId)
    if (!current) {
      throw new Error('Event not found.')
    }
    const updated: CalendarEvent = { ...current, ...payload, updated_at: new Date().toISOString() }
    await queueSyncOperation({ kind: 'update_calendar_event', connection_id: connectionId, event_id: eventId, ...payload })
    return updated
  }

  async function deleteCalendarEventLocalFirst(connectionId: string, eventId: string) {
    if (getConnectivityState()) {
      await api.deleteCalendarEvent(connectionId, eventId)
      return
    }
    await queueSyncOperation({ kind: 'delete_calendar_event', connection_id: connectionId, event_id: eventId })
  }

  async function createTaskLocalFirst(payload: {
    title: string
    description: string
    start_at?: string | null
    end_at?: string | null
    all_day: boolean
    calendar_connection_id?: string | null
  }) {
    if (getConnectivityState()) {
      return api.createTask(payload)
    }
    if (!session) {
      throw new Error('You must be signed in to create tasks offline.')
    }
    const now = new Date().toISOString()
    const task: TaskItem = {
      id: createEntityId(),
      owner_id: session.user.id,
      owner_display_name: session.user.display_name,
      title: payload.title,
      description: payload.description,
      status: 'open',
      start_at: payload.start_at ?? null,
      end_at: payload.end_at ?? null,
      all_day: payload.all_day,
      calendar_connection_id: payload.calendar_connection_id ?? null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    }
    await queueSyncOperation({ kind: 'create_task', client_generated_id: task.id, ...payload })
    return task
  }

  async function updateTaskLocalFirst(
    id: string,
    payload: {
      title: string
      description: string
      status: 'open' | 'completed'
      start_at?: string | null
      end_at?: string | null
      all_day: boolean
      calendar_connection_id?: string | null
    },
  ) {
    if (getConnectivityState()) {
      return api.updateTask(id, payload)
    }
    const current = tasks.find((task) => task.id === id)
    if (!current) {
      throw new Error('Task not found.')
    }
    const updated: TaskItem = {
      ...current,
      ...payload,
      updated_at: new Date().toISOString(),
      completed_at: payload.status === 'completed' ? current.completed_at ?? new Date().toISOString() : null,
    }
    await queueSyncOperation({ kind: 'update_task', id, ...payload })
    return updated
  }

  async function deleteTaskLocalFirst(id: string) {
    if (getConnectivityState()) {
      await api.deleteTask(id)
      return
    }
    await queueSyncOperation({ kind: 'delete_task', id })
  }

  async function createDiagramLocalFirst(title: string, xml?: string) {
    if (getConnectivityState()) {
      return api.createDiagram(title, xml)
    }
    if (!session) {
      throw new Error('You must be signed in to create diagrams offline.')
    }
    const now = new Date().toISOString()
    const diagram: Diagram = {
      id: createEntityId(),
      title,
      xml: xml ?? createEmptyDrawioDiagramXml(),
      revision: 1,
      created_at: now,
      updated_at: now,
      author_id: session.user.id,
      last_editor_id: session.user.id,
    }
    await queueSyncOperation({
      kind: 'create_diagram',
      client_generated_id: diagram.id,
      title: diagram.title,
      xml: diagram.xml,
    })
    return diagram
  }

  async function updateDiagramLocalFirst(diagram: Diagram, xml: string) {
    if (getConnectivityState()) {
      return api.updateDiagram({ ...diagram, xml })
    }
    const updated: Diagram = {
      ...diagram,
      xml,
      revision: diagram.revision + 1,
      updated_at: new Date().toISOString(),
      last_editor_id: session?.user.id ?? diagram.last_editor_id,
    }
    await queueSyncOperation({
      kind: 'update_diagram',
      id: diagram.id,
      title: updated.title,
      xml: updated.xml,
      revision: diagram.revision,
    })
    return updated
  }

  async function createMessageLocalFirst(roomId: string, body: string) {
    if (getConnectivityState()) {
      return api.createMessage(roomId, body)
    }
    if (!session) {
      throw new Error('You must be signed in to send messages offline.')
    }
    const message: Message = {
      id: createEntityId(),
      room_id: roomId,
      author: session.user,
      body,
      created_at: new Date().toISOString(),
      reactions: [],
    }
    await queueSyncOperation({
      kind: 'create_message',
      client_generated_id: message.id,
      room_id: roomId,
      body,
    })
    return message
  }

  async function toggleMessageReactionLocalFirst(roomId: string, messageId: string, emoji: string) {
    if (getConnectivityState()) {
      return api.toggleMessageReaction(roomId, messageId, emoji)
    }
    if (!session) {
      throw new Error('You must be signed in to react offline.')
    }
    const current = messages.find((entry) => entry.id === messageId)
    if (!current) {
      throw new Error('Message not found.')
    }
    const nextReactions = current.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      user_ids: [...reaction.user_ids],
    }))
    const existing = nextReactions.find((reaction) => reaction.emoji === emoji)
    if (existing) {
      const index = existing.user_ids.indexOf(session.user.id)
      if (index >= 0) {
        existing.user_ids.splice(index, 1)
      } else {
        existing.user_ids.push(session.user.id)
      }
    } else {
      nextReactions.push({ emoji, user_ids: [session.user.id] })
    }
    const filtered = nextReactions.filter((reaction) => reaction.user_ids.length > 0).sort((left, right) => left.emoji.localeCompare(right.emoji))
    const updated: Message = { ...current, reactions: filtered }
    await queueSyncOperation({ kind: 'toggle_message_reaction', room_id: roomId, message_id: messageId, emoji })
    return updated
  }

  function showSyncNotice(tone: 'offline' | 'error', message: string, timeoutMs = 4500) {
    if (syncNoticeTimeoutRef.current != null) {
      window.clearTimeout(syncNoticeTimeoutRef.current)
      syncNoticeTimeoutRef.current = null
    }
    setSyncNotice({ tone, message })
    if (timeoutMs > 0) {
      syncNoticeTimeoutRef.current = window.setTimeout(() => {
        setSyncNotice((current) => (current?.message === message ? null : current))
        syncNoticeTimeoutRef.current = null
      }, timeoutMs)
    }
  }

  async function refreshQueuedSyncConflicts() {
    const nextConflicts = await listQueuedSyncConflicts()
    setSyncConflicts(nextConflicts)
    if (nextConflicts.length === 0) {
      setSyncConflictsOpen(false)
    }
    return nextConflicts
  }

  async function uploadVoiceMemoLocalFirst(title: string, file: Blob, browserTranscript?: string) {
    if (getConnectivityState()) {
      const memo = await api.uploadVoiceMemo(title, file, browserTranscript)
      const nextMemos = await api.listVoiceMemos()
      setMemos(nextMemos)
      await refreshFilesTree()
      showActionNotice(`Uploaded audio: ${title}`)
      return memo
    }

    const pendingUpload = {
      id: createEntityId(),
      title,
      filename: file instanceof File ? file.name : 'memo.webm',
      mime_type: file.type || 'audio/webm',
      size_bytes: file.size,
      browser_transcript: browserTranscript?.trim() || null,
      created_at: new Date().toISOString(),
      blob: file,
    }
    await offlineDb.savePendingVoiceUpload(pendingUpload)
    const memo = pendingVoiceUploadToMemo(pendingUpload)
    setMemos((current) => upsertVoiceMemo(current, memo))
    setFilesTree((current) => insertFileTreeNode(current, pendingVoiceUploadToFileNode(pendingUpload)))
    showActionNotice(`Queued audio upload: ${title}`)
    return memo
  }

  async function renamePendingVoiceUploadLocalFirst(memoId: string, title: string) {
    const pendingUpload = (await offlineDb.listPendingVoiceUploads()).find((entry) => entry.id === memoId)
    if (!pendingUpload) {
      throw new Error('Pending upload could not be found.')
    }
    await offlineDb.savePendingVoiceUpload({ ...pendingUpload, title })
    const updated = pendingVoiceUploadToMemo({ ...pendingUpload, title })
    setMemos((current) => current.map((entry) => (entry.id === memoId ? updated : entry)))
    showActionNotice(`Renamed memo to ${title}`)
    return updated
  }

  async function deletePendingVoiceUploadLocalFirst(memoId: string) {
    await offlineDb.removePendingVoiceUpload(memoId)
    const memo = memosRef.current.find((entry) => entry.id === memoId)
    setMemos((current) => current.filter((entry) => entry.id !== memoId))
    setFilesTree((current) => removeFileTreeNode(current, memo?.audio_path ?? '').nodes)
    setSelectedVoiceMemoId((current) => (current === memoId ? (memosRef.current.find((entry) => entry.id !== memoId)?.id ?? null) : current))
    showActionNotice(`Deleted memo: ${memo?.title || 'Untitled memo'}`)
  }

  async function uploadManagedFileLocalFirst(path: string, file: Blob, filename: string) {
    if (getConnectivityState()) {
      const node = await api.uploadFile(path, file, filename)
      await refreshFilesTree()
      showActionNotice(`Uploaded file: ${filename}`)
      return node
    }

    const pendingUpload = {
      id: createEntityId(),
      path,
      filename,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      created_at: new Date().toISOString(),
      blob: file,
    }
    await offlineDb.savePendingManagedUpload(pendingUpload)
    const node = pendingManagedUploadToFileNode(pendingUpload)
    setFilesTree((current) => insertFileTreeNode(current, node))
    showActionNotice(`Queued file upload: ${filename}`)
    return node
  }

  async function flushPendingVoiceUploads() {
    if (!getConnectivityState()) {
      return
    }
    const pendingUploads = await offlineDb.listPendingVoiceUploads()
    if (pendingUploads.length === 0) {
      return
    }
    for (const pendingUpload of pendingUploads) {
      await api.uploadVoiceMemo(
        pendingUpload.title,
        pendingUpload.blob,
        pendingUpload.browser_transcript?.trim() || undefined,
      )
      await offlineDb.removePendingVoiceUpload(pendingUpload.id)
    }
  }

  async function flushPendingManagedUploads() {
    if (!getConnectivityState()) {
      return
    }
    const pendingUploads = await offlineDb.listPendingManagedUploads()
    if (pendingUploads.length === 0) {
      return
    }
    for (const pendingUpload of pendingUploads) {
      await api.uploadFile(pendingUpload.path, pendingUpload.blob, pendingUpload.filename)
      await offlineDb.removePendingManagedUpload(pendingUpload.id)
    }
  }

  async function createManagedFolderLocalFirst(path: string) {
    if (getConnectivityState()) {
      return api.createDriveFolder(path)
    }

    const node = createOptimisticDirectoryNode(path)
    setFilesTree((current) => insertFileTreeNode(current, node))
    await queueSyncOperation({ kind: 'create_managed_folder', path })
    return node
  }

  async function moveManagedPathLocalFirst(sourcePath: string, destinationDir: string) {
    if (getConnectivityState()) {
      return api.moveFile(sourcePath, destinationDir)
    }
    const now = new Date().toISOString()
    let moved: FileNode | null = null

    if (sourcePath === 'drive' || sourcePath.startsWith('drive/')) {
      setFilesTree((current) => {
        const result = moveFileTreeNode(current, sourcePath, destinationDir)
        moved = result.moved
        return result.nodes
      })
      if (!moved) {
        throw new Error('Could not find the item to move.')
      }
    } else if (sourcePath === 'notes' || sourcePath.startsWith('notes/')) {
      if (sourcePath.endsWith('.md')) {
        const noteId = noteIdFromPath(sourcePath)
        const current = noteId ? notesRef.current.find((entry) => entry.id === noteId) : null
        if (!current) throw new Error('Note not found.')
        const nextFolder = normalizeFolderPath(destinationDir.replace(/^notes\/?/, '') || 'Inbox')
        const updated: Note = {
          ...current,
          folder: nextFolder,
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: session?.user.id ?? current.last_editor_id,
        }
        setNotes((entries) => entries.map((entry) => (entry.id === updated.id ? updated : entry)))
        rememberPersistedNotes(notesRef.current.map((entry) => (entry.id === updated.id ? updated : entry)))
        setCustomFolders((currentFolders) => mergeFolderPaths(currentFolders, [current.folder || 'Inbox', updated.folder || 'Inbox']))
        if (selectedNoteIdRef.current === updated.id) {
          setSelectedFolderPath(nextFolder)
        }
        const nextPath = noteManagedFilePath(updated)
        setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, sourcePath, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.markdown.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          moved = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = normalizeFolderPath(sourcePath.replace(/^notes\/?/, '') || 'Inbox')
        const folderName = sourceFolder.split('/').pop() || sourceFolder
        const targetFolder = normalizeFolderPath(destinationDir.replace(/^notes\/?/, '') || 'Inbox')
        const rebasedRoot = normalizeFolderPath(targetFolder === 'Inbox' ? folderName : `${targetFolder}/${folderName}`)
        const rebaseFolderPath = (folderPath: string) => {
          const normalized = normalizeFolderPath(folderPath || 'Inbox')
          if (normalized === sourceFolder) return rebasedRoot
          if (normalized.startsWith(`${sourceFolder}/`)) {
            return normalizeFolderPath(`${rebasedRoot}/${normalized.slice(sourceFolder.length + 1)}`)
          }
          return normalized
        }
        const nextNotes = notesRef.current.map((note) => {
          const normalized = normalizeFolderPath(note.folder || 'Inbox')
          if (normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)) return note
          return {
            ...note,
            folder: rebaseFolderPath(note.folder || 'Inbox'),
            revision: note.revision + 1,
            updated_at: now,
            last_editor_id: session?.user.id ?? note.last_editor_id,
          }
        })
        setNotes(nextNotes)
        rememberPersistedNotes(nextNotes)
        setCustomFolders((currentFolders) =>
          mergeFolderPaths(
            currentFolders.map((folderPath) => {
              const normalized = normalizeFolderPath(folderPath)
              if (normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)) {
                return rebaseFolderPath(normalized)
              }
              return normalized
            }),
            nextNotes.map((note) => note.folder || 'Inbox'),
          ),
        )
        if (
          selectedFolderPathRef.current === sourceFolder ||
          selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)
        ) {
          setSelectedFolderPath(rebaseFolderPath(selectedFolderPathRef.current))
        }
        setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      }
    } else if (sourcePath === 'diagrams' || sourcePath.startsWith('diagrams/')) {
      if (sourcePath.endsWith('.drawio')) {
        const diagramId = diagramIdFromManagedPath(sourcePath)
        const current = diagramId ? diagramsRef.current.find((entry) => entry.id === diagramId) : null
        if (!current) throw new Error('Diagram not found.')
        const folderSuffix = destinationDir.replace(/^diagrams\/?/, '')
        const nextTitle = normalizeDiagramTitlePath(
          folderSuffix ? `Diagrams/${folderSuffix}/${diagramDisplayName(current.title)}` : `Diagrams/${diagramDisplayName(current.title)}`,
        )
        const updated: Diagram = {
          ...current,
          title: nextTitle,
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: session?.user.id ?? current.last_editor_id,
        }
        const nextDiagrams = diagramsRef.current.map((entry) => (entry.id === updated.id ? updated : entry))
        setDiagrams(nextDiagrams)
        setCustomDiagramFolders((currentFolders) =>
          Array.from(new Set([...currentFolders, normalizeDiagramFolderPath(current.title), normalizeDiagramFolderPath(updated.title)])).sort((left, right) => left.localeCompare(right)),
        )
        const nextPath = diagramManagedFilePath(updated)
        setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, sourcePath, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.xml.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          moved = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = sourcePath.replace(/^diagrams\/?/, '')
        const folderName = sourceFolder.split('/').pop() || sourceFolder
        const targetFolder = destinationDir.replace(/^diagrams\/?/, '')
        const rebasedRoot = targetFolder ? `${targetFolder}/${folderName}` : folderName
        const rebaseTitle = (title: string) => {
          if (title === sourceFolder) return rebasedRoot
          if (title.startsWith(`${sourceFolder}/`)) {
            return `${rebasedRoot}/${title.slice(sourceFolder.length + 1)}`
          }
          return title
        }
        const nextDiagrams = diagramsRef.current.map((diagram) => {
          if (diagram.title !== sourceFolder && !diagram.title.startsWith(`${sourceFolder}/`)) return diagram
          return {
            ...diagram,
            title: rebaseTitle(diagram.title),
            revision: diagram.revision + 1,
            updated_at: now,
            last_editor_id: session?.user.id ?? diagram.last_editor_id,
          }
        })
        setDiagrams(nextDiagrams)
        setCustomDiagramFolders((currentFolders) =>
          Array.from(
            new Set(
              currentFolders.map((folderPath) => {
                if (folderPath === sourceFolder) return rebasedRoot
                if (folderPath.startsWith(`${sourceFolder}/`)) {
                  return `${rebasedRoot}/${folderPath.slice(sourceFolder.length + 1)}`
                }
                return folderPath
              }),
            ),
          ).sort((left, right) => left.localeCompare(right)),
        )
        setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      }
    } else if (sourcePath === 'voice' || sourcePath.startsWith('voice/')) {
      if (sourcePath.includes('.') && !sourcePath.endsWith('/')) {
        const current = memosRef.current.find((entry) => entry.audio_path === sourcePath)
        if (!current) throw new Error('Voice memo not found.')
        const leaf = sourcePath.split('/').pop() ?? current.audio_path
        const nextPath = `${destinationDir}/${leaf}`
        const nextMemos = memosRef.current.map((entry) =>
          entry.id === current.id ? { ...entry, audio_path: nextPath, updated_at: now } : entry,
        )
        setMemos(nextMemos)
        setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      } else {
        const nextMemos = memosRef.current.map((memo) => {
          if (memo.audio_path !== sourcePath && !memo.audio_path.startsWith(`${sourcePath}/`)) return memo
          return {
            ...memo,
            audio_path: memo.audio_path.replace(sourcePath, `${destinationDir}/${sourcePath.split('/').pop() || ''}`),
            updated_at: now,
          }
        })
        setMemos(nextMemos)
        setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      }
    } else {
      throw new Error('Managed path is not supported for offline move.')
    }

    if (!moved) throw new Error('Could not find the item to move.')

    await queueSyncOperation({ kind: 'move_managed_path', source_path: sourcePath, destination_dir: destinationDir })
    return moved
  }

  async function renameManagedPathLocalFirst(path: string, newName: string) {
    if (getConnectivityState()) {
      return api.renameFile(path, newName)
    }
    const now = new Date().toISOString()
    let renamed: FileNode | null = null

    if (path === 'drive' || path.startsWith('drive/')) {
      setFilesTree((current) => {
        const result = renameFileTreeNode(current, path, newName)
        renamed = result.renamed
        return result.nodes
      })
    } else if (path === 'notes' || path.startsWith('notes/')) {
      if (path.endsWith('.md')) {
        const noteId = noteIdFromPath(path)
        const current = noteId ? notesRef.current.find((entry) => entry.id === noteId) : null
        if (!current) throw new Error('Note not found.')
        const updated: Note = {
          ...current,
          title: newName.trim(),
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: session?.user.id ?? current.last_editor_id,
        }
        const nextNotes = notesRef.current.map((entry) => (entry.id === updated.id ? updated : entry))
        setNotes(nextNotes)
        rememberPersistedNotes(nextNotes)
        const nextPath = noteManagedFilePath(updated)
        setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, path, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.markdown.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          renamed = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = normalizeFolderPath(path.replace(/^notes\/?/, '') || 'Inbox')
        const leaf = normalizeFolderPath(sourceFolder).split('/').filter(Boolean).pop() ?? sourceFolder
        const destinationFolder = normalizeFolderPath(
          [...sourceFolder.split('/').filter(Boolean).slice(0, -1), newName.trim()].join('/'),
        )
        const rebaseFolderPath = (folderPath: string) => {
          const normalized = normalizeFolderPath(folderPath || 'Inbox')
          if (normalized === sourceFolder) return destinationFolder
          if (normalized.startsWith(`${sourceFolder}/`)) {
            return normalizeFolderPath(`${destinationFolder}/${normalized.slice(sourceFolder.length + 1)}`)
          }
          return normalized
        }
        const nextNotes = notesRef.current.map((note) => {
          const normalized = normalizeFolderPath(note.folder || 'Inbox')
          if (normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)) return note
          return {
            ...note,
            folder: rebaseFolderPath(note.folder || 'Inbox'),
            revision: note.revision + 1,
            updated_at: now,
            last_editor_id: session?.user.id ?? note.last_editor_id,
          }
        })
        setNotes(nextNotes)
        rememberPersistedNotes(nextNotes)
        setCustomFolders((currentFolders) =>
          mergeFolderPaths(
            currentFolders.map((folderPath) => {
              const normalized = normalizeFolderPath(folderPath)
              if (normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)) {
                return rebaseFolderPath(normalized)
              }
              return normalized
            }),
            nextNotes.map((note) => note.folder || 'Inbox'),
          ),
        )
        if (
          selectedFolderPathRef.current === sourceFolder ||
          selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)
        ) {
          setSelectedFolderPath(rebaseFolderPath(selectedFolderPathRef.current))
        }
        setFilesTree((tree) => {
          const result = renameFileTreeNode(tree, path, leaf === sourceFolder ? newName.trim() : newName.trim())
          renamed = result.renamed
          return result.nodes
        })
      }
    } else if (path === 'diagrams' || path.startsWith('diagrams/')) {
      if (path.endsWith('.drawio')) {
        const diagramId = diagramIdFromManagedPath(path)
        const current = diagramId ? diagramsRef.current.find((entry) => entry.id === diagramId) : null
        if (!current) throw new Error('Diagram not found.')
        const updated: Diagram = {
          ...current,
          title: normalizeDiagramTitlePath(
            `${normalizeDiagramFolderPath(current.title)}/${newName.trim()}`,
          ),
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: session?.user.id ?? current.last_editor_id,
        }
        const nextDiagrams = diagramsRef.current.map((entry) => (entry.id === updated.id ? updated : entry))
        setDiagrams(nextDiagrams)
        const nextPath = diagramManagedFilePath(updated)
        setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, path, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.xml.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          renamed = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = path.replace(/^diagrams\/?/, '')
        const parts = sourceFolder.split('/').filter(Boolean)
        const destinationFolder = [...parts.slice(0, -1), newName.trim()].join('/')
        const nextDiagrams = diagramsRef.current.map((diagram) => {
          if (diagram.title !== sourceFolder && !diagram.title.startsWith(`${sourceFolder}/`)) return diagram
          return {
            ...diagram,
            title: diagram.title.replace(sourceFolder, destinationFolder),
            revision: diagram.revision + 1,
            updated_at: now,
            last_editor_id: session?.user.id ?? diagram.last_editor_id,
          }
        })
        setDiagrams(nextDiagrams)
        setCustomDiagramFolders((currentFolders) =>
          Array.from(
            new Set(
              currentFolders.map((folderPath) => {
                if (folderPath === sourceFolder) return destinationFolder
                if (folderPath.startsWith(`${sourceFolder}/`)) {
                  return `${destinationFolder}/${folderPath.slice(sourceFolder.length + 1)}`
                }
                return folderPath
              }),
            ),
          ).sort((left, right) => left.localeCompare(right)),
        )
        setFilesTree((tree) => {
          const result = renameFileTreeNode(tree, path, newName.trim())
          renamed = result.renamed
          return result.nodes
        })
      }
    } else if (path === 'voice' || path.startsWith('voice/')) {
      const nextPath = `${deriveParentPath(path) ?? 'voice'}/${newName.trim()}`
      const nextMemos = memosRef.current.map((memo) => {
        if (memo.audio_path !== path && !memo.audio_path.startsWith(`${path}/`)) return memo
        return {
          ...memo,
          audio_path: memo.audio_path.replace(path, nextPath),
          updated_at: now,
        }
      })
      setMemos(nextMemos)
      setFilesTree((tree) => {
        const result = renameFileTreeNode(tree, path, newName.trim())
        renamed = result.renamed
        return result.nodes
      })
    } else {
      throw new Error('Managed path is not supported for offline rename.')
    }
    if (!renamed) throw new Error('Could not find the item to rename.')

    await queueSyncOperation({ kind: 'rename_managed_path', path, new_name: newName })
    return renamed
  }

  async function deleteManagedPathLocalFirst(path: string) {
    if (getConnectivityState()) {
      await api.deleteFile(path)
      return
    }

    if (path === 'drive' || path.startsWith('drive/')) {
      setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else if (path === 'notes' || path.startsWith('notes/')) {
      if (path.endsWith('.md')) {
        const noteId = noteIdFromPath(path)
        if (!noteId) throw new Error('Note not found.')
        const nextNotes = notesRef.current.filter((entry) => entry.id !== noteId)
        setNotes(nextNotes)
        rememberPersistedNotes(nextNotes)
        setSelectedNoteId((current) => (current && nextNotes.some((note) => note.id === current) ? current : null))
      } else {
        const sourceFolder = normalizeFolderPath(path.replace(/^notes\/?/, '') || 'Inbox')
        const nextNotes = notesRef.current.filter((note) => {
          const normalized = normalizeFolderPath(note.folder || 'Inbox')
          return normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)
        })
        setNotes(nextNotes)
        rememberPersistedNotes(nextNotes)
        setCustomFolders((current) =>
          current.filter((folderPath) => {
            const normalized = normalizeFolderPath(folderPath)
            return normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)
          }),
        )
        if (
          selectedFolderPathRef.current === sourceFolder ||
          selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)
        ) {
          setSelectedFolderPath('Inbox')
        }
        setSelectedNoteId((current) => (current && nextNotes.some((note) => note.id === current) ? current : null))
      }
      setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else if (path === 'diagrams' || path.startsWith('diagrams/')) {
      if (path.endsWith('.drawio')) {
        const diagramId = diagramIdFromManagedPath(path)
        if (!diagramId) throw new Error('Diagram not found.')
        const nextDiagrams = diagramsRef.current.filter((entry) => entry.id !== diagramId)
        setDiagrams(nextDiagrams)
        setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      } else {
        const sourceFolder = path.replace(/^diagrams\/?/, '')
        const nextDiagrams = diagramsRef.current.filter(
          (diagram) => diagram.title !== sourceFolder && !diagram.title.startsWith(`${sourceFolder}/`),
        )
        setDiagrams(nextDiagrams)
        setCustomDiagramFolders((current) =>
          current.filter((folderPath) => folderPath !== sourceFolder && !folderPath.startsWith(`${sourceFolder}/`)),
        )
        setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      }
      setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else if (path === 'voice' || path.startsWith('voice/')) {
      const nextMemos = memosRef.current.filter(
        (memo) => memo.audio_path !== path && !memo.audio_path.startsWith(`${path}/`),
      )
      setMemos(nextMemos)
      setSelectedVoiceMemoId((current) =>
        current && nextMemos.some((memo) => memo.id === current) ? current : null,
      )
      setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else {
      throw new Error('Managed path is not supported for offline delete.')
    }

    await queueSyncOperation({ kind: 'delete_managed_path', path })
  }

  const orderedNavItems = useMemo(() => {
    const byPath = new Map(NAV_ITEMS.map((item) => [item.path, item]))
    const visibleItems = NAV_ITEMS.filter((item) => canAccessRoute(item.path))
    return navOrder
      .map((path) => byPath.get(path))
      .filter((item): item is typeof NAV_ITEMS[number] => Boolean(item))
      .concat(visibleItems.filter((item) => !navOrder.includes(item.path)))
      .filter((item) => canAccessRoute(item.path))
  }, [canAccessRoute, navOrder])
  const comsUnreadCount = useMemo(
    () => Object.values(roomUnreadCounts).reduce((total, count) => total + count, 0),
    [roomUnreadCounts],
  )
  const effectiveAppearance = useMemo(() => {
    if (adminSettings?.enforce_org_appearance) {
      return {
        ...appearance,
        fontFamily: adminSettings.org_font_family,
        accent: adminSettings.org_accent,
        background: adminSettings.org_background,
        disableGradients: adminSettings.org_disable_gradients,
        gradientTopLeft: adminSettings.org_gradient_top_left,
        gradientTopRight: adminSettings.org_gradient_top_right,
        gradientBottomLeft: adminSettings.org_gradient_bottom_left,
        gradientBottomRight: adminSettings.org_gradient_bottom_right,
        gradientStrength: adminSettings.org_gradient_strength,
        pageGutter: adminSettings.org_page_gutter,
        radius: adminSettings.org_radius,
      }
    }
    return appearance
  }, [appearance, adminSettings])
  const appearanceStyle = useMemo(() => buildAppearanceStyle(effectiveAppearance), [effectiveAppearance])

  useEffect(() => {
    const pathname = window.location.pathname
    if ((pathname === '/chat' || pathname === '/calls') && route === '/coms') {
      window.history.replaceState({}, '', '/coms')
    }
  }, [route])

  useEffect(() => {
    if (authMode !== 'ready') return
    if (canAccessRoute(route)) return
    const routeOptions: RoutePath[] = [...orderedNavItems.map((item) => item.path), '/settings']
    const fallback = routeOptions.find((path) => canAccessRoute(path))
    if (fallback && fallback !== route) {
      void navigate(fallback)
    }
  }, [authMode, canAccessRoute, orderedNavItems, route])

  useEffect(() => {
    const handlePopState = () => {
      setRoute(normalizeRoute(window.location.pathname))
      setLocationSearch(window.location.search)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    void refreshQueuedSyncConflicts()
  }, [])

  useEffect(() => {
    if (!fileColumnViewOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (fileColumnViewRef.current?.contains(event.target as Node)) return
      setFileColumnViewOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [fileColumnViewOpen])

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId
  }, [selectedRoomId])

  useEffect(() => {
    routeRef.current = route
  }, [route])

  useEffect(() => {
    sessionUserIdRef.current = session?.user.id ?? null
  }, [session?.user.id])

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId
  }, [selectedNoteId])

  useEffect(() => {
    selectedNoteRef.current = selectedNote
  }, [selectedNote])

  useEffect(() => {
    if (authMode !== 'ready' || !session || !selectedNoteId) {
      return
    }

    let cancelled = false
    void api
      .openNoteSession(selectedNoteId, clientIdRef.current)
      .then((response) => {
        if (cancelled) return
        noteSessionIdRef.current = response.sessions[0]?.session_id ?? null
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error)
        }
      })

    return () => {
      cancelled = true
      const sessionId = noteSessionIdRef.current
      noteSessionIdRef.current = null
      if (sessionId) {
        void api.closeNoteSession(selectedNoteId, sessionId).catch((error) => {
          console.error(error)
        })
      }
    }
  }, [authMode, selectedNoteId, session])

  useEffect(() => {
    noteEditorModeRef.current = noteEditorMode
  }, [noteEditorMode])

  useEffect(() => () => stopRecordingLevelTracking(), [])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    diagramsRef.current = diagrams
  }, [diagrams])

  useEffect(() => {
    memosRef.current = memos
  }, [memos])

  useEffect(() => {
    selectedFolderPathRef.current = selectedFolderPath
  }, [selectedFolderPath])

  useEffect(() => {
    noteDraftRef.current = noteDraft
  }, [noteDraft])

  useEffect(() => {
    selectedNoteDocumentRef.current = selectedNoteDocument
  }, [selectedNoteDocument])

  useEffect(() => {
    rtcConfigRef.current = rtcConfig
  }, [rtcConfig])

  useEffect(() => {
    callJoinedRef.current = callJoined
  }, [callJoined])

  useEffect(() => {
    activeCallRoomIdRef.current = activeCallRoomId
  }, [activeCallRoomId])

  useEffect(() => {
    if (!actionNotice) return
    const timeout = window.setTimeout(() => setActionNotice(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [actionNotice])

  useEffect(
    () => () => {
      if (noteDraftBroadcastTimeoutRef.current) {
        window.clearTimeout(noteDraftBroadcastTimeoutRef.current)
      }
      if (noteLiveSaveTimeoutRef.current) {
        window.clearTimeout(noteLiveSaveTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!noteHasPendingPersistence()) return
      if (currentNoteIsDirty()) {
        void saveNote({ quiet: true, keepalive: true })
      }
      event.preventDefault()
      event.returnValue = ''
    }

    function onPageHide() {
      if (!currentNoteIsDirty()) return
      void saveNote({ quiet: true, keepalive: true })
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [noteSaveState, noteEditorMode, selectedFolderPath, route])

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!isNativePlatform()) return
    void serverBaseStore.get().then((storedUrl) => {
      if (storedUrl) {
        setServerUrl(storedUrl)
      }
    })
  }, [])

  useEffect(
    () =>
      subscribeToConnectivity((online) => {
        if (!online) {
          showSyncNotice('offline', 'Offline mode. Changes will sync when your connection returns.')
        }
      }),
    [],
  )

  useEffect(
    () => () => {
      if (syncNoticeTimeoutRef.current != null) {
        window.clearTimeout(syncNoticeTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.noteFolders')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed)) {
        setCustomFolders(parsed.filter((value) => typeof value === 'string' && value.trim() !== ''))
      }
    } catch {
      // Ignore invalid local folder cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.noteFolders', JSON.stringify(customFolders))
  }, [customFolders])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.diagramFolders')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed)) {
        setCustomDiagramFolders(parsed.filter((value) => typeof value === 'string' && value.trim() !== ''))
      }
    } catch {
      // Ignore invalid local folder cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.diagramFolders', JSON.stringify(customDiagramFolders))
  }, [customDiagramFolders])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.filePaneWidths')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof filePaneWidths>
      if (typeof parsed.left === 'number' && typeof parsed.right === 'number') {
        setFilePaneWidths({ left: parsed.left, right: parsed.right })
      }
    } catch {
      // Ignore invalid file pane width cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.filePaneWidths', JSON.stringify(filePaneWidths))
  }, [filePaneWidths])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.filePreviewOpen')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (typeof parsed === 'boolean') {
        setFilePreviewOpen(parsed)
      }
    } catch {
      // Ignore invalid preview state cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.filePreviewOpen', JSON.stringify(filePreviewOpen))
  }, [filePreviewOpen])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.filePaneHeights')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof filePaneHeights>
      if (typeof parsed.top === 'number' && typeof parsed.middle === 'number') {
        setFilePaneHeights({ top: parsed.top, middle: parsed.middle })
      }
    } catch {
      // Ignore invalid file pane height cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.filePaneHeights', JSON.stringify(filePaneHeights))
  }, [filePaneHeights])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.fileColumnWidths')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof fileColumnWidths>
      setFileColumnWidths({
        name: typeof parsed.name === 'number' ? parsed.name : 260,
        directory: typeof parsed.directory === 'number' ? parsed.directory : 220,
        type: typeof parsed.type === 'number' ? parsed.type : 56,
        size: typeof parsed.size === 'number' ? parsed.size : 56,
        modified: typeof parsed.modified === 'number' ? parsed.modified : 150,
        created: typeof parsed.created === 'number' ? parsed.created : 150,
      })
    } catch {
      // Ignore invalid file column width cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.fileColumnWidths', JSON.stringify(fileColumnWidths))
  }, [fileColumnWidths])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.fileColumnVisibility')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<FileColumnVisibility>
      setFileColumnVisibility((current) => ({
        ...current,
        directory: typeof parsed.directory === 'boolean' ? parsed.directory : current.directory,
        type: typeof parsed.type === 'boolean' ? parsed.type : current.type,
        size: typeof parsed.size === 'boolean' ? parsed.size : current.size,
        modified: typeof parsed.modified === 'boolean' ? parsed.modified : current.modified,
        created: typeof parsed.created === 'boolean' ? parsed.created : current.created,
      }))
    } catch {
      // Ignore invalid file column visibility cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.fileColumnVisibility', JSON.stringify(fileColumnVisibility))
  }, [fileColumnVisibility])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.notePaneSize')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof notePaneSize>
      setNotePaneSize({
        width: typeof parsed.width === 'number' ? parsed.width : 280,
        height: typeof parsed.height === 'number' ? parsed.height : 220,
      })
    } catch {
      // Ignore invalid note pane size cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.notePaneSize', JSON.stringify(notePaneSize))
  }, [notePaneSize])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.diagramPaneSize')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof diagramPaneSize>
      setDiagramPaneSize({
        width: typeof parsed.width === 'number' ? parsed.width : 280,
        height: typeof parsed.height === 'number' ? parsed.height : 220,
      })
    } catch {
      // Ignore invalid diagram pane size cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.diagramPaneSize', JSON.stringify(diagramPaneSize))
  }, [diagramPaneSize])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.voicePaneSize')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof voicePaneSize>
      setVoicePaneSize({
        width: typeof parsed.width === 'number' ? parsed.width : 280,
        height: typeof parsed.height === 'number' ? parsed.height : 220,
      })
    } catch {
      // Ignore invalid voice pane size cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.voicePaneSize', JSON.stringify(voicePaneSize))
  }, [voicePaneSize])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.chatPaneSize')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof chatPaneSize>
      setChatPaneSize({
        width: typeof parsed.width === 'number' ? parsed.width : 280,
        height: typeof parsed.height === 'number' ? parsed.height : 220,
      })
    } catch {
      // Ignore invalid chat pane size cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.chatPaneSize', JSON.stringify(chatPaneSize))
  }, [chatPaneSize])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.appearance')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<AppearanceSettings>
      setAppearance({
        mode: parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'custom' ? parsed.mode : 'dark',
        pageGutter: typeof parsed.pageGutter === 'number' ? parsed.pageGutter : DEFAULT_APPEARANCE.pageGutter,
        radius: typeof parsed.radius === 'number' ? parsed.radius : DEFAULT_APPEARANCE.radius,
        surfaceOpacity:
          typeof parsed.surfaceOpacity === 'number' ? parsed.surfaceOpacity : DEFAULT_APPEARANCE.surfaceOpacity,
        accent: typeof parsed.accent === 'string' ? parsed.accent : DEFAULT_APPEARANCE.accent,
        secondaryBackground:
          typeof parsed.secondaryBackground === 'string' ? parsed.secondaryBackground : DEFAULT_APPEARANCE.secondaryBackground,
        fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : DEFAULT_APPEARANCE.fontFamily,
        background: typeof parsed.background === 'string' ? parsed.background : DEFAULT_APPEARANCE.background,
        backgroundImage:
          typeof parsed.backgroundImage === 'string' ? parsed.backgroundImage : DEFAULT_APPEARANCE.backgroundImage,
        disableGradients:
          typeof parsed.disableGradients === 'boolean' ? parsed.disableGradients : DEFAULT_APPEARANCE.disableGradients,
        gradientTopLeftEnabled:
          typeof parsed.gradientTopLeftEnabled === 'boolean'
            ? parsed.gradientTopLeftEnabled
            : DEFAULT_APPEARANCE.gradientTopLeftEnabled,
        gradientTopRightEnabled:
          typeof parsed.gradientTopRightEnabled === 'boolean'
            ? parsed.gradientTopRightEnabled
            : DEFAULT_APPEARANCE.gradientTopRightEnabled,
        gradientBottomLeftEnabled:
          typeof parsed.gradientBottomLeftEnabled === 'boolean'
            ? parsed.gradientBottomLeftEnabled
            : DEFAULT_APPEARANCE.gradientBottomLeftEnabled,
        gradientBottomRightEnabled:
          typeof parsed.gradientBottomRightEnabled === 'boolean'
            ? parsed.gradientBottomRightEnabled
            : DEFAULT_APPEARANCE.gradientBottomRightEnabled,
        gradientTopLeft:
          typeof parsed.gradientTopLeft === 'string'
            ? parsed.gradientTopLeft
            : typeof (parsed as Partial<{ gradientStart: string }>).gradientStart === 'string'
              ? (parsed as Partial<{ gradientStart: string }>).gradientStart!
              : DEFAULT_APPEARANCE.gradientTopLeft,
        gradientTopRight:
          typeof parsed.gradientTopRight === 'string'
            ? parsed.gradientTopRight
            : typeof (parsed as Partial<{ gradientEnd: string }>).gradientEnd === 'string'
              ? (parsed as Partial<{ gradientEnd: string }>).gradientEnd!
              : DEFAULT_APPEARANCE.gradientTopRight,
        gradientBottomLeft:
          typeof parsed.gradientBottomLeft === 'string'
            ? parsed.gradientBottomLeft
            : typeof (parsed as Partial<{ gradientStart: string }>).gradientStart === 'string'
              ? (parsed as Partial<{ gradientStart: string }>).gradientStart!
              : DEFAULT_APPEARANCE.gradientBottomLeft,
        gradientBottomRight:
          typeof parsed.gradientBottomRight === 'string'
            ? parsed.gradientBottomRight
            : typeof (parsed as Partial<{ gradientEnd: string }>).gradientEnd === 'string'
              ? (parsed as Partial<{ gradientEnd: string }>).gradientEnd!
              : DEFAULT_APPEARANCE.gradientBottomRight,
        gradientStrength:
          typeof parsed.gradientStrength === 'number'
            ? parsed.gradientStrength
            : DEFAULT_APPEARANCE.gradientStrength,
      })
    } catch {
      // Ignore invalid appearance cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.appearance', JSON.stringify(appearance))
  }, [appearance])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.shortcuts')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<ShortcutSettings>
      setShortcuts({
        previousSection: normalizeShortcutBinding(parsed.previousSection ?? DEFAULT_SHORTCUTS.previousSection),
        nextSection: normalizeShortcutBinding(parsed.nextSection ?? DEFAULT_SHORTCUTS.nextSection),
        notesJump: normalizeShortcutBinding(parsed.notesJump ?? DEFAULT_SHORTCUTS.notesJump),
        filesJump: normalizeShortcutBinding(parsed.filesJump ?? DEFAULT_SHORTCUTS.filesJump),
        diagramsJump: normalizeShortcutBinding(parsed.diagramsJump ?? DEFAULT_SHORTCUTS.diagramsJump),
        voiceJump: normalizeShortcutBinding(parsed.voiceJump ?? DEFAULT_SHORTCUTS.voiceJump),
        chatJump: normalizeShortcutBinding(parsed.chatJump ?? DEFAULT_SHORTCUTS.chatJump),
        callsJump: normalizeShortcutBinding(parsed.callsJump ?? DEFAULT_SHORTCUTS.callsJump),
        settingsJump: normalizeShortcutBinding(parsed.settingsJump ?? DEFAULT_SHORTCUTS.settingsJump),
        focusNext: normalizeShortcutBinding(parsed.focusNext ?? DEFAULT_SHORTCUTS.focusNext),
        focusPrev: normalizeShortcutBinding(parsed.focusPrev ?? DEFAULT_SHORTCUTS.focusPrev),
        routeLeft: (() => {
          const normalized = normalizeShortcutBinding(parsed.routeLeft ?? DEFAULT_SHORTCUTS.routeLeft)
          return normalized === 'ArrowLeft' ? '' : normalized
        })(),
        routeRight: (() => {
          const normalized = normalizeShortcutBinding(parsed.routeRight ?? DEFAULT_SHORTCUTS.routeRight)
          return normalized === 'ArrowRight' ? '' : normalized
        })(),
        notesNew: normalizeShortcutBinding(parsed.notesNew ?? DEFAULT_SHORTCUTS.notesNew),
        notesSave: normalizeShortcutBinding(parsed.notesSave ?? DEFAULT_SHORTCUTS.notesSave),
        notesHideLibrary: normalizeShortcutBinding(parsed.notesHideLibrary ?? DEFAULT_SHORTCUTS.notesHideLibrary),
        notesShowLibrary: normalizeShortcutBinding(parsed.notesShowLibrary ?? DEFAULT_SHORTCUTS.notesShowLibrary),
        diagramsNew: normalizeShortcutBinding(parsed.diagramsNew ?? DEFAULT_SHORTCUTS.diagramsNew),
        diagramsSave: normalizeShortcutBinding(parsed.diagramsSave ?? DEFAULT_SHORTCUTS.diagramsSave),
        voiceRecord: normalizeShortcutBinding(parsed.voiceRecord ?? DEFAULT_SHORTCUTS.voiceRecord),
        chatCreateRoom: normalizeShortcutBinding(parsed.chatCreateRoom ?? DEFAULT_SHORTCUTS.chatCreateRoom),
      })
    } catch {
      // Ignore invalid shortcut cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.shortcuts', JSON.stringify(shortcuts))
  }, [shortcuts])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.navOrder')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      const nextOrder = parsed.filter((path): path is NavItemPath => DEFAULT_NAV_ORDER.includes(path as NavItemPath))
      if (nextOrder.length > 0) {
        setNavOrder([...nextOrder, ...DEFAULT_NAV_ORDER.filter((path) => !nextOrder.includes(path))])
      }
    } catch {
      // Ignore invalid nav order cache.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.navOrder', JSON.stringify(navOrder))
  }, [navOrder])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)')
    const apply = () => setIsCompactViewport(mediaQuery.matches)
    apply()
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (selectedNote) {
      applySelectedNoteDocument(selectedNote.document, { note: selectedNote, markdown: selectedNote.markdown })
      return
    }
    const emptyDocument = noteDocumentFromMarkdown('local-draft', '', session?.user.id ?? 'local', selectedNoteDocumentRef.current)
    setSelectedNoteDocument(emptyDocument)
    setNoteDraft('')
  }, [selectedNote?.id])

  useEffect(() => {
    if (!selectedNoteId) {
      setNoteTitleModalOpen(false)
    }
  }, [selectedNoteId])

  useEffect(() => {
    if (selectedNoteId && !notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(null)
    }
  }, [notes, selectedNoteId])

  useEffect(() => {
    if (route !== '/notes' || !noteEditorRef.current || noteEditorMode !== 'rich') return
    const editorHasFocus =
      document.activeElement === noteEditorRef.current ||
      !!(document.activeElement instanceof HTMLElement && document.activeElement.closest('.markdown-editor'))
    const pendingRestore = pendingLocalDraftRestoreRef.current
    const markdown =
      pendingRestore && pendingRestore.noteId === selectedNote?.id
        ? pendingRestore.markdown
        : noteDraft
    const currentMarkdown = editableHtmlToMarkdown(noteEditorRef.current)
    if (noteEditorRef.current.dataset.noteEditorModel === 'blocks') {
      if (pendingRestore?.noteId === selectedNote?.id) {
        pendingLocalDraftRestoreRef.current = null
      }
      return
    }
    if (currentMarkdown !== markdown && (!editorHasFocus || pendingRestore?.noteId === selectedNote?.id)) {
      noteEditorRef.current.innerHTML = markdownToEditableHtml(markdown)
    }
    if (pendingRestore?.noteId === selectedNote?.id) {
      pendingLocalDraftRestoreRef.current = null
    }
  }, [route, selectedNote?.id, selectedNote?.revision, noteEditorMode, noteDraft])

  useEffect(() => {
    setNoteContextMenu(null)
    setNoteContextSubmenu(null)
    setNoteClipboardText('')
    setNoteContextMenuOpenLeft(false)
    setNoteContextSubmenuOpenUp(false)
    noteContextTableRef.current = null
    noteContextCellRef.current = null
  }, [noteEditorMode, selectedNote?.id, route])

  useEffect(() => {
    if (!noteContextMenu) return

    function closeMenu() {
      setNoteContextMenu(null)
      setNoteContextSubmenu(null)
    }

    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNoteContextMenu(null)
        setNoteContextSubmenu(null)
      }
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', onWindowKeyDown)
    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  }, [noteContextMenu])

  useEffect(() => {
    if (!noteContextMenu || !noteContextMenuRef.current) return

    const margin = 8
    const submenuWidth = 188 + 8
    const submenuHeight = 320
    const rect = noteContextMenuRef.current.getBoundingClientRect()
    const openLeft = rect.right + submenuWidth > window.innerWidth - margin
    const openUp = rect.top + submenuHeight > window.innerHeight - margin
    const clampedX = Math.max(
      margin,
      Math.min(
        noteContextMenu.x,
        window.innerWidth - margin - rect.width - (openLeft ? 0 : submenuWidth),
      ),
    )
    const clampedY = Math.max(margin, Math.min(noteContextMenu.y, window.innerHeight - margin - rect.height))

    if (openLeft !== noteContextMenuOpenLeft) {
      setNoteContextMenuOpenLeft(openLeft)
    }
    if (openUp !== noteContextSubmenuOpenUp) {
      setNoteContextSubmenuOpenUp(openUp)
    }
    if (clampedX !== noteContextMenu.x || clampedY !== noteContextMenu.y) {
      setNoteContextMenu({ ...noteContextMenu, x: clampedX, y: clampedY })
    }
  }, [noteContextMenu, noteContextSubmenu, noteContextMenuOpenLeft, noteContextSubmenuOpenUp])

  useEffect(() => {
    if (pendingDeletePaths.length === 0) return

    deleteConfirmButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPendingDeletePaths([])
        return
      }
      if (event.key !== 'Tab') return

      const focusables = [deleteConfirmButtonRef.current, deleteCancelButtonRef.current].filter(Boolean) as HTMLElement[]
      if (focusables.length === 0) return

      const active = document.activeElement as HTMLElement | null
      const currentIndex = active ? focusables.findIndex((element) => element === active) : -1
      const direction = event.shiftKey ? -1 : 1
      const nextIndex = currentIndex === -1
        ? (event.shiftKey ? focusables.length - 1 : 0)
        : (currentIndex + direction + focusables.length) % focusables.length

      event.preventDefault()
      focusables[nextIndex]?.focus()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingDeletePaths.length])

  useEffect(() => {
    if (displayedFileNodes.length === 0) {
      setActiveFilePath(selectedFileNode?.kind === 'file' ? selectedFileNode.path : null)
      return
    }
    if (!activeFilePath || !displayedFileNodes.some((node: FileNode) => node.path === activeFilePath)) {
      setActiveFilePath(displayedFileNodes[0].path)
    }
  }, [currentDirectoryPath, displayedFileNodes, selectedFileNode?.path, activeFilePath])

  useEffect(() => {
    if (route !== '/files') return
    if (!pendingFileKey) return
    const timeout = window.setTimeout(() => setPendingFileKey(null), 400)
    return () => window.clearTimeout(timeout)
  }, [pendingFileKey, route])

  useEffect(() => {
    if (!fileSearchOpen) return
    window.requestAnimationFrame(() => {
      fileSearchInputRef.current?.focus()
      fileSearchInputRef.current?.select()
    })
  }, [fileSearchOpen])

  useEffect(() => {
    if (!renamingFilePath) return
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [renamingFilePath])

  useEffect(() => {
    if (!pendingAppKey) return
    const timeout = window.setTimeout(() => setPendingAppKey(null), 500)
    return () => window.clearTimeout(timeout)
  }, [pendingAppKey])

  useEffect(() => {
    if (!selectedDiagram) {
      setDiagramDraft(createEmptyDrawioDiagramXml())
      setDiagramSourceFormat('empty')
      setDiagramLoadVersion((current) => current + 1)
      return
    }
    const parsed = parseDrawioDiagramXml(selectedDiagram.xml)
    setDiagramDraft(parsed.xml)
    setDiagramSourceFormat(parsed.sourceFormat)
    setDiagramLoadVersion((current) => current + 1)
  }, [selectedDiagram?.id, selectedDiagram?.revision])

  useEffect(() => {
    if (!standaloneDrawioDiagramId) return
    if (selectedDiagramId !== standaloneDrawioDiagramId) {
      setSelectedDiagramId(standaloneDrawioDiagramId)
    }
    if (diagramEditorMode !== 'diagram') {
      setDiagramMode('diagram')
    }
  }, [diagramEditorMode, selectedDiagramId, setDiagramMode, standaloneDrawioDiagramId])

  useEffect(() => {
    async function persistStandaloneDrawioSave(xml: string) {
      const diagramId = standaloneDrawioEditingIdRef.current
      if (!diagramId) return
      const currentDiagram = diagramsRef.current.find((entry) => entry.id === diagramId)
      if (!currentDiagram) return
      try {
        const updated = await updateDiagramLocalFirst(currentDiagram, xml)
        setDiagrams((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      } catch (error) {
        console.error('Failed to save standalone draw.io diagram', error)
        showActionNotice('Unable to save diagram from draw.io')
      }
    }

    function clearStandaloneDrawioSession(source?: MessageEventSource | null) {
      if (!source || source === standaloneDrawioWindowRef.current) {
        standaloneDrawioWindowRef.current = null
        standaloneDrawioEditingIdRef.current = null
      }
    }

    function onStandaloneDrawioMessage(event: MessageEvent) {
      if (event.origin !== getDrawioBaseUrl()) return
      if (event.source !== standaloneDrawioWindowRef.current) return

      let payload: { event?: string; xml?: string; exit?: boolean } | null = null
      if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data) as typeof payload
        } catch {
          payload = event.data === 'ready' ? { event: 'ready' } : null
        }
      } else if (typeof event.data === 'object' && event.data) {
        payload = event.data as typeof payload
      }

      if (!payload?.event) return

      if (payload.event === 'init' || payload.event === 'ready') {
        const diagramId = standaloneDrawioEditingIdRef.current
        if (!diagramId) return
        const diagram = diagramsRef.current.find((entry) => entry.id === diagramId)
        if (!diagram) return
        event.source?.postMessage(
          JSON.stringify({
            action: 'load',
            autosave: 1,
            saveAndExit: 1,
            xml: diagram.xml,
            title: diagramDisplayName(diagram.title),
          }),
          getDrawioBaseUrl(),
        )
        return
      }

      if (payload.event === 'save' && typeof payload.xml === 'string') {
        void persistStandaloneDrawioSave(payload.xml)
        if (payload.exit) {
          clearStandaloneDrawioSession(event.source)
        }
        return
      }

      if (payload.event === 'exit') {
        clearStandaloneDrawioSession(event.source)
      }
    }

    window.addEventListener('message', onStandaloneDrawioMessage)
    return () => window.removeEventListener('message', onStandaloneDrawioMessage)
  }, [showActionNotice])

  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([])
      return
    }
    if (!getConnectivityState()) {
      void loadCachedWorkspaceSnapshot().then((snapshot) => {
        if (!snapshot) return
        setMessages(snapshot.messages.filter((message) => message.room_id === selectedRoomId))
      })
      return
    }
    void api.listMessages(selectedRoomId).then(setMessages)
  }, [selectedRoomId])

  useEffect(() => {
    if (route !== '/coms' || !selectedRoomId) return
    setRoomUnreadCounts((current) => {
      if (!current[selectedRoomId]) return current
      const next = { ...current }
      delete next[selectedRoomId]
      return next
    })
  }, [route, selectedRoomId])

  useEffect(() => {
    if (authMode !== 'ready') return

    let cancelled = false
    let socket: WebSocket | null = null

    async function connectRealtime() {
      try {
        const socketUrl = await api.realtimeUrl('/ws/realtime')
        if (cancelled) return

        socket = new WebSocket(socketUrl)
        socketRef.current = socket

        socket.onopen = () => {
          setStatus((current) => (current === 'Workspace ready' ? current : 'Realtime connected'))
          broadcastPresence()
        }

        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data) as RealtimeEvent
          if (payload.type === 'chat_rooms_updated') {
            void refreshRooms()
          }
          if (payload.type === 'chat_message') {
            void refreshRooms()
            const isOwnMessage = payload.author_id === sessionUserIdRef.current
            const isVisibleRoom = routeRef.current === '/coms' && payload.room_id === selectedRoomIdRef.current
            if (!isOwnMessage && !isVisibleRoom) {
              setRoomUnreadCounts((current) => ({
                ...current,
                [payload.room_id]: (current[payload.room_id] ?? 0) + 1,
              }))
            }
            if (payload.room_id === selectedRoomIdRef.current) {
              void api.listMessages(payload.room_id).then(setMessages)
            }
          }
          if (payload.type === 'chat_message_reactions_updated') {
            if (payload.room_id === selectedRoomIdRef.current) {
              void api.listMessages(payload.room_id).then(setMessages)
            }
          }
          if (payload.type === 'note_patch') {
        const currentSelected = selectedNoteRef.current
        const editorHasLocalFocus =
          document.activeElement === noteEditorRef.current ||
          (document.activeElement instanceof HTMLTextAreaElement &&
            document.activeElement.classList.contains('note-markdown-editor'))
        const selectedDirty =
          payload.note_id === selectedNoteIdRef.current &&
          currentSelected?.id === payload.note_id &&
          currentNoteIsDirty() &&
          editorHasLocalFocus
        const realtimeBaseBeforeUpdate =
          realtimeDraftBaseRef.current[payload.note_id] ??
          persistedNoteStateRef.current[payload.note_id]?.markdown ??
          currentSelected?.markdown ??
          ''
        const localSelectedMarkdown =
          selectedDirty && currentSelected?.id === payload.note_id ? currentNoteMarkdown() : null
        const mergedSelectedPatch =
          selectedDirty && localSelectedMarkdown !== null
            ? mergeConcurrentMarkdown(
                realtimeBaseBeforeUpdate,
                localSelectedMarkdown,
                payload.markdown,
              )
            : null

        startTransition(() => {
          persistedNoteStateRef.current[payload.note_id] = {
            title: payload.title,
            folder: payload.folder,
            markdown: payload.markdown,
          }
          realtimeDraftBaseRef.current[payload.note_id] = payload.markdown
          if (!locallyDirtyNoteIdsRef.current.has(payload.note_id)) {
            clearNoteLocallyDirty(payload.note_id)
          }
          setNotes((current) =>
            current.map((note) =>
              note.id === payload.note_id
                ? {
                    ...note,
                    title: payload.title,
                    folder: payload.folder,
                    markdown:
                      selectedDirty && mergedSelectedPatch && note.id === payload.note_id
                        ? mergedSelectedPatch.markdown
                        : payload.markdown,
                    document:
                      selectedDirty && mergedSelectedPatch && note.id === payload.note_id
                        ? noteDocumentFromMarkdown(
                            note.id,
                            mergedSelectedPatch.markdown,
                            session?.user.id ?? note.last_editor_id,
                            note.document,
                          )
                        : (payload.document ?? note.document),
                    revision: payload.revision,
                  }
                : note,
            ),
          )
        })

        if (payload.note_id === selectedNoteIdRef.current) {
          if (!selectedDirty) {
            applySelectedNoteDocument(payload.document ?? currentSelected?.document, {
              note:
                currentSelected && currentSelected.id === payload.note_id
                  ? { ...currentSelected, title: payload.title, folder: payload.folder }
                  : null,
              markdown: payload.markdown,
            })
            setSelectedFolderPath(normalizeFolderPath(payload.folder || 'Inbox'))
            if (
              noteEditorModeRef.current === 'rich' &&
              noteEditorRef.current &&
              noteEditorRef.current.dataset.noteEditorModel !== 'blocks'
            ) {
              noteEditorRef.current.innerHTML = markdownToEditableHtml(payload.markdown)
            }
          } else if (mergedSelectedPatch) {
            applySelectedNoteMarkdown(mergedSelectedPatch.markdown)
            setSelectedFolderPath(normalizeFolderPath(payload.folder || 'Inbox'))
            if (
              noteEditorModeRef.current === 'rich' &&
              noteEditorRef.current &&
              noteEditorRef.current.dataset.noteEditorModel !== 'blocks' &&
              !editorHasLocalFocus
            ) {
              noteEditorRef.current.innerHTML = markdownToEditableHtml(mergedSelectedPatch.markdown)
            }
            setStatus(
              mergedSelectedPatch.hadConflict
                ? 'Concurrent note edits merged with conflict markers'
                : 'Concurrent note edits merged',
            )
          }
        }
          }
          if (payload.type === 'note_draft' || payload.type === 'note_operations') {
        if (payload.client_id === clientIdRef.current) return
        const isSelectedNote = payload.note_id === selectedNoteIdRef.current
        const editorHasLocalFocus =
          document.activeElement === noteEditorRef.current ||
          (document.activeElement instanceof HTMLTextAreaElement &&
            document.activeElement.classList.contains('note-markdown-editor'))
        const selectedDirty = isSelectedNote && currentNoteIsDirty()
        const currentSelected = selectedNoteRef.current
        const incomingDocument =
          payload.type === 'note_operations'
            ? applyNoteOperationBatch(currentSelected?.id === payload.note_id ? currentSelected.document : undefined, payload.batch)
            : (payload.document ?? (currentSelected?.id === payload.note_id ? currentSelected.document : { blocks: [], clock: {}, last_operation_id: '' }))
        const incomingMarkdown =
          payload.type === 'note_operations'
            ? markdownFromNoteDocument(incomingDocument)
            : payload.markdown
        const realtimeBaseBeforeUpdate =
          realtimeDraftBaseRef.current[payload.note_id] ??
          persistedNoteStateRef.current[payload.note_id]?.markdown ??
          currentSelected?.markdown ??
          ''
        const localSelectedMarkdown =
          isSelectedNote && selectedDirty && currentSelected?.id === payload.note_id ? currentNoteMarkdown() : null
        const mergedSelectedDraft =
          isSelectedNote && selectedDirty && localSelectedMarkdown !== null
            ? mergeConcurrentMarkdown(
                realtimeBaseBeforeUpdate,
                localSelectedMarkdown,
                incomingMarkdown,
              )
            : null

        startTransition(() => {
          realtimeDraftBaseRef.current[payload.note_id] = incomingMarkdown
          setNotes((current) =>
            current.map((note) =>
              note.id === payload.note_id
                ? {
                    ...note,
                    title: payload.title,
                    folder: payload.folder,
                    markdown:
                      isSelectedNote && selectedDirty && mergedSelectedDraft && note.id === payload.note_id
                        ? mergedSelectedDraft.markdown
                        : incomingMarkdown,
                    document:
                      isSelectedNote && selectedDirty && mergedSelectedDraft && note.id === payload.note_id
                        ? noteDocumentFromMarkdown(
                            note.id,
                            mergedSelectedDraft.markdown,
                            session?.user.id ?? note.last_editor_id,
                            note.document,
                          )
                        : incomingDocument,
                    revision: Math.max(note.revision, payload.revision),
                  }
                : note,
            ),
          )
        })

        if (isSelectedNote) {
          registerPresence(payload.note_id, payload.user)
          if (!(selectedDirty && editorHasLocalFocus)) {
            applySelectedNoteDocument(incomingDocument, {
              note:
                currentSelected && currentSelected.id === payload.note_id
                  ? { ...currentSelected, title: payload.title, folder: payload.folder }
                  : null,
              markdown: incomingMarkdown,
            })
            setSelectedFolderPath(normalizeFolderPath(payload.folder || 'Inbox'))
            if (
              noteEditorModeRef.current === 'rich' &&
              noteEditorRef.current &&
              noteEditorRef.current.dataset.noteEditorModel !== 'blocks'
            ) {
              noteEditorRef.current.innerHTML = markdownToEditableHtml(incomingMarkdown)
            }
          } else if (mergedSelectedDraft) {
            applySelectedNoteMarkdown(mergedSelectedDraft.markdown)
            setSelectedFolderPath(normalizeFolderPath(payload.folder || 'Inbox'))
            if (
              noteEditorModeRef.current === 'rich' &&
              noteEditorRef.current &&
              noteEditorRef.current.dataset.noteEditorModel !== 'blocks' &&
              !editorHasLocalFocus
            ) {
              noteEditorRef.current.innerHTML = markdownToEditableHtml(mergedSelectedDraft.markdown)
            }
            setStatus(
              mergedSelectedDraft.hadConflict
                ? 'Concurrent note edits merged with conflict markers'
                : 'Concurrent note edits merged',
            )
          }
        }
          }
          if (payload.type === 'note_presence') {
            registerPresence(payload.note_id, payload.user)
          }
          if (payload.type === 'note_cursor') {
            if (payload.client_id === clientIdRef.current) return
            setNoteCursors((current) => {
              const existing = current[payload.note_id] ?? []
              if (payload.offset === null || payload.offset === undefined) {
                const next = existing.filter((entry) => entry.clientId !== payload.client_id)
                return { ...current, [payload.note_id]: next }
              }
              const seenAt = Date.now()
              const next = [
                {
                  clientId: payload.client_id,
                  user: payload.user,
                  offset: payload.offset,
                  seenAt,
                  color: colorForPresenceLabel(payload.user),
                },
                ...existing.filter((entry) => entry.clientId !== payload.client_id),
              ].filter((entry) => seenAt - entry.seenAt < 12_000)
              return { ...current, [payload.note_id]: next }
            })
          }
          if (payload.type === 'signal' && payload.room_id === activeCallRoomIdRef.current) {
            void handleSignal(payload.from, payload.payload as SignalPayload)
          }
        }

        socket.onclose = () => {
          if (!cancelled) {
            setStatus('Realtime disconnected')
          }
        }
      } catch (error) {
        if (!cancelled && error instanceof Error && error.message !== 'Server not configured') {
          setStatus(error.message)
        }
      }
    }

    void connectRealtime()

    return () => {
      cancelled = true
      socket?.close()
      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [authMode])

  useEffect(() => {
    if (!selectedNoteId || !session) {
      return
    }
    broadcastPresence()
    const interval = window.setInterval(() => {
      broadcastPresence()
      prunePresence()
      setNoteCursors((current) =>
        Object.fromEntries(
          Object.entries(current).map(([noteId, entries]) => [
            noteId,
            entries.filter((entry) => Date.now() - entry.seenAt < 12_000),
          ]),
        ),
      )
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [selectedNoteId, session?.user.id])

  useEffect(() => {
    if (authMode !== 'ready' || !session || !selectedNoteId) {
      return
    }

    let cancelled = false

    async function reconcileSelectedNote() {
      const currentSession = session
      const currentSelected = selectedNoteRef.current
      if (!currentSession || !currentSelected || currentSelected.id !== selectedNoteId || !getConnectivityState()) {
        return
      }

      try {
        const response = await api.pullNoteOperations(selectedNoteId, currentSelected.revision)
        if (cancelled || response.note.revision <= currentSelected.revision) {
          return
        }
        const pulledDocument =
          response.operations.length > 0
            ? response.operations.reduce(
                (document, operation) => applyNoteOperationBatch(document, operation.batch),
                currentSelected.document,
              )
            : response.note.document
        const pulledMarkdown = pulledDocument ? markdownFromNoteDocument(pulledDocument) : response.note.markdown
        const pulledNote = {
          ...response.note,
          document: pulledDocument,
          markdown: pulledMarkdown,
        }

        const selectedDirty = currentNoteIsDirty()
        const editorHasLocalFocus =
          document.activeElement === noteEditorRef.current ||
          (document.activeElement instanceof HTMLTextAreaElement &&
            document.activeElement.classList.contains('note-markdown-editor'))
        const merged =
          selectedDirty
            ? mergeConcurrentMarkdown(
                realtimeDraftBaseRef.current[selectedNoteId] ??
                  persistedNoteStateRef.current[selectedNoteId]?.markdown ??
                  currentSelected.markdown,
                currentNoteMarkdown(),
                pulledNote.markdown,
              )
            : null

        persistedNoteStateRef.current[selectedNoteId] = {
          title: pulledNote.title,
          folder: pulledNote.folder,
          markdown: pulledNote.markdown,
        }
        realtimeDraftBaseRef.current[selectedNoteId] = pulledNote.markdown

        startTransition(() => {
          setNotes((current) =>
            current.map((note) =>
              note.id === selectedNoteId
                ? {
                    ...pulledNote,
                    markdown: selectedDirty && merged ? merged.markdown : pulledNote.markdown,
                    document:
                      selectedDirty && merged
                        ? noteDocumentFromMarkdown(
                            pulledNote.id,
                            merged.markdown,
                            currentSession.user.id,
                            pulledNote.document,
                          )
                        : pulledNote.document,
                  }
                : note,
            ),
          )
        })

        if (!selectedDirty) {
          applySelectedNoteDocument(pulledNote.document, { note: pulledNote, markdown: pulledNote.markdown })
          setSelectedFolderPath(normalizeFolderPath(pulledNote.folder || 'Inbox'))
          if (
            noteEditorModeRef.current === 'rich' &&
            noteEditorRef.current &&
            noteEditorRef.current.dataset.noteEditorModel !== 'blocks'
          ) {
            noteEditorRef.current.innerHTML = markdownToEditableHtml(pulledNote.markdown)
          }
        } else if (merged) {
          applySelectedNoteMarkdown(merged.markdown)
          if (
            noteEditorModeRef.current === 'rich' &&
            noteEditorRef.current &&
            noteEditorRef.current.dataset.noteEditorModel !== 'blocks' &&
            !editorHasLocalFocus
          ) {
            noteEditorRef.current.innerHTML = markdownToEditableHtml(merged.markdown)
          }
          setStatus(merged.hadConflict ? 'Concurrent note edits merged with conflict markers' : 'Concurrent note edits merged')
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error)
        }
      }
    }

    void reconcileSelectedNote()
    const interval = window.setInterval(() => {
      void reconcileSelectedNote()
    }, 4000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [authMode, selectedNoteId, session, route, noteEditorMode])

  useEffect(() => {
    if (route !== '/notes' || noteEditorMode !== 'rich' || !selectedNoteId) return

    const publishCursor = () => {
      const editor = noteEditorRef.current
      if (!editor) return
      const activeElement = document.activeElement as HTMLElement | null
      const editorFocused = activeElement === editor || !!activeElement?.closest('.markdown-editor')
      if (!editorFocused) {
        broadcastNoteCursor(null)
        return
      }
      broadcastNoteCursor(getCaretOffsetInContentEditable(editor))
    }

    const handleSelectionChange = () => publishCursor()
    const handleBlur = () => window.setTimeout(() => publishCursor(), 0)

    document.addEventListener('selectionchange', handleSelectionChange)
    noteEditorRef.current?.addEventListener('blur', handleBlur, true)
    publishCursor()

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      noteEditorRef.current?.removeEventListener('blur', handleBlur, true)
      broadcastNoteCursor(null)
    }
  }, [route, noteEditorMode, selectedNoteId])

  useEffect(() => {
    const pending = memos.some((memo) => memo.status === 'pending' || memo.status === 'running')
    if (!pending) {
      return
    }
    const interval = window.setInterval(() => {
      void api.listVoiceMemos().then(setMemos)
    }, 2500)
    return () => window.clearInterval(interval)
  }, [memos])

  useEffect(() => {
    if (authMode !== 'ready' || !session) return
    void api
      .googleCalendarConfig()
      .then(setGoogleCalendarConfig)
      .catch((error) => {
        console.error(error)
        setGoogleCalendarConfig(null)
      })
    void refreshCalendarConnections().catch((error) => {
      console.error(error)
    })
    void refreshTasks().catch((error) => {
      console.error(error)
    })
  }, [authMode, session?.token])

  useEffect(() => {
    if (route !== '/calendar' || !session) return
    const params = new URLSearchParams(locationSearch)
    const code = params.get('code')
    const returnedState = params.get('state')
    if (!code) return

    const expectedState = window.sessionStorage.getItem('sweet.calendar.google.state')
    if (expectedState && returnedState && expectedState !== returnedState) {
      showActionNotice('Google calendar connection could not be verified.')
      window.history.replaceState({}, '', '/calendar')
      setLocationSearch('')
      return
    }

    const redirectUrl = `${window.location.origin}/calendar`
    window.sessionStorage.removeItem('sweet.calendar.google.state')
    void api
      .connectGoogleCalendar(code, redirectUrl)
      .then(async (connection) => {
        await refreshCalendarConnections({ preferredSelectedConnectionIds: [connection.id] })
        setSelectedCalendarConnectionIds([connection.id])
        showActionNotice(`Connected ${connection.title}`)
      })
      .catch((error) => {
        console.error(error)
        showActionNotice(error instanceof Error ? error.message : 'Could not connect Google calendar.')
      })
      .finally(() => {
        window.history.replaceState({}, '', '/calendar')
        setLocationSearch('')
      })
  }, [locationSearch, route, session?.token])

  useEffect(() => {
    if (authMode !== 'ready' || !session || selectedCalendarConnectionIds.length === 0) {
      setCalendarEvents([])
      return
    }
    void refreshCalendarEvents(selectedCalendarConnectionIds)
      .catch((error) => {
        console.error(error)
        setCalendarEvents([])
        showActionNotice(error instanceof Error ? error.message : 'Could not load calendar events.')
      })
  }, [authMode, selectedCalendarConnectionIds, session?.token])

  useEffect(() => {
    if (session) return
    setGoogleCalendarConfig(null)
    setCalendarConnections([])
    setSelectedCalendarConnectionIds([])
    setCalendarEvents([])
    setTasks([])
    setSelectedTaskId(null)
    setSyncCursors({ generated_at: new Date(0).toISOString() })
  }, [session])

  useEffect(() => {
    if (authMode !== 'ready' || !session || !currentRolePolicy.manage_org_settings) {
      setSystemUpdateStatus(null)
      return
    }
    void api.getSystemUpdateStatus().then(setSystemUpdateStatus).catch((error) => {
      console.error(error)
    })
  }, [authMode, session, currentRolePolicy.manage_org_settings])

  useEffect(() => {
    if (authMode !== 'ready' || !session || !currentRolePolicy.manage_org_settings) {
      setAdminDatabaseOverview(null)
      return
    }
    if (route !== '/admin') {
      return
    }
    void refreshAdminDatabaseOverview().catch((error) => {
      console.error(error)
    })
  }, [authMode, session, currentRolePolicy.manage_org_settings, route])

  useEffect(() => {
    if (route !== '/admin' || !systemUpdateStatus?.update_in_progress || !currentRolePolicy.manage_org_settings) {
      return
    }
    const interval = window.setInterval(() => {
      void api.getSystemUpdateStatus().then(setSystemUpdateStatus).catch((error) => {
        console.error(error)
      })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [route, systemUpdateStatus?.update_in_progress, currentRolePolicy.manage_org_settings])

  useEffect(() => {
    if (authMode !== 'ready' || !session) return

    let cancelled = false

    async function runSyncCycle() {
      if (!getConnectivityState()) {
        return
      }

      try {
        await flushPendingVoiceUploads()
        await flushPendingManagedUploads()
        const pushResponse = await flushQueuedOperations()
        const nextConflicts = await refreshQueuedSyncConflicts()
        const snapshot = await refreshWorkspace(pushResponse?.envelope.cursors ?? syncCursors, true)
        if (cancelled) return
        setSyncCursors(snapshot.cursors)
        rememberPersistedNotes(snapshot.notes)
        setNotes(snapshot.notes)
        setFilesTree(snapshot.file_tree)
        setDiagrams(snapshot.diagrams)
        setMemos(snapshot.voice_memos)
        setRooms(snapshot.rooms)
        setTasks(snapshot.tasks)
        setCalendarConnections(snapshot.calendar_connections)
        if (selectedRoomId) {
          setMessages(snapshot.messages.filter((message) => message.room_id === selectedRoomId))
        }
        setSelectedNoteId((current) => current && snapshot.notes.some((note) => note.id === current) ? current : (snapshot.notes[0]?.id ?? null))
        setSelectedDiagramId((current) =>
          current && snapshot.diagrams.some((diagram) => diagram.id === current) ? current : (snapshot.diagrams[0]?.id ?? null),
        )
        setSelectedVoiceMemoId((current) =>
          current && snapshot.voice_memos.some((memo) => memo.id === current) ? current : (snapshot.voice_memos[0]?.id ?? null),
        )
        setSelectedRoomId((current) => current && snapshot.rooms.some((room) => room.id === current) ? current : (snapshot.rooms[0]?.id ?? null))
        setSelectedCalendarConnectionIds((current) => {
          const valid = current.filter((id) => snapshot.calendar_connections.some((connection) => connection.id === id))
          if (valid.length > 0) return valid
          return snapshot.calendar_connections[0] ? [snapshot.calendar_connections[0].id] : []
        })
        setSelectedTaskId((current) =>
          current && snapshot.tasks.some((task) => task.id === current) ? current : (snapshot.tasks[0]?.id ?? null),
        )
        setSyncNotice(null)
        if (nextConflicts.length > 0) {
          setSyncConflictsOpen(true)
          showSyncNotice(
            'error',
            `${nextConflicts.length} offline change${nextConflicts.length === 1 ? '' : 's'} need review.`,
            6500,
          )
        }
      } catch (error) {
        if (!cancelled) {
          showSyncNotice('error', error instanceof Error ? error.message : 'Sync failed')
        }
      }
    }

    void runSyncCycle()
    const interval = window.setInterval(() => {
      void runSyncCycle()
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [authMode, selectedRoomId, session, syncCursors])

  useEffect(() => {
    if (authMode !== 'ready' || !session) return
    void persistWorkspaceSnapshot({
      source: 'remote',
      synced_at: new Date().toISOString(),
      cursors: syncCursors,
      notes,
      diagrams,
      voice_memos: memos,
      rooms,
      messages,
      calendar_connections: calendarConnections,
      calendar_events: calendarEvents,
      tasks,
      file_tree: filesTree,
      resource_shares: [],
      tombstones: [],
    })
  }, [
    authMode,
    calendarConnections,
    calendarEvents,
    diagrams,
    filesTree,
    memos,
    messages,
    notes,
    rooms,
    session,
    syncCursors,
    tasks,
  ])

  useEffect(() => () => cleanupCallState(), [])

  function applyUpdatedUserProfile(profile: UserProfile) {
    setSession((current) => {
      if (!current) return current
      const next = { ...current, user: profile }
      void sessionStore.set(next)
      return next
    })
    setAdminUsers((current) =>
      current.map((user) =>
        user.id === profile.id
          ? {
              ...user,
              username: profile.username,
              email: profile.email,
              display_name: profile.display_name,
              avatar_path: profile.avatar_path,
              avatar_content_type: profile.avatar_content_type,
              role: profile.role,
              roles: profile.roles,
              must_change_password: profile.must_change_password,
            }
          : user,
      ),
    )
    setComsParticipants((current) =>
      current.map((participant) => (participant.id === profile.id ? { ...participant, ...profile } : participant)),
    )
    setMessages((current) =>
      current.map((message) =>
        message.author.id === profile.id
          ? { ...message, author: { ...message.author, ...profile } }
          : message,
      ),
    )
  }
  const {
    bootstrap,
    loginWithPassword,
    changePasswordFirstUse,
    setupAdminAccount,
    uploadCurrentUserAvatar,
    updateCurrentUserCredentials,
    changeCurrentUserPassword,
    logout,
  } = createAuthActions({
    adminSettings,
    session,
    setStatus,
    setOidc,
    setSetupStatus,
    setAuthMode,
    setRoute,
    setSession,
    setAdminSettings,
    setAdminUsers,
    setAdminStorageOverview,
    setAdminDatabaseOverview,
    setNotes,
    setFilesTree,
    setSelectedFilePath,
    setSelectedNoteId,
    setSelectedFolderPath,
    setCustomFolders,
    setDiagrams,
    setSelectedDiagramId,
    setMemos,
    setSelectedVoiceMemoId,
    setCalendarConnections,
    setTasks,
    setRooms,
    setRoomUnreadCounts,
    setComsParticipants,
    setSelectedRoomId,
    setMessages,
    setRtcConfig,
    setSyncCursors,
    rememberPersistedNotes,
    normalizeFolderPath,
    mergeFolderPaths,
    applyUpdatedUserProfile,
    showActionNotice,
  })
  const {
    resourceKeyForFilePath,
    resourceKeyForNote,
    resourceKeyForCalendar,
    openShareDialog,
    setShareVisibility,
    toggleShareUser,
    saveShareSettings,
  } = createShareActions({
    session,
    shareTarget,
    shareDraft,
    setShareTarget,
    setShareUserQuery,
    setShareDraft,
    setShareSaving,
    showActionNotice,
  })

  async function cycleRoute(offset: number) {
    await navigate(cycleRoutePath(orderedNavItems.map((item) => item.path), route, offset))
  }

  function routeJumpFromShortcut(binding: string): RoutePath | null {
    return routeJumpFromShortcutAction(binding, shortcuts)
  }

  function moveRouteFocus(offset: number) {
    moveRouteFocusAction(route, offset)
  }

  function handleTextareaTabKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    onNextValue?: (value: string) => void,
  ) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const nextValue = `${target.value.slice(0, start)}\t${target.value.slice(end)}`
    setValue(nextValue)
    onNextValue?.(nextValue)
    window.requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = start + 1
    })
  }

  function pushCallLog(entry: string) {
    console.debug(`[call] ${entry}`)
  }

  function showActionNotice(message: string) {
    setActionNotice({ id: createClientId(), message })
  }

  async function retrySyncConflict(id: string) {
    await retryQueuedSyncConflict(id)
    await refreshQueuedSyncConflicts()
    showActionNotice('Queued conflict retry')
  }

  async function discardSyncConflict(id: string) {
    await discardQueuedSyncConflict(id)
    await refreshQueuedSyncConflicts()
    showActionNotice('Discarded offline conflict')
  }

  async function retryAllSyncConflicts() {
    const conflicts = await listQueuedSyncConflicts()
    for (const conflict of conflicts) {
      await retryQueuedSyncConflict(conflict.id)
    }
    await refreshQueuedSyncConflicts()
    showActionNotice(`Queued ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} for retry`)
  }

  async function discardAllSyncConflicts() {
    const conflicts = await listQueuedSyncConflicts()
    for (const conflict of conflicts) {
      await discardQueuedSyncConflict(conflict.id)
    }
    await refreshQueuedSyncConflicts()
    showActionNotice(`Discarded ${conflicts.length} offline conflict${conflicts.length === 1 ? '' : 's'}`)
  }

  async function openSyncConflictTarget(id: string) {
    const conflict = syncConflicts.find((entry) => entry.id === id)
    if (!conflict) {
      return
    }
    const operation = conflict.queued_operation.operation
    switch (operation.kind) {
      case 'create_note':
        setSelectedFolderPath(normalizeFolderPath(operation.folder || 'Inbox'))
        await navigate('/notes')
        return
      case 'apply_note_operations':
      case 'update_note':
      case 'delete_note': {
        const note = notesRef.current.find((entry) => entry.id === operation.id)
        if (note) {
          setSelectedFolderPath(normalizeFolderPath(note.folder || 'Inbox'))
          setSelectedNoteId(note.id)
        }
        await navigate('/notes')
        return
      }
      case 'create_diagram':
        await navigate('/diagrams')
        return
      case 'update_diagram':
        setSelectedDiagramId(operation.id)
        await navigate('/diagrams')
        return
      case 'create_task':
        setSelectedTaskId(operation.client_generated_id)
        await navigate('/tasks')
        return
      case 'update_task':
      case 'delete_task':
        setSelectedTaskId(operation.id)
        await navigate('/tasks')
        return
      case 'create_local_calendar':
        await navigate('/calendar')
        return
      case 'rename_calendar':
      case 'delete_calendar':
        setSelectedCalendarConnectionIds([operation.id])
        await navigate('/calendar')
        return
      case 'create_calendar_event':
      case 'update_calendar_event':
      case 'delete_calendar_event':
        setSelectedCalendarConnectionIds([operation.connection_id])
        await navigate('/calendar')
        return
      case 'create_message':
      case 'toggle_message_reaction':
        setSelectedRoomId(operation.room_id)
        await navigate('/coms')
        return
      case 'create_managed_folder':
        setSelectedFilePath(operation.path)
        setActiveFilePath(operation.path)
        await navigate('/files')
        return
      case 'move_managed_path':
        setSelectedFilePath(operation.source_path)
        setActiveFilePath(operation.source_path)
        await navigate('/files')
        return
      case 'rename_managed_path':
      case 'delete_managed_path':
        setSelectedFilePath(operation.path)
        setActiveFilePath(operation.path)
        await navigate('/files')
        return
    }
  }

  async function deleteSelectedNote() {
    const note = selectedNoteRef.current
    if (!note) return

    if (noteSavePromiseRef.current) {
      await noteSavePromiseRef.current
    }

    if (noteDraftBroadcastTimeoutRef.current) {
      window.clearTimeout(noteDraftBroadcastTimeoutRef.current)
      noteDraftBroadcastTimeoutRef.current = null
    }
    if (noteLiveSaveTimeoutRef.current) {
      window.clearTimeout(noteLiveSaveTimeoutRef.current)
      noteLiveSaveTimeoutRef.current = null
    }
    pendingLiveSaveNoteIdRef.current = null

    await deleteNoteLocalFirst(note)

    locallyDirtyNoteIdsRef.current.delete(note.id)
    clearNoteLocallyDirty(note.id)
    setNotePresence((current) => {
      const next = { ...current }
      delete next[note.id]
      return next
    })
    setNoteCursors((current) => {
      const next = { ...current }
      delete next[note.id]
      return next
    })

    const nextNotes = getConnectivityState()
      ? await api.listNotes()
      : notesRef.current.filter((entry) => entry.id !== note.id)
    rememberPersistedNotes(nextNotes)
    setNotes(nextNotes)
    setCustomFolders((current) =>
      mergeFolderPaths(
        current,
        nextNotes.map((entry) => entry.folder || 'Inbox'),
      ),
    )

    const nextSelected =
      nextNotes.find((entry) => normalizeFolderPath(entry.folder || 'Inbox') === normalizeFolderPath(note.folder || 'Inbox')) ??
      nextNotes[0] ??
      null

    setSelectedNoteId(nextSelected?.id ?? null)
    setSelectedFolderPath(normalizeFolderPath(nextSelected?.folder || note.folder || 'Inbox'))
    if (nextSelected) {
      applySelectedNoteDocument(nextSelected.document, { note: nextSelected, markdown: nextSelected.markdown })
    } else {
      applySelectedNoteMarkdown('', { note: null })
    }
    await refreshFilesTree()
    showActionNotice(`Deleted note: ${note.title || 'Untitled note'}`)
  }

  async function refreshFilesTree() {
    if (!getConnectivityState()) {
      return
    }
    const nextTree = await api.listFilesTree()
    setFilesTree(nextTree)
  }

  function beginFileDrag(event: React.DragEvent<HTMLElement>, path: string) {
    beginFileDragAction(event, path, setDraggingFilePath)
  }

  async function handleDirectoryDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    await handleDirectoryDropAction(
      event,
      destinationDir,
      draggingFilePath,
      setDropTargetPath,
      setDraggingFilePath,
      moveDriveItem,
    )
  }

  function beginNoteTreeDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (!path.startsWith('note:') && path === 'Inbox') return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', path)
    setDraggingNoteTreePath(path)
  }

  async function handleNoteTreeDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePath = event.dataTransfer.getData('text/plain') || draggingNoteTreePath
    setNoteTreeDropTargetPath(null)
    setDraggingNoteTreePath(null)
    if (!sourcePath) return

    if (sourcePath.startsWith('note:')) {
      const noteId = sourcePath.slice('note:'.length)
      const note = notesRef.current.find((entry) => entry.id === noteId)
      if (!note) return
      const nextFolder = normalizeFolderPath(destinationDir || 'Inbox')
      const currentFolder = normalizeFolderPath(note.folder || 'Inbox')
      if (nextFolder === currentFolder) return
      const markdown = noteId === selectedNoteIdRef.current ? currentNoteMarkdown() : note.markdown
      const title = noteId === selectedNoteIdRef.current ? (selectedNoteRef.current?.title ?? note.title) : note.title
      const updated = await updateNoteLocalFirst({ ...note, title }, { folder: nextFolder, markdown })
      setNotes((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      persistedNoteStateRef.current[updated.id] = {
        title: updated.title,
        folder: updated.folder,
        markdown: updated.markdown,
      }
      locallyDirtyNoteIdsRef.current.delete(updated.id)
      if (updated.id === selectedNoteIdRef.current) {
        setSelectedFolderPath(nextFolder)
        applySelectedNoteDocument(updated.document, { note: updated, markdown: updated.markdown })
      }
      setCustomFolders((current) => mergeFolderPaths(current, [currentFolder, updated.folder || 'Inbox']))
      await refreshFilesTree()
      showActionNotice(`Moved note: ${updated.title}`)
      return
    }

    const sourceFolder = normalizeFolderPath(sourcePath)
    const targetFolder = normalizeFolderPath(destinationDir || 'Inbox')
    if (sourceFolder === 'Inbox') return
    if (targetFolder === sourceFolder || targetFolder.startsWith(`${sourceFolder}/`)) return

    const folderName = sourceFolder.split('/').pop() || sourceFolder
    const rebasedRoot = normalizeFolderPath(targetFolder === 'Inbox' ? folderName : `${targetFolder}/${folderName}`)
    if (rebasedRoot === sourceFolder) return

    const rebaseFolderPath = (folderPath: string) => {
      const normalized = normalizeFolderPath(folderPath || 'Inbox')
      if (normalized === sourceFolder) return rebasedRoot
      if (normalized.startsWith(`${sourceFolder}/`)) {
        return normalizeFolderPath(`${rebasedRoot}/${normalized.slice(sourceFolder.length + 1)}`)
      }
      return normalized
    }

    const affectedNotes = notesRef.current.filter((note) => {
      const normalized = normalizeFolderPath(note.folder || 'Inbox')
      return normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)
    })
    const updatedNotes = await Promise.all(
      affectedNotes.map(async (note) => {
        const updatedFolder = rebaseFolderPath(note.folder || 'Inbox')
        const markdown = note.id === selectedNoteIdRef.current ? currentNoteMarkdown() : note.markdown
        const title = note.id === selectedNoteIdRef.current ? (selectedNoteRef.current?.title ?? note.title) : note.title
        return updateNoteLocalFirst({ ...note, title }, { folder: updatedFolder, markdown })
      }),
    )

    const updatedById = new Map(updatedNotes.map((note) => [note.id, note]))
    setNotes((current) => current.map((note) => updatedById.get(note.id) ?? note))
    for (const updated of updatedNotes) {
      persistedNoteStateRef.current[updated.id] = {
        title: updated.title,
        folder: updated.folder,
        markdown: updated.markdown,
      }
      locallyDirtyNoteIdsRef.current.delete(updated.id)
    }

    const selectedNoteId = selectedNoteIdRef.current
    if (selectedNoteId) {
      const updatedSelected = updatedById.get(selectedNoteId)
      if (updatedSelected) {
        setSelectedFolderPath(normalizeFolderPath(updatedSelected.folder || 'Inbox'))
        applySelectedNoteDocument(updatedSelected.document, { note: updatedSelected, markdown: updatedSelected.markdown })
      } else if (selectedFolderPathRef.current === sourceFolder || selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)) {
        setSelectedFolderPath(rebaseFolderPath(selectedFolderPathRef.current))
      }
    }

    setCustomFolders((current) =>
      mergeFolderPaths(
        current
          .map((folderPath) => {
            const normalized = normalizeFolderPath(folderPath)
            if (normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)) {
              return rebaseFolderPath(normalized)
            }
            return normalized
          })
          .concat(updatedNotes.map((note) => note.folder || 'Inbox')),
        [],
      ),
    )
    await refreshFilesTree()
    showActionNotice(`Moved folder: ${folderName}`)
  }

  function beginDiagramTreeDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (!path.startsWith('diagram:') && path === 'Diagrams') return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', path)
    setDraggingDiagramTreePath(path)
  }

  async function handleDiagramTreeDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePath = event.dataTransfer.getData('text/plain') || draggingDiagramTreePath
    setDiagramTreeDropTargetPath(null)
    setDraggingDiagramTreePath(null)
    if (!sourcePath) return

    if (sourcePath.startsWith('diagram:')) {
      const diagramId = sourcePath.slice('diagram:'.length)
      const diagram = diagrams.find((entry) => entry.id === diagramId)
      if (!diagram) return
      const currentFolder = normalizeDiagramFolderPath(diagram.title)
      const nextFolder = normalizeDiagramFolderPath(`${destinationDir}/${diagramDisplayName(diagram.title)}`)
      if (nextFolder === currentFolder) return
      const updated = await updateDiagramLocalFirst(
        { ...diagram, title: `${destinationDir}/${diagramDisplayName(diagram.title)}` },
        diagram.xml,
      )
      setDiagrams((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      setCustomDiagramFolders((current) =>
        Array.from(new Set([...current, currentFolder, nextFolder])).sort((left, right) => left.localeCompare(right)),
      )
      await refreshFilesTree()
      showActionNotice(`Moved diagram: ${diagramDisplayName(updated.title)}`)
      return
    }

    const sourceFolder = sourcePath
    const targetFolder = destinationDir
    if (sourceFolder === 'Diagrams') return
    if (targetFolder === sourceFolder || targetFolder.startsWith(`${sourceFolder}/`)) return

    const folderName = sourceFolder.split('/').pop() || sourceFolder
    const rebasedRoot = `${targetFolder}/${folderName}`
    if (rebasedRoot === sourceFolder) return

    const rebaseTitle = (title: string) => {
      if (title === sourceFolder) return rebasedRoot
      if (title.startsWith(`${sourceFolder}/`)) {
        return `${rebasedRoot}/${title.slice(sourceFolder.length + 1)}`
      }
      return title
    }

    const affectedDiagrams = diagrams.filter((diagram) => {
      const currentPath = diagram.title
      return currentPath === sourceFolder || currentPath.startsWith(`${sourceFolder}/`)
    })
    const updatedDiagrams = await Promise.all(
      affectedDiagrams.map((diagram) =>
        updateDiagramLocalFirst(
          {
            ...diagram,
            title: rebaseTitle(diagram.title),
          },
          diagram.xml,
        ),
      ),
    )
    const updatedById = new Map(updatedDiagrams.map((diagram) => [diagram.id, diagram]))
    setDiagrams((current) => current.map((diagram) => updatedById.get(diagram.id) ?? diagram))
    setCustomDiagramFolders((current) =>
      Array.from(
        new Set(
          current.map((folderPath) => {
            if (folderPath === sourceFolder) return rebasedRoot
            if (folderPath.startsWith(`${sourceFolder}/`)) {
              return `${rebasedRoot}/${folderPath.slice(sourceFolder.length + 1)}`
            }
            return folderPath
          }),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    )
    await refreshFilesTree()
    showActionNotice(`Moved folder: ${folderName}`)
  }

  function beginVoiceTreeDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (path === 'voice') return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', path)
    setDraggingVoiceTreePath(path)
  }

  async function handleVoiceTreeDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePath = event.dataTransfer.getData('text/plain') || draggingVoiceTreePath
    setVoiceTreeDropTargetPath(null)
    setDraggingVoiceTreePath(null)
    if (!sourcePath) return
    await moveDriveItem(sourcePath, destinationDir)
  }

  function activateRelativeFile(offset: number) {
    activateRelativeFileAction(displayedFileNodes, activeFileNode, offset, setActiveFilePath)
  }

  function displayNameForFileNode(node: FileNode) {
    return displayNameForManagedFileNode(node, notes, memos, diagrams)
  }

  function toggleFileColumnVisibility(column: FileColumnKey) {
    toggleFileColumnVisibilityAction(column, setFileColumnVisibility)
  }

  function renderFileColumnCell(node: FileNode, column: FileColumnKey) {
    return renderManagedFileCell(node, column, displayNameForFileNode)
  }

  async function navigate(nextRoute: RoutePath) {
    if (nextRoute === route) return
    if (route === '/notes') {
      const autosaved = await autosaveCurrentNoteBeforeSwitch()
      if (!autosaved) return
    }
    window.history.pushState({}, '', nextRoute)
    setRoute(nextRoute)
  }

  function goToParentDirectory() {
    goToParentDirectoryAction(currentDirectoryPath)
  }

  useEffect(() => {
    if (route !== '/files') return

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (isEditable || creatingDriveFolder || pendingDeletePaths.length > 0) return

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        activateRelativeFile(1)
        return
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        activateRelativeFile(-1)
        return
      }
      if (event.key === 'G') {
        event.preventDefault()
        if (displayedFileNodes.length > 0) {
          setActiveFilePath(displayedFileNodes[displayedFileNodes.length - 1]?.path ?? null)
        }
        return
      }
      if (event.key === 'g') {
        event.preventDefault()
        if (pendingFileKey === 'g') {
          setActiveFilePath(displayedFileNodes[0]?.path ?? null)
          setPendingFileKey(null)
        } else {
          setPendingFileKey('g')
        }
        return
      }
      setPendingFileKey(null)

      if (event.key === 'h' || event.key === 'ArrowLeft') {
        event.preventDefault()
        goToParentDirectory()
        return
      }
      if (event.key === 'l' || event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        openFileNode(activeFileNode)
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        toggleMarkedPath(activeFileNode?.path)
        activateRelativeFile(1)
        return
      }
      if (event.key === 'y') {
        event.preventDefault()
        const payload = (markedFilePaths.length > 0 ? markedFilePaths : [activeFileNode?.path])
          .filter(Boolean)
          .join('\n')
        if (payload) {
          void navigator.clipboard.writeText(payload).then(() => setStatus('Copied path(s)')).catch(() => undefined)
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        downloadManagedPaths(markedFilePaths.length > 0 ? markedFilePaths : [activeFileNode?.path ?? ''])
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        beginRenameCurrentFile()
        return
      }
      if (event.key === '?' || event.key === 'F1') {
        event.preventDefault()
        setFileHelpOpen((current) => !current)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        const targets = normalizedDeletePaths(markedFilePaths.length > 0 ? markedFilePaths : [activeFileNode?.path ?? ''])
        if (targets.length > 0) {
          requestDeletePaths(targets)
        }
        return
      }
      if (event.key === 'Escape') {
        setFileHelpOpen(false)
        setMarkedFilePaths([])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [route, activeFileNode?.path, displayedFileNodes, pendingFileKey, markedFilePaths, creatingDriveFolder, currentDirectoryPath, pendingDeletePaths.length, currentRolePolicy.admin_panel, adminSettings?.confirm_file_delete])

  useEffect(() => {
    if (!activeSplitter) return

    function eventPoint(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        const touch = event.touches[0] ?? event.changedTouches[0]
        return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
      }
      return { clientX: event.clientX, clientY: event.clientY }
    }

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = fileManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 760px)').matches
      const minLeft = 120
      const minRight = 180
      const minTop = 120
      const minBottom = 160

      if (stacked) {
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        setFilePaneHeights((current) => ({ ...current, top: Math.round(nextTop) }))
        return
      }

      if (activeSplitter === 'left') {
        const nextLeft = Math.min(
          rect.width - minRight - splitterWidth,
          Math.max(minLeft, point.clientX - rect.left),
        )
        setFilePaneWidths((current) => ({ ...current, left: Math.round(nextLeft) }))
        return
      }

      const nextRight = Math.min(
        rect.width - minLeft - splitterWidth,
        Math.max(minRight, rect.right - point.clientX),
      )
      filePreviewWidthRef.current = Math.round(nextRight)
      if (!filePreviewOpen) {
        setFilePreviewOpen(true)
      }
      setFilePaneWidths((current) => ({ ...current, right: Math.round(nextRight) }))
    }

    function onPointerUp() {
      setActiveSplitter(null)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [activeSplitter, filePaneHeights.middle, filePaneHeights.top, filePreviewOpen])

  function toggleFilePreviewPane() {
    toggleFilePreviewPaneAction(
      filePreviewOpen,
      filePaneWidths,
      filePreviewWidthRef,
      setFilePaneWidths,
      setFilePreviewOpen,
    )
  }

  function beginFileColumnResize(splitter: FileColumnKey, clientX: number) {
    beginFileColumnResizeAction(
      splitter,
      clientX,
      fileColumnWidths,
      fileColumnResizeRef,
      setActiveFileColumnSplitter,
    )
  }

  useEffect(() => {
    if (!activeFileColumnSplitter) return

    function onMouseMove(event: MouseEvent) {
      const dragState = fileColumnResizeRef.current
      if (!dragState) return
      const deltaX = event.clientX - dragState.startX

      setFileColumnWidths((current) => {
        const minimums: Record<FileColumnKey, number> = {
          name: 160,
          directory: 140,
          type: 40,
          size: 44,
          modified: 120,
          created: 120,
        }
        const maximums: Record<FileColumnKey, number> = {
          name: 960,
          directory: 520,
          type: 180,
          size: 220,
          modified: 260,
          created: 260,
        }
        const nextWidth = Math.max(
          minimums[dragState.splitter],
          Math.min(maximums[dragState.splitter], Math.round(dragState.startWidths[dragState.splitter] + deltaX)),
        )
        return { ...current, [dragState.splitter]: nextWidth }
      })
    }

    function onMouseUp() {
      fileColumnResizeRef.current = null
      setActiveFileColumnSplitter(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeFileColumnSplitter])

  useEffect(() => {
    if (!activeNoteSplitter || !noteDrawerOpen) return

    function eventPoint(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        const touch = event.touches[0] ?? event.changedTouches[0]
        return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
      }
      return { clientX: event.clientX, clientY: event.clientY }
    }

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = noteManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        setNotePaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      setNotePaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      setActiveNoteSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [activeNoteSplitter, noteDrawerOpen])

  useEffect(() => {
    if (!activeDiagramSplitter || !diagramDrawerOpen) return

    function eventPoint(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        const touch = event.touches[0] ?? event.changedTouches[0]
        return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
      }
      return { clientX: event.clientX, clientY: event.clientY }
    }

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = diagramManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 340
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        setDiagramPaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 120
      const minRight = 420
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      setDiagramPaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      setActiveDiagramSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [activeDiagramSplitter, diagramDrawerOpen])

  useEffect(() => {
    function handleFullscreenChange() {
      setDiagramFullscreen(document.fullscreenElement === diagramsSectionRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (!activeVoiceSplitter || !voiceDrawerOpen) return

    function eventPoint(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        const touch = event.touches[0] ?? event.changedTouches[0]
        return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
      }
      return { clientX: event.clientX, clientY: event.clientY }
    }

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = document.querySelector('.voice-manager') as HTMLElement | null
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        setVoicePaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      setVoicePaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      setActiveVoiceSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [activeVoiceSplitter, voiceDrawerOpen])

  useEffect(() => {
    if (!activeChatSplitter || !chatDrawerOpen) return

    function eventPoint(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        const touch = event.touches[0] ?? event.changedTouches[0]
        return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
      }
      return { clientX: event.clientX, clientY: event.clientY }
    }

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = chatManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        setChatPaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      setChatPaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      setActiveChatSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [activeChatSplitter, chatDrawerOpen])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editable = isEditableTarget(event.target)
      const stroke = eventShortcutStroke(event)
      const saveChord = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
      const routeJumpBindings = [
        shortcuts.notesJump,
        shortcuts.filesJump,
        shortcuts.diagramsJump,
        shortcuts.voiceJump,
        shortcuts.chatJump,
        shortcuts.callsJump,
        shortcuts.settingsJump,
      ].map(normalizeShortcutBinding)

      if (saveChord && route === '/notes') {
        event.preventDefault()
        void saveNote()
        return
      }

      if (saveChord && route === '/diagrams') {
        event.preventDefault()
        void saveDiagram()
        return
      }

      if (saveChord && route === '/files') {
        event.preventDefault()
        setFileSearchOpen(true)
        return
      }

      if (editable) {
        if (event.key === 'Escape') {
          event.preventDefault()
          blurEditableTarget(event.target)
          if (route === '/files' && fileSearchOpen) {
            setFileSearchOpen(false)
            setFileSearchQuery('')
          }
          setPendingAppKey(null)
        }
        return
      }

      if (pendingAppKey) {
        const jumpRoute = routeJumpFromShortcut(`${pendingAppKey} ${stroke}`)
        setPendingAppKey(null)
        if (jumpRoute) {
          event.preventDefault()
          void navigate(jumpRoute)
          return
        }
      }

      if (stroke === normalizeShortcutBinding(shortcuts.previousSection)) {
        event.preventDefault()
        void cycleRoute(-1)
        return
      }

      if (stroke === normalizeShortcutBinding(shortcuts.nextSection)) {
        event.preventDefault()
        void cycleRoute(1)
        return
      }

      if (
        route !== '/files' &&
        stroke !== 'ArrowLeft' &&
        shortcuts.routeLeft &&
        stroke === normalizeShortcutBinding(shortcuts.routeLeft)
      ) {
        event.preventDefault()
        void cycleRoute(-1)
        return
      }

      if (
        route !== '/files' &&
        stroke !== 'ArrowRight' &&
        shortcuts.routeRight &&
        stroke === normalizeShortcutBinding(shortcuts.routeRight)
      ) {
        event.preventDefault()
        void cycleRoute(1)
        return
      }

      const jumpPrefix = routeJumpBindings
        .filter((binding) => binding.includes(' '))
        .map((binding) => binding.split(' ')[0])
        .find((prefix) => prefix === stroke)
      if (route !== '/files' && jumpPrefix) {
        setPendingAppKey(jumpPrefix)
        return
      }

      if (route !== '/files' && stroke === normalizeShortcutBinding(shortcuts.focusNext)) {
        event.preventDefault()
        moveRouteFocus(1)
        return
      }

      if (route !== '/files' && stroke === normalizeShortcutBinding(shortcuts.focusPrev)) {
        event.preventDefault()
        moveRouteFocus(-1)
        return
      }

      if (route === '/notes' && stroke === normalizeShortcutBinding(shortcuts.notesNew)) {
        event.preventDefault()
        void createNote()
        return
      }

      if (route === '/notes' && stroke === normalizeShortcutBinding(shortcuts.notesSave)) {
        event.preventDefault()
        void saveNote()
        return
      }

      if (route === '/notes' && stroke === normalizeShortcutBinding(shortcuts.notesHideLibrary)) {
        event.preventDefault()
        setNoteDrawerOpen((current) => !current)
        return
      }

      if (route === '/notes' && stroke === normalizeShortcutBinding(shortcuts.notesShowLibrary)) {
        event.preventDefault()
        setNoteDrawerOpen((current) => !current)
        return
      }

      if (route === '/diagrams' && stroke === normalizeShortcutBinding(shortcuts.diagramsNew)) {
        event.preventDefault()
        void createDiagram()
        return
      }

      if (route === '/diagrams' && stroke === normalizeShortcutBinding(shortcuts.diagramsSave)) {
        event.preventDefault()
        void saveDiagram()
        return
      }

      if (route === '/voice' && stroke === normalizeShortcutBinding(shortcuts.voiceRecord)) {
        event.preventDefault()
        void toggleRecording()
        return
      }

      if (route === '/coms' && stroke === normalizeShortcutBinding(shortcuts.chatCreateRoom)) {
        event.preventDefault()
        void createRoom(`thread-${rooms.length + 1}`, [])
        return
      }

      if (event.key === 'Escape') {
        setPendingAppKey(null)
        if (route === '/files') {
          setFileSearchOpen(false)
          setFileSearchQuery('')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    route,
    pendingAppKey,
    shortcuts,
    noteDrawerOpen,
    noteDraft,
    selectedFolderPath,
    selectedNote?.id,
    notes.length,
    selectedDiagram?.id,
    diagrams.length,
    recording,
    selectedRoomId,
    rooms.length,
  ])

  const notePersistenceState: 'saving' | 'unsaved' | 'saved' | null = selectedNote
    ? noteSaveState === 'saving'
      ? 'saving'
      : currentNoteIsDirty()
        ? 'unsaved'
        : 'saved'
    : null

  const notesPageProps = {
    noteFullscreen,
    notesSectionRef,
    notePersistenceState,
    selectedNote,
    noteSaveState,
    noteDrawerOpen,
    activeNoteSplitter,
    notePaneSize,
    noteManagerRef,
    selectedNoteFolderPath,
    noteTree,
    notes,
    selectedNoteId,
    draggingPath: draggingNoteTreePath,
    dropTargetPath: noteTreeDropTargetPath,
    isCompactViewport,
    noteTitleModalOpen,
    noteEditorMode,
    noteDraft,
    selectedNoteDocument,
    activePresence,
    remoteCursors: activeRemoteNoteCursors,
    noteEditorRef,
    noteContextMenu,
    noteContextMenuRef,
    noteContextMenuOpenLeft,
    noteContextSubmenuOpenUp,
    noteContextSubmenu,
    noteClipboardText,
    currentLibraryFolderPath: selectedFolderPath,
    onCreateNote: () => void createNote(),
    onCreateFolder: (name: string, parentPath: string | null) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const nextPath = normalizeFolderPath(parentPath ? `${parentPath}/${trimmed}` : trimmed)
      void (async () => {
        await createManagedFolderLocalFirst(managedPathForNoteFolder(nextPath))
        setCustomFolders((current) => mergeFolderPaths(current, [nextPath]))
        setSelectedFolderPath(nextPath)
        await refreshFilesTree()
        showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onUploadFile: (file: File) => {
      void (async () => {
        const markdown = await file.text()
        const leaf = file.name.replace(/\.[^.]+$/, '') || 'Imported note'
        const note = await createNoteLocalFirst(leaf, selectedFolderPath || 'Inbox', markdown)
        setNotes((current) => [note, ...current])
        setCustomFolders((current) => mergeFolderPaths(current, [note.folder || 'Inbox']))
        rememberPersistedNotes([note, ...notesRef.current])
        setSelectedFolderPath(note.folder || 'Inbox')
        setSelectedNoteId(note.id)
        await refreshFilesTree()
        showActionNotice(`Imported note: ${leaf}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'Inbox') return
      void (async () => {
        const renamed = await renameManagedPathLocalFirst(managedPathForNoteFolder(path), trimmed)
        const nextPath = renamed.path.replace(/^notes\//, '')
        if (getConnectivityState()) {
          const nextNotes = await api.listNotes()
          rememberPersistedNotes(nextNotes)
          setNotes(nextNotes)
          setCustomFolders((current) => rebaseFolderEntries(current, path, nextPath))
          setSelectedFolderPath((current) =>
            current === path || current.startsWith(`${path}/`) ? `${nextPath}${current.slice(path.length)}` : current,
          )
        }
        await refreshFilesTree()
        showActionNotice(`Renamed folder to ${trimmed}`)
      })()
    },
    onSetActiveNoteSplitter: setActiveNoteSplitter,
    onToggleNoteDrawer: () => setNoteDrawerOpen((current) => !current),
    onSelectNote: (note: Note) => {
      void openNoteInNotes(note)
    },
    onDragStart: beginNoteTreeDrag,
    onDragEnd: () => {
      setDraggingNoteTreePath(null)
      setNoteTreeDropTargetPath(null)
    },
    onDropTargetChange: setNoteTreeDropTargetPath,
    onDrop: handleNoteTreeDrop,
    onOpenTitleModal: () => setNoteTitleModalOpen(true),
    onCloseTitleModal: () => setNoteTitleModalOpen(false),
    onChangeSelectedNoteTitle: (value: string) => {
      if (!selectedNote) return
      const nextSelectedNote = { ...selectedNote, title: value }
      applySelectedNoteDocument(selectedNoteDocumentRef.current, { note: nextSelectedNote, markdown: currentNoteMarkdown() })
      window.requestAnimationFrame(() => scheduleNoteDraftBroadcast(currentNoteMarkdown()))
    },
    onRequestSave: () => void saveNote(),
    onDeleteNote: () => void deleteSelectedNote(),
    confirmNoteDelete: adminSettings?.confirm_file_delete ?? true,
    onEnterFullscreen: () => setNoteFullscreen(true),
    onExitFullscreen: () => setNoteFullscreen(false),
    onOpenShareDialog: (target: ShareTarget) => void openShareDialog(target),
    resourceKeyForNote,
    onSetNoteEditorMode: setNoteEditorMode,
    onRichDocumentChange: (document: NoteDocument) => {
      const markdown = markdownFromNoteDocument(document)
      applySelectedNoteDocument(document, { note: selectedNoteRef.current, markdown })
      scheduleNoteDraftBroadcast(markdown)
    },
    handleNoteEditorClick,
    openNoteContextMenu,
    handleNoteEditorInput,
    handleNoteEditorKeyDown,
    onRawDraftChange: (value: string) => {
      applySelectedNoteMarkdown(value)
      scheduleNoteDraftBroadcast(value)
    },
    onRawDraftKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
      handleTextareaTabKeyDown(event, (value) => {
        const nextValue = typeof value === 'function' ? value(noteDraftRef.current) : value
        applySelectedNoteMarkdown(nextValue)
      }, scheduleNoteDraftBroadcast),
    onCopySelection: copyNoteSelection,
    onPasteFromClipboard: pasteIntoNoteFromClipboard,
    onSetNoteContextMenu: setNoteContextMenu,
    onSetNoteContextSubmenu: setNoteContextSubmenu,
    onInsertNoteElement: insertNoteElement,
    onRunToolbarAction: runToolbarAction,
    onAddTableRow: addTableRowFromContext,
    onAddTableColumn: addTableColumnFromContext,
  }

  const filesPageProps = {
    creatingDriveFolder,
    newDriveFolderName,
    pendingDeletePaths,
    pendingDeleteNodes,
    renamingFilePath,
    renameFileName,
    convertingFilePath,
    fileHelpOpen,
    fileManagerRef,
    fileSearchInputRef,
    fileColumnViewRef,
    renameInputRef,
    deleteConfirmButtonRef,
    deleteCancelButtonRef,
    activeSplitter,
    filePreviewOpen,
    filePaneWidths,
    filePaneHeights,
    filesTree,
    displayNameForFileNode,
    selectedFilePath,
    activeFileNode,
    markedFilePaths,
    draggingFilePath,
    dropTargetPath,
    currentDirectoryPath,
    trimmedFileSearchQuery,
    fileSearchOpen,
    fileSearchQuery,
    fileColumnViewOpen,
    fileColumnVisibility,
    showFileTable: !!trimmedFileSearchQuery || currentDirectoryNode?.kind === 'directory',
    fileGridTemplateColumns,
    visibleFileColumns,
    displayedFileNodes,
    onSetCreatingDriveFolder: setCreatingDriveFolder,
    onSetNewDriveFolderName: setNewDriveFolderName,
    onCreateDriveFolderFromSelection: () => void createDriveFolderFromSelection(),
    onSetPendingDeletePaths: setPendingDeletePaths,
    onDeleteManagedPaths: (paths: string[]) => void deleteManagedPaths(paths),
    onSetRenamingFilePath: setRenamingFilePath,
    onSetRenameFileName: setRenameFileName,
    onRenameManagedPath: (path: string | null, name: string) => {
      if (!path) return
      void renameManagedPath(path, name)
    },
    onSetConvertingFilePath: setConvertingFilePath,
    onConvertManagedTextFile: (path: string | null) => {
      if (!path) return
      void convertManagedTextFile(path)
    },
    onSetFileHelpOpen: setFileHelpOpen,
    selectFileTreeNode,
    beginFileDrag,
    onFileDragEnd: () => {
      setDraggingFilePath(null)
      setDropTargetPath(null)
    },
    onDropTargetChange: setDropTargetPath,
    handleDirectoryDrop,
    onSetActiveSplitter: setActiveSplitter,
    onToggleFilePreviewPane: toggleFilePreviewPane,
    onOpenSearch: () => setFileSearchOpen(true),
    onCloseSearch: () => {
      setFileSearchOpen(false)
      setFileSearchQuery('')
    },
    onChangeSearchQuery: setFileSearchQuery,
    goToParentDirectory,
    onToggleFileColumnView: () => setFileColumnViewOpen((current) => !current),
    onToggleFileColumnVisibility: toggleFileColumnVisibility,
    onBeginCreateFolder: () => {
      setCreatingDriveFolder(true)
      setNewDriveFolderName('')
    },
    onHandleDriveUpload: (event: React.ChangeEvent<HTMLInputElement>) => void handleDriveUpload(event),
    beginFileColumnResize,
    renderFileColumnCell,
    onSetActiveFilePath: setActiveFilePath,
    onOpenFileNode: (node: FileNode | null | undefined) => void openFileNode(node),
    canDeleteFilePath,
    canRenameFilePath,
    canConvertFilePath,
    onRequestDeletePaths: requestDeletePaths,
    onOpenShareDialog: (target: ShareTarget) => void openShareDialog(target),
    resourceKeyForFilePath,
    onDownloadManagedPath: downloadManagedPath,
    onBeginRenameCurrentFile: beginRenameCurrentFile,
  }

  const diagramsPageProps = {
    diagramFullscreen,
    standaloneDrawio,
    diagramManagerRef,
    diagramDrawerOpen,
    activeDiagramSplitter,
    diagramPaneSize,
    diagramTree,
    diagramTreeNode: diagramsTreeNode,
    diagrams,
    selectedDiagramId,
    selectedDiagramPath,
    draggingPath: draggingDiagramTreePath,
    dropTargetPath: diagramTreeDropTargetPath,
    selectedDiagram,
    diagramEditorMode,
    diagramDraft,
    diagramLoadVersion,
    diagramSourceFormat,
    drawioEditorRef,
    onCreateDiagram: () => void createDiagram(),
    onCreateFolder: (name: string, parentPath: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const nextPath = normalizeDiagramDirectoryPath(`${parentPath}/${trimmed}`)
      void (async () => {
        await createManagedFolderLocalFirst(managedPathForDiagramFolder(nextPath))
        setCustomDiagramFolders((current) =>
          Array.from(new Set([...current, nextPath])).sort((left, right) => left.localeCompare(right)),
        )
        await refreshFilesTree()
        showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onUploadFile: (file: File) => {
      void (async () => {
        const xml = await file.text()
        const leaf = file.name.replace(/\.[^.]+$/, '') || 'Imported diagram'
        const title = normalizeDiagramTitlePath(`${selectedDiagram ? normalizeDiagramFolderPath(selectedDiagram.title) : 'Diagrams'}/${leaf}`)
        const diagram = await createDiagramLocalFirst(title, xml)
        setDiagrams((current) => [diagram, ...current])
        setSelectedDiagramId(diagram.id)
        await refreshFilesTree()
        showActionNotice(`Imported diagram: ${leaf}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'Diagrams') return
      void (async () => {
        const renamed = await renameManagedPathLocalFirst(managedPathForDiagramFolder(path), trimmed)
        const nextPath = renamed.path.replace(/^diagrams\/?/, '')
        const normalizedNextPath = nextPath ? `Diagrams/${nextPath}` : 'Diagrams'
        if (getConnectivityState()) {
          const nextDiagrams = await api.listDiagrams()
          setDiagrams(nextDiagrams)
          setCustomDiagramFolders((current) => rebaseFolderEntries(current, path, normalizedNextPath))
        }
        await refreshFilesTree()
        showActionNotice(`Renamed folder to ${trimmed}`)
      })()
    },
    onSelectDiagram: setSelectedDiagramId,
    onOpenStandaloneDrawio: () => {
      if (!selectedDiagram) return
      const popup = window.open(getStandaloneDrawioUrl(), '_blank')
      if (!popup) {
        showActionNotice('Allow popups to open draw.io')
        return
      }
      standaloneDrawioWindowRef.current = popup
      standaloneDrawioEditingIdRef.current = selectedDiagram.id
      popup.focus()
    },
    onSelectDiagramPath: (path: string) => {
      const diagramId = diagramIdFromPath(path)
      if (diagramId) {
        setSelectedDiagramId(diagramId)
      }
    },
    onDragStart: beginDiagramTreeDrag,
    onDragEnd: () => {
      setDraggingDiagramTreePath(null)
      setDiagramTreeDropTargetPath(null)
    },
    onDropTargetChange: setDiagramTreeDropTargetPath,
    onDrop: handleDiagramTreeDrop,
    onSetActiveDiagramSplitter: setActiveDiagramSplitter,
    onToggleDiagramDrawer: () => setDiagramDrawerOpen((current) => !current),
    onChangeSelectedDiagramTitle: (value: string) => {
      if (!selectedDiagram) return
      setDiagrams((current) =>
        current.map((diagram) => (diagram.id === selectedDiagram.id ? { ...diagram, title: value } : diagram)),
      )
    },
    onSetDiagramMode: setDiagramMode,
    onSaveDiagram: () => void saveDiagram(),
    onChangeDiagramDraft: setDiagramDraft,
    onDiagramDraftKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
      handleTextareaTabKeyDown(event, setDiagramDraft),
    onPersistDiagramXml: (xml: string) => void persistDiagramXml(xml),
  }

  const voicePageProps = {
    voiceTree: voiceTreeNode,
    voiceDrawerOpen,
    voicePaneSize,
    activeVoiceSplitter,
    memos,
    selectedVoiceMemo,
    selectedVoicePath,
    selectedVoiceMemoSizeBytes: selectedVoiceMemoNode?.size_bytes ?? null,
    currentVoiceFolderPath,
    recording,
    draggingPath: draggingVoiceTreePath,
    dropTargetPath: voiceTreeDropTargetPath,
    onSelectVoicePath: selectVoicePath,
    onCreateFolder: (name: string, parentPath: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const nextPath = normalizeVoiceDirectoryPath(`${parentPath}/${trimmed}`)
      void (async () => {
        await createManagedFolderLocalFirst(managedPathForVoiceFolder(nextPath))
        await refreshFilesTree()
        showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'voice') return
      void (async () => {
        await renameManagedPathLocalFirst(managedPathForVoiceFolder(path), trimmed)
        await refreshFilesTree()
        showActionNotice(`Renamed folder to ${trimmed}`)
      })()
    },
    onDragStart: beginVoiceTreeDrag,
    onDragEnd: () => {
      setDraggingVoiceTreePath(null)
      setVoiceTreeDropTargetPath(null)
    },
    onDropTargetChange: setVoiceTreeDropTargetPath,
    onDrop: handleVoiceTreeDrop,
    onStartVoiceResize: () => setActiveVoiceSplitter(true),
    onToggleVoiceDrawer: () => setVoiceDrawerOpen((current) => !current),
    onOpenRecorder: openRecorderPanel,
    onUploadAudioFile: (file: File) => void uploadAudioFile(file),
    onPollTranscript: (memo: VoiceMemo) => void pollTranscript(memo),
    onRenameVoiceMemo: async (memoId: string, title: string) => {
      const localMemo = memosRef.current.find((entry) => entry.id === memoId)
      if (localMemo?.local_only) {
        await renamePendingVoiceUploadLocalFirst(memoId, title)
        return
      }
      const memo = await api.updateVoiceMemo(memoId, title)
      setMemos((current) => current.map((entry) => (entry.id === memo.id ? memo : entry)))
      await refreshFilesTree()
      showActionNotice(`Renamed memo to ${title}`)
    },
    onDeleteVoiceMemo: async (memoId: string) => {
      const localMemo = memosRef.current.find((entry) => entry.id === memoId)
      if (localMemo?.local_only) {
        await deletePendingVoiceUploadLocalFirst(memoId)
        return
      }
      await deleteVoiceMemo(memoId)
    },
    confirmVoiceDelete: adminSettings?.confirm_file_delete ?? true,
  }

  const primarySelectedCalendarConnectionId = selectedCalendarConnectionIds[0] ?? null
  const calendarPageProps = {
    currentUserId: session?.user.id ?? null,
    googleConfig: googleCalendarConfig,
    connections: calendarConnections,
    selectedConnectionIds: selectedCalendarConnectionIds,
    events: calendarEvents,
    onToggleConnection: (id: string) =>
      setSelectedCalendarConnectionIds((current) => {
        const exists = current.includes(id)
        if (exists) {
          const next = current.filter((entry) => entry !== id)
          return next.length > 0 ? next : current
        }
        return [...current, id]
      }),
    onStartGoogleConnect: () => {
      if (!googleCalendarConfig?.enabled || !googleCalendarConfig.client_id) {
        showActionNotice('Google Calendar is not configured by an admin.')
        return
      }
      const state = globalThis.crypto?.randomUUID?.() || `calendar-${Date.now()}`
      window.sessionStorage.setItem('sweet.calendar.google.state', state)
      const params = new URLSearchParams({
        client_id: googleCalendarConfig.client_id,
        redirect_uri: googleCalendarConfig.redirect_url,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: googleCalendarConfig.scope,
        state,
      })
      window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
    },
    onCreateIcsConnection: async (title: string, url: string) => {
      const connection = await api.createIcsCalendarConnection(title, url)
      await refreshCalendarConnections({ preferredSelectedConnectionIds: [connection.id] })
      setSelectedCalendarConnectionIds([connection.id])
      showActionNotice(`Added ${connection.title}`)
    },
    onCreateLocalConnection: async (title: string) => {
      const connection = await createLocalCalendarConnectionLocalFirst(title)
      if (getConnectivityState()) {
        await refreshCalendarConnections({ preferredSelectedConnectionIds: [connection.id] })
      } else {
        setCalendarConnections((current) => [connection, ...current])
      }
      setSelectedCalendarConnectionIds([connection.id])
      showActionNotice(`Added ${connection.title}`)
    },
    onRenameConnection: async (id: string, title: string) => {
      const connection = await renameCalendarConnectionLocalFirst(id, title)
      setCalendarConnections((current) => current.map((entry) => (entry.id === connection.id ? connection : entry)))
      showActionNotice(`Renamed ${connection.title}`)
    },
    onDeleteConnection: async (id: string) => {
      await deleteCalendarConnectionLocalFirst(id)
      if (getConnectivityState()) {
        await refreshCalendarConnections({
          preferredSelectedConnectionIds: selectedCalendarConnectionIds.filter((entry) => entry !== id),
        })
        if (selectedCalendarConnectionIds.includes(id)) {
          setCalendarEvents([])
        }
      } else {
        setCalendarConnections((current) => current.filter((entry) => entry.id !== id))
        setCalendarEvents((current) => current.filter((event) => event.connection_id !== id))
        setSelectedCalendarConnectionIds((current) => {
          const next = current.filter((entry) => entry !== id)
          return next.length > 0 ? next : (calendarConnections.find((entry) => entry.id !== id)?.id ? [calendarConnections.find((entry) => entry.id !== id)!.id] : [])
        })
      }
      showActionNotice('Removed calendar')
    },
    onRefresh: async () => {
      if (selectedCalendarConnectionIds.length === 0) return
      await refreshCalendarEvents(selectedCalendarConnectionIds)
    },
    onCreateEvent: async (payload: {
      title: string
      description: string
      location: string
      start_at: string
      end_at: string
      all_day: boolean
    }) => {
      if (!primarySelectedCalendarConnectionId) return
      const created = await createCalendarEventLocalFirst(primarySelectedCalendarConnectionId, payload)
      if (getConnectivityState()) {
        await refreshCalendarEvents(selectedCalendarConnectionIds)
      } else {
        setCalendarEvents((current) => [...current, created].sort((left, right) => left.start_at.localeCompare(right.start_at)))
      }
      showActionNotice(`Added ${payload.title}`)
    },
    onUpdateEvent: async (
      eventId: string,
      payload: {
        title: string
        description: string
        location: string
        start_at: string
        end_at: string
        all_day: boolean
      },
    ) => {
      if (!primarySelectedCalendarConnectionId) return
      const updated = await updateCalendarEventLocalFirst(primarySelectedCalendarConnectionId, eventId, payload)
      if (getConnectivityState()) {
        await refreshCalendarEvents(selectedCalendarConnectionIds)
      } else {
        setCalendarEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)))
      }
      showActionNotice(`Updated ${payload.title}`)
    },
    onDeleteEvent: async (eventId: string) => {
      const existingEvent = calendarEvents.find((event) => event.id === eventId)
      if (!existingEvent) return
      await deleteCalendarEventLocalFirst(existingEvent.connection_id, eventId)
      if (getConnectivityState()) {
        await refreshCalendarEvents(selectedCalendarConnectionIds)
      } else {
        setCalendarEvents((current) => current.filter((event) => event.id !== eventId))
      }
      showActionNotice('Deleted event')
    },
    onOpenShareDialog: (target: ShareTarget) => void openShareDialog(target),
    resourceKeyForCalendar,
  }

  const tasksPageProps = {
    tasks,
    selectedTaskId,
    calendars: calendarConnections,
    onSelectTask: (id: string) => setSelectedTaskId(id),
    onCreateTask: async (payload: {
      title: string
      description: string
      start_at?: string | null
      end_at?: string | null
      all_day: boolean
      calendar_connection_id?: string | null
    }) => {
      const created = await createTaskLocalFirst(payload)
      setSelectedTaskId(created.id)
      if (getConnectivityState()) {
        await refreshTasks({ preferredSelectedTaskId: created.id })
        if (payload.calendar_connection_id && selectedCalendarConnectionIds.includes(payload.calendar_connection_id)) {
          await refreshCalendarEvents(selectedCalendarConnectionIds)
        }
      } else {
        setTasks((current) => [created, ...current])
      }
      showActionNotice(`Added ${payload.title}`)
    },
    onUpdateTask: async (
      id: string,
      payload: {
        title: string
        description: string
        status: 'open' | 'completed'
        start_at?: string | null
        end_at?: string | null
        all_day: boolean
        calendar_connection_id?: string | null
      },
    ) => {
      const previous = tasks.find((task) => task.id === id)
      const updated = await updateTaskLocalFirst(id, payload)
      setSelectedTaskId(updated.id)
      if (getConnectivityState()) {
        await refreshTasks({ preferredSelectedTaskId: updated.id })
      } else {
        setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)))
      }
      const refreshIds = new Set<string>()
      if (previous?.calendar_connection_id) refreshIds.add(previous.calendar_connection_id)
      if (payload.calendar_connection_id) refreshIds.add(payload.calendar_connection_id)
      if (selectedCalendarConnectionIds.some((id) => refreshIds.has(id))) {
        if (getConnectivityState()) {
          await refreshCalendarEvents(selectedCalendarConnectionIds)
        } else {
          setCalendarEvents((current) => current)
        }
      }
    },
    onDeleteTask: async (id: string) => {
      const previous = tasks.find((task) => task.id === id)
      await deleteTaskLocalFirst(id)
      if (getConnectivityState()) {
        const remaining = tasks.filter((task) => task.id !== id)
        const fallbackSelection = remaining.find((task) => task.id === selectedTaskId)?.id ?? remaining[0]?.id ?? null
        await refreshTasks({ preferredSelectedTaskId: fallbackSelection })
      } else {
        setTasks((current) => current.filter((task) => task.id !== id))
        setSelectedTaskId((current) => (current === id ? tasks.find((task) => task.id !== id)?.id ?? null : current))
      }
      if (previous?.calendar_connection_id && selectedCalendarConnectionIds.includes(previous.calendar_connection_id)) {
        if (getConnectivityState()) {
          await refreshCalendarEvents(selectedCalendarConnectionIds)
        }
      }
      showActionNotice('Deleted task')
    },
  }

  const chatPageProps = {
    chatManagerRef,
    chatDrawerOpen,
    chatPaneSize,
    activeChatSplitter,
    currentUserId: session?.user.id ?? null,
    currentUserLabel: session?.user.display_name ?? 'You',
    comsParticipants,
    rooms,
    roomUnreadCounts,
    selectedRoomId,
    selectedRoom,
    messages,
    activeCallRoomId,
    callJoined,
    callMediaMode,
    screenSharing,
    remoteParticipants,
    localVideoRef,
    onCreateRoom: (name: string, participantIds: string[]) => createRoom(name, participantIds),
    onCreateDirectRoom: (participantIds: string[]) => void createDirectRoom(participantIds),
    onDeleteRoom: deleteRoom,
    confirmRoomDelete: adminSettings?.confirm_file_delete ?? true,
    onRenameRoom: renameRoom,
    onUpdateRoomParticipants: updateRoomParticipants,
    onSelectRoom: setSelectedRoomId,
    onJoinVoiceCall: () => void joinCall('audio'),
    onJoinVideoCall: () => void joinCall('video'),
    onToggleScreenShare: () => void (screenSharing ? stopScreenShare() : startScreenShare()),
    onLeaveCall: leaveCall,
    onStartChatResize: () => setActiveChatSplitter(true),
    onToggleChatDrawer: () => setChatDrawerOpen((current) => !current),
    onSendMessage: sendMessage,
    onToggleMessageReaction: toggleMessageReaction,
  }

  const settingsPageProps = {
    appearance,
    shortcuts,
    orderedNavItems,
    session,
    canCustomizeAppearance: !adminSettings?.enforce_org_appearance && currentRolePolicy.customize_appearance,
    allowDirectCredentialChanges: adminSettings?.allow_user_credential_changes ?? true,
    onSetAppearance: setAppearance,
    onSetShortcuts: setShortcuts,
    onSetNavOrder: setNavOrder,
    onUploadAvatar: uploadCurrentUserAvatar,
    onUpdateCredentials: updateCurrentUserCredentials,
    onChangePassword: changeCurrentUserPassword,
    onLogout: logout,
  }

  const adminPageProps = {
    isAdmin: currentRolePolicy.admin_panel,
    canManageUsers: currentRolePolicy.manage_users,
    canManageOrgSettings: currentRolePolicy.manage_org_settings,
    settings: adminSettings,
    users: adminUsers,
    storageOverview: adminStorageOverview,
    databaseOverview: adminDatabaseOverview,
    currentFontFamily: appearance.fontFamily,
    currentAccent: appearance.accent,
    currentPageGutter: appearance.pageGutter,
    currentRadius: appearance.radius,
    oidcConfig: oidc,
    systemUpdateStatus,
    onRefreshDatabaseOverview: () => void refreshAdminDatabaseOverview(),
    onSave: (settings: AdminSettings) => void saveAdminSettings(settings),
    onRefreshSystemUpdateStatus: () => void refreshSystemUpdateStatus(),
    onRunSystemUpdate: () => void runSystemUpdate(),
    onApplyCurrentAppearance: () => {
      if (!adminSettings) return
      void saveAdminSettings({
        ...adminSettings,
        org_font_family: appearance.fontFamily,
        org_accent: appearance.accent,
        org_background: appearance.background,
        org_disable_gradients: appearance.disableGradients,
        org_gradient_top_left: appearance.gradientTopLeft,
        org_gradient_top_right: appearance.gradientTopRight,
        org_gradient_bottom_left: appearance.gradientBottomLeft,
        org_gradient_bottom_right: appearance.gradientBottomRight,
        org_gradient_strength: appearance.gradientStrength,
        org_page_gutter: appearance.pageGutter,
        org_radius: appearance.radius,
      })
    },
    onCreateUser: createAdminUser,
    onResetPassword: (userId: string, password: string) => void resetAdminUserPassword(userId, password),
    onUpdateUserAccess: (userId: string, payload: import('./lib/types').UpdateUserAccessRequest) =>
      void updateAdminUserAccess(userId, payload),
    onResolveCredentialRequest: (userId: string, approve: boolean) =>
      void resolveAdminUserCredentialRequest(userId, approve),
  }

  if (authMode !== 'ready') {
    return (
      <div className={`app-shell theme-${effectiveAppearance.mode}`} style={appearanceStyle}>
        <AuthPage
          mode={authMode === 'connect' ? 'connect' : authMode === 'setup' ? 'setup' : authMode === 'change-password' ? 'change-password' : 'login'}
          status={status}
          ssoConfigured={setupStatus?.sso_configured ?? false}
          serverUrl={serverUrl}
          onSaveServerUrl={async (url) => {
            const normalized = normalizeServerConnectionUrl(url)
            if (!normalized) {
              setStatus('Enter your Home Suite Home server URL')
              setAuthMode('connect')
              return
            }
            await api.setServerBaseUrl(normalized)
            setServerUrl(normalized)
            setAuthMode('boot')
            setStatus(`Connecting to ${normalized}`)
            await bootstrap()
          }}
          onEditServerUrl={authMode !== 'connect' && isNativePlatform() ? () => setAuthMode('connect') : undefined}
          onLogin={(identifier, password) => loginWithPassword(identifier, password)}
          onSetupAdmin={(payload) => setupAdminAccount(payload)}
          onChangePassword={(payload) => changePasswordFirstUse(payload)}
        />
      </div>
    )
  }

  return (
    <div className={`app-shell theme-${effectiveAppearance.mode}`} style={appearanceStyle}>
      {!standaloneDrawio ? (
        <TopNav
          orderedNavItems={orderedNavItems}
          route={route}
          currentUser={session?.user ?? null}
          navUnreadCounts={{ '/coms': comsUnreadCount }}
          shortcutsHelpOpen={shortcutsHelpOpen}
          onNavigate={(path) => void navigate(path)}
          onToggleShortcutsHelp={() => setShortcutsHelpOpen((current) => !current)}
          onSetShortcutsHelpOpen={setShortcutsHelpOpen}
          shortcutsContent={<ShortcutsPopover shortcuts={shortcuts} />}
        />
      ) : null}
      {syncNotice ? <ConnectionBanner tone={syncNotice.tone} message={syncNotice.message} /> : null}

      {actionNotice ? <ActionNotice id={actionNotice.id} message={actionNotice.message} /> : null}
      <SyncConflictsPanel
        conflicts={syncConflicts}
        open={syncConflictsOpen}
        onToggleOpen={() => setSyncConflictsOpen((current) => !current)}
        onRetry={(id) => void retrySyncConflict(id)}
        onDiscard={(id) => void discardSyncConflict(id)}
        onRetryAll={() => void retryAllSyncConflicts()}
        onDiscardAll={() => void discardAllSyncConflicts()}
        onOpenTarget={(id) => void openSyncConflictTarget(id)}
      />
      <ShareModal
        shareTarget={shareTarget}
        shareDraft={shareDraft}
        shareUserQuery={shareUserQuery}
        shareSaving={shareSaving}
        participants={comsParticipants}
        onClose={() => setShareTarget(null)}
        onSetVisibility={setShareVisibility}
        onSetQuery={setShareUserQuery}
        onToggleUser={toggleShareUser}
        onSave={() => void saveShareSettings()}
      />
      <FloatingActivityPanels
        recording={recording}
        recorderOpen={recording}
        voiceInputLevel={voiceInputLevel}
        callJoined={callJoined}
        callOverlayOpen={callJoined}
        callRoomName={activeCallRoom ? (activeCallRoom.kind === 'direct' ? activeCallRoom.name : `#${activeCallRoom.name}`) : null}
        callMode={callMediaMode}
        screenSharing={screenSharing}
        callParticipants={floatingCallParticipants}
        onCloseRecorder={() => undefined}
        onStopRecording={() => void toggleRecording()}
        onCloseCall={() => undefined}
        onOpenCallRoom={() => {
          if (activeCallRoomId) {
            setSelectedRoomId(activeCallRoomId)
          }
          void navigate('/coms')
        }}
        onToggleScreenShare={() => void (screenSharing ? stopScreenShare() : startScreenShare())}
        onLeaveCall={leaveCall}
      />

      <AppPageRenderer
        route={route}
        notesPageProps={notesPageProps}
        filesPageProps={filesPageProps}
        diagramsPageProps={diagramsPageProps}
        voicePageProps={voicePageProps}
        calendarPageProps={calendarPageProps}
        tasksPageProps={tasksPageProps}
        chatPageProps={chatPageProps}
        settingsPageProps={settingsPageProps}
        adminPageProps={adminPageProps}
      />
    </div>
  )
}

export default App
