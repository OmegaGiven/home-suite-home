import { useMemo, type Dispatch, type SetStateAction } from 'react'
import './App.css'
import { ActionNotice } from './components/ActionNotice'
import { AppAuthShell } from './components/AppAuthShell'
import { AppReadyShell } from './components/AppReadyShell'
import { AppPageRenderer } from './components/AppPageRenderer'
import { ConnectionBanner } from './components/ConnectionBanner'
import { getStandaloneDrawioUrl } from './components/DrawioDiagramEditor'
import { FloatingActivityPanels } from './components/FloatingActivityPanels'
import { ShareModal } from './components/ShareModal'
import { ShortcutsPopover } from './components/ShortcutsPopover'
import { SyncConflictsPanel } from './components/SyncConflictsPanel'
import { TopNav } from './components/TopNav'
import { api } from './lib/api'
import { useAppActionBundle } from './lib/app-action-bundle'
import { useAppCoreState } from './lib/app-core-state'
import { useAppEffectsBundle } from './lib/app-effects-bundle'
import { useAppSupportBundle } from './lib/app-support-bundle'
import {
  buildAppActionBundleContext,
  buildAppPagePropsContext,
  buildAppSupportContext,
  buildSelectedEntityRuntimeContext,
} from './lib/app-context-builders'
import { diagramIdFromPath, diagramIdFromPath as diagramIdFromManagedPath, noteIdFromPath, noteTitleFromPath } from './lib/file-display'
import { importedFolderForPath } from './lib/file-browser'
import { useAppInteractionBundle } from './lib/app-interaction-bundle'
import { usePaneLayoutEffects } from './lib/pane-layout-effects'
import { useFilesKeyboardEffects, useGlobalKeyboardEffects } from './lib/keyboard-effects'
import { useAppPagePropsBundle } from './lib/app-page-props'
import { useSelectedEntityRuntime } from './lib/selected-entity-runtime'
import { rebaseFolderEntries } from './lib/app-view-runtime'
import { isNativePlatform } from './lib/platform'
import { displayNameForManagedFileNode } from './lib/app-shell'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_NAV_ORDER,
  DEFAULT_SHORTCUTS,
  normalizeRoute,
} from './lib/app-config'
import {
  editableHtmlToMarkdown,
} from './lib/markdown-editor'
import { normalizeShortcutBinding } from './lib/shortcuts'
import type {
  Diagram,
  FileNode,
  Note,
  VoiceMemo,
} from './lib/types'
import {
  parseDrawioDiagramXml,
} from './lib/drawio-diagram'
import {
  buildDiagramTree,
  buildNoteTree,
  defaultNoteTitle,
  deriveParentPath,
  findFileNode,
  managedPathForDiagramFolder,
  managedPathForNoteFolder,
  managedPathForVoiceFolder,
  diagramDisplayName,
  mergeFolderPaths,
  normalizeDiagramDirectoryPath,
  normalizeDiagramFolderPath,
  normalizeDiagramTitlePath,
  normalizeFolderPath,
  normalizeVoiceDirectoryPath,
} from './lib/ui-helpers'

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

function upsertVoiceMemo(records: VoiceMemo[], nextRecord: VoiceMemo) {
  const withoutExisting = records.filter((record) => record.id !== nextRecord.id)
  return [nextRecord, ...withoutExisting].sort((left, right) => right.created_at.localeCompare(left.created_at))
}

function displayNameForFileNodeFactory(node: FileNode, notes: Note[], memos: VoiceMemo[], diagrams: Diagram[]) {
  return displayNameForManagedFileNode(node, notes, memos, diagrams)
}

