import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import './App.css'
import { ActionNotice } from './components/ActionNotice'
import { AppPageRenderer } from './components/AppPageRenderer'
import { getDrawioBaseUrl, getStandaloneDrawioUrl, type DrawioDiagramEditorHandle } from './components/DrawioDiagramEditor'
import { FloatingActivityPanels } from './components/FloatingActivityPanels'
import { ShareModal } from './components/ShareModal'
import { ShortcutsPopover } from './components/ShortcutsPopover'
import { TopNav } from './components/TopNav'
import { api } from './lib/api'
import { diagramIdFromPath as diagramIdFromManagedPath, noteIdFromPath, noteTitleFromPath } from './lib/file-display'
import {
  importedFolderForPath,
  type FileColumnKey,
} from './lib/file-browser'
import { createFileMutationActions } from './lib/file-mutations'
import { createFileNavigationActions } from './lib/file-navigation'
import { createNoteActions, type NotePresenceEntry } from './lib/note-actions'
import { createAdminActions } from './lib/admin-actions'
import { createVoiceActions } from './lib/voice-actions'
import { createRtcActions, type SignalPayload } from './lib/rtc-actions'
import { createNoteEditorActions } from './lib/note-editor-actions'
import { createAuthActions } from './lib/auth-actions'
import { createShareActions, type ShareTarget } from './lib/share-actions'
import { createDiagramActions } from './lib/diagram-actions'
import { createComsActions } from './lib/coms-actions'
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
  Diagram,
  FileNode,
  Message,
  Note,
  OidcConfig,
  ResourceShare,
  RealtimeEvent,
  Room,
  RtcConfig,
  SetupStatusResponse,
  SessionResponse,
  UserProfile,
  VoiceMemo,
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
  defaultNoteTitle,
  deriveDirectoryPath,
  deriveParentPath,
  diagramDisplayName,
  findFileNode,
  flattenFileNodes,
  isEditableTarget,
  managedPathForDiagramFolder,
  managedPathForNoteFolder,
  managedPathForVoiceFolder,
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

