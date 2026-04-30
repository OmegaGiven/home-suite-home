import { useEffect } from 'react'
import { createEmptyDrawioDiagramXml, parseDrawioDiagramXml } from './drawio-diagram'
import { useAppBootstrapEffects } from './app-bootstrap-effects'
import { useAppUiEffects } from './app-ui-effects'
import { useNoteEditorEffects } from './note-editor-effects'
import { usePageRefreshEffects } from './page-refresh-effects'
import { useRealtimeEffects } from './realtime-effects'
import { useStandaloneDrawioEffects } from './standalone-drawio-effects'
import { useUiPersistenceEffects } from './ui-persistence-effects'
import { useWorkspaceSyncEffects } from './workspace-sync-effects'

export function useAppEffectsBundle(context: any) {
  useEffect(() => {
    context.notesRef.current = context.notes
  }, [context.notes])

  useEffect(() => {
    context.diagramsRef.current = context.diagrams
  }, [context.diagrams])

  useEffect(() => {
    context.memosRef.current = context.memos
  }, [context.memos])

  useNoteEditorEffects({
    authMode: context.authMode,
    route: context.route,
    session: context.session,
    clientId: context.clientIdRef.current,
    selectedNoteId: context.selectedNoteId,
    selectedNote: context.selectedNote,
    notes: context.notes,
    selectedFolderPath: context.selectedFolderPath,
    noteDraft: context.noteDraft,
    noteEditorMode: context.noteEditorMode,
    noteSaveState: context.noteSaveState,
    noteContextMenu: context.noteContextMenu,
    noteContextSubmenu: context.noteContextSubmenu,
    noteContextMenuOpenLeft: context.noteContextMenuOpenLeft,
    noteContextSubmenuOpenUp: context.noteContextSubmenuOpenUp,
    noteSessionIdRef: context.noteSessionIdRef,
    noteDraftBroadcastTimeoutRef: context.noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef: context.noteLiveSaveTimeoutRef,
    pendingLocalDraftRestoreRef: context.pendingLocalDraftRestoreRef,
    noteContextTableRef: context.noteContextTableRef,
    noteContextCellRef: context.noteContextCellRef,
    noteEditorRef: context.noteEditorRef,
    noteContextMenuRef: context.noteContextMenuRef,
    setNoteDraft: context.setNoteDraft,
    setNoteTitleModalOpen: context.setNoteTitleModalOpen,
    setSelectedNoteId: context.setSelectedNoteId,
    setNoteContextMenu: context.setNoteContextMenu,
    setNoteContextSubmenu: context.setNoteContextSubmenu,
    setNoteClipboardText: context.setNoteClipboardText,
    setNoteContextMenuOpenLeft: context.setNoteContextMenuOpenLeft,
    setNoteContextSubmenuOpenUp: context.setNoteContextSubmenuOpenUp,
    applySelectedNoteMarkdown: context.applySelectedNoteMarkdown,
    noteHasPendingPersistence: context.noteHasPendingPersistence,
    currentNoteIsDirty: context.currentNoteIsDirty,
    saveNote: context.saveNote,
  })

  useAppUiEffects({
    route: context.route,
    authMode: context.authMode,
    selectedRoomId: context.selectedRoomId,
    selectedNoteId: context.selectedNoteId,
    selectedNote: context.selectedNote,
    selectedFolderPath: context.selectedFolderPath,
    noteDraft: context.noteDraft,
    noteEditorMode: context.noteEditorMode,
    actionNotice: context.actionNotice,
    pendingDeletePathsLength: context.pendingDeletePaths.length,
    displayedFileNodes: context.displayedFileNodes,
    activeFilePath: context.activeFilePath,
    currentDirectoryPath: context.currentDirectoryPath,
    selectedFileNode: context.selectedFileNode,
    pendingFileKey: context.pendingFileKey,
    pendingAppKey: context.pendingAppKey,
    fileSearchOpen: context.fileSearchOpen,
    renamingFilePath: context.renamingFilePath,
    fileColumnViewOpen: context.fileColumnViewOpen,
    orderedNavItems: context.orderedNavItems,
    canAccessRoute: context.canAccessRoute,
    navigate: context.navigate,
    setFileColumnViewOpen: context.setFileColumnViewOpen,
    setPendingDeletePaths: context.setPendingDeletePaths,
    setActiveFilePath: context.setActiveFilePath,
    setPendingFileKey: context.setPendingFileKey,
    setPendingAppKey: context.setPendingAppKey,
    setActionNotice: context.setActionNotice,
    selectedRoomIdRef: context.selectedRoomIdRef,
    routeRef: context.routeRef,
    sessionUserIdRef: context.sessionUserIdRef,
    selectedNoteIdRef: context.selectedNoteIdRef,
    selectedNoteRef: context.selectedNoteRef,
    noteEditorModeRef: context.noteEditorModeRef,
    selectedFolderPathRef: context.selectedFolderPathRef,
    noteDraftRef: context.noteDraftRef,
    rtcConfigRef: context.rtcConfigRef,
    callJoinedRef: context.callJoinedRef,
    activeCallRoomIdRef: context.activeCallRoomIdRef,
    fileSearchInputRef: context.fileSearchInputRef,
    renameInputRef: context.renameInputRef,
    fileColumnViewRef: context.fileColumnViewRef,
    deleteConfirmButtonRef: context.deleteConfirmButtonRef,
    deleteCancelButtonRef: context.deleteCancelButtonRef,
    sessionUserId: context.session?.user.id ?? null,
    rtcConfig: context.rtcConfig,
    callJoined: context.callJoined,
    activeCallRoomId: context.activeCallRoomId,
  })

  useEffect(() => {
    if (!context.selectedDiagram) {
      context.setDiagramDraft(createEmptyDrawioDiagramXml())
      context.setDiagramSourceFormat('empty')
      context.setDiagramLoadVersion((current: number) => current + 1)
      return
    }
    const parsed = parseDrawioDiagramXml(context.selectedDiagram.xml)
    context.setDiagramDraft(parsed.xml)
    context.setDiagramSourceFormat(parsed.sourceFormat)
    context.setDiagramLoadVersion((current: number) => current + 1)
  }, [context.selectedDiagram?.id, context.selectedDiagram?.revision])

  useEffect(() => {
    if (!context.standaloneDrawioDiagramId) return
    if (context.selectedDiagramId !== context.standaloneDrawioDiagramId) {
      context.setSelectedDiagramId(context.standaloneDrawioDiagramId)
    }
    if (context.diagramEditorMode !== 'diagram') {
      context.setDiagramMode('diagram')
    }
  }, [context.diagramEditorMode, context.selectedDiagramId, context.setDiagramMode, context.standaloneDrawioDiagramId])

  useStandaloneDrawioEffects({
    diagramsRef: context.diagramsRef,
    standaloneDrawioWindowRef: context.standaloneDrawioWindowRef,
    standaloneDrawioEditingIdRef: context.standaloneDrawioEditingIdRef,
    updateDiagramLocalFirst: context.updateDiagramLocalFirst,
    setDiagrams: context.setDiagrams,
    showActionNotice: context.showActionNotice,
    diagramDisplayName: context.diagramDisplayName,
  })

  usePageRefreshEffects({
    route: context.route,
    authMode: context.authMode,
    locationSearch: context.locationSearch,
    session: context.session,
    memos: context.memos,
    selectedRoomId: context.selectedRoomId,
    selectedCalendarConnectionIds: context.selectedCalendarConnectionIds,
    systemUpdateStatus: context.systemUpdateStatus,
    currentRolePolicy: context.currentRolePolicy,
    cleanupCallState: context.cleanupCallState,
    refreshCalendarConnections: context.refreshCalendarConnections,
    refreshTasks: context.refreshTasks,
    refreshCalendarEvents: context.refreshCalendarEvents,
    refreshAdminDatabaseOverview: context.refreshAdminDatabaseOverview,
    refreshAdminDeletedItems: context.refreshAdminDeletedItems,
    refreshAdminAuditEntries: context.refreshAdminAuditEntries,
    refreshUserDeletedItems: context.refreshUserDeletedItems,
    showActionNotice: context.showActionNotice,
    setMessages: context.setMessages,
    setRoomUnreadCounts: context.setRoomUnreadCounts,
    setMemos: context.setMemos,
    setGoogleCalendarConfig: context.setGoogleCalendarConfig,
    setSelectedCalendarConnectionIds: context.setSelectedCalendarConnectionIds,
    setCalendarEvents: context.setCalendarEvents,
    setTasks: context.setTasks,
    setSelectedTaskId: context.setSelectedTaskId,
    setSyncCursors: context.setSyncCursors,
    setCalendarConnections: context.setCalendarConnections,
    setSystemUpdateStatus: context.setSystemUpdateStatus,
    setAdminDatabaseOverview: context.setAdminDatabaseOverview,
    setAdminDeletedItems: context.setAdminDeletedItems,
    setAdminAuditEntries: context.setAdminAuditEntries,
    setDeletedItems: context.setDeletedItems,
    setLocationSearch: context.setLocationSearch,
  })

  useAppBootstrapEffects({
    bootstrap: context.bootstrap,
    refreshQueuedSyncConflicts: context.refreshQueuedSyncConflicts,
    setRoute: context.setRoute,
    setLocationSearch: context.setLocationSearch,
    setServerUrl: context.setServerUrl,
    showSyncNotice: context.showSyncNotice,
    syncNoticeTimeoutRef: context.syncNoticeTimeoutRef,
    normalizeRoute: context.normalizeRoute,
  })

  useUiPersistenceEffects({
    customFolders: context.customFolders,
    setCustomFolders: context.setCustomFolders,
    customDiagramFolders: context.customDiagramFolders,
    setCustomDiagramFolders: context.setCustomDiagramFolders,
    filePaneWidths: context.filePaneWidths,
    setFilePaneWidths: context.setFilePaneWidths,
    filePreviewOpen: context.filePreviewOpen,
    setFilePreviewOpen: context.setFilePreviewOpen,
    filePaneHeights: context.filePaneHeights,
    setFilePaneHeights: context.setFilePaneHeights,
    fileColumnWidths: context.fileColumnWidths,
    setFileColumnWidths: context.setFileColumnWidths,
    fileColumnVisibility: context.fileColumnVisibility,
    setFileColumnVisibility: context.setFileColumnVisibility,
    notePaneSize: context.notePaneSize,
    setNotePaneSize: context.setNotePaneSize,
    diagramPaneSize: context.diagramPaneSize,
    setDiagramPaneSize: context.setDiagramPaneSize,
    voicePaneSize: context.voicePaneSize,
    setVoicePaneSize: context.setVoicePaneSize,
    chatPaneSize: context.chatPaneSize,
    setChatPaneSize: context.setChatPaneSize,
    appearance: context.appearance,
    setAppearance: context.setAppearance,
    shortcuts: context.shortcuts,
    setShortcuts: context.setShortcuts,
    navOrder: context.navOrder,
    setNavOrder: context.setNavOrder,
    setIsCompactViewport: context.setIsCompactViewport,
    defaultAppearance: context.DEFAULT_APPEARANCE,
    defaultShortcuts: context.DEFAULT_SHORTCUTS,
    defaultNavOrder: context.DEFAULT_NAV_ORDER,
    normalizeShortcutBinding: context.normalizeShortcutBinding,
  })

  useRealtimeEffects({
    authMode: context.authMode,
    session: context.session,
    route: context.route,
    selectedRoomId: context.selectedRoomId,
    selectedNoteId: context.selectedNoteId,
    noteEditorMode: context.noteEditorMode,
    socketRef: context.socketRef,
    clientIdRef: context.clientIdRef,
    routeRef: context.routeRef,
    sessionUserIdRef: context.sessionUserIdRef,
    selectedRoomIdRef: context.selectedRoomIdRef,
    selectedNoteIdRef: context.selectedNoteIdRef,
    selectedNoteRef: context.selectedNoteRef,
    noteEditorRef: context.noteEditorRef,
    noteEditorModeRef: context.noteEditorModeRef,
    noteSessionIdRef: context.noteSessionIdRef,
    activeCallRoomIdRef: context.activeCallRoomIdRef,
    notesRef: context.notesRef,
    persistedNoteStateRef: context.persistedNoteStateRef,
    realtimeDraftBaseRef: context.realtimeDraftBaseRef,
    locallyDirtyNoteIdsRef: context.locallyDirtyNoteIdsRef,
    peerConnectionsRef: context.peerConnectionsRef,
    rtcConfigRef: context.rtcConfigRef,
    activeCallRoomId: context.activeCallRoomId,
    currentNoteIsDirty: context.currentNoteIsDirty,
    currentNoteMarkdown: context.currentNoteMarkdown,
    rebaseDirtySelectedNote: context.rebaseDirtySelectedNote,
    applySelectedNoteMarkdown: context.applySelectedNoteMarkdown,
    clearNoteLocallyDirty: context.clearNoteLocallyDirty,
    registerPresence: context.registerPresence,
    prunePresence: context.prunePresence,
    broadcastPresence: context.broadcastPresence,
    broadcastNoteCursor: context.broadcastNoteCursor,
    refreshRooms: context.refreshRooms,
    handleSignal: context.handleSignal,
    setStatus: context.setStatus,
    setMessages: context.setMessages,
    setRoomUnreadCounts: context.setRoomUnreadCounts,
    setNotePresence: context.setNotePresence,
    setNoteCursors: context.setNoteCursors,
    setNotes: context.setNotes,
    setSelectedFolderPath: context.setSelectedFolderPath,
  })

  useWorkspaceSyncEffects({
    authMode: context.authMode,
    session: context.session,
    selectedRoomId: context.selectedRoomId,
    syncCursors: context.syncCursors,
    notes: context.notes,
    diagrams: context.diagrams,
    memos: context.memos,
    rooms: context.rooms,
    messages: context.messages,
    calendarConnections: context.calendarConnections,
    calendarEvents: context.calendarEvents,
    tasks: context.tasks,
    filesTree: context.filesTree,
    flushPendingVoiceUploads: context.flushPendingVoiceUploads,
    flushPendingManagedUploads: context.flushPendingManagedUploads,
    refreshQueuedSyncConflicts: context.refreshQueuedSyncConflicts,
    rememberPersistedNotes: context.rememberPersistedNotes,
    showSyncNotice: context.showSyncNotice,
    setSyncCursors: context.setSyncCursors,
    setNotes: context.setNotes,
    setFilesTree: context.setFilesTree,
    setDiagrams: context.setDiagrams,
    setMemos: context.setMemos,
    setRooms: context.setRooms,
    setTasks: context.setTasks,
    setCalendarConnections: context.setCalendarConnections,
    setMessages: context.setMessages,
    setSelectedNoteId: context.setSelectedNoteId,
    setSelectedDiagramId: context.setSelectedDiagramId,
    setSelectedVoiceMemoId: context.setSelectedVoiceMemoId,
    chooseRoom: context.chooseRoom,
    setSelectedCalendarConnectionIds: context.setSelectedCalendarConnectionIds,
    setSelectedTaskId: context.setSelectedTaskId,
    setSyncNotice: context.setSyncNotice,
    setSyncConflictsOpen: context.setSyncConflictsOpen,
  })
}
