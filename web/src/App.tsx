import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import './App.css'
import { ActionNotice } from './components/ActionNotice'
import { ConfirmModal } from './components/ConfirmModal'
import { DiagramLibraryTreeNode } from './components/DiagramLibraryTreeNode'
import { DrawioDiagramEditor, getDrawioBaseUrl, type DrawioDiagramEditorHandle } from './components/DrawioDiagramEditor'
import { FileTreeNode } from './components/FileTreeNode'
import { NoteLibraryTreeNode } from './components/NoteLibraryTreeNode'
import { ShortcutsPopover } from './components/ShortcutsPopover'
import { TopNav } from './components/TopNav'
import { api } from './lib/api'
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
  applyMarkdownShortcut,
  createParagraphElement,
  createTableElement,
  editableInlineText,
  editableHtmlToMarkdown,
  ensureEditorBlocks,
  getCurrentBlock,
  isSelectionAtEndOfElement,
  markdownToEditableHtml,
  moveCaretToEnd,
  rangeFromViewportPoint,
  transformBlockToCodeFence,
  transformBlockToListItem,
  transformBlockToOrderedListItem,
  transformBlockToTaskListItem,
} from './lib/markdown-editor'
import {
  createBrowserSpeechRecognition,
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
  ResourceVisibility,
  RealtimeEvent,
  Room,
  RtcConfig,
  SetupAdminRequest,
  SetupStatusResponse,
  SessionResponse,
  TranscriptionJob,
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
  fileTypeLabel,
  findFileNode,
  flattenFileNodes,
  formatFileSize,
  formatFileTimestamp,
  insertTextAtSelection,
  isEditableTarget,
  mergeFolderPaths,
  normalizeDiagramFolderPath,
  normalizeFolderPath,
  type NoteInsertKind,
} from './lib/ui-helpers'
import { ChatPage } from './pages/ChatPage'
import { AdminPage } from './pages/AdminPage'
import { AuthPage } from './pages/AuthPage'
import { SettingsPage } from './pages/SettingsPage'
import { VoicePage } from './pages/VoicePage'

type SignalPayload =
  | { kind: 'join'; label: string; tracks: string[] }
  | { kind: 'offer'; label: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; label: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'leave' }

type NotePresence = {
  user: string
  seenAt: number
}

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type FileColumnKey = 'name' | 'directory' | 'type' | 'size' | 'modified' | 'created'

type FileColumnVisibility = Record<FileColumnKey, boolean>