type FileColumnVisibility = Record<FileColumnKey, boolean>

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function App() {
  const [route, setRoute] = useState<RoutePath>(normalizeRoute(window.location.pathname))
  const [locationSearch, setLocationSearch] = useState(window.location.search)
  const [authMode, setAuthMode] = useState<'boot' | 'setup' | 'login' | 'change-password' | 'ready'>('boot')
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null)
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [oidc, setOidc] = useState<OidcConfig | null>(null)
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null)
  const [adminUsers, setAdminUsers] = useState<import('./lib/types').AdminUserSummary[]>([])
  const [adminStorageOverview, setAdminStorageOverview] = useState<import('./lib/types').AdminStorageOverview | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState(demoMarkdown)
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
  const noteEditorModeRef = useRef<NoteEditorMode>('rich')
  const selectedFolderPathRef = useRef(selectedFolderPath)
  const noteDraftRef = useRef(noteDraft)
  const notesRef = useRef<Note[]>([])
  const diagramsRef = useRef<Diagram[]>([])
  const persistedNoteStateRef = useRef<Record<string, { title: string; folder: string; markdown: string }>>({})
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
  const {
    saveAdminSettings,
    createAdminUser,
    resetAdminUserPassword,
    updateAdminUserAccess,
    resolveAdminUserCredentialRequest,
  } = createAdminActions({
    session,
    setAdminSettings,
    setAdminStorageOverview,
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
    refreshFilesTree,
    showActionNotice,
  })
  const activePresence = selectedNoteId ? notePresence[selectedNoteId] ?? [] : []
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
    selectedNoteRef,
    selectedNoteIdRef,
    selectedFolderPathRef,
    notesRef,
    persistedNoteStateRef,
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
    setCustomFolders,
    setSelectedNoteId,
    setSelectedFolderPath,
    setStatus,
    setRoute,
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
    showActionNotice,
  })
  const { createRoom, createDirectRoom, renameRoom, updateRoomParticipants, deleteRoom, sendMessage } =
    createComsActions({
      rooms,
      comsParticipants,
      selectedRoomId,
      selectedRoomIdRef,
      activeCallRoomIdRef,
      callJoinedRef,
      setMessages,
      refreshRooms,
      leaveCall,
      showActionNotice,
    })
  const {
    insertNoteElement,
    addTableRowFromContext,
    addTableColumnFromContext,
    copyNoteSelection,
    pasteIntoNoteFromClipboard,
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
    setNoteDraft,
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
    selectedFolderPathRef.current = selectedFolderPath
  }, [selectedFolderPath])

  useEffect(() => {
    noteDraftRef.current = noteDraft
  }, [noteDraft])

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
        accent: typeof parsed.accent === 'string' ? parsed.accent : DEFAULT_APPEARANCE.accent,
        fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : DEFAULT_APPEARANCE.fontFamily,
        background: typeof parsed.background === 'string' ? parsed.background : DEFAULT_APPEARANCE.background,
        gradientStart:
          typeof parsed.gradientStart === 'string'
            ? parsed.gradientStart
            : DEFAULT_APPEARANCE.gradientStart,
        gradientEnd:
          typeof parsed.gradientEnd === 'string' ? parsed.gradientEnd : DEFAULT_APPEARANCE.gradientEnd,
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
    setNoteDraft(selectedNote?.markdown ?? '')
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
    const pendingRestore = pendingLocalDraftRestoreRef.current
    const markdown =
      pendingRestore && pendingRestore.noteId === selectedNote?.id
        ? pendingRestore.markdown
        : (selectedNote?.markdown ?? '')
    const currentMarkdown = editableHtmlToMarkdown(noteEditorRef.current)
    if (currentMarkdown !== markdown) {
      noteEditorRef.current.innerHTML = markdownToEditableHtml(markdown)
    }
    if (pendingRestore?.noteId === selectedNote?.id) {
      pendingLocalDraftRestoreRef.current = null
    }
  }, [route, selectedNote?.id, selectedNote?.revision, noteEditorMode])

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
        const updated = await api.updateDiagram({ ...currentDiagram, xml })
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
    const socket = new WebSocket(api.apiBase.replace('http', 'ws') + '/ws/realtime')
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
      if (payload.type === 'note_patch') {
        const currentSelected = selectedNoteRef.current
        const editorHasLocalFocus =
          document.activeElement === noteEditorRef.current ||
          (document.activeElement instanceof HTMLTextAreaElement &&
            document.activeElement.classList.contains('note-raw-editor'))
        const selectedDirty =
          payload.note_id === selectedNoteIdRef.current &&
          currentSelected?.id === payload.note_id &&
          currentNoteIsDirty() &&
          editorHasLocalFocus

        startTransition(() => {
          persistedNoteStateRef.current[payload.note_id] = {
            title: payload.title,
            folder: payload.folder,
            markdown: payload.markdown,
          }
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
                    markdown: payload.markdown,
                    revision: payload.revision,
                  }
                : note,
            ),
          )
        })

        if (payload.note_id === selectedNoteIdRef.current) {
          if (!selectedDirty) {
            setNoteDraft(payload.markdown)
            setSelectedFolderPath(normalizeFolderPath(payload.folder || 'Inbox'))
          }
        }
      }
      if (payload.type === 'note_draft') {
        if (payload.client_id === clientIdRef.current) return
        const isSelectedNote = payload.note_id === selectedNoteIdRef.current
        const editorHasLocalFocus = document.activeElement === noteEditorRef.current
        const selectedDirty = isSelectedNote && currentNoteIsDirty()

        startTransition(() => {
          setNotes((current) =>
            current.map((note) =>
              note.id === payload.note_id
                ? {
                    ...note,
                    title: payload.title,
                    folder: payload.folder,
                    markdown: payload.markdown,
                    revision: Math.max(note.revision, payload.revision),
                  }
                : note,
            ),
          )
        })

        if (isSelectedNote) {
          registerPresence(payload.note_id, payload.user)
          if (!(selectedDirty && editorHasLocalFocus)) {
            setNoteDraft(payload.markdown)
            setSelectedFolderPath(normalizeFolderPath(payload.folder || 'Inbox'))
            if (noteEditorModeRef.current === 'rich' && noteEditorRef.current) {
              noteEditorRef.current.innerHTML = markdownToEditableHtml(payload.markdown)
            }
          }
        }
      }
      if (payload.type === 'note_presence') {
        registerPresence(payload.note_id, payload.user)
      }
      if (payload.type === 'signal' && payload.room_id === activeCallRoomIdRef.current) {
        void handleSignal(payload.from, payload.payload as SignalPayload)
      }
    }

    socket.onclose = () => setStatus('Realtime disconnected')
    return () => socket.close()
  }, [])

  useEffect(() => {
    if (!selectedNoteId || !session) {
      return
    }
    broadcastPresence()
    const interval = window.setInterval(() => {
      broadcastPresence()
      prunePresence()
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [selectedNoteId, session?.user.id])

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

  useEffect(() => () => cleanupCallState(), [])

  function applyUpdatedUserProfile(profile: UserProfile) {
    setSession((current) => {
      if (!current) return current
      const next = { ...current, user: profile }
      window.localStorage.setItem('sweet.session', JSON.stringify(next))
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
    setRooms,
    setRoomUnreadCounts,
    setComsParticipants,
    setSelectedRoomId,
    setMessages,
    setRtcConfig,
    rememberPersistedNotes,
    normalizeFolderPath,
    mergeFolderPaths,
    applyUpdatedUserProfile,
    showActionNotice,
  })
  const {
    resourceKeyForFilePath,
    resourceKeyForNote,
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

  async function refreshFilesTree() {
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
      const updated = await api.updateNote({ ...note, title, folder: nextFolder, markdown })
      setNotes((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      persistedNoteStateRef.current[updated.id] = {
        title: updated.title,
        folder: updated.folder,
        markdown: updated.markdown,
      }
      locallyDirtyNoteIdsRef.current.delete(updated.id)
      if (updated.id === selectedNoteIdRef.current) {
        setSelectedFolderPath(nextFolder)
        setNoteDraft(updated.markdown)
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
        return api.updateNote({ ...note, title, folder: updatedFolder, markdown })
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
        setNoteDraft(updatedSelected.markdown)
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
      const updated = await api.updateDiagram({
        ...diagram,
        title: `${destinationDir}/${diagramDisplayName(diagram.title)}`,
      })
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
        api.updateDiagram({
          ...diagram,
          title: rebaseTitle(diagram.title),
        }),
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

    function onMouseMove(event: MouseEvent) {
      const root = fileManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 760px)').matches
      const minLeft = 120
      const minCenter = 280
      const minRight = 180
      const minTop = 120
      const minMiddle = 180
      const minBottom = 160

      if (stacked) {
        if (activeSplitter === 'left') {
          const maxTop = rect.height - filePaneHeights.middle - minBottom - splitterWidth * 2
          const nextTop = Math.min(maxTop, Math.max(minTop, event.clientY - rect.top))
          setFilePaneHeights((current) => ({ ...current, top: Math.round(nextTop) }))
          return
        }

        const topOffset = rect.top + filePaneHeights.top + splitterWidth
        const maxMiddle = rect.height - filePaneHeights.top - minBottom - splitterWidth * 2
        const nextMiddle = Math.min(maxMiddle, Math.max(minMiddle, event.clientY - topOffset))
        setFilePaneHeights((current) => ({ ...current, middle: Math.round(nextMiddle) }))
        return
      }

      if (activeSplitter === 'left') {
        const nextLeft = Math.min(
          rect.width - minCenter - minRight - splitterWidth * 2,
          Math.max(minLeft, event.clientX - rect.left),
        )
        setFilePaneWidths((current) => ({ ...current, left: Math.round(nextLeft) }))
        return
      }

      const nextRight = Math.min(
        rect.width - minCenter - minLeft - splitterWidth * 2,
        Math.max(minRight, rect.right - event.clientX),
      )
      filePreviewWidthRef.current = Math.round(nextRight)
      if (!filePreviewOpen) {
        setFilePreviewOpen(true)
      }
      setFilePaneWidths((current) => ({ ...current, right: Math.round(nextRight) }))
    }

    function onMouseUp() {
      setActiveSplitter(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
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

    function onMouseMove(event: MouseEvent) {
      const root = noteManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, event.clientY - rect.top))
        setNotePaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, event.clientX - rect.left))
      setNotePaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onMouseUp() {
      setActiveNoteSplitter(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeNoteSplitter, noteDrawerOpen])

  useEffect(() => {
    if (!activeDiagramSplitter || !diagramDrawerOpen) return

    function onMouseMove(event: MouseEvent) {
      const root = diagramManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 340
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, event.clientY - rect.top))
        setDiagramPaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 120
      const minRight = 420
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, event.clientX - rect.left))
      setDiagramPaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onMouseUp() {
      setActiveDiagramSplitter(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
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

    function onMouseMove(event: MouseEvent) {
      const root = document.querySelector('.voice-manager') as HTMLElement | null
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, event.clientY - rect.top))
        setVoicePaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, event.clientX - rect.left))
      setVoicePaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onMouseUp() {
      setActiveVoiceSplitter(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeVoiceSplitter, voiceDrawerOpen])

  useEffect(() => {
    if (!activeChatSplitter || !chatDrawerOpen) return

    function onMouseMove(event: MouseEvent) {
      const root = chatManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, event.clientY - rect.top))
        setChatPaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, event.clientX - rect.left))
      setChatPaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onMouseUp() {
      setActiveChatSplitter(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
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
    activePresence,
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
        await api.createDriveFolder(managedPathForNoteFolder(nextPath))
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
        const note = await api.createNote(leaf, selectedFolderPath || 'Inbox', markdown)
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
        const renamed = await api.renameFile(managedPathForNoteFolder(path), trimmed)
        const nextPath = renamed.path.replace(/^notes\//, '')
        const nextNotes = await api.listNotes()
        rememberPersistedNotes(nextNotes)
        setNotes(nextNotes)
        setCustomFolders((current) => rebaseFolderEntries(current, path, nextPath))
        setSelectedFolderPath((current) =>
          current === path || current.startsWith(`${path}/`) ? `${nextPath}${current.slice(path.length)}` : current,
        )
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
      setNotes((current) => current.map((note) => (note.id === selectedNote.id ? { ...note, title: value } : note)))
      window.requestAnimationFrame(() => scheduleNoteDraftBroadcast(currentNoteMarkdown()))
    },
    onRequestSave: () => void saveNote(),
    onOpenShareDialog: (target: ShareTarget) => void openShareDialog(target),
    resourceKeyForNote,
    onSetNoteEditorMode: setNoteEditorMode,
    handleNoteEditorClick,
    openNoteContextMenu,
    handleNoteEditorInput,
    handleNoteEditorKeyDown,
    onRawDraftChange: (value: string) => {
      setNoteDraft(value)
      scheduleNoteDraftBroadcast(value)
    },
    onRawDraftKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
      handleTextareaTabKeyDown(event, setNoteDraft, scheduleNoteDraftBroadcast),
    onCopySelection: copyNoteSelection,
    onPasteFromClipboard: pasteIntoNoteFromClipboard,
    onSetNoteContextMenu: setNoteContextMenu,
    onSetNoteContextSubmenu: setNoteContextSubmenu,
    onInsertNoteElement: insertNoteElement,
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
        await api.createDriveFolder(managedPathForDiagramFolder(nextPath))
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
        const diagram = await api.createDiagram(title, xml)
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
        const renamed = await api.renameFile(managedPathForDiagramFolder(path), trimmed)
        const nextPath = renamed.path.replace(/^diagrams\/?/, '')
        const normalizedNextPath = nextPath ? `Diagrams/${nextPath}` : 'Diagrams'
        const nextDiagrams = await api.listDiagrams()
        setDiagrams(nextDiagrams)
        setCustomDiagramFolders((current) => rebaseFolderEntries(current, path, normalizedNextPath))
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
        await api.createDriveFolder(managedPathForVoiceFolder(nextPath))
        await refreshFilesTree()
        showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'voice') return
      void (async () => {
        await api.renameFile(managedPathForVoiceFolder(path), trimmed)
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
    onDeleteVoiceMemo: deleteVoiceMemo,
    confirmVoiceDelete: adminSettings?.confirm_file_delete ?? true,
  }

  const chatPageProps = {
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
  }

  const settingsPageProps = {
    appearance,
    shortcuts,
    orderedNavItems,
    session,
    status,
    oidc,
    rtcConfig,
    clientId: clientIdRef.current,
    canCustomizeAppearance: !adminSettings?.enforce_org_appearance && currentRolePolicy.customize_appearance,
    onSetAppearance: setAppearance,
    onSetShortcuts: setShortcuts,
    onSetNavOrder: setNavOrder,
    onUploadAvatar: uploadCurrentUserAvatar,
    onUpdateCredentials: updateCurrentUserCredentials,
    onChangePassword: changeCurrentUserPassword,
  }

  const adminPageProps = {
    isAdmin: currentRolePolicy.admin_panel,
    canManageUsers: currentRolePolicy.manage_users,
    canManageOrgSettings: currentRolePolicy.manage_org_settings,
    settings: adminSettings,
    users: adminUsers,
    storageOverview: adminStorageOverview,
    currentFontFamily: appearance.fontFamily,
    currentAccent: appearance.accent,
    currentPageGutter: appearance.pageGutter,
    currentRadius: appearance.radius,
    onSave: (settings: AdminSettings) => void saveAdminSettings(settings),
    onApplyCurrentAppearance: () => {
      if (!adminSettings) return
      void saveAdminSettings({
        ...adminSettings,
        org_font_family: appearance.fontFamily,
        org_accent: appearance.accent,
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
          mode={authMode === 'setup' ? 'setup' : authMode === 'change-password' ? 'change-password' : 'login'}
          status={status}
          ssoConfigured={setupStatus?.sso_configured ?? false}
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

      {actionNotice ? <ActionNotice id={actionNotice.id} message={actionNotice.message} /> : null}
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
        chatPageProps={chatPageProps}
        settingsPageProps={settingsPageProps}
        adminPageProps={adminPageProps}
      />
    </div>
  )
}

export default App
