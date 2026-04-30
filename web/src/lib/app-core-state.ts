import { useRef, useState } from 'react'
import type { DrawioDiagramEditorHandle } from '../components/DrawioDiagramEditor'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_NAV_ORDER,
  DEFAULT_SHORTCUTS,
  normalizeRoute,
  type ActionNotice as ActionNoticeState,
  type AppearanceSettings,
  type DiagramEditorMode,
  type NavItemPath,
  type RoutePath,
  type ShortcutSettings,
} from './app-config'
import { createEmptyDrawioDiagramXml, type ParsedDrawioDiagram } from './drawio-diagram'
import { useLibraryUiState } from './library-ui-state'
import { useNoteUiState } from './note-ui-state'
import type {
  AdminAuditEntry,
  AdminDeletedItem,
  AdminStorageOverview,
  AdminDatabaseOverview,
  AdminSettings,
  AdminUserSummary,
  CalendarConnection,
  CalendarEvent,
  Diagram,
  FileNode,
  GoogleCalendarConfig,
  Message,
  Note,
  OidcConfig,
  ResourceShare,
  Room,
  RtcConfig,
  SessionResponse,
  SetupStatusResponse,
  SyncCursorSet,
  SystemUpdateStatus,
  TaskItem,
  UserProfile,
  VoiceMemo,
} from './types'
import { type BrowserSpeechRecognition } from './shortcuts'
import { normalizeFolderPath } from './ui-helpers'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