type ShareTarget = {
  resourceKey: string
  label: string
}

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function App() {
  const [route, setRoute] = useState<RoutePath>(normalizeRoute(window.location.pathname))
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
  const [status, setStatus] = useState('Bootstrapping workspace')
  const [actionNotice, setActionNotice] = useState<ActionNoticeState | null>(null)
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
  const [shareDraft, setShareDraft] = useState<ResourceShare | null>(null)
  const [shareUserQuery, setShareUserQuery] = useState('')
  const [shareSaving, setShareSaving] = useState(false)
  const [noteSaveState, setNoteSaveState] = useState<'idle' | 'saving'>('idle')
  const [, setNoteDirtyVersion] = useState(0)
  const [callJoined, setCallJoined] = useState(false)
  const [activeCallRoomId, setActiveCallRoomId] = useState<string | null>(null)
  const [callMediaMode, setCallMediaMode] = useState<'audio' | 'video' | null>(null)
  const [screenSharing, setScreenSharing] = useState(false)
  const [notePresence, setNotePresence] = useState<Record<string, NotePresence[]>>({})
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
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
  const persistedNoteStateRef = useRef<Record<string, { title: string; folder: string; markdown: string }>>({})
  const locallyDirtyNoteIdsRef = useRef<Set<string>>(new Set())
  const pendingLocalDraftRestoreRef = useRef<{ noteId: string; markdown: string } | null>(null)
  const noteSavePromiseRef = useRef<Promise<boolean> | null>(null)
  const rtcConfigRef = useRef<RtcConfig | null>(null)
  const callJoinedRef = useRef(false)
  const activeCallRoomIdRef = useRef<string | null>(null)
  const clientIdRef = useRef(createClientId())
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const selectedNoteFolderPath = selectedNote ? normalizeFolderPath(selectedNote.folder || 'Inbox') : null
  const selectedDiagram = diagrams.find((diagram) => diagram.id === selectedDiagramId) ?? null
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedVoiceMemo = memos.find((memo) => memo.id === selectedVoiceMemoId) ?? null
  const activePresence = selectedNoteId ? notePresence[selectedNoteId] ?? [] : []
  const clientLabel = session
    ? `${session.user.display_name} (${clientIdRef.current.slice(0, 6)})`
    : `Guest (${clientIdRef.current.slice(0, 6)})`
  const noteTree = useMemo(() => buildNoteTree(notes, customFolders), [notes, customFolders])
  const diagramTree = useMemo(() => buildDiagramTree(diagrams), [diagrams])
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
  const directoryNodes = currentDirectoryNode?.children ?? []
  const allFileNodes = useMemo(() => flattenFileNodes(filesTree), [filesTree])
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
    const handlePopState = () => setRoute(normalizeRoute(window.location.pathname))
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

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

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
    setNoteDraft(selectedNote?.markdown ?? '')
  }, [selectedNote?.id])

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

  async function bootstrap() {
    try {
      setStatus('Connecting to API')
      const callbackParams = new URLSearchParams(window.location.search)
      const callbackCode = callbackParams.get('code')
      const callbackState = callbackParams.get('state') ?? undefined
      const [oidcConfig, setup] = await Promise.all([api.oidcConfig(), api.setupStatus()])
      setOidc(oidcConfig)
      setSetupStatus(setup)
      if (!setup.admin_exists) {
        setAuthMode('setup')
        setStatus('Create the first admin account')
        return
      }

      let sessionData: SessionResponse | null = null
      if (window.location.pathname === '/auth/oidc/callback' && callbackCode) {
        sessionData = await api.oidcCallback(callbackCode, callbackState)
      } else {
        const stored = window.localStorage.getItem('sweet.session')
        if (stored) {
          try {
            sessionData = JSON.parse(stored) as SessionResponse
          } catch {
            window.localStorage.removeItem('sweet.session')
          }
        }
      }

      if (!sessionData) {
        setAuthMode('login')
        setStatus('Sign in to continue')
        return
      }

      await hydrateWorkspace(sessionData)
      if (window.location.pathname === '/auth/oidc/callback') {
        window.history.replaceState({}, '', '/notes')
        setRoute('/notes')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to connect')
    }
  }

  async function hydrateWorkspace(sessionData: SessionResponse) {
    window.localStorage.setItem('sweet.session', JSON.stringify(sessionData))
    setSession(sessionData)
    const [nextNotes, nextFiles, nextDiagrams, nextMemos, nextRooms, nextComsParticipants, nextRtc, nextAdminSettings, nextUsers, nextAdminStorageOverview] =
      await Promise.all([
        api.listNotes(),
        api.listFilesTree(),
        api.listDiagrams(),
        api.listVoiceMemos(),
        api.listRooms(),
        api.listComsParticipants(),
        api.callConfig(),
        api.getAdminSettings(),
        api.listUsers(),
        api.getAdminStorageOverview(),
      ])

    setAdminSettings(nextAdminSettings)
    setAdminUsers(nextUsers)
    setAdminStorageOverview(nextAdminStorageOverview)
    rememberPersistedNotes(nextNotes)
    setNotes(nextNotes)
    setFilesTree(nextFiles)
    setSelectedFilePath('')
    setSelectedNoteId(nextNotes[0]?.id ?? null)
    setSelectedFolderPath(normalizeFolderPath(nextNotes[0]?.folder ?? 'Inbox'))
    setCustomFolders((current) => mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
    setDiagrams(nextDiagrams)
    setSelectedDiagramId(nextDiagrams[0]?.id ?? null)
    setMemos(nextMemos)
    setSelectedVoiceMemoId(nextMemos[0]?.id ?? null)
    setRooms(nextRooms)
    setRoomUnreadCounts({})
    setComsParticipants(nextComsParticipants)
    setSelectedRoomId(nextRooms[0]?.id ?? null)
    setMessages([])
    setRtcConfig(nextRtc)
    setAuthMode(sessionData.user.must_change_password ? 'change-password' : 'ready')
    setStatus('Workspace ready')
  }

  async function loginWithPassword(identifier: string, password: string) {
    const sessionData = await api.login(identifier, password)
    await hydrateWorkspace(sessionData)
  }

  async function changePasswordFirstUse(payload: import('./lib/types').ChangePasswordRequest) {
    const sessionData = await api.changePassword(payload)
    await hydrateWorkspace(sessionData)
    showActionNotice('Password changed')
  }

  async function setupAdminAccount(payload: SetupAdminRequest) {
    const sessionData = await api.setupAdmin(payload)
    setSetupStatus((current) => (current ? { ...current, admin_exists: true, user_count: 1 } : current))
    await hydrateWorkspace(sessionData)
  }

  async function cycleRoute(offset: number) {
    const sequence: RoutePath[] = [...orderedNavItems.map((item) => item.path), '/settings']
    const index = sequence.indexOf(route)
    const nextIndex = (index + offset + sequence.length) % sequence.length
    await navigate(sequence[nextIndex])
  }

  function routeJumpFromShortcut(binding: string): RoutePath | null {
    const normalized = normalizeShortcutBinding(binding)
    if (normalized === normalizeShortcutBinding(shortcuts.notesJump)) return '/notes'
    if (normalized === normalizeShortcutBinding(shortcuts.filesJump)) return '/files'
    if (normalized === normalizeShortcutBinding(shortcuts.diagramsJump)) return '/diagrams'
    if (normalized === normalizeShortcutBinding(shortcuts.voiceJump)) return '/voice'
    if (normalized === normalizeShortcutBinding(shortcuts.chatJump)) return '/coms'
    if (normalized === normalizeShortcutBinding(shortcuts.callsJump)) return '/coms'
    if (normalized === normalizeShortcutBinding(shortcuts.settingsJump)) return '/settings'
    return null
  }

  function routeNavigationTargets() {
    if (route === '/notes') {
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          '.notes-sidebar .folder-row, .notes-editor-actions button',
        ),
      )
    }
    if (route === '/diagrams') {
      return Array.from(
        document.querySelectorAll<HTMLElement>('.diagrams-sidebar .folder-row, .notes-editor-actions button'),
      )
    }
    if (route === '/voice') {
      return Array.from(
        document.querySelectorAll<HTMLElement>('.panel-header .button, .memo-card button, .memo-card audio'),
      )
    }
    if (route === '/coms') {
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          '.chat-sidebar .folder-row, .chat-thread-actions button, .chat-card form button',
        ),
      )
    }
    return []
  }

  function moveRouteFocus(offset: number) {
    const targets = routeNavigationTargets()
    if (targets.length === 0) return
    const active = document.activeElement as HTMLElement | null
    const currentIndex = active ? targets.findIndex((target) => target === active) : -1
    const fallbackIndex = offset > 0 ? 0 : targets.length - 1
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : Math.min(targets.length - 1, Math.max(0, currentIndex + offset))
    targets[nextIndex]?.focus()
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

  function resourceKeyForFilePath(path: string) {
    return `file:${path}`
  }

  function resourceKeyForNote(noteId: string) {
    return `note:${noteId}`
  }

  async function openShareDialog(target: ShareTarget) {
    setShareTarget(target)
    setShareUserQuery('')
    setShareDraft({
      resource_key: target.resourceKey,
      visibility: 'private',
      user_ids: [],
      updated_at: new Date().toISOString(),
      updated_by: session?.user.id ?? '',
    })
    try {
      const share = await api.getResourceShare(target.resourceKey)
      setShareDraft(share)
    } catch (error) {
      console.error(error)
      showActionNotice('Could not load visibility settings.')
    }
  }

  function setShareVisibility(visibility: ResourceVisibility) {
    setShareDraft((current) =>
      current
        ? {
            ...current,
            visibility,
            user_ids: visibility === 'users' ? current.user_ids : [],
          }
        : current,
    )
  }

  function toggleShareUser(userId: string) {
    setShareDraft((current) => {
      if (!current) return current
      const user_ids = current.user_ids.includes(userId)
        ? current.user_ids.filter((id) => id !== userId)
        : [...current.user_ids, userId]
      return { ...current, visibility: 'users', user_ids }
    })
  }

  async function saveShareSettings() {
    if (!shareTarget || !shareDraft) return
    setShareSaving(true)
    try {
      const saved = await api.updateResourceShare(
        shareTarget.resourceKey,
        shareDraft.visibility,
        shareDraft.visibility === 'users' ? shareDraft.user_ids : [],
      )
      setShareDraft(saved)
      setShareTarget(null)
      showActionNotice(
        saved.visibility === 'org'
          ? `Shared ${shareTarget.label} with the org.`
          : saved.visibility === 'users'
            ? `Shared ${shareTarget.label} with selected people.`
            : `${shareTarget.label} is private.`,
      )
    } catch (error) {
      console.error(error)
      showActionNotice('Could not save visibility settings.')
    } finally {
      setShareSaving(false)
    }
  }

  function currentNoteMarkdown() {
    if (noteEditorMode === 'rich' && noteEditorRef.current) {
      return editableHtmlToMarkdown(noteEditorRef.current)
    }
    return noteDraftRef.current
  }

  function markNoteLocallyDirty(noteId: string | null | undefined) {
    if (!noteId) return
    if (locallyDirtyNoteIdsRef.current.has(noteId)) return
    locallyDirtyNoteIdsRef.current.add(noteId)
    setNoteDirtyVersion((version) => version + 1)
  }

  function clearNoteLocallyDirty(noteId: string | null | undefined) {
    if (!noteId || !locallyDirtyNoteIdsRef.current.delete(noteId)) return
    setNoteDirtyVersion((version) => version + 1)
  }

  function rememberPersistedNotes(nextNotes: Note[]) {
    persistedNoteStateRef.current = Object.fromEntries(
      nextNotes.map((note) => [
        note.id,
        {
          title: note.title,
          folder: note.folder,
          markdown: note.markdown,
        },
      ]),
    )
  }

  function currentNoteIsDirty() {
    const note = selectedNoteRef.current
    if (!note) return false
    if (!locallyDirtyNoteIdsRef.current.has(note.id)) return false
    const persisted = persistedNoteStateRef.current[note.id]
    if (!persisted) return currentNoteMarkdown() !== note.markdown
    return (
      note.title !== persisted.title ||
      (selectedFolderPathRef.current || note.folder) !== persisted.folder ||
      currentNoteMarkdown() !== persisted.markdown
    )
  }

  function noteHasPendingPersistence() {
    return noteSaveState === 'saving' || currentNoteIsDirty()
  }

  function registerPresence(noteId: string, user: string) {
    if (!user) return
    const seenAt = Date.now()
    setNotePresence((current) => {
      const existing = current[noteId] ?? []
      const next = [{ user, seenAt }, ...existing.filter((entry) => entry.user !== user)].filter(
        (entry) => seenAt - entry.seenAt < 20_000,
      )
      return { ...current, [noteId]: next }
    })
  }

  function prunePresence() {
    const now = Date.now()
    setNotePresence((current) =>
      Object.fromEntries(
        Object.entries(current).map(([noteId, entries]) => [
          noteId,
          entries.filter((entry) => now - entry.seenAt < 20_000),
        ]),
      ),
    )
  }

  function broadcastPresence() {
    if (!selectedNoteIdRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    const event: RealtimeEvent = {
      type: 'note_presence',
      note_id: selectedNoteIdRef.current,
      user: clientLabel,
    }
    socketRef.current.send(JSON.stringify(event))
    registerPresence(selectedNoteIdRef.current, clientLabel)
  }

  function broadcastNoteDraft(markdown: string) {
    const note = selectedNoteRef.current
    if (!note || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    const event: RealtimeEvent = {
      type: 'note_draft',
      note_id: note.id,
      title: note.title,
      folder: selectedFolderPathRef.current || note.folder,
      markdown,
      revision: note.revision,
      client_id: clientIdRef.current,
      user: clientLabel,
    }
    socketRef.current.send(JSON.stringify(event))
  }

  function scheduleNoteDraftBroadcast(markdown: string) {
    const noteId = selectedNoteRef.current?.id
    markNoteLocallyDirty(noteId)
    if (noteDraftBroadcastTimeoutRef.current) {
      window.clearTimeout(noteDraftBroadcastTimeoutRef.current)
    }
    noteDraftBroadcastTimeoutRef.current = window.setTimeout(() => {
      noteDraftBroadcastTimeoutRef.current = null
      broadcastNoteDraft(markdown)
    }, 180)
    scheduleLiveNoteSave(noteId)
  }

  function flushLiveSaveForNote(noteId: string | null | undefined) {
    if (!noteId) return
    const targetNote =
      (selectedNoteRef.current?.id === noteId ? selectedNoteRef.current : null) ??
      notesRef.current.find((note) => note.id === noteId) ??
      null
    if (!targetNote) return
    if (noteSavePromiseRef.current) {
      pendingLiveSaveNoteIdRef.current = noteId
      return
    }
    void saveNote({
      note: targetNote,
      markdown: noteId === selectedNoteIdRef.current ? currentNoteMarkdown() : targetNote.markdown,
      quiet: true,
      notify: false,
      retryCount: 0,
    })
  }

  function scheduleLiveNoteSave(noteId: string | null | undefined) {
    if (!noteId) return
    if (noteLiveSaveTimeoutRef.current) {
      window.clearTimeout(noteLiveSaveTimeoutRef.current)
    }
    noteLiveSaveTimeoutRef.current = window.setTimeout(() => {
      noteLiveSaveTimeoutRef.current = null
      flushLiveSaveForNote(noteId)
    }, 700)
  }

  async function createNote() {
    const note = await api.createNote(defaultNoteTitle(), selectedFolderPath || 'Inbox')
    setNotes((current) => [note, ...current])
    setSelectedNoteId(note.id)
    setSelectedFolderPath(normalizeFolderPath(note.folder))
    setCustomFolders((current) => mergeFolderPaths(current, [note.folder || 'Inbox']))
    await refreshFilesTree()
  }

  async function saveNote(options?: {
    note?: Note
    markdown?: string
    quiet?: boolean
    keepalive?: boolean
    notify?: boolean
    retryCount?: number
  }) {
    if (noteSavePromiseRef.current) {
      if (options?.note?.id) {
        pendingLiveSaveNoteIdRef.current = options.note.id
      }
      return noteSavePromiseRef.current
    }

    const targetNote = options?.note ?? selectedNoteRef.current
    if (!targetNote) return false
    if (!locallyDirtyNoteIdsRef.current.has(targetNote.id)) return true

    const markdown = options?.markdown ?? currentNoteMarkdown()
    const targetFolder =
      targetNote.id === selectedNoteIdRef.current ? selectedFolderPathRef.current || targetNote.folder : targetNote.folder
    const persisted = persistedNoteStateRef.current[targetNote.id]
    if (
      persisted &&
      targetNote.title === persisted.title &&
      targetFolder === persisted.folder &&
      markdown === persisted.markdown
    ) {
      return true
    }

    const task = (async () => {
      setNoteSaveState('saving')
      try {
        const updated = await api.updateNote(
          {
            ...targetNote,
            markdown,
            folder: targetFolder,
          },
          { keepalive: options?.keepalive },
        )
        setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)))
        persistedNoteStateRef.current[updated.id] = {
          title: updated.title,
          folder: updated.folder,
          markdown: updated.markdown,
        }
        clearNoteLocallyDirty(updated.id)
        if (updated.id === selectedNoteIdRef.current) {
          setNoteDraft(updated.markdown)
        }
        setCustomFolders((current) => mergeFolderPaths(current, [updated.folder || 'Inbox']))
        await refreshFilesTree()
        if (options?.notify !== false && !options?.quiet) {
          if (!options?.quiet) {
            showActionNotice(`Saved note: ${updated.title}`)
          }
        }
        return true
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes('revision mismatch') &&
          (options?.retryCount ?? 0) < 1
        ) {
          const latestNotes = await api.listNotes()
          const latest = latestNotes.find((note) => note.id === targetNote.id) ?? null
          rememberPersistedNotes(latestNotes)
          setNotes(latestNotes)
          setCustomFolders((current) => mergeFolderPaths(current, latestNotes.map((note) => note.folder || 'Inbox')))
          if (latest) {
            const localNote =
              (targetNote.id === selectedNoteIdRef.current ? selectedNoteRef.current : null) ??
              notesRef.current.find((note) => note.id === targetNote.id) ??
              targetNote
            const rebased = await api.updateNote(
              {
                ...latest,
                title: localNote.title,
                folder:
                  targetNote.id === selectedNoteIdRef.current
                    ? selectedFolderPathRef.current || localNote.folder
                    : localNote.folder,
                markdown,
              },
              { keepalive: options?.keepalive },
            )
            setNotes((current) => current.map((note) => (note.id === rebased.id ? rebased : note)))
            persistedNoteStateRef.current[rebased.id] = {
              title: rebased.title,
              folder: rebased.folder,
              markdown: rebased.markdown,
            }
            clearNoteLocallyDirty(rebased.id)
            if (rebased.id === selectedNoteIdRef.current) {
              setNoteDraft(rebased.markdown)
            }
            await refreshFilesTree()
            if (options?.notify !== false && !options?.quiet) {
              showActionNotice(`Saved note: ${rebased.title}`)
            }
            return true
          }
          if (targetNote.id === selectedNoteIdRef.current) {
            setNoteDraft(markdown)
          }
          return false
        }
        throw error
      } finally {
        setNoteSaveState('idle')
        noteSavePromiseRef.current = null
        const pendingNoteId = pendingLiveSaveNoteIdRef.current
        pendingLiveSaveNoteIdRef.current = null
        if (pendingNoteId && locallyDirtyNoteIdsRef.current.has(pendingNoteId)) {
          window.setTimeout(() => flushLiveSaveForNote(pendingNoteId), 0)
        }
      }
    })()

    noteSavePromiseRef.current = task
    return task
  }

  async function refreshFilesTree() {
    const nextTree = await api.listFilesTree()
    setFilesTree(nextTree)
  }

  async function createDriveFolderFromSelection() {
    const cleaned = newDriveFolderName.trim()
    if (!cleaned) return
    const basePath =
      currentDirectoryPath === 'drive' || currentDirectoryPath.startsWith('drive/')
        ? currentDirectoryPath
        : 'drive'
    const nextPath = basePath === 'drive' ? cleaned : `${basePath}/${cleaned}`
    await api.createDriveFolder(nextPath)
    setNewDriveFolderName('')
    setCreatingDriveFolder(false)
    setSelectedFilePath(nextPath.startsWith('drive') ? nextPath : `drive/${nextPath}`)
    await refreshFilesTree()
  }

  async function handleDriveUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const basePath =
      selectedFileNode?.kind === 'directory' && selectedFileNode.path.startsWith('drive')
        ? selectedFileNode.path
        : 'drive'
    await api.uploadFile(basePath, file, file.name)
    event.target.value = ''
    await refreshFilesTree()
  }

  async function moveDriveItem(sourcePath: string, destinationDir: string) {
    const sameArea =
      (sourcePath === 'drive' || sourcePath.startsWith('drive/')) &&
      (destinationDir === 'drive' || destinationDir.startsWith('drive/'))
        ? 'drive'
        : (sourcePath === 'notes' || sourcePath.startsWith('notes/')) &&
            (destinationDir === 'notes' || destinationDir.startsWith('notes/'))
          ? 'notes'
          : (sourcePath === 'diagrams' || sourcePath.startsWith('diagrams/')) &&
              (destinationDir === 'diagrams' || destinationDir.startsWith('diagrams/'))
            ? 'diagrams'
          : null

    if (!sameArea) {
      setStatus('Moves must stay within drive/, notes/, or diagrams/')
      return
    }
    if (sourcePath === destinationDir || destinationDir.startsWith(`${sourcePath}/`)) {
      return
    }
    const moved = await api.moveFile(sourcePath, destinationDir)
    if (selectedFilePath === sourcePath) {
      setSelectedFilePath(moved.path)
    } else if (selectedFilePath.startsWith(`${sourcePath}/`)) {
      setSelectedFilePath(`${moved.path}${selectedFilePath.slice(sourcePath.length)}`)
    }
    if (sameArea === 'notes') {
      const nextNotes = await api.listNotes()
      rememberPersistedNotes(nextNotes)
      setNotes(nextNotes)
      setCustomFolders((current) => mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
    }
    if (sameArea === 'diagrams') {
      const nextDiagrams = await api.listDiagrams()
      setDiagrams(nextDiagrams)
      setSelectedDiagramId((current) => (current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null))
    }
    await refreshFilesTree()
  }

  function canDeleteFilePath(path: string | null | undefined) {
    if (!path) return false
    if (!currentRolePolicy.admin_panel) return false
    return (
      path !== 'drive' &&
      path !== 'notes' &&
      path !== 'diagrams' &&
      path !== 'voice' &&
      (path.startsWith('drive/') ||
        path.startsWith('notes/') ||
        path.startsWith('diagrams/') ||
        path.startsWith('voice/'))
    )
  }

  function normalizedDeletePaths(paths: string[]) {
    return Array.from(new Set(paths))
      .filter((path) => canDeleteFilePath(path))
      .sort((left, right) => left.length - right.length)
      .filter((path, index, values) => !values.slice(0, index).some((parent) => path.startsWith(`${parent}/`)))
  }

  function requestDeletePaths(paths: string[]) {
    const deletable = normalizedDeletePaths(paths)
    if (deletable.length === 0) return
    if (adminSettings?.confirm_file_delete ?? true) {
      setPendingDeletePaths(deletable)
      return
    }
    void deleteManagedPaths(deletable)
  }

  function canRenameFilePath(path: string | null | undefined) {
    if (!path) return false
    if (!currentRolePolicy.admin_panel) return false
    return (
      path !== 'drive' &&
      path !== 'notes' &&
      path !== 'diagrams' &&
      path !== 'voice' &&
      (path.startsWith('drive/') ||
        path.startsWith('notes/') ||
        path.startsWith('diagrams/') ||
        path.startsWith('voice/'))
    )
  }

  function convertibleTextExtension(path: string | null | undefined) {
    if (!path || !path.startsWith('drive/')) return null
    const extension = path.split('.').pop()?.toLowerCase()
    if (extension === 'txt') return 'md'
    if (extension === 'md') return 'txt'
    return null
  }

  function canConvertFilePath(path: string | null | undefined) {
    return convertibleTextExtension(path) !== null && currentRolePolicy.admin_panel
  }

  function baseNameForPath(path: string) {
    if (path.startsWith('notes/') && path.endsWith('.md')) {
      const noteId = noteIdFromPath(path)
      const note = noteId ? notes.find((item) => item.id === noteId) : null
      if (note) return note.title
    }
    if (path.startsWith('diagrams/') && path.endsWith('.drawio')) {
      const diagramId = diagramIdFromPath(path)
      const diagram = diagramId ? diagrams.find((item) => item.id === diagramId) : null
      if (diagram) return diagramDisplayName(diagram.title)
    }
    const name = path.split('/').filter(Boolean).pop() ?? ''
    return name.replace(/\.md$/i, '').replace(/\.drawio$/i, '')
  }

  function beginRenameCurrentFile() {
    if (!activeFileNode || !canRenameFilePath(activeFileNode.path)) return
    setRenamingFilePath(activeFileNode.path)
    setRenameFileName(baseNameForPath(activeFileNode.path))
  }

  async function convertManagedTextFile(path: string) {
    const targetExtension = convertibleTextExtension(path)
    if (!targetExtension) return
    const parent = deriveParentPath(path)
    const currentName = path.split('/').filter(Boolean).pop() ?? ''
    const nextName = `${currentName.replace(/\.[^.]+$/i, '')}.${targetExtension}`
    const content = await api.fileText(path)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    await api.uploadFile(parent || 'drive', blob, nextName)
    await api.deleteFile(path)
    if (selectedFilePath === path) {
      setSelectedFilePath(`${parent ? `${parent}/` : ''}${nextName}`)
    }
    if (activeFilePath === path) {
      setActiveFilePath(`${parent ? `${parent}/` : ''}${nextName}`)
    }
    setMarkedFilePaths((current) => current.filter((currentPath) => currentPath !== path))
    await refreshFilesTree()
    setConvertingFilePath(null)
    showActionNotice(`Converted to .${targetExtension}`)
  }

  async function renameManagedPath(path: string, newName: string) {
    const cleaned = newName.trim()
    if (!cleaned) return
    const renamed = await api.renameFile(path, cleaned)
    if (selectedFilePath === path) {
      setSelectedFilePath(renamed.path)
    } else if (selectedFilePath.startsWith(`${path}/`)) {
      setSelectedFilePath(`${renamed.path}${selectedFilePath.slice(path.length)}`)
    }
    if (activeFilePath === path) {
      setActiveFilePath(renamed.path)
    } else if (activeFilePath?.startsWith(`${path}/`)) {
      setActiveFilePath(`${renamed.path}${activeFilePath.slice(path.length)}`)
    }
    setMarkedFilePaths((current) =>
      current.map((currentPath) =>
        currentPath === path || currentPath.startsWith(`${path}/`)
          ? `${renamed.path}${currentPath.slice(path.length)}`
          : currentPath,
      ),
    )
    if (path.startsWith('notes/')) {
      const nextNotes = await api.listNotes()
      rememberPersistedNotes(nextNotes)
      setNotes(nextNotes)
      setCustomFolders((current) => mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
      setSelectedNoteId((current) => (current && nextNotes.some((note) => note.id === current) ? current : null))
    }
    if (path.startsWith('voice/')) {
      const nextMemos = await api.listVoiceMemos()
      setMemos(nextMemos)
      setSelectedVoiceMemoId((current) => (current && nextMemos.some((memo) => memo.id === current) ? current : null))
    }
    if (path.startsWith('diagrams/')) {
      const nextDiagrams = await api.listDiagrams()
      setDiagrams(nextDiagrams)
      setSelectedDiagramId((current) =>
        current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
      )
    }
    await refreshFilesTree()
    setRenamingFilePath(null)
    setRenameFileName('')
    showActionNotice(`Renamed to ${renamed.name}`)
  }

  async function deleteManagedPaths(paths: string[]) {
    const deletable = normalizedDeletePaths(paths).sort((left, right) => right.length - left.length)
    if (deletable.length === 0) return
    for (const path of deletable) {
      await api.deleteFile(path)
    }

    const affectedRoots = new Set(
      deletable.map((path) =>
        path.startsWith('notes/') ? 'notes' : path.startsWith('diagrams/') ? 'diagrams' : 'drive',
      ),
    )

    if (deletable.some((path) => path === selectedFilePath || selectedFilePath.startsWith(`${path}/`))) {
      const fallbackPath =
        deriveParentPath(
          deletable.find((path) => path === selectedFilePath || selectedFilePath.startsWith(`${path}/`)) ?? '',
        ) ?? 'drive'
      setSelectedFilePath(fallbackPath)
    }
    if (
      deletable.some(
        (path) => path === activeFilePath || (activeFilePath?.startsWith(`${path}/`) ?? false),
      )
    ) {
      setActiveFilePath(null)
    }
    setMarkedFilePaths((current) =>
      current.filter((path) => !deletable.some((deleted) => path === deleted || path.startsWith(`${deleted}/`))),
    )
    if (affectedRoots.has('notes')) {
      const nextNotes = await api.listNotes()
      rememberPersistedNotes(nextNotes)
      setNotes(nextNotes)
      setSelectedNoteId((current) =>
        current && nextNotes.some((note) => note.id === current) ? current : null,
      )
      setCustomFolders((current) => mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
    }
    if (affectedRoots.has('diagrams')) {
      const nextDiagrams = await api.listDiagrams()
      setDiagrams(nextDiagrams)
      setSelectedDiagramId((current) =>
        current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
      )
    }
    await refreshFilesTree()
    setPendingDeletePaths([])
    showActionNotice(
      deletable.length === 1 ? `Deleted ${deletable[0]}` : `Deleted ${deletable.length} items`,
    )
  }

  function beginFileDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (!(path.startsWith('drive/') || path.startsWith('notes/') || path.startsWith('diagrams/'))) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', path)
    setDraggingFilePath(path)
  }

  async function handleDirectoryDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePath = event.dataTransfer.getData('text/plain') || draggingFilePath
    setDropTargetPath(null)
    setDraggingFilePath(null)
    if (!sourcePath || sourcePath === destinationDir) return
    await moveDriveItem(sourcePath, destinationDir)
  }

  function activateRelativeFile(offset: number) {
    if (displayedFileNodes.length === 0) return
    const currentIndex = Math.max(
      0,
      displayedFileNodes.findIndex((node: FileNode) => node.path === activeFileNode?.path),
    )
    const nextIndex = Math.min(displayedFileNodes.length - 1, Math.max(0, currentIndex + offset))
    setActiveFilePath(displayedFileNodes[nextIndex]?.path ?? null)
  }

  function isMarkdownFile(path: string) {
    return path.toLowerCase().endsWith('.md')
  }

  function noteIdFromPath(path: string) {
    const match = path.match(
      /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.md$/i,
    )
    return match?.[1] ?? null
  }

  function noteTitleFromPath(path: string) {
    const filename = path.split('/').pop() ?? 'Imported note.md'
    const base = filename.replace(/\.md$/i, '')
    const withoutId = base.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
    return withoutId
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Imported note'
  }

  function displayNameForFileNode(node: FileNode) {
    if (node.kind === 'file' && node.path.startsWith('notes/')) {
      const noteId = noteIdFromPath(node.path)
      const note = noteId ? notes.find((item) => item.id === noteId) : null
      if (note) return note.title
    }
    if (node.kind === 'file' && node.path.startsWith('diagrams/')) {
      const diagramId = diagramIdFromPath(node.path)
      const diagram = diagramId ? diagrams.find((item) => item.id === diagramId) : null
      if (diagram) return diagramDisplayName(diagram.title)
    }
    return node.name
  }

  function importedFolderForPath(path: string) {
    const parts = path.split('/').slice(1, -1).filter(Boolean)
    return parts.length > 0 ? `Imported/${parts.join('/')}` : 'Imported'
  }

  function parentDirectoryLabel(path: string) {
    const parent = deriveParentPath(path)
    return parent && parent.length > 0 ? parent : '/'
  }

  function toggleFileColumnVisibility(column: FileColumnKey) {
    if (column === 'name') return
    setFileColumnVisibility((current) => ({ ...current, [column]: !current[column] }))
  }

  function renderFileColumnCell(node: FileNode, column: FileColumnKey) {
    if (column === 'name') {
      return (
        <span className="file-name-cell">
          <span>{node.kind === 'directory' ? `/${displayNameForFileNode(node)}` : displayNameForFileNode(node)}</span>
        </span>
      )
    }
    if (column === 'directory') {
      return <span className="muted file-directory-cell">{parentDirectoryLabel(node.path)}</span>
    }
    if (column === 'type') {
      return <span className="muted">{node.kind === 'directory' ? 'Folder' : fileTypeLabel(node.name)}</span>
    }
    if (column === 'size') {
      return <span className="muted file-size-cell">{node.kind === 'directory' ? '—' : formatFileSize(node.size_bytes)}</span>
    }
    if (column === 'modified') {
      return <span className="muted file-modified-cell">{formatFileTimestamp(node.updated_at)}</span>
    }
    return <span className="muted file-created-cell">{formatFileTimestamp(node.created_at)}</span>
  }

  function openVoiceMemoInVoice(path: string) {
    const memo = memos.find((item) => item.audio_path === path)
    if (!memo) return false
    setSelectedVoiceMemoId(memo.id)
    if (route !== '/voice') {
      window.history.pushState({}, '', '/voice')
      setRoute('/voice')
    }
    setStatus(`Opened ${memo.title} in Voice`)
    return true
  }

  function selectVoicePath(path: string) {
    const memo = memos.find((item) => item.audio_path === path)
    if (memo) {
      setSelectedVoiceMemoId(memo.id)
    }
  }

  function diagramIdFromPath(path: string) {
    const filename = path.split('/').filter(Boolean).pop()
    if (!filename?.toLowerCase().endsWith('.drawio')) return null
    const stem = filename.slice(0, -'.drawio'.length)
    const parts = stem.split('-')
    if (parts.length < 5) return null
    return parts.slice(-5).join('-')
  }

  function openDiagramInDiagrams(path: string) {
    const diagramId = diagramIdFromPath(path)
    const diagram = diagramId ? diagrams.find((item) => item.id === diagramId) : null
    if (!diagram) return false
    setSelectedDiagramId(diagram.id)
    if (route !== '/diagrams') {
      window.history.pushState({}, '', '/diagrams')
      setRoute('/diagrams')
    }
    setStatus(`Opened ${diagramDisplayName(diagram.title)} in Diagrams`)
    return true
  }

  async function autosaveCurrentNoteBeforeSwitch() {
    const currentNote = selectedNoteRef.current
    if (!currentNote || !currentNoteIsDirty()) return true
    return saveNote({ note: currentNote, markdown: currentNoteMarkdown(), quiet: true })
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

  async function openNoteInNotes(note: Note) {
    try {
      if (selectedNoteRef.current?.id === note.id) {
        setSelectedFolderPath(normalizeFolderPath(note.folder || 'Inbox'))
        return
      }
      const autosaved = await autosaveCurrentNoteBeforeSwitch()
      if (!autosaved) return
      const folderPath = normalizeFolderPath(note.folder || 'Inbox')
      setSelectedFolderPath(folderPath)
      setSelectedNoteId(note.id)
      setCustomFolders((current) => mergeFolderPaths(current, [note.folder || 'Inbox']))
      if (route !== '/notes') {
        window.history.pushState({}, '', '/notes')
        setRoute('/notes')
      }
    } catch (error) {
      showActionNotice(error instanceof Error ? error.message : 'Could not switch notes')
    }
  }

  async function openMarkdownInNotes(node: FileNode) {
    if (node.path.startsWith('notes/')) {
      const noteId = noteIdFromPath(node.path)
      const existing = noteId ? notes.find((note) => note.id === noteId) : null
      if (existing) {
        await openNoteInNotes(existing)
        return
      }
    }

    const markdown = await api.fileText(node.path)
    const imported = await api.createNote(
      noteTitleFromPath(node.path),
      importedFolderForPath(node.path),
      markdown,
    )
    setNotes((current) => [imported, ...current])
    setCustomFolders((current) => mergeFolderPaths(current, [imported.folder || 'Inbox']))
    await refreshFilesTree()
    await openNoteInNotes(imported)
    setStatus(`Opened ${displayNameForFileNode(node)} in Notes`)
  }

  async function openFileNode(node: FileNode | null | undefined) {
    if (!node) return
    if (node.kind === 'directory') {
      setSelectedFilePath(node.path)
      return
    }
    if (node.path.startsWith('voice/')) {
      if (!openVoiceMemoInVoice(node.path)) {
        window.open(api.fileDownloadUrl(node.path), '_blank', 'noopener,noreferrer')
      }
      return
    }
    if (node.path.startsWith('diagrams/') && node.path.endsWith('.drawio')) {
      if (!openDiagramInDiagrams(node.path)) {
        window.open(api.fileDownloadUrl(node.path), '_blank', 'noopener,noreferrer')
      }
      return
    }
    if (isMarkdownFile(node.path)) {
      try {
        await openMarkdownInNotes(node)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to open markdown in Notes')
      }
      return
    }
    window.open(api.fileDownloadUrl(node.path), '_blank', 'noopener,noreferrer')
  }

  function downloadManagedPath(path: string) {
    const link = document.createElement('a')
    link.href = api.fileDownloadUrl(path)
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function downloadManagedPaths(paths: string[]) {
    const targets = [...new Set(paths.filter(Boolean))]
    if (targets.length === 0) return
    for (const path of targets) {
      downloadManagedPath(path)
    }
    showActionNotice(
      targets.length === 1 ? `Downloading ${targets[0]}` : `Downloading ${targets.length} items`,
    )
  }

  function goToParentDirectory() {
    const parentPath = deriveParentPath(currentDirectoryPath)
    if (parentPath !== null) {
      setSelectedFilePath(parentPath)
    }
  }

  function selectFileTreeNode(path: string) {
    setSelectedFilePath(path)
    const node = path === '' ? fileRootNode : findFileNode(filesTree, path)
    setActiveFilePath(node?.kind === 'file' ? path : null)
  }

  function toggleMarkedPath(path: string | null | undefined) {
    if (!path) return
    setMarkedFilePaths((current) =>
      current.includes(path) ? current.filter((value) => value !== path) : [...current, path],
    )
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
    if (filePreviewOpen) {
      if (filePaneWidths.right > 0) {
        filePreviewWidthRef.current = filePaneWidths.right
      }
      setFilePreviewOpen(false)
      return
    }

    setFilePaneWidths((current) => ({
      ...current,
      right: Math.max(180, filePreviewWidthRef.current || 240),
    }))
    setFilePreviewOpen(true)
  }

  function beginFileColumnResize(splitter: FileColumnKey, clientX: number) {
    fileColumnResizeRef.current = {
      splitter,
      startX: clientX,
      startWidths: { ...fileColumnWidths },
    }
    setActiveFileColumnSplitter(splitter)
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

  async function createDiagram() {
    const nextXml = createEmptyDrawioDiagramXml()
    const diagram = await api.createDiagram(`Diagram ${diagrams.length + 1}`, nextXml)
    setDiagrams((current) => [diagram, ...current])
    setSelectedDiagramId(diagram.id)
    setDiagramSourceFormat('empty')
    setDiagramDraft(nextXml)
    setDiagramLoadVersion((current) => current + 1)
  }

  async function persistDiagramXml(xml: string) {
    if (!selectedDiagram) return
    setDiagramDraft(xml)
    const updated = await api.updateDiagram({ ...selectedDiagram, xml })
    setDiagrams((current) => current.map((diagram) => (diagram.id === updated.id ? updated : diagram)))
    setDiagramSourceFormat('drawio')
    showActionNotice(`Saved diagram: ${updated.title}`)
  }

  async function saveDiagram() {
    if (!selectedDiagram) return
    if (diagramEditorMode === 'diagram') {
      drawioEditorRef.current?.requestSave()
      return
    }
    await persistDiagramXml(diagramDraft)
  }

  function setDiagramMode(mode: DiagramEditorMode) {
    if (mode === 'xml') {
      setDiagramEditorMode(mode)
      return
    }
    const parsed = parseDrawioDiagramXml(diagramDraft)
    setDiagramDraft(parsed.xml)
    setDiagramSourceFormat(parsed.sourceFormat)
    setDiagramLoadVersion((current) => current + 1)
    setDiagramEditorMode(mode)
  }

  async function createRoom() {
    const room = await api.createRoom(`thread-${rooms.length + 1}`, 'channel', [])
    await refreshRooms({ preferredSelectedRoomId: room.id })
    showActionNotice(`Created thread: ${room.name}`)
  }

  async function createDirectRoom(participantIds: string[]) {
    const participants = comsParticipants.filter((participant) => participantIds.includes(participant.id))
    const roomName = participants.map((participant) => participant.display_name).join(', ')
    const room = await api.createRoom(roomName || 'New message', 'direct', participantIds)
    await refreshRooms({ preferredSelectedRoomId: room.id })
    showActionNotice(`Started message: ${room.name}`)
  }

  async function renameRoom(roomId: string, name: string) {
    const room = await api.updateRoom(roomId, name)
    await refreshRooms({ preferredSelectedRoomId: room.id })
    showActionNotice(`Renamed thread: ${room.name}`)
  }

  async function updateRoomParticipants(roomId: string, participantIds: string[]) {
    const room = rooms.find((entry) => entry.id === roomId)
    if (!room) return
    const updated = await api.updateRoom(roomId, room.name, participantIds)
    await refreshRooms({ preferredSelectedRoomId: updated.id })
    showActionNotice(`Updated participants: ${updated.name}`)
  }

  async function saveAdminSettings(settings: AdminSettings) {
    const next = await api.updateAdminSettings(settings)
    setAdminSettings(next)
    setAdminStorageOverview((current) =>
      current
        ? {
            ...current,
            public_storage_mb: next.public_storage_mb,
          }
        : current,
    )
    showActionNotice('Saved admin settings')
  }

  async function createAdminUser(payload: import('./lib/types').CreateUserRequest) {
    const created = await api.createUser(payload)
    setAdminUsers((current) => [...current, created].sort((left, right) => left.username.localeCompare(right.username)))
    setSetupStatus((current) => (current ? { ...current, user_count: current.user_count + 1 } : current))
    showActionNotice(`Created user: ${created.username}`)
  }

  async function resetAdminUserPassword(userId: string, password: string) {
    const updated = await api.resetUserPassword(userId, password)
    setAdminUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
    showActionNotice(`Reset password for ${updated.username}`)
  }

  async function updateAdminUserAccess(
    userId: string,
    payload: import('./lib/types').UpdateUserAccessRequest,
  ) {
    const updated = await api.updateUserAccess(userId, payload)
    setAdminUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
    showActionNotice(`Updated access for ${updated.username}`)
  }

  async function sendMessage(body: string) {
    const trimmedBody = body.trim()
    if (!trimmedBody || !selectedRoomId) return
    const targetRoomId = selectedRoomId
    const message = await api.createMessage(targetRoomId, trimmedBody)
    setMessages((current) => {
      if (targetRoomId !== selectedRoomIdRef.current) return current
      if (current.some((entry) => entry.id === message.id)) return current
      return [...current, message]
    })
    void refreshRooms({ preferredSelectedRoomId: targetRoomId })
  }

  async function toggleRecording() {
    if (recording) {
      speechRecognitionRef.current?.stop()
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    audioChunksRef.current = []
    speechTranscriptRef.current = ''

    const recognition = createBrowserSpeechRecognition()
    if (recognition) {
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || 'en-US'
      recognition.onresult = (event) => {
        let transcript = ''
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          transcript += result[0]?.transcript ?? ''
        }
        speechTranscriptRef.current = transcript.trim()
      }
      recognition.onerror = () => undefined
      recognition.onend = () => {
        speechRecognitionRef.current = null
      }
      try {
        recognition.start()
        speechRecognitionRef.current = recognition
      } catch {
        speechRecognitionRef.current = null
      }
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const transcript = speechTranscriptRef.current.trim()
      await api.uploadVoiceMemo(`Memo ${new Date().toLocaleTimeString()}`, blob, transcript || undefined)
      const nextMemos = await api.listVoiceMemos()
      setMemos(nextMemos)
      speechTranscriptRef.current = ''
      stream.getTracks().forEach((track) => track.stop())
    }
    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
  }

  async function pollTranscript(memo: VoiceMemo) {
    const job: TranscriptionJob = await api.getVoiceJob(memo.id)
    if (job.status === 'failed') {
      await api.retryVoiceJob(memo.id)
    }
    const nextMemos = await api.listVoiceMemos()
    setMemos(nextMemos)
  }

  async function uploadAudioFile(file: File) {
    const title = file.name.replace(/\.[^.]+$/, '') || `Memo ${new Date().toLocaleTimeString()}`
    const memo = await api.uploadVoiceMemo(title, file)
    const nextMemos = await api.listVoiceMemos()
    setMemos(nextMemos)
    setSelectedVoiceMemoId(memo.id)
    showActionNotice(`Uploaded audio: ${title}`)
  }

  function buildIceServers() {
    const config = rtcConfigRef.current
    if (!config) return [{ urls: 'stun:stun.l.google.com:19302' }]
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: config.turn_urls, username: config.username, credential: config.credential },
    ]
  }

  function sendSignal(payload: SignalPayload, targetRoomId = activeCallRoomIdRef.current) {
    if (!targetRoomId || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return
    const event: RealtimeEvent = {
      type: 'signal',
      room_id: targetRoomId,
      from: clientIdRef.current,
      payload,
    }
    socketRef.current.send(JSON.stringify(event))
  }

  function ensurePeerConnection(remoteId: string, remoteLabel: string) {
    const existing = peerConnectionsRef.current.get(remoteId)
    if (existing) return existing

    const connection = new RTCPeerConnection({ iceServers: buildIceServers() })
    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ kind: 'ice', candidate: event.candidate.toJSON() })
    }
    connection.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
      setRemoteParticipants((current) => {
        const filtered = current.filter((participant) => participant.id !== remoteId)
        return [...filtered, { id: remoteId, label: remoteLabel, stream }]
      })
    }
    connection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        cleanupPeer(remoteId)
      }
    }
    localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, localStreamRef.current as MediaStream)
    })
    screenStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, screenStreamRef.current as MediaStream)
    })
    peerConnectionsRef.current.set(remoteId, connection)
    return connection
  }

  async function renegotiatePeerConnection(connection: RTCPeerConnection) {
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    sendSignal({ kind: 'offer', label: clientLabel, sdp: offer })
  }

  function cleanupPeer(remoteId: string) {
    peerConnectionsRef.current.get(remoteId)?.close()
    peerConnectionsRef.current.delete(remoteId)
    setRemoteParticipants((current) => current.filter((participant) => participant.id !== remoteId))
  }

  function cleanupCallState() {
    peerConnectionsRef.current.forEach((connection) => connection.close())
    peerConnectionsRef.current.clear()
    setRemoteParticipants([])
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    setActiveCallRoomId(null)
    setCallMediaMode(null)
    setScreenSharing(false)
    setCallJoined(false)
  }

  async function handleSignal(from: string, payload: SignalPayload) {
    if (from === clientIdRef.current) return
    if (payload.kind === 'leave') {
      cleanupPeer(from)
      pushCallLog(`${from.slice(0, 6)} left the room call`)
      return
    }
    if (!callJoinedRef.current) return

    if (payload.kind === 'join') {
      pushCallLog(`${payload.label} joined thread signaling`)
      const connection = ensurePeerConnection(from, payload.label)
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      sendSignal({ kind: 'offer', label: clientLabel, sdp: offer })
      return
    }

    if (payload.kind === 'offer') {
      const connection = ensurePeerConnection(from, payload.label)
      await connection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      sendSignal({ kind: 'answer', label: clientLabel, sdp: answer })
      pushCallLog(`answered ${payload.label}`)
      return
    }

    if (payload.kind === 'answer') {
      const connection = ensurePeerConnection(from, payload.label)
      await connection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      pushCallLog(`connected answer from ${payload.label}`)
      return
    }

    if (payload.kind === 'ice') {
      const connection = peerConnectionsRef.current.get(from)
      if (connection) await connection.addIceCandidate(new RTCIceCandidate(payload.candidate))
    }
  }

  async function joinCall(mode: 'audio' | 'video') {
    if (!selectedRoomId) {
      pushCallLog('select a thread before joining a call')
      return
    }
    if (callJoined) {
      sendSignal({ kind: 'leave' })
      cleanupCallState()
      pushCallLog('left call')
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' })
    localStreamRef.current = stream
    if (localVideoRef.current) {
      if (mode === 'video') {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.muted = true
        await localVideoRef.current.play().catch(() => undefined)
      } else {
        localVideoRef.current.srcObject = null
      }
    }
    setActiveCallRoomId(selectedRoomId)
    setCallMediaMode(mode)
    setCallJoined(true)
    sendSignal({ kind: 'join', label: clientLabel, tracks: stream.getTracks().map((track) => track.kind) }, selectedRoomId)
    pushCallLog(`joined ${mode} call as ${clientLabel}`)
  }

  async function startScreenShare() {
    if (!callJoined || screenStreamRef.current) return
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const [screenTrack] = stream.getVideoTracks()
    if (!screenTrack) return
    screenStreamRef.current = stream
    setScreenSharing(true)
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
      localVideoRef.current.muted = true
      await localVideoRef.current.play().catch(() => undefined)
    }

    for (const connection of peerConnectionsRef.current.values()) {
      const videoSender = connection.getSenders().find((sender) => sender.track?.kind === 'video')
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack)
      } else {
        connection.addTrack(screenTrack, stream)
      }
      await renegotiatePeerConnection(connection)
    }
    screenTrack.onended = () => {
      void stopScreenShare()
    }
    pushCallLog('started screen share')
  }

  async function stopScreenShare() {
    const stream = screenStreamRef.current
    if (!stream) return
    const [screenTrack] = stream.getVideoTracks()
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null
    for (const connection of peerConnectionsRef.current.values()) {
      const screenSender = connection.getSenders().find((sender) => sender.track === screenTrack)
      if (screenSender) {
        if (cameraTrack) {
          await screenSender.replaceTrack(cameraTrack)
        } else {
          connection.removeTrack(screenSender)
        }
        await renegotiatePeerConnection(connection)
      }
    }
    stream.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    setScreenSharing(false)
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = callMediaMode === 'video' ? localStreamRef.current : null
      if (callMediaMode === 'video') {
        await localVideoRef.current.play().catch(() => undefined)
      }
    }
    pushCallLog('stopped screen share')
  }

  function leaveCall() {
    if (!callJoined) return
    sendSignal({ kind: 'leave' })
    cleanupCallState()
    pushCallLog('left call')
  }

  function syncNoteDraftFromEditor() {
    if (!noteEditorRef.current) return
    ensureEditorBlocks(noteEditorRef.current)
    const markdown = editableHtmlToMarkdown(noteEditorRef.current)
    setNoteDraft(markdown)
    scheduleNoteDraftBroadcast(markdown)
  }

  function restoreNoteContextRange() {
    if (!noteContextRangeRef.current) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(noteContextRangeRef.current)
  }

  function currentNoteBlock() {
    const selection = window.getSelection()
    return getCurrentBlock(selection)
  }

  function ensureNoteBlockForInsert() {
    const root = noteEditorRef.current
    if (!root) return null
    ensureEditorBlocks(root)
    restoreNoteContextRange()
    const existing = currentNoteBlock()
    if (existing) return existing
    const paragraph = createParagraphElement()
    root.appendChild(paragraph)
    moveCaretToEnd(paragraph)
    return paragraph
  }

  function replaceNoteBlock(block: HTMLElement, nextTag: keyof HTMLElementTagNameMap) {
    const replacement = document.createElement(nextTag)
    const text = (block.textContent ?? '').replace(/\u00a0/g, ' ').trim()
    replacement.innerHTML = text ? editableInlineText(text) : '<br>'
    block.replaceWith(replacement)
    moveCaretToEnd(replacement)
    return replacement
  }

  function moveCaretToStart(element: HTMLElement) {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function splitBlockIntoParagraphAtSelection(block: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) return null

    const beforeRange = range.cloneRange()
    beforeRange.selectNodeContents(block)
    beforeRange.setEnd(range.startContainer, range.startOffset)

    const afterRange = range.cloneRange()
    afterRange.selectNodeContents(block)
    afterRange.setStart(range.endContainer, range.endOffset)

    const beforeText = beforeRange.toString().replace(/\u00a0/g, ' ')
    const afterText = afterRange.toString().replace(/\u00a0/g, ' ')

    block.innerHTML = beforeText ? editableInlineText(beforeText) : '<br>'
    const paragraph = createParagraphElement()
    paragraph.innerHTML = afterText ? editableInlineText(afterText) : '<br>'
    block.parentElement?.insertBefore(paragraph, block.nextSibling)
    moveCaretToStart(paragraph)
    return paragraph
  }

  function insertNoteElement(kind: NoteInsertKind) {
    const root = noteEditorRef.current
    if (!root) return
    root.focus()
    const block = ensureNoteBlockForInsert()
    if (!block) return

    if (kind === 'paragraph') {
      replaceNoteBlock(block, 'p')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'heading-1') {
      replaceNoteBlock(block, 'h1')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'heading-2') {
      replaceNoteBlock(block, 'h2')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'heading-3') {
      replaceNoteBlock(block, 'h3')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'quote') {
      replaceNoteBlock(block, 'blockquote')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'bullet-list') {
      if (block.tagName.toLowerCase() !== 'li') {
        transformBlockToListItem(block)
      }
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'numbered-list') {
      if (block.tagName.toLowerCase() !== 'li') {
        transformBlockToOrderedListItem(block, 1)
      }
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'task-list') {
      if (block.tagName.toLowerCase() !== 'li' || !block.dataset.task) {
        transformBlockToTaskListItem(block, false)
      }
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'code-block') {
      transformBlockToCodeFence(block)
      syncNoteDraftFromEditor()
      return
    }

    const parent = block.parentElement
    if (!parent) return

    if (kind === 'divider') {
      const hr = document.createElement('hr')
      const paragraph = createParagraphElement()
      parent.insertBefore(hr, block.nextSibling)
      parent.insertBefore(paragraph, hr.nextSibling)
      moveCaretToEnd(paragraph)
      syncNoteDraftFromEditor()
      return
    }

    if (kind === 'table') {
      const { table, focusTarget } = createTableElement()
      const paragraph = createParagraphElement()
      parent.insertBefore(table, block.nextSibling)
      parent.insertBefore(paragraph, table.nextSibling)
      moveCaretToEnd(focusTarget)
      syncNoteDraftFromEditor()
    }
  }

  function addTableRowFromContext(position: 'before' | 'after') {
    const table = noteContextTableRef.current
    if (!table) return
    const cell = noteContextCellRef.current
    const referenceRow = (cell?.closest('tr') as HTMLTableRowElement | null) ?? table.querySelector('tbody tr') ?? table.querySelector('tr')
    if (!referenceRow) return
    const nextRow = document.createElement('tr')
    const cells = Array.from(referenceRow.children)
    cells.forEach((sourceCell) => {
      const nextCell = document.createElement(sourceCell.tagName.toLowerCase())
      nextCell.innerHTML = '<br>'
      nextRow.appendChild(nextCell)
    })

    const tbody = table.querySelector('tbody')
    if (tbody) {
      const rowParent = referenceRow.parentElement
      if (rowParent === tbody) {
        tbody.insertBefore(nextRow, position === 'before' ? referenceRow : referenceRow.nextSibling)
      } else {
        tbody.insertBefore(nextRow, position === 'before' ? tbody.firstChild : null)
      }
    } else {
      referenceRow.parentElement?.insertBefore(nextRow, position === 'before' ? referenceRow : referenceRow.nextSibling)
    }

    const focusTarget = nextRow.children[0]
    if (focusTarget instanceof HTMLElement) {
      moveCaretToEnd(focusTarget)
    }
    syncNoteDraftFromEditor()
  }

  function addTableColumnFromContext(position: 'before' | 'after') {
    const table = noteContextTableRef.current
    if (!table) return
    const cell = noteContextCellRef.current
    const columnIndex = cell?.cellIndex ?? ((table.querySelector('tr')?.children.length ?? 1) - 1)
    const rows = Array.from(table.querySelectorAll('tr'))
    rows.forEach((row) => {
      const rowCells = Array.from(row.children)
      const sourceCell = rowCells[Math.min(columnIndex, rowCells.length - 1)]
      const nextCell = document.createElement(sourceCell?.tagName?.toLowerCase() === 'th' ? 'th' : 'td')
      nextCell.innerHTML =
        nextCell.tagName.toLowerCase() === 'th'
          ? `Column ${rowCells.length + 1}`
          : '<br>'
      row.insertBefore(nextCell, position === 'before' ? sourceCell ?? null : sourceCell?.nextSibling ?? null)
    })

    const targetRow =
      (cell?.closest('tr') as HTMLTableRowElement | null) ??
      (table.querySelector('tbody tr') as HTMLTableRowElement | null) ??
      (table.querySelector('tr') as HTMLTableRowElement | null)
    const focusIndex = position === 'before' ? columnIndex : Math.min(columnIndex + 1, (targetRow?.children.length ?? 1) - 1)
    const focusTarget = targetRow?.children[focusIndex]
    if (focusTarget instanceof HTMLElement) {
      moveCaretToEnd(focusTarget)
    }
    syncNoteDraftFromEditor()
  }

  async function copyNoteSelection() {
    const selectedText = window.getSelection()?.toString().trim()
    if (!selectedText) return
    try {
      await navigator.clipboard.writeText(selectedText)
      setStatus('Copied selection')
    } catch {
      setStatus('Clipboard copy failed')
    }
  }

  async function pasteIntoNoteFromClipboard() {
    const text = noteClipboardText.trim()
    if (!text || !noteEditorRef.current) return
    noteEditorRef.current.focus()
    restoreNoteContextRange()
    insertTextAtSelection(text)
    syncNoteDraftFromEditor()
  }

  function openNoteContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!selectedNote || noteEditorMode !== 'rich') return
    event.preventDefault()
    noteEditorRef.current?.focus()
    const range = rangeFromViewportPoint(event.clientX, event.clientY)
    if (range) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      noteContextRangeRef.current = range.cloneRange()
    } else if (window.getSelection()?.rangeCount) {
      noteContextRangeRef.current = window.getSelection()?.getRangeAt(0).cloneRange() ?? null
    }
    const eventTarget = event.target as HTMLElement | null
    const tableCell = eventTarget?.closest('td, th') as HTMLTableCellElement | null
    const table = eventTarget?.closest('table') as HTMLTableElement | null
    noteContextCellRef.current = tableCell
    noteContextTableRef.current = table
    setNoteContextSubmenu(null)
    void navigator.clipboard
      .readText()
      .then((text) => setNoteClipboardText(text))
      .catch(() => setNoteClipboardText(''))
    setNoteContextMenu({ x: event.clientX, y: event.clientY, kind: table ? 'table' : 'default' })
  }

  function handleNoteEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (noteEditorRef.current) {
      ensureEditorBlocks(noteEditorRef.current)
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      insertTextAtSelection('\t')
      syncNoteDraftFromEditor()
      return
    }
    const selection = window.getSelection()
    const block = getCurrentBlock(selection)
    if (!block) return

    if (event.key === 'Enter') {
      const tag = block.tagName.toLowerCase()

      if (tag === 'li') {
        event.preventDefault()
        const list = block.parentElement
        if (!list) return
        const isTaskItem = Boolean(block.dataset.task)

        if ((block.textContent ?? '').trim() === '') {
          const paragraph = createParagraphElement()
          if (list.children.length === 1) {
            list.replaceWith(paragraph)
          } else {
            list.parentElement?.insertBefore(paragraph, list.nextSibling)
            block.remove()
          }
          moveCaretToEnd(paragraph)
          syncNoteDraftFromEditor()
          return
        }

        const nextItem = document.createElement('li')
        if (isTaskItem) {
          nextItem.dataset.task = 'unchecked'
          nextItem.innerHTML = '<span class="task-checkbox" contenteditable="false" data-task-checkbox="true" aria-hidden="true"></span><span class="task-content"><br></span>'
        } else {
          nextItem.innerHTML = '<br>'
        }
        list.insertBefore(nextItem, block.nextSibling)
        const focusTarget = nextItem.querySelector('.task-content')
        moveCaretToEnd(focusTarget instanceof HTMLElement ? focusTarget : nextItem)
        syncNoteDraftFromEditor()
        return
      }

      if (tag === 'pre') {
        const code = block.querySelector('code')
        const text = code?.textContent?.replace(/\u00a0/g, ' ') ?? ''
        if (isSelectionAtEndOfElement(code instanceof HTMLElement ? code : block) && (text === '' || text.endsWith('\n'))) {
          event.preventDefault()
          const paragraph = createParagraphElement()
          block.parentElement?.insertBefore(paragraph, block.nextSibling)
          moveCaretToEnd(paragraph)
          syncNoteDraftFromEditor()
          return
        }
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag)) {
        event.preventDefault()
        splitBlockIntoParagraphAtSelection(block)
        syncNoteDraftFromEditor()
      }
    }
  }

  function handleNoteEditorInput() {
    if (noteEditorRef.current) {
      ensureEditorBlocks(noteEditorRef.current)
    }
    const selection = window.getSelection()
    const block = getCurrentBlock(selection)
    if (!block) {
      syncNoteDraftFromEditor()
      return
    }

    const transformed = applyMarkdownShortcut(block)
    void transformed
    syncNoteDraftFromEditor()
  }

  function handleNoteEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    if (!target) return
    const checkbox = target.closest('[data-task-checkbox="true"]')
    if (!checkbox) return
    event.preventDefault()
    const item = checkbox.closest('li[data-task]') as HTMLElement | null
    if (!item) return
    item.dataset.task = item.dataset.task === 'checked' ? 'unchecked' : 'checked'
    syncNoteDraftFromEditor()
  }

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
        void createRoom()
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

  function renderNotesPage() {
    const notePersistenceState = selectedNote
      ? noteSaveState === 'saving'
        ? 'saving'
        : currentNoteIsDirty()
          ? 'unsaved'
          : 'saved'
      : null

    return (
      <section className="panel">
        <div
          ref={noteManagerRef}
          className={`notes-manager ${noteDrawerOpen ? '' : 'library-hidden'} ${activeNoteSplitter ? 'resizing' : ''}`}
          style={
            {
              ['--notes-pane-width' as string]: `${notePaneSize.width}px`,
              ['--notes-pane-height' as string]: `${notePaneSize.height}px`,
            } as React.CSSProperties
          }
        >
          {noteDrawerOpen ? (
            <aside className="notes-sidebar">
              <div className="file-sidebar-header-row">
                <div className="button-row files-actions">
                  <button className="button-secondary notes-new-button" onClick={() => void createNote()}>
                    New note
                  </button>
                </div>
              </div>
              <div className="folder-tree file-tree notes-folder-tree">
                <NoteLibraryTreeNode
                  node={{
                    name: 'Inbox',
                    path: 'Inbox',
                    children: noteTree,
                    notes: notes
                      .filter((note) => normalizeFolderPath(note.folder || 'Inbox') === 'Inbox')
                      .sort((a, b) => a.title.localeCompare(b.title)),
                  }}
                  activeFolderPath={selectedNoteFolderPath}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={(note) => {
                    void openNoteInNotes(note)
                  }}
                />
              </div>
            </aside>
          ) : null}
          <div
            className={`pane-splitter notes-pane-splitter ${activeNoteSplitter ? 'active' : ''} ${noteDrawerOpen ? '' : 'collapsed'}`}
            role="separator"
            aria-orientation="vertical"
            onMouseDown={() => {
              if (noteDrawerOpen) setActiveNoteSplitter(true)
            }}
            onDoubleClick={() => setNoteDrawerOpen((current) => !current)}
          />
          <div className="notes-editor-shell">
            {selectedNote ? (
              <>
                <div className="notes-editor-header">
                  <input
                    className="input note-title-input notes-title-input"
                    value={selectedNote.title}
                    placeholder="Select or create a note"
                    onChange={(event) => {
                      setNotes((current) =>
                        current.map((note) =>
                          note.id === selectedNote.id ? { ...note, title: event.target.value } : note,
                        ),
                      )
                      window.requestAnimationFrame(() => scheduleNoteDraftBroadcast(currentNoteMarkdown()))
                    }}
                  />
                  <div className="notes-editor-actions">
                    {notePersistenceState ? (
                      <div
                        className={`notes-save-indicator ${notePersistenceState}`}
                        title={
                          notePersistenceState === 'saving'
                            ? 'Saving to database'
                            : notePersistenceState === 'unsaved'
                              ? 'Unsaved changes'
                              : 'Saved to database'
                        }
                        aria-label={
                          notePersistenceState === 'saving'
                            ? 'Saving to database'
                            : notePersistenceState === 'unsaved'
                              ? 'Unsaved changes'
                              : 'Saved to database'
                        }
                      >
                        <span className="notes-save-indicator-dot" />
                        <span className="notes-save-indicator-label">
                          {notePersistenceState === 'saving'
                            ? 'Saving'
                            : notePersistenceState === 'unsaved'
                              ? 'Unsaved'
                              : 'Saved'}
                        </span>
                      </div>
                    ) : null}
                    <button
                      className={noteEditorMode === 'rich' ? 'button' : 'button-secondary'}
                      onClick={() => setNoteEditorMode('rich')}
                    >
                      Rich
                    </button>
                    <button
                      className={noteEditorMode === 'raw' ? 'button' : 'button-secondary'}
                      onClick={() => setNoteEditorMode('raw')}
                    >
                      Raw
                    </button>
                    <button className="button" onClick={() => void saveNote()}>
                      Save
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() =>
                        void openShareDialog({
                          resourceKey: resourceKeyForNote(selectedNote.id),
                          label: selectedNote.title || 'this note',
                        })
                      }
                    >
                      visibility
                    </button>
                  </div>
                </div>
                <div className="notes-editor-status">
                  <div className="presence-row">
                    {activePresence.map((presence) => (
                      <span className="presence-chip" key={presence.user}>{presence.user}</span>
                    ))}
                  </div>
                </div>
                <div className="notes-editor-card">
                  {noteEditorMode === 'rich' ? (
                    <>
                      <div
                        ref={noteEditorRef}
                        className="markdown-editor"
                        contentEditable
                        suppressContentEditableWarning
                        data-editor-root="true"
                        data-placeholder="Select a note to begin editing"
                        onFocus={() => {
                          if (noteEditorRef.current) ensureEditorBlocks(noteEditorRef.current)
                        }}
                        onClick={handleNoteEditorClick}
                        onContextMenu={openNoteContextMenu}
                        onInput={handleNoteEditorInput}
                        onKeyDown={handleNoteEditorKeyDown}
                      />
                      {noteContextMenu ? (
                        <div
                          ref={noteContextMenuRef}
                          className={`note-context-menu ${noteContextMenuOpenLeft ? 'open-left' : ''} ${noteContextSubmenuOpenUp ? 'submenu-open-up' : ''}`}
                          style={{ left: noteContextMenu.x, top: noteContextMenu.y }}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <button
                            className="note-context-menu-item"
                            disabled={!window.getSelection()?.toString().trim()}
                            onClick={() => {
                              void copyNoteSelection()
                              setNoteContextMenu(null)
                              setNoteContextSubmenu(null)
                            }}
                          >
                            Copy
                          </button>
                          {noteClipboardText.trim() ? (
                            <button
                              className="note-context-menu-item"
                              onClick={() => {
                                void pasteIntoNoteFromClipboard()
                                setNoteContextMenu(null)
                                setNoteContextSubmenu(null)
                              }}
                            >
                              Paste
                            </button>
                          ) : null}
                          <div className="note-context-menu-separator" />
                          <div className="note-context-menu-row">
                            <button
                              className={`note-context-menu-item note-context-menu-parent ${noteContextSubmenu === 'elements' ? 'active' : ''}`}
                              onMouseEnter={() => setNoteContextSubmenu('elements')}
                              onClick={() => setNoteContextSubmenu((current) => (current === 'elements' ? null : 'elements'))}
                            >
                              <span>Elements</span>
                              <span className="note-context-menu-arrow">›</span>
                            </button>
                            {noteContextSubmenu === 'elements' ? (
                              <div className="note-context-submenu">
                                {([
                                  ['paragraph', 'Paragraph'],
                                  ['heading-1', 'Heading 1'],
                                  ['heading-2', 'Heading 2'],
                                  ['heading-3', 'Heading 3'],
                                  ['quote', 'Quote'],
                                  ['bullet-list', 'Bullet list'],
                                  ['numbered-list', 'Numbered list'],
                                  ['task-list', 'Task list'],
                                  ['code-block', 'Code block'],
                                  ['divider', 'Divider'],
                                  ['table', 'Table'],
                                ] as const).map(([kind, label]) => (
                                  <button
                                    key={kind}
                                    className="note-context-menu-item"
                                    onClick={() => {
                                      insertNoteElement(kind)
                                      setNoteContextMenu(null)
                                      setNoteContextSubmenu(null)
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {noteContextMenu.kind === 'table' ? (
                            <div className="note-context-menu-row">
                              <button
                                className={`note-context-menu-item note-context-menu-parent ${noteContextSubmenu === 'table' ? 'active' : ''}`}
                                onMouseEnter={() => setNoteContextSubmenu('table')}
                                onClick={() => setNoteContextSubmenu((current) => (current === 'table' ? null : 'table'))}
                              >
                                <span>Table</span>
                                <span className="note-context-menu-arrow">›</span>
                              </button>
                              {noteContextSubmenu === 'table' ? (
                                <div className="note-context-submenu">
                                  <button
                                    className="note-context-menu-item"
                                    onClick={() => {
                                      addTableRowFromContext('before')
                                      setNoteContextMenu(null)
                                      setNoteContextSubmenu(null)
                                    }}
                                  >
                                    Add row before
                                  </button>
                                  <button
                                    className="note-context-menu-item"
                                    onClick={() => {
                                      addTableRowFromContext('after')
                                      setNoteContextMenu(null)
                                      setNoteContextSubmenu(null)
                                    }}
                                  >
                                    Add row after
                                  </button>
                                  <button
                                    className="note-context-menu-item"
                                    onClick={() => {
                                      addTableColumnFromContext('before')
                                      setNoteContextMenu(null)
                                      setNoteContextSubmenu(null)
                                    }}
                                  >
                                    Add column before
                                  </button>
                                  <button
                                    className="note-context-menu-item"
                                    onClick={() => {
                                      addTableColumnFromContext('after')
                                      setNoteContextMenu(null)
                                      setNoteContextSubmenu(null)
                                    }}
                                  >
                                    Add column after
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <textarea
                      className="textarea note-raw-editor"
                      value={noteDraft}
                      placeholder="Edit raw markdown"
                      onChange={(event) => {
                        setNoteDraft(event.target.value)
                        scheduleNoteDraftBroadcast(event.target.value)
                      }}
                      onKeyDown={(event) => handleTextareaTabKeyDown(event, setNoteDraft, scheduleNoteDraftBroadcast)}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="notes-empty-state">
                <button className="button notes-new-button" onClick={() => void createNote()}>
                  New note
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  function renderFilesPage() {
    return (
      <section className="panel">
        {creatingDriveFolder ? (
          <div
            className="modal-backdrop"
            onClick={() => {
              setCreatingDriveFolder(false)
              setNewDriveFolderName('')
            }}
          >
            <div
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>Create folder</h3>
              <p className="muted">Create a new folder inside {selectedFileNode?.path ?? 'drive'}.</p>
              <input
                className="input"
                value={newDriveFolderName}
                placeholder="Folder name"
                autoFocus
                onChange={(event) => setNewDriveFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void createDriveFolderFromSelection()
                  }
                  if (event.key === 'Escape') {
                    setCreatingDriveFolder(false)
                    setNewDriveFolderName('')
                  }
                }}
              />
              <div className="button-row">
                <button className="button" onClick={() => void createDriveFolderFromSelection()}>
                  Confirm
                </button>
                <button
                  className="button-secondary"
                  onClick={() => {
                    setCreatingDriveFolder(false)
                    setNewDriveFolderName('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {pendingDeletePaths.length > 0 ? (
          <ConfirmModal
            title={`Delete ${pendingDeletePaths.length === 1 ? 'item' : `${pendingDeletePaths.length} items`}?`}
            onClose={() => setPendingDeletePaths([])}
            onConfirm={() => void deleteManagedPaths(pendingDeletePaths)}
            confirmRef={deleteConfirmButtonRef}
            cancelRef={deleteCancelButtonRef}
          >
            <p className="muted">
              This will permanently delete:
            </p>
            <div className="code-block file-delete-list">
              {pendingDeleteNodes.map((node) => node.path).join('\n')}
            </div>
          </ConfirmModal>
        ) : null}
        {renamingFilePath ? (
          <div className="modal-backdrop" onClick={() => setRenamingFilePath(null)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <h3>Rename item</h3>
              <input
                ref={renameInputRef}
                className="input"
                value={renameFileName}
                onChange={(event) => setRenameFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenamingFilePath(null)
                    return
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void renameManagedPath(renamingFilePath, renameFileName)
                  }
                }}
              />
              <div className="button-row">
                <button className="button" onClick={() => void renameManagedPath(renamingFilePath, renameFileName)}>
                  Rename
                </button>
                <button className="button-secondary" onClick={() => setRenamingFilePath(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {convertingFilePath ? (
          <ConfirmModal
            title={`Convert to .${convertibleTextExtension(convertingFilePath)}`}
            onClose={() => setConvertingFilePath(null)}
            onConfirm={() => void convertManagedTextFile(convertingFilePath)}
            confirmLabel="Convert"
          >
            <p className="muted">
              This rewrites the file as plain text with the new extension and removes the old file.
            </p>
          </ConfirmModal>
        ) : null}
        {fileHelpOpen ? (
          <div className="modal-backdrop" onClick={() => setFileHelpOpen(false)}>
            <div className="modal-card file-help-card" onClick={(event) => event.stopPropagation()}>
              <h3>Yazi-style keys</h3>
              <div className="help-grid">
                <div><code>j</code> <code>k</code> or arrows</div>
                <div>Move cursor</div>
                <div><code>h</code></div>
                <div>Go to parent directory</div>
                <div><code>l</code> or <code>Enter</code></div>
                <div>Open directory or file</div>
                <div><code>gg</code> / <code>G</code></div>
                <div>Jump to first / last item</div>
                <div><code>Space</code></div>
                <div>Mark or unmark item</div>
                <div><code>Delete</code></div>
                <div>Delete marked or active item</div>
                <div><code>y</code></div>
                <div>Copy marked path(s)</div>
                <div><code>?</code></div>
                <div>Toggle help</div>
              </div>
            </div>
          </div>
        ) : null}
        <div
          ref={fileManagerRef}
          className={`file-manager ${activeSplitter ? 'resizing' : ''} ${filePreviewOpen ? '' : 'preview-collapsed'}`}
          style={
            {
              ['--files-left-width' as string]: `${filePaneWidths.left}px`,
              ['--files-right-width' as string]: `${filePaneWidths.right}px`,
              ['--files-top-height' as string]: `${filePaneHeights.top}px`,
              ['--files-middle-height' as string]: `${filePaneHeights.middle}px`,
            } as React.CSSProperties
          }
        >
          <aside className="file-sidebar">
            <div className="folder-tree file-tree">
              {filesTree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  getDisplayName={displayNameForFileNode}
                  selectedPath={selectedFilePath}
                  activePath={activeFileNode?.path ?? null}
                  markedPaths={markedFilePaths}
                  draggingPath={draggingFilePath}
                  dropTargetPath={dropTargetPath}
                  onSelect={selectFileTreeNode}
                  onDragStart={beginFileDrag}
                  onDragEnd={() => {
                    setDraggingFilePath(null)
                    setDropTargetPath(null)
                  }}
                  onDropTargetChange={setDropTargetPath}
                  onDrop={handleDirectoryDrop}
                />
              ))}
            </div>
          </aside>
          <div
            className={`pane-splitter ${activeSplitter === 'left' ? 'active' : ''}`}
            role="separator"
            aria-orientation="vertical"
            onMouseDown={() => setActiveSplitter('left')}
          />
          <div className="file-browser-pane">
            <div className="file-list-shell">
              <div className="file-browser-header">
                {fileSearchOpen ? (
                  <div className="file-current-directory file-current-directory-search">
                    <input
                      ref={fileSearchInputRef}
                      className="input file-search-inline-input"
                      value={fileSearchQuery}
                      placeholder="Search everything"
                      onChange={(event) => setFileSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setFileSearchOpen(false)
                          setFileSearchQuery('')
                        }
                      }}
                    />
                  </div>
                ) : (
                  deriveParentPath(currentDirectoryPath) !== null ? (
                    <button
                      className="file-current-directory file-current-directory-button"
                      onClick={goToParentDirectory}
                      title={`Go to ${deriveParentPath(currentDirectoryPath) || '/'}`}
                    >
                      {trimmedFileSearchQuery ? `Search: ${fileSearchQuery.trim()}` : `/${currentDirectoryPath || ''}`.replace(/\/$/, '/')}
                    </button>
                  ) : (
                    <div className="file-current-directory">
                      {trimmedFileSearchQuery ? `Search: ${fileSearchQuery.trim()}` : `/${currentDirectoryPath || ''}`.replace(/\/$/, '/')}
                    </div>
                  )
                )}
                <div className="button-row files-actions">
                  {!fileSearchOpen ? (
                    <button
                      className="button-secondary files-search-button"
                      onClick={() => {
                        setFileSearchOpen(true)
                      }}
                      aria-label="Open search"
                    >
                      ⌕
                    </button>
                  ) : null}
                  <div className="files-view-anchor" ref={fileColumnViewRef}>
                    <button
                      className="button-secondary"
                      onClick={() => setFileColumnViewOpen((current) => !current)}
                      aria-expanded={fileColumnViewOpen}
                    >
                      View
                    </button>
                    {fileColumnViewOpen ? (
                      <div className="files-view-menu">
                        {[
                          { key: 'directory', label: 'Directory' },
                          { key: 'type', label: 'Type' },
                          { key: 'size', label: 'Size' },
                          { key: 'modified', label: 'Modified' },
                          { key: 'created', label: 'Created' },
                        ].map((column) => (
                          <label key={column.key} className="files-view-option">
                            <input
                              type="checkbox"
                              checked={fileColumnVisibility[column.key as Exclude<FileColumnKey, 'name'>]}
                              onChange={() => toggleFileColumnVisibility(column.key as FileColumnKey)}
                            />
                            <span>{column.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {trimmedFileSearchQuery ? (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setFileSearchOpen(false)
                        setFileSearchQuery('')
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    className="button-secondary"
                    onClick={() => {
                      setCreatingDriveFolder(true)
                      setNewDriveFolderName('')
                    }}
                  >
                    New folder
                  </button>
                  <label className="button-secondary upload-button">
                    Upload
                    <input type="file" hidden onChange={(event) => void handleDriveUpload(event)} />
                  </label>
                </div>
              </div>
              {trimmedFileSearchQuery || currentDirectoryNode?.kind === 'directory' ? (
                <div className="file-table-wrap">
                  <div
                    className={`file-list-header ${trimmedFileSearchQuery ? 'search-mode' : ''}`}
                    style={{ gridTemplateColumns: fileGridTemplateColumns }}
                  >
                    {visibleFileColumns.map((column) => (
                      <span key={column.key} className={`file-header-cell ${column.className ?? ''}`}>
                        <span>{column.label}</span>
                        {column.resizable ? (
                          <span className="file-col-resizer" onMouseDown={(event) => beginFileColumnResize(column.key, event.clientX)} />
                        ) : null}
                      </span>
                    ))}
                  </div>
                  <div className="file-list">
                  {displayedFileNodes.map((node: FileNode) => (
                    <div
                      key={node.path}
                      className={`file-row ${trimmedFileSearchQuery ? 'search-mode' : ''} ${dropTargetPath === node.path ? 'drop-target' : ''} ${activeFileNode?.path === node.path ? 'active' : ''} ${markedFilePaths.includes(node.path) ? 'marked' : ''}`}
                      style={{ gridTemplateColumns: fileGridTemplateColumns }}
                      draggable={
                        node.path.startsWith('drive/') ||
                        node.path.startsWith('notes/') ||
                        node.path.startsWith('diagrams/')
                      }
                      onDragStart={(event) => beginFileDrag(event, node.path)}
                      onDragEnd={() => {
                        setDraggingFilePath(null)
                        setDropTargetPath(null)
                      }}
                      onDragOver={(event) => {
                        if (node.kind !== 'directory' || !draggingFilePath) return
                        event.preventDefault()
                        setDropTargetPath(node.path)
                      }}
                      onDragLeave={() => {
                        if (dropTargetPath === node.path) setDropTargetPath(null)
                      }}
                      onDrop={(event) => {
                        if (node.kind !== 'directory') return
                        void handleDirectoryDrop(event, node.path)
                      }}
                      onClick={() => setActiveFilePath(node.path)}
                      onDoubleClick={() => openFileNode(node)}
                    >
                      {visibleFileColumns.map((column) => (
                        <span key={column.key} className={column.className}>
                          {renderFileColumnCell(node, column.key)}
                        </span>
                      ))}
                    </div>
                  ))}
                  {displayedFileNodes.length === 0 ? (
                    <div className="empty-state">
                      {trimmedFileSearchQuery ? 'No search results.' : 'This directory is empty.'}
                    </div>
                  ) : null}
                </div>
                </div>
              ) : (
                <div className="empty-state">No files yet.</div>
              )}
            </div>
          </div>
          <div
            className={`pane-splitter ${activeSplitter === 'right' ? 'active' : ''} ${filePreviewOpen ? '' : 'collapsed'}`}
            role="separator"
            aria-orientation="vertical"
            aria-expanded={filePreviewOpen}
            onMouseDown={() => {
              if (!filePreviewOpen) return
              setActiveSplitter('right')
            }}
            onDoubleClick={toggleFilePreviewPane}
          />
          <aside className={`file-preview-pane ${filePreviewOpen ? '' : 'hidden'}`}>
            {activeFileNode ? (
              <div className="file-preview-card">
                <div className="file-preview-title">
                  {activeFileNode.kind === 'directory' ? <span className="file-type-icon">/</span> : null}
                  <strong>{activeFileNode.kind === 'directory' ? activeFileNode.path : `${parentDirectoryLabel(activeFileNode.path)}/${displayNameForFileNode(activeFileNode)}`}</strong>
                </div>
                <div className="preview-meta">
                  <div><span className="muted">Type</span><strong>{activeFileNode.kind === 'directory' ? 'Directory' : fileTypeLabel(activeFileNode.name)}</strong></div>
                  <div><span className="muted">Size</span><strong>{activeFileNode.kind === 'directory' ? '—' : formatFileSize(activeFileNode.size_bytes)}</strong></div>
                  <div><span className="muted">Modified</span><strong>{formatFileTimestamp(activeFileNode.updated_at)}</strong></div>
                  <div><span className="muted">Created</span><strong>{formatFileTimestamp(activeFileNode.created_at)}</strong></div>
                  <div><span className="muted">Marked</span><strong>{markedFilePaths.includes(activeFileNode.path) ? 'Yes' : 'No'}</strong></div>
                </div>
                {activeFileNode.kind === 'file' ? (
                  <div className="button-row preview-actions">
                    <button
                      className="button-secondary file-open-link"
                      onClick={() => void openFileNode(activeFileNode)}
                      style={{ display: 'inline-flex', textDecoration: 'none', width: 'fit-content' }}
                    >
                      open
                    </button>
                    <button className="button-secondary file-open-link" onClick={() => downloadManagedPath(activeFileNode.path)}>
                      download
                    </button>
                    <button
                      className="button-secondary file-open-link"
                      onClick={() =>
                        void openShareDialog({
                          resourceKey: resourceKeyForFilePath(activeFileNode.path),
                          label: displayNameForFileNode(activeFileNode),
                        })
                      }
                    >
                      visibility
                    </button>
                    {canConvertFilePath(activeFileNode.path) ? (
                      <button className="button-secondary file-open-link" onClick={() => setConvertingFilePath(activeFileNode.path)}>
                        convert
                      </button>
                    ) : null}
                    {canRenameFilePath(activeFileNode.path) ? (
                      <button className="button-secondary file-open-link" onClick={beginRenameCurrentFile}>
                        rename
                      </button>
                    ) : null}
                    {canDeleteFilePath(activeFileNode.path) ? (
                      <button className="button-secondary file-delete-link" onClick={() => requestDeletePaths([activeFileNode.path])}>
                        delete
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="button-row preview-actions">
                    <button className="button-secondary file-open-link" onClick={() => setSelectedFilePath(activeFileNode.path)}>
                      enter
                    </button>
                    <button className="button-secondary file-open-link" onClick={() => downloadManagedPath(activeFileNode.path)}>
                      download
                    </button>
                    <button
                      className="button-secondary file-open-link"
                      onClick={() =>
                        void openShareDialog({
                          resourceKey: resourceKeyForFilePath(activeFileNode.path),
                          label: activeFileNode.path,
                        })
                      }
                    >
                      visibility
                    </button>
                    {canRenameFilePath(activeFileNode.path) ? (
                      <button className="button-secondary file-open-link" onClick={beginRenameCurrentFile}>
                        rename
                      </button>
                    ) : null}
                    {canDeleteFilePath(activeFileNode.path) ? (
                      <button className="button-secondary file-delete-link" onClick={() => requestDeletePaths([activeFileNode.path])}>
                        delete
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">Select a file or directory.</div>
            )}
          </aside>
        </div>
      </section>
    )
  }

  function renderDiagramsPage() {
    return (
      <section
        ref={diagramsSectionRef}
        className={`panel diagrams-panel ${diagramFullscreen ? 'fullscreen' : ''}`}
      >
        <div
          ref={diagramManagerRef}
          className={`notes-manager diagrams-manager ${diagramDrawerOpen ? '' : 'library-hidden'} ${activeDiagramSplitter ? 'resizing' : ''} ${diagramFullscreen ? 'fullscreen' : ''}`}
          style={
            {
              ['--notes-pane-width' as string]: `${diagramPaneSize.width}px`,
              ['--notes-pane-height' as string]: `${diagramPaneSize.height}px`,
            } as React.CSSProperties
          }
        >
          {diagramDrawerOpen ? (
            <aside className="notes-sidebar diagrams-sidebar">
              <div className="file-sidebar-header-row">
                <div className="button-row files-actions">
                  <button className="button-secondary notes-new-button" onClick={() => void createDiagram()}>
                    New diagram
                  </button>
                </div>
              </div>
              <div className="folder-tree file-tree notes-folder-tree">
                <DiagramLibraryTreeNode
                  node={{
                    name: 'Diagrams',
                    path: 'Diagrams',
                    children: diagramTree,
                    diagrams: diagrams
                      .filter((diagram) => normalizeDiagramFolderPath(diagram.title) === 'Diagrams')
                      .sort((a, b) => diagramDisplayName(a.title).localeCompare(diagramDisplayName(b.title))),
                  }}
                  selectedDiagramId={selectedDiagramId}
                  onSelectDiagram={setSelectedDiagramId}
                />
              </div>
            </aside>
          ) : null}
          <div
            className={`pane-splitter notes-pane-splitter ${activeDiagramSplitter ? 'active' : ''} ${diagramDrawerOpen ? '' : 'collapsed'}`}
            role="separator"
            aria-orientation="vertical"
            onMouseDown={() => {
              if (diagramDrawerOpen) setActiveDiagramSplitter(true)
            }}
            onDoubleClick={() => setDiagramDrawerOpen((current) => !current)}
          />
          <div className="notes-editor-shell diagrams-editor-shell">
            <div className="notes-editor-header">
              <input
                className="input note-title-input notes-title-input"
                value={selectedDiagram?.title ?? ''}
                placeholder="Select or create a diagram"
                disabled={!selectedDiagram}
                onChange={(event) => {
                  if (!selectedDiagram) return
                  setDiagrams((current) =>
                    current.map((diagram) =>
                      diagram.id === selectedDiagram.id ? { ...diagram, title: event.target.value } : diagram,
                    ),
                  )
                }}
              />
              <button
                className="button-secondary"
                type="button"
                title="Open self-hosted draw.io"
                onClick={() => window.open(getDrawioBaseUrl(), '_blank', 'noopener,noreferrer')}
              >
                open draw
              </button>
              <div className="notes-editor-actions">
                <button
                  className={diagramEditorMode === 'diagram' ? 'button' : 'button-secondary'}
                  onClick={() => setDiagramMode('diagram')}
                >
                  Diagram
                </button>
                <button
                  className={diagramEditorMode === 'xml' ? 'button' : 'button-secondary'}
                  onClick={() => setDiagramMode('xml')}
                >
                  XML
                </button>
                <button className="button" onClick={() => void saveDiagram()}>
                  Save
                </button>
              </div>
            </div>
            <div className="diagrams-workspace">
              {diagramEditorMode === 'xml' ? (
                <textarea
                  className="textarea diagram-xml-pane"
                  value={diagramDraft}
                  placeholder="Select a diagram to inspect or edit XML"
                  disabled={!selectedDiagram}
                  onChange={(event) => setDiagramDraft(event.target.value)}
                  onKeyDown={(event) => handleTextareaTabKeyDown(event, setDiagramDraft)}
                />
              ) : (
                <DrawioDiagramEditor
                  ref={drawioEditorRef}
                  loadKey={`${selectedDiagram?.id ?? 'empty'}-${diagramLoadVersion}`}
                  xml={diagramDraft}
                  title={selectedDiagram?.title ?? 'Diagram'}
                  sourceFormat={diagramSourceFormat}
                  disabled={!selectedDiagram}
                  onChange={(xml) => {
                    setDiagramDraft(xml)
                    setDiagramSourceFormat('drawio')
                  }}
                  onSave={(xml) => void persistDiagramXml(xml)}
                />
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  function renderCurrentPage() {
    switch (route) {
      case '/notes':
        return renderNotesPage()
      case '/files':
        return renderFilesPage()
      case '/diagrams':
        return renderDiagramsPage()
      case '/voice':
        return (
          <VoicePage
            voiceTree={voiceTreeNode}
            voiceDrawerOpen={voiceDrawerOpen}
            voicePaneSize={voicePaneSize}
            activeVoiceSplitter={activeVoiceSplitter}
            memos={memos}
            selectedVoiceMemoId={selectedVoiceMemoId}
            selectedVoiceMemo={selectedVoiceMemo}
            recording={recording}
            onSelectVoiceMemo={setSelectedVoiceMemoId}
            onSelectVoicePath={selectVoicePath}
            onStartVoiceResize={() => setActiveVoiceSplitter(true)}
            onToggleVoiceDrawer={() => setVoiceDrawerOpen((current) => !current)}
            onToggleRecording={() => void toggleRecording()}
            onUploadAudioFile={(file) => void uploadAudioFile(file)}
            onPollTranscript={(memo) => void pollTranscript(memo)}
          />
        )
      case '/coms':
        return (
          <ChatPage
            chatDrawerOpen={chatDrawerOpen}
            chatPaneSize={chatPaneSize}
            activeChatSplitter={activeChatSplitter}
            currentUserId={session?.user.id ?? null}
            currentUserLabel={session?.user.display_name ?? 'You'}
            comsParticipants={comsParticipants}
            rooms={rooms}
            roomUnreadCounts={roomUnreadCounts}
            selectedRoomId={selectedRoomId}
            selectedRoom={selectedRoom}
            messages={messages}
            activeCallRoomId={activeCallRoomId}
            callJoined={callJoined}
            callMediaMode={callMediaMode}
            screenSharing={screenSharing}
            remoteParticipants={remoteParticipants}
            localVideoRef={localVideoRef}
            onCreateRoom={() => void createRoom()}
            onCreateDirectRoom={(participantIds) => void createDirectRoom(participantIds)}
            onRenameRoom={renameRoom}
            onUpdateRoomParticipants={updateRoomParticipants}
            onSelectRoom={setSelectedRoomId}
            onJoinVoiceCall={() => void joinCall('audio')}
            onJoinVideoCall={() => void joinCall('video')}
            onToggleScreenShare={() => void (screenSharing ? stopScreenShare() : startScreenShare())}
            onLeaveCall={leaveCall}
            onStartChatResize={() => setActiveChatSplitter(true)}
            onToggleChatDrawer={() => setChatDrawerOpen((current) => !current)}
            onSendMessage={sendMessage}
          />
        )
      case '/settings':
        return (
          <SettingsPage
            appearance={appearance}
            shortcuts={shortcuts}
            orderedNavItems={orderedNavItems}
            session={session}
            status={status}
            oidc={oidc}
            rtcConfig={rtcConfig}
            clientId={clientIdRef.current}
            canCustomizeAppearance={!adminSettings?.enforce_org_appearance && currentRolePolicy.customize_appearance}
            onSetAppearance={setAppearance}
            onSetShortcuts={setShortcuts}
            onSetNavOrder={setNavOrder}
          />
        )
      case '/admin':
        return (
          <AdminPage
            isAdmin={currentRolePolicy.admin_panel}
            canManageUsers={currentRolePolicy.manage_users}
            canManageOrgSettings={currentRolePolicy.manage_org_settings}
            settings={adminSettings}
            users={adminUsers}
            storageOverview={adminStorageOverview}
            currentFontFamily={appearance.fontFamily}
            currentAccent={appearance.accent}
            currentPageGutter={appearance.pageGutter}
            currentRadius={appearance.radius}
            onSave={(settings) => void saveAdminSettings(settings)}
            onApplyCurrentAppearance={() => {
              if (!adminSettings) return
              void saveAdminSettings({
                ...adminSettings,
                org_font_family: appearance.fontFamily,
                org_accent: appearance.accent,
                org_page_gutter: appearance.pageGutter,
                org_radius: appearance.radius,
              })
            }}
            onCreateUser={createAdminUser}
            onResetPassword={(userId, password) => void resetAdminUserPassword(userId, password)}
            onUpdateUserAccess={(userId, payload) => void updateAdminUserAccess(userId, payload)}
          />
        )
      default:
        return renderNotesPage()
    }
  }

  function renderShareModal() {
    if (!shareTarget || !shareDraft) return null
    const query = shareUserQuery.trim().toLowerCase()
    const matchingParticipants = comsParticipants.filter((participant) => {
      const haystack = `${participant.display_name} ${participant.username} ${participant.email}`.toLowerCase()
      return !query || haystack.includes(query)
    })
    const selectedParticipants = comsParticipants.filter((participant) => shareDraft.user_ids.includes(participant.id))

    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setShareTarget(null)}>
        <div className="modal-card share-modal-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <div className="share-modal-header">
            <div>
              <h3>Visibility</h3>
              <p className="muted">{shareTarget.label}</p>
            </div>
            <button className="button-secondary modal-close-button" onClick={() => setShareTarget(null)} aria-label="Close visibility">
              x
            </button>
          </div>
          <div className="share-visibility-options">
            <button
              className={shareDraft.visibility === 'private' ? 'button' : 'button-secondary'}
              onClick={() => setShareVisibility('private')}
            >
              Private
            </button>
            <button
              className={shareDraft.visibility === 'org' ? 'button' : 'button-secondary'}
              onClick={() => setShareVisibility('org')}
            >
              Anyone in org
            </button>
            <button
              className={shareDraft.visibility === 'users' ? 'button' : 'button-secondary'}
              onClick={() => setShareVisibility('users')}
            >
              Specific people
            </button>
          </div>
          <div className="share-picker">
            <input
              className="input"
              value={shareUserQuery}
              placeholder="Search username or email"
              onChange={(event) => {
                setShareUserQuery(event.target.value)
                if (shareDraft.visibility !== 'users') setShareVisibility('users')
              }}
            />
            {selectedParticipants.length ? (
              <div className="share-selected-list" aria-label="Selected people">
                {selectedParticipants.map((participant) => (
                  <button
                    key={participant.id}
                    className="share-chip"
                    onClick={() => toggleShareUser(participant.id)}
                    title="Remove"
                  >
                    {participant.display_name || participant.username}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="share-user-list">
              {matchingParticipants.map((participant) => {
                const selected = shareDraft.user_ids.includes(participant.id)
                return (
                  <button
                    key={participant.id}
                    className={`share-user-row ${selected ? 'selected' : ''}`}
                    onClick={() => toggleShareUser(participant.id)}
                  >
                    <span>{participant.display_name || participant.username}</span>
                    <span className="muted">{participant.email || participant.username}</span>
                    <span>{selected ? 'added' : 'add'}</span>
                  </button>
                )
              })}
              {!matchingParticipants.length ? <div className="empty-state compact">No users found.</div> : null}
            </div>
          </div>
          <div className="button-row modal-actions">
            <button className="button-secondary" onClick={() => setShareTarget(null)}>
              Cancel
            </button>
            <button className="button" onClick={() => void saveShareSettings()} disabled={shareSaving}>
              {shareSaving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )
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
      <TopNav
        orderedNavItems={orderedNavItems}
        route={route}
        navUnreadCounts={{ '/coms': comsUnreadCount }}
        shortcutsHelpOpen={shortcutsHelpOpen}
        onNavigate={(path) => void navigate(path)}
        onToggleShortcutsHelp={() => setShortcutsHelpOpen((current) => !current)}
        onSetShortcutsHelpOpen={setShortcutsHelpOpen}
        shortcutsContent={<ShortcutsPopover shortcuts={shortcuts} />}
      />

      {actionNotice ? <ActionNotice id={actionNotice.id} message={actionNotice.message} /> : null}
      {renderShareModal()}

      {renderCurrentPage()}
    </div>
  )
}

export default App