function App() {
  const appState = useAppCoreState(createClientId)
  const {
    route, setRoute,
    locationSearch, setLocationSearch,
    authMode, setAuthMode,
    serverUrl, setServerUrl,
    setupStatus,
    session,
    setGoogleCalendarConfig,
    setAdminDatabaseOverview,
    setAdminDeletedItems,
    setAdminAuditEntries,
    deletedItems, setDeletedItems,
    systemUpdateStatus, setSystemUpdateStatus,
    notes, setNotes,
    filesTree, setFilesTree,
    pendingAppKey, setPendingAppKey,
    notePaneSize, setNotePaneSize,
    activeNoteSplitter, setActiveNoteSplitter,
    diagramPaneSize, setDiagramPaneSize,
    activeDiagramSplitter, setActiveDiagramSplitter,
    diagramDrawerOpen,
    setDiagramFullscreen,
    voicePaneSize, setVoicePaneSize,
    activeVoiceSplitter, setActiveVoiceSplitter,
    voiceDrawerOpen,
    chatPaneSize, setChatPaneSize,
    activeChatSplitter, setActiveChatSplitter,
    chatDrawerOpen,
    shortcutsHelpOpen, setShortcutsHelpOpen,
    shortcuts, setShortcuts,
    appearance, setAppearance,
    navOrder, setNavOrder,
    diagrams, setDiagrams,
    selectedDiagramId, setSelectedDiagramId,
    setDiagramDraft,
    diagramEditorMode,
    setDiagramSourceFormat,
    setDiagramLoadVersion,
    memos, setMemos,
    setSelectedVoiceMemoId,
    calendarConnections, setCalendarConnections,
    selectedCalendarConnectionIds, setSelectedCalendarConnectionIds,
    calendarEvents, setCalendarEvents,
    tasks, setTasks,
    setSelectedTaskId,
    rooms, setRooms,
    comsParticipants,
    roomUnreadCounts, setRoomUnreadCounts,
    selectedRoomId, selectComsRoom,
    setMessages,
    rtcConfig,
    recording,
    voiceInputLevel,
    status, setStatus,
    actionNotice, setActionNotice,
    syncNotice, setSyncNotice,
    syncConflicts,
    syncConflictsOpen, setSyncConflictsOpen,
    syncCursors, setSyncCursors,
    shareTarget, setShareTarget,
    shareDraft,
    shareUserQuery, setShareUserQuery,
    shareSaving,
    setIsCompactViewport,
    callJoined,
    activeCallRoomId,
    callMediaMode,
    screenSharing,
    customFolders,
    setCustomFolders,
    customDiagramFolders,
    setCustomDiagramFolders,
    activeFilePath,
    setActiveFilePath,
    setFileSearchQuery,
    fileSearchOpen,
    setFileSearchOpen,
    creatingDriveFolder,
    renamingFilePath,
    setPendingDeletePaths,
    pendingDeletePaths,
    markedFilePaths,
    setMarkedFilePaths,
    setFileHelpOpen,
    pendingFileKey,
    setPendingFileKey,
    filePaneWidths,
    setFilePaneWidths,
    filePaneHeights,
    setFilePaneHeights,
    filePreviewOpen,
    setFilePreviewOpen,
    activeSplitter,
    setActiveSplitter,
    fileColumnWidths,
    setFileColumnWidths,
    fileColumnVisibility,
    setFileColumnVisibility,
    fileColumnViewOpen,
    setFileColumnViewOpen,
    activeFileColumnSplitter,
    setActiveFileColumnSplitter,
    fileManagerRef,
    deleteConfirmButtonRef,
    deleteCancelButtonRef,
    renameInputRef,
    fileSearchInputRef,
    fileColumnViewRef,
    filePreviewWidthRef,
    fileColumnResizeRef,
    selectedNoteId,
    setSelectedNoteId,
    noteDraft,
    setNoteDraft,
    noteEditorMode,
    noteContextMenu,
    setNoteContextMenu,
    noteContextSubmenu,
    setNoteContextSubmenu,
    setNoteClipboardText,
    noteContextMenuOpenLeft,
    setNoteContextMenuOpenLeft,
    noteContextSubmenuOpenUp,
    setNoteContextSubmenuOpenUp,
    noteDrawerOpen,
    setNoteDrawerOpen,
    selectedFolderPath,
    setNoteTitleModalOpen,
    noteSaveState,
    setNotePresence,
    setNoteCursors,
    noteManagerRef,
    noteEditorRef,
    noteContextMenuRef,
    noteContextTableRef,
    noteContextCellRef,
    noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef,
    selectedNoteIdRef,
    selectedNoteRef,
    noteSessionIdRef,
    noteEditorModeRef,
    selectedFolderPathRef,
    noteDraftRef,
    locallyDirtyNoteIdsRef,
    pendingLocalDraftRestoreRef,
    diagramManagerRef,
    chatManagerRef,
    diagramsSectionRef,
    socketRef,
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
  } = appState

  const selectedEntityRuntime = useSelectedEntityRuntime(buildSelectedEntityRuntimeContext({
    appState,
    route,
    locationSearch,
    rooms,
    activeCallRoomId,
    session,
  }))
  const {
    selectedNote,
    selectedDiagram,
    standaloneDrawio,
    standaloneDrawioDiagramId,
    activeCallRoom,
    applySelectedNoteMarkdown,
    rebaseDirtySelectedNote,
  } = selectedEntityRuntime
  let noteFileActionsRef: { refreshFilesTree?: () => Promise<any>; syncNotesAndFilesView?: () => Promise<any>; deleteSelectedNote?: () => Promise<any> } | null = null

  async function refreshFilesTree() {
    return noteFileActionsRef?.refreshFilesTree?.()
  }

  async function syncNotesAndFilesView() {
    return noteFileActionsRef?.syncNotesAndFilesView?.()
  }

  async function deleteSelectedNote() {
    return noteFileActionsRef?.deleteSelectedNote?.()
  }

  function showActionNotice(message: string) {
    setActionNotice({ id: createClientId(), message })
  }

  const supportBundle = useAppSupportBundle(buildAppSupportContext({
    appState,
    session,
    showActionNotice,
    displayNameForFileNodeFactory,
    diagramIdFromManagedPath,
    navOrder,
    roomUnreadCounts,
    appearance,
  }))
  const {
    refreshAdminDatabaseOverview,
    refreshAdminDeletedItems,
    refreshAdminAuditEntries,
    floatingCallParticipants,
    selectedFileNode,
    currentDirectoryPath,
    displayedFileNodes,
    activeFileNode,
    currentRolePolicy,
    canAccessRoute,
    orderedNavItems,
    comsUnreadCount,
    effectiveAppearance,
    appearanceStyle,
  } = supportBundle
  const actionBundle = useAppActionBundle(buildAppActionBundleContext({
    appState,
    session,
    route,
    supportBundle,
    selectedEntityRuntime,
    refreshFilesTree,
    syncNotesAndFilesView,
    showActionNotice,
    upsertVoiceMemo,
    createEntityId,
    normalizeFolderPath,
    mergeFolderPaths,
    defaultNoteTitle,
    noteIdFromPath,
    noteTitleFromPath,
    importedFolderForPath,
    editableHtmlToMarkdown,
    diagramIdFromManagedPath,
    deriveParentPath,
    diagramDisplayName,
    parseDrawioDiagramXml,
    findFileNode,
  }))
  const {
    flushPendingVoiceUploads,
    flushPendingManagedUploads,
    toggleRecording,
    handleSignal,
    cleanupCallState,
    startScreenShare,
    stopScreenShare,
    leaveCall,
    updateDiagramLocalFirst,
    currentNoteMarkdown,
    clearNoteLocallyDirty,
    rememberPersistedNotes,
    currentNoteIsDirty,
    noteHasPendingPersistence,
    registerPresence,
    prunePresence,
    broadcastPresence,
    broadcastNoteCursor,
    createNote,
    saveNote,
    createDiagram,
    saveDiagram,
    setDiagramMode,
    refreshRooms,
    refreshCalendarConnections,
    refreshTasks,
    refreshCalendarEvents,
    createRoom,
    refreshUserDeletedItems,
    noteFileActions,
    openFileNode,
    downloadManagedPaths,
    toggleMarkedPath,
    normalizedDeletePaths,
    requestDeletePaths,
    beginRenameCurrentFile,
  } = actionBundle
  const noteTree = useMemo(() => buildNoteTree(notes, customFolders), [notes, customFolders])
  const diagramTree = useMemo(() => buildDiagramTree(diagrams, customDiagramFolders), [diagrams, customDiagramFolders])
  noteFileActionsRef = noteFileActions
  const {
    showSyncNotice,
    handleTextareaTabKeyDown,
    beginFileColumnResize,
    navigate,
    cycleRoute,
    routeJumpFromShortcut,
    moveRouteFocus,
    beginFileDrag,
    handleDirectoryDrop,
    activateRelativeFile,
    toggleFileColumnVisibility,
    renderFileColumnCell,
    toggleFilePreviewPane,
    goToParentDirectory,
    refreshQueuedSyncConflicts,
    retrySyncConflict,
    discardSyncConflict,
    retryAllSyncConflicts,
    discardAllSyncConflicts,
    openSyncConflictTarget,
    bootstrap,
    loginWithPassword,
    changePasswordFirstUse,
    setupAdminAccount,
    uploadCurrentUserAvatar,
    updateCurrentUserCredentials,
    changeCurrentUserPassword,
    logout,
    resourceKeyForFilePath,
    resourceKeyForNote,
    resourceKeyForCalendar,
    openShareDialog,
    setShareVisibility,
    toggleShareUser,
    saveShareSettings,
    beginNoteTreeDrag,
    handleNoteTreeDrop,
    beginDiagramTreeDrag,
    handleDiagramTreeDrop,
    beginVoiceTreeDrag,
    handleVoiceTreeDrop,
  } = useAppInteractionBundle({
    appState,
    supportBundle,
    selectedEntityRuntime,
    actionBundle,
    createClientId,
    refreshFilesTree,
    normalizeFolderPath,
    mergeFolderPaths,
    normalizeDiagramFolderPath,
    diagramDisplayName,
  })

  usePaneLayoutEffects({
    activeSplitter,
    filePaneHeights,
    filePreviewOpen,
    activeFileColumnSplitter,
    activeNoteSplitter,
    noteDrawerOpen,
    activeDiagramSplitter,
    diagramDrawerOpen,
    activeVoiceSplitter,
    voiceDrawerOpen,
    activeChatSplitter,
    chatDrawerOpen,
    fileManagerRef,
    noteManagerRef,
    diagramManagerRef,
    chatManagerRef,
    diagramsSectionRef,
    filePreviewWidthRef,
    fileColumnResizeRef,
    setFilePaneHeights,
    setFilePaneWidths,
    setFilePreviewOpen,
    setActiveSplitter,
    setFileColumnWidths,
    setActiveFileColumnSplitter,
    setNotePaneSize,
    setActiveNoteSplitter,
    setDiagramPaneSize,
    setActiveDiagramSplitter,
    setDiagramFullscreen,
    setVoicePaneSize,
    setActiveVoiceSplitter,
    setChatPaneSize,
    setActiveChatSplitter,
  })
  useFilesKeyboardEffects({
    route,
    activeFileNode,
    displayedFileNodes,
    pendingFileKey,
    markedFilePaths,
    creatingDriveFolder,
    pendingDeletePathsLength: pendingDeletePaths.length,
    setActiveFilePath,
    setPendingFileKey,
    setFileHelpOpen,
    setMarkedFilePaths,
    setStatus,
    activateRelativeFile,
    goToParentDirectory,
    openFileNode,
    toggleMarkedPath,
    downloadManagedPaths,
    beginRenameCurrentFile,
    normalizedDeletePaths,
    requestDeletePaths,
  })
  useGlobalKeyboardEffects({
    route,
    pendingAppKey,
    shortcuts,
    fileSearchOpen,
    setFileSearchOpen,
    setFileSearchQuery,
    setPendingAppKey,
    setNoteDrawerOpen,
    createNote,
    saveNote,
    createDiagram,
    saveDiagram,
    toggleRecording,
    createRoom,
    roomsLength: rooms.length,
    routeJumpFromShortcut,
    navigate,
    cycleRoute,
    moveRouteFocus,
  })
  useAppEffectsBundle({
    notesRef,
    notes,
    diagramsRef,
    diagrams,
    memosRef,
    memos,
    authMode,
    route,
    session,
    clientIdRef,
    selectedNoteId,
    selectedNote,
    selectedFolderPath,
    noteDraft,
    noteEditorMode,
    noteSaveState,
    noteContextMenu,
    noteContextSubmenu,
    noteContextMenuOpenLeft,
    noteContextSubmenuOpenUp,
    noteSessionIdRef,
    noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef,
    pendingLocalDraftRestoreRef,
    noteContextTableRef,
    noteContextCellRef,
    noteEditorRef,
    noteContextMenuRef,
    setNoteDraft,
    setNoteTitleModalOpen,
    setSelectedNoteId,
    setNoteContextMenu,
    setNoteContextSubmenu,
    setNoteClipboardText,
    setNoteContextMenuOpenLeft,
    setNoteContextSubmenuOpenUp,
    applySelectedNoteMarkdown,
    noteHasPendingPersistence,
    currentNoteIsDirty,
    saveNote,
    selectedRoomId,
    actionNotice,
    pendingDeletePaths,
    displayedFileNodes,
    activeFilePath,
    currentDirectoryPath,
    selectedFileNode,
    pendingFileKey,
    pendingAppKey,
    fileSearchOpen,
    renamingFilePath,
    fileColumnViewOpen,
    orderedNavItems,
    canAccessRoute,
    navigate,
    setFileColumnViewOpen,
    setPendingDeletePaths,
    setActiveFilePath,
    setPendingFileKey,
    setPendingAppKey,
    setActionNotice,
    selectedRoomIdRef,
    routeRef,
    sessionUserIdRef,
    selectedNoteIdRef,
    selectedNoteRef,
    noteEditorModeRef,
    selectedFolderPathRef,
    noteDraftRef,
    rtcConfigRef,
    callJoinedRef,
    activeCallRoomIdRef,
    fileSearchInputRef,
    renameInputRef,
    fileColumnViewRef,
    deleteConfirmButtonRef,
    deleteCancelButtonRef,
    rtcConfig,
    callJoined,
    activeCallRoomId,
    selectedDiagram,
    setDiagramDraft,
    setDiagramSourceFormat,
    setDiagramLoadVersion,
    standaloneDrawioDiagramId,
    selectedDiagramId,
    setSelectedDiagramId,
    diagramEditorMode,
    setDiagramMode,
    standaloneDrawioWindowRef,
    standaloneDrawioEditingIdRef,
    updateDiagramLocalFirst,
    setDiagrams,
    showActionNotice,
    diagramDisplayName,
    locationSearch,
    selectedCalendarConnectionIds,
    systemUpdateStatus,
    currentRolePolicy,
    cleanupCallState,
    refreshCalendarConnections,
    refreshTasks,
    refreshCalendarEvents,
    refreshAdminDatabaseOverview,
    refreshAdminDeletedItems,
    refreshAdminAuditEntries,
    refreshUserDeletedItems,
    setMessages,
    setRoomUnreadCounts,
    setRooms,
    setMemos,
    setGoogleCalendarConfig,
    setSelectedCalendarConnectionIds,
    setCalendarEvents,
    setTasks,
    setSelectedTaskId,
    setSyncCursors,
    setCalendarConnections,
    setSystemUpdateStatus,
    setAdminDatabaseOverview,
    setAdminDeletedItems,
    setAdminAuditEntries,
    setDeletedItems,
    setLocationSearch,
    bootstrap,
    refreshQueuedSyncConflicts,
    setRoute: setRoute as unknown as Dispatch<SetStateAction<string>>,
    setServerUrl,
    showSyncNotice,
    syncNoticeTimeoutRef,
    normalizeRoute,
    customFolders,
    setCustomFolders,
    customDiagramFolders,
    setCustomDiagramFolders,
    filePaneWidths,
    setFilePaneWidths,
    filePreviewOpen,
    setFilePreviewOpen,
    filePaneHeights,
    setFilePaneHeights,
    fileColumnWidths,
    setFileColumnWidths,
    fileColumnVisibility,
    setFileColumnVisibility,
    notePaneSize,
    setNotePaneSize,
    diagramPaneSize,
    setDiagramPaneSize,
    voicePaneSize,
    setVoicePaneSize,
    chatPaneSize,
    setChatPaneSize,
    appearance,
    setAppearance,
    shortcuts,
    setShortcuts,
    navOrder,
    setNavOrder,
    setIsCompactViewport,
    DEFAULT_APPEARANCE,
    DEFAULT_SHORTCUTS,
    DEFAULT_NAV_ORDER,
    normalizeShortcutBinding,
    socketRef,
    locallyDirtyNoteIdsRef,
    peerConnectionsRef,
    currentNoteMarkdown,
    rebaseDirtySelectedNote,
    clearNoteLocallyDirty,
    registerPresence,
    prunePresence,
    broadcastPresence,
    broadcastNoteCursor,
    refreshRooms,
    handleSignal,
    setStatus,
    setNotePresence,
    setNoteCursors,
    setNotes,
    syncCursors,
    calendarConnections,
    calendarEvents,
    tasks,
    filesTree,
    flushPendingVoiceUploads,
    flushPendingManagedUploads,
    rememberPersistedNotes,
    setFilesTree,
    setSelectedVoiceMemoId,
    setSyncNotice,
    setSyncConflictsOpen,
  })

  const {
    notesPageProps,
    filesPageProps,
    diagramsPageProps,
    voicePageProps,
    calendarPageProps,
    tasksPageProps,
    chatPageProps,
    settingsPageProps,
    adminPageProps,
  } = useAppPagePropsBundle(buildAppPagePropsContext({
    appState,
    session,
    route,
    locationSearch,
    supportBundle,
    selectedEntityRuntime,
    actionBundle,
    routeActions: {
      beginFileDrag,
      handleDirectoryDrop,
      activateRelativeFile,
      toggleFileColumnVisibility,
      renderFileColumnCell,
      toggleFilePreviewPane,
      goToParentDirectory,
    },
    authActions: {
      uploadCurrentUserAvatar,
      updateCurrentUserCredentials,
      changeCurrentUserPassword,
      logout,
    },
    shareActions: {
      resourceKeyForFilePath,
      resourceKeyForNote,
      resourceKeyForCalendar,
      openShareDialog,
      setShareVisibility,
      toggleShareUser,
      saveShareSettings,
    },
    noteTree,
    diagramTree,
    deletedItems,
    showActionNotice,
    refreshFilesTree,
    syncNotesAndFilesView,
    deleteSelectedNote,
    noteIdFromPath,
    noteTitleFromPath,
    diagramIdFromManagedPath,
    diagramIdFromPath,
    managedPathForNoteFolder,
    managedPathForDiagramFolder,
    managedPathForVoiceFolder,
    normalizeFolderPath,
    mergeFolderPaths,
    normalizeDiagramDirectoryPath,
    normalizeDiagramTitlePath,
    normalizeDiagramFolderPath,
    normalizeVoiceDirectoryPath,
    rebaseFolderEntries,
    getStandaloneDrawioUrl,
    handleTextareaTabKeyDown,
    beginNoteTreeDrag,
    handleNoteTreeDrop,
    beginDiagramTreeDrag,
    handleDiagramTreeDrop,
    beginVoiceTreeDrag,
    handleVoiceTreeDrop,
    beginFileColumnResize,
  }))

  if (authMode !== 'ready') {
    return (
      <AppAuthShell
        appearanceMode={effectiveAppearance.mode}
        appearanceStyle={appearanceStyle}
        authMode={authMode}
        status={status}
        setupStatus={setupStatus}
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
        onLogin={loginWithPassword}
        onSetupAdmin={setupAdminAccount}
        onChangePassword={changePasswordFirstUse}
      />
    )
  }

  return (
    <AppReadyShell
      appearanceMode={effectiveAppearance.mode}
      appearanceStyle={appearanceStyle}
      topNav={
        !standaloneDrawio ? (
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
        ) : null
      }
      syncNotice={syncNotice ? <ConnectionBanner tone={syncNotice.tone} message={syncNotice.message} /> : null}
      actionNotice={actionNotice ? <ActionNotice id={actionNotice.id} message={actionNotice.message} /> : null}
      syncConflictsPanel={
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
      }
      shareModal={
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
      }
      floatingPanels={
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
              selectComsRoom(activeCallRoomId)
            }
            void navigate('/coms')
          }}
          onToggleScreenShare={() => void (screenSharing ? stopScreenShare() : startScreenShare())}
          onLeaveCall={leaveCall}
        />
      }
      pageRenderer={
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
      }
    />
  )
}

export default App