export function useAppCoreState(createClientId: () => string) {
  const [route, setRoute] = useState<RoutePath>(normalizeRoute(window.location.pathname))
  const [locationSearch, setLocationSearch] = useState(window.location.search)
  const [authMode, setAuthMode] = useState<'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'>('boot')
  const [serverUrl, setServerUrl] = useState('')
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null)
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [oidc, setOidc] = useState<OidcConfig | null>(null)
  const [googleCalendarConfig, setGoogleCalendarConfig] = useState<GoogleCalendarConfig | null>(null)
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null)
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([])
  const [adminStorageOverview, setAdminStorageOverview] = useState<AdminStorageOverview | null>(null)
  const [adminDatabaseOverview, setAdminDatabaseOverview] = useState<AdminDatabaseOverview | null>(null)
  const [adminDeletedItems, setAdminDeletedItems] = useState<AdminDeletedItem[]>([])
  const [adminAuditEntries, setAdminAuditEntries] = useState<AdminAuditEntry[]>([])
  const [deletedItems, setDeletedItems] = useState<AdminDeletedItem[]>([])
  const [systemUpdateStatus, setSystemUpdateStatus] = useState<SystemUpdateStatus | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [filesTree, setFilesTree] = useState<FileNode[]>([])
  const [pendingAppKey, setPendingAppKey] = useState<string | null>(null)
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
  const [selectedRoomId, setRoomSelectionState] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [rtcConfig, setRtcConfig] = useState<RtcConfig | null>(null)
  const [recording, setRecording] = useState(false)
  const [voiceInputLevel, setVoiceInputLevel] = useState(0)
  const [status, setStatus] = useState('Bootstrapping workspace')
  const [actionNotice, setActionNotice] = useState<ActionNoticeState | null>(null)
  const [syncNotice, setSyncNotice] = useState<{ tone: 'offline' | 'error'; message: string } | null>(null)
  const [syncConflicts, setSyncConflicts] = useState<any[]>([])
  const [syncConflictsOpen, setSyncConflictsOpen] = useState(false)
  const [syncCursors, setSyncCursors] = useState<SyncCursorSet>({ generated_at: new Date(0).toISOString() })
  const [shareTarget, setShareTarget] = useState<any | null>(null)
  const [shareDraft, setShareDraft] = useState<ResourceShare | null>(null)
  const [shareUserQuery, setShareUserQuery] = useState('')
  const [shareSaving, setShareSaving] = useState(false)
  const [isCompactViewport, setIsCompactViewport] = useState(false)
  const [callJoined, setCallJoined] = useState(false)
  const [activeCallRoomId, setActiveCallRoomId] = useState<string | null>(null)
  const [callMediaMode, setCallMediaMode] = useState<'audio' | 'video' | null>(null)
  const [screenSharing, setScreenSharing] = useState(false)
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingAudioContextRef = useRef<AudioContext | null>(null)
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null)
  const recordingLevelFrameRef = useRef<number | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const speechTranscriptRef = useRef('')
  const libraryUiState = useLibraryUiState()
  const noteUiState = useNoteUiState(normalizeFolderPath('Getting Started'))
  const diagramManagerRef = useRef<HTMLDivElement | null>(null)
  const chatManagerRef = useRef<HTMLDivElement | null>(null)
  const diagramsSectionRef = useRef<HTMLElement | null>(null)
  const drawioEditorRef = useRef<DrawioDiagramEditorHandle | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const selectedRoomIdRef = useRef<string | null>(null)
  const routeRef = useRef<RoutePath>(route)
  const sessionUserIdRef = useRef<string | null>(session?.user.id ?? null)
  const notesRef = useRef<Note[]>([])
  const diagramsRef = useRef<Diagram[]>([])
  const memosRef = useRef<VoiceMemo[]>([])
  const syncNoticeTimeoutRef = useRef<number | null>(null)
  const rtcConfigRef = useRef<RtcConfig | null>(null)
  const callJoinedRef = useRef(false)
  const activeCallRoomIdRef = useRef<string | null>(null)
  const clientIdRef = useRef(createClientId())
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const standaloneDrawioWindowRef = useRef<Window | null>(null)
  const standaloneDrawioEditingIdRef = useRef<string | null>(null)

  function chooseRoom(roomId: string | null) {
    setRoomSelectionState(roomId)
  }

  return {
    route, setRoute,
    locationSearch, setLocationSearch,
    authMode, setAuthMode,
    serverUrl, setServerUrl,
    setupStatus, setSetupStatus,
    session, setSession,
    oidc, setOidc,
    googleCalendarConfig, setGoogleCalendarConfig,
    adminSettings, setAdminSettings,
    adminUsers, setAdminUsers,
    adminStorageOverview, setAdminStorageOverview,
    adminDatabaseOverview, setAdminDatabaseOverview,
    adminDeletedItems, setAdminDeletedItems,
    adminAuditEntries, setAdminAuditEntries,
    deletedItems, setDeletedItems,
    systemUpdateStatus, setSystemUpdateStatus,
    notes, setNotes,
    filesTree, setFilesTree,
    pendingAppKey, setPendingAppKey,
    notePaneSize, setNotePaneSize,
    activeNoteSplitter, setActiveNoteSplitter,
    noteFullscreen, setNoteFullscreen,
    diagramPaneSize, setDiagramPaneSize,
    activeDiagramSplitter, setActiveDiagramSplitter,
    diagramDrawerOpen, setDiagramDrawerOpen,
    diagramFullscreen, setDiagramFullscreen,
    voicePaneSize, setVoicePaneSize,
    activeVoiceSplitter, setActiveVoiceSplitter,
    voiceDrawerOpen, setVoiceDrawerOpen,
    chatPaneSize, setChatPaneSize,
    activeChatSplitter, setActiveChatSplitter,
    chatDrawerOpen, setChatDrawerOpen,
    shortcutsHelpOpen, setShortcutsHelpOpen,
    shortcuts, setShortcuts,
    appearance, setAppearance,
    navOrder, setNavOrder,
    diagrams, setDiagrams,
    selectedDiagramId, setSelectedDiagramId,
    diagramDraft, setDiagramDraft,
    diagramEditorMode, setDiagramEditorMode,
    diagramSourceFormat, setDiagramSourceFormat,
    diagramLoadVersion, setDiagramLoadVersion,
    memos, setMemos,
    selectedVoiceMemoId, setSelectedVoiceMemoId,
    calendarConnections, setCalendarConnections,
    selectedCalendarConnectionIds, setSelectedCalendarConnectionIds,
    calendarEvents, setCalendarEvents,
    tasks, setTasks,
    selectedTaskId, setSelectedTaskId,
    rooms, setRooms,
    comsParticipants, setComsParticipants,
    roomUnreadCounts, setRoomUnreadCounts,
    selectedRoomId, chooseRoom,
    messages, setMessages,
    rtcConfig, setRtcConfig,
    recording, setRecording,
    voiceInputLevel, setVoiceInputLevel,
    status, setStatus,
    actionNotice, setActionNotice,
    syncNotice, setSyncNotice,
    syncConflicts, setSyncConflicts,
    syncConflictsOpen, setSyncConflictsOpen,
    syncCursors, setSyncCursors,
    shareTarget, setShareTarget,
    shareDraft, setShareDraft,
    shareUserQuery, setShareUserQuery,
    shareSaving, setShareSaving,
    isCompactViewport, setIsCompactViewport,
    callJoined, setCallJoined,
    activeCallRoomId, setActiveCallRoomId,
    callMediaMode, setCallMediaMode,
    screenSharing, setScreenSharing,
    remoteParticipants, setRemoteParticipants,
    mediaRecorderRef,
    recordingStreamRef,
    recordingAudioContextRef,
    recordingAnalyserRef,
    recordingLevelFrameRef,
    audioChunksRef,
    speechRecognitionRef,
    speechTranscriptRef,
    ...libraryUiState,
    ...noteUiState,
    diagramManagerRef,
    chatManagerRef,
    diagramsSectionRef,
    drawioEditorRef,
    socketRef,
    localVideoRef,
    localStreamRef,
    screenStreamRef,
    selectedRoomIdRef,
    routeRef,
    sessionUserIdRef,
    notesRef,
    diagramsRef,
    memosRef,
    syncNoticeTimeoutRef,
    rtcConfigRef,
    callJoinedRef,
    activeCallRoomIdRef,
    clientIdRef,
    peerConnectionsRef,
    standaloneDrawioWindowRef,
    standaloneDrawioEditingIdRef,
  }
}
