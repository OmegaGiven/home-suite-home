import { createComsActions } from './coms-actions'
import { createComsLocalActions } from './coms-local-actions'
import { createDeletedItemActions } from './deleted-item-actions'
import { createDiagramActions } from './diagram-actions'
import { createDiagramLocalActions } from './diagram-local-actions'
import { createFileMutationActions } from './file-mutations'
import { createFileNavigationActions } from './file-navigation'
import { createManagedFileLocalActions } from './managed-file-local-actions'
import { createMediaLocalActions } from './media-local-actions'
import { createNoteActions } from './note-actions'
import { createNoteEditorActions } from './note-editor-actions'
import { createNoteFileActions } from './note-file-actions'
import { createRtcActions } from './rtc-actions'
import { createVoiceActions } from './voice-actions'
import { createWorkspaceLocalActions } from './workspace-local-actions'
import { createWorkspaceRefreshActions } from './workspace-refresh-actions'

export function useAppActionBundle(context: any) {
  const mediaActions = createMediaLocalActions({
    createEntityId: context.createEntityId,
    memosRef: context.memosRef,
    setMemos: context.setMemos,
    setFilesTree: context.setFilesTree,
    setSelectedVoiceMemoId: context.setSelectedVoiceMemoId,
    refreshFilesTree: context.refreshFilesTree,
    showActionNotice: context.showActionNotice,
    upsertVoiceMemo: context.upsertVoiceMemo,
  })

  const voiceActions = createVoiceActions({
    recording: context.recording,
    memos: context.memos,
    mediaRecorderRef: context.mediaRecorderRef,
    recordingStreamRef: context.recordingStreamRef,
    recordingAudioContextRef: context.recordingAudioContextRef,
    recordingAnalyserRef: context.recordingAnalyserRef,
    recordingLevelFrameRef: context.recordingLevelFrameRef,
    audioChunksRef: context.audioChunksRef,
    speechRecognitionRef: context.speechRecognitionRef,
    speechTranscriptRef: context.speechTranscriptRef,
    setRecording: context.setRecording,
    setVoiceInputLevel: context.setVoiceInputLevel,
    uploadVoiceMemoRecord: mediaActions.uploadVoiceMemoLocalFirst,
    listVoiceMemos: context.api.listVoiceMemos,
    getVoiceJob: context.api.getVoiceJob,
    retryVoiceJob: context.api.retryVoiceJob,
    showActionNotice: context.showActionNotice,
    setMemos: context.setMemos,
    setSelectedVoiceMemoId: context.setSelectedVoiceMemoId,
  })

  const activePresence = context.selectedNoteId ? context.notePresence[context.selectedNoteId] ?? [] : []
  const activeRemoteNoteCursors = context.selectedNoteId ? context.noteCursors[context.selectedNoteId] ?? [] : []
  const clientLabel = context.session
    ? `${context.session.user.display_name} (${context.clientIdRef.current.slice(0, 6)})`
    : `Guest (${context.clientIdRef.current.slice(0, 6)})`
  const notePresenceLabel =
    context.session?.user.username || context.session?.user.display_name || 'Guest'

  const rtcActions = createRtcActions({
    selectedRoomId: context.selectedRoomId,
    callJoined: context.callJoined,
    callMediaMode: context.callMediaMode,
    clientLabel,
    localVideoRef: context.localVideoRef,
    localStreamRef: context.localStreamRef,
    screenStreamRef: context.screenStreamRef,
    socketRef: context.socketRef,
    activeCallRoomIdRef: context.activeCallRoomIdRef,
    callJoinedRef: context.callJoinedRef,
    rtcConfigRef: context.rtcConfigRef,
    clientIdRef: context.clientIdRef,
    peerConnectionsRef: context.peerConnectionsRef,
    setRemoteParticipants: context.setRemoteParticipants,
    setActiveCallRoomId: context.setActiveCallRoomId,
    setCallMediaMode: context.setCallMediaMode,
    setScreenSharing: context.setScreenSharing,
    setCallJoined: context.setCallJoined,
    pushCallLog: context.pushCallLog,
  })

  const workspaceLocalActions = createWorkspaceLocalActions({
    session: context.session,
    clientId: context.clientIdRef.current,
    notesRef: context.notesRef,
    calendarConnections: context.calendarConnections,
    calendarEvents: context.calendarEvents,
    tasks: context.tasks,
    createEntityId: context.createEntityId,
  })

  const diagramLocalActions = createDiagramLocalActions({
    session: context.session,
    createEntityId: context.createEntityId,
  })

  const noteActions = createNoteActions({
    noteEditorMode: context.noteEditorMode,
    noteEditorRef: context.noteEditorRef,
    noteDraftRef: context.noteDraftRef,
    selectedNoteRef: context.selectedNoteRef,
    selectedNoteIdRef: context.selectedNoteIdRef,
    selectedFolderPathRef: context.selectedFolderPathRef,
    notesRef: context.notesRef,
    persistedNoteStateRef: context.persistedNoteStateRef,
    realtimeDraftBaseRef: context.realtimeDraftBaseRef,
    locallyDirtyNoteIdsRef: context.locallyDirtyNoteIdsRef,
    noteSavePromiseRef: context.noteSavePromiseRef,
    noteDraftBroadcastTimeoutRef: context.noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef: context.noteLiveSaveTimeoutRef,
    pendingLiveSaveNoteIdRef: context.pendingLiveSaveNoteIdRef,
    socketRef: context.socketRef,
    clientIdRef: context.clientIdRef,
    notePresenceLabel,
    noteSaveState: context.noteSaveState,
    route: context.route,
    notes: context.notes,
    selectedFolderPath: context.selectedFolderPath,
    setNoteDirtyVersion: context.setNoteDirtyVersion,
    setNotePresence: context.setNotePresence,
    setNoteSaveState: context.setNoteSaveState,
    setNotes: context.setNotes,
    setNoteDraft: context.setNoteDraft,
    applySelectedNoteMarkdown: context.applySelectedNoteMarkdown,
    setCustomFolders: context.setCustomFolders,
    setSelectedNoteId: context.setSelectedNoteId,
    setSelectedFolderPath: context.setSelectedFolderPath,
    setStatus: context.setStatus,
    setRoute: context.setRoute,
    createNoteRecord: workspaceLocalActions.createNoteLocalFirst,
    updateNoteRecord: workspaceLocalActions.updateNoteLocalFirst,
    refreshFilesTree: context.refreshFilesTree,
    showActionNotice: context.showActionNotice,
    normalizeFolderPath: context.normalizeFolderPath,
    mergeFolderPaths: context.mergeFolderPaths,
    defaultNoteTitle: context.defaultNoteTitle,
    noteIdFromPath: context.noteIdFromPath,
    noteTitleFromPath: context.noteTitleFromPath,
    importedFolderForPath: context.importedFolderForPath,
    editableHtmlToMarkdown: context.editableHtmlToMarkdown,
    displayNameForFileNode: context.displayNameForFileNode,
  })

  const managedFileLocalActions = createManagedFileLocalActions({
    session: context.session,
    notesRef: context.notesRef,
    diagramsRef: context.diagramsRef,
    memosRef: context.memosRef,
    selectedNoteIdRef: context.selectedNoteIdRef,
    selectedFolderPathRef: context.selectedFolderPathRef,
    setFilesTree: context.setFilesTree,
    setNotes: context.setNotes,
    setDiagrams: context.setDiagrams,
    setMemos: context.setMemos,
    setCustomFolders: context.setCustomFolders,
    setCustomDiagramFolders: context.setCustomDiagramFolders,
    setSelectedFolderPath: context.setSelectedFolderPath,
    setSelectedNoteId: context.setSelectedNoteId,
    setSelectedDiagramId: context.setSelectedDiagramId,
    setSelectedVoiceMemoId: context.setSelectedVoiceMemoId,
    rememberPersistedNotes: noteActions.rememberPersistedNotes,
    mergeFolderPaths: context.mergeFolderPaths,
    diagramIdFromManagedPath: context.diagramIdFromManagedPath,
  })

  const diagramActions = createDiagramActions({
    diagrams: context.diagrams,
    selectedDiagram: context.selectedDiagram,
    diagramDraft: context.diagramDraft,
    diagramEditorMode: context.diagramEditorMode,
    drawioEditorRef: context.drawioEditorRef,
    setDiagrams: context.setDiagrams,
    setSelectedDiagramId: context.setSelectedDiagramId,
    setDiagramSourceFormat: context.setDiagramSourceFormat,
    setDiagramDraft: context.setDiagramDraft,
    setDiagramLoadVersion: context.setDiagramLoadVersion,
    setDiagramEditorMode: context.setDiagramEditorMode,
    createDiagramRecord: diagramLocalActions.createDiagramLocalFirst,
    updateDiagramRecord: diagramLocalActions.updateDiagramLocalFirst,
    showActionNotice: context.showActionNotice,
  })

  const workspaceRefreshActions = createWorkspaceRefreshActions({
    setRooms: context.setRooms,
    selectComsRoom: context.selectComsRoom,
    setCalendarConnections: context.setCalendarConnections,
    setSelectedCalendarConnectionIds: context.setSelectedCalendarConnectionIds,
    setTasks: context.setTasks,
    setSelectedTaskId: context.setSelectedTaskId,
    setCalendarEvents: context.setCalendarEvents,
  })

  const comsLocalActions = createComsLocalActions({
    session: context.session,
    messages: context.messages,
    createEntityId: context.createEntityId,
  })
  const comsActions = createComsActions({
    rooms: context.rooms,
    comsParticipants: context.comsParticipants,
    selectedRoomId: context.selectedRoomId,
    selectedRoomIdRef: context.selectedRoomIdRef,
    activeCallRoomIdRef: context.activeCallRoomIdRef,
    callJoinedRef: context.callJoinedRef,
    setMessages: context.setMessages,
    refreshRooms: workspaceRefreshActions.refreshRooms,
    createMessageRecord: comsLocalActions.createMessageLocalFirst,
    toggleMessageReactionRecord: comsLocalActions.toggleMessageReactionLocalFirst,
    leaveCall: rtcActions.leaveCall,
    showActionNotice: context.showActionNotice,
  })

  const noteEditorActions = createNoteEditorActions({
    selectedNote: context.selectedNote,
    noteEditorMode: context.noteEditorMode,
    noteEditorRef: context.noteEditorRef,
    noteContextRangeRef: context.noteContextRangeRef,
    noteContextTableRef: context.noteContextTableRef,
    noteContextCellRef: context.noteContextCellRef,
    noteClipboardText: context.noteClipboardText,
    setStatus: context.setStatus,
    setNoteClipboardText: context.setNoteClipboardText,
    setNoteContextMenu: context.setNoteContextMenu,
    setNoteContextSubmenu: context.setNoteContextSubmenu,
  })

  const deletedItemActions = createDeletedItemActions({
    authMode: context.authMode,
    session: context.session,
    setDeletedItems: context.setDeletedItems,
    setNotes: context.setNotes,
    setDiagrams: context.setDiagrams,
    setMemos: context.setMemos,
    setCustomFolders: context.setCustomFolders,
    rememberPersistedNotes: noteActions.rememberPersistedNotes,
    normalizeFolderPath: context.normalizeFolderPath,
    refreshFilesTree: context.refreshFilesTree,
  })

  const noteFileActions = createNoteFileActions({
    notesRef: context.notesRef,
    selectedNoteRef: context.selectedNoteRef,
    noteSavePromiseRef: context.noteSavePromiseRef,
    noteDraftBroadcastTimeoutRef: context.noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef: context.noteLiveSaveTimeoutRef,
    pendingLiveSaveNoteIdRef: context.pendingLiveSaveNoteIdRef,
    locallyDirtyNoteIdsRef: context.locallyDirtyNoteIdsRef,
    setFilesTree: context.setFilesTree,
    setNotes: context.setNotes,
    setCustomFolders: context.setCustomFolders,
    setSelectedNoteId: context.setSelectedNoteId,
    setSelectedFolderPath: context.setSelectedFolderPath,
    setNotePresence: context.setNotePresence,
    setNoteCursors: context.setNoteCursors,
    clearNoteLocallyDirty: noteActions.clearNoteLocallyDirty,
    applySelectedNoteMarkdown: context.applySelectedNoteMarkdown,
    rememberPersistedNotes: noteActions.rememberPersistedNotes,
    mergeFolderPaths: context.mergeFolderPaths,
    normalizeFolderPath: context.normalizeFolderPath,
    deleteNoteLocalFirst: workspaceLocalActions.deleteNoteLocalFirst,
    refreshUserDeletedItems: deletedItemActions.refreshUserDeletedItems,
    showActionNotice: context.showActionNotice,
  })

  const fileNavigationActions = createFileNavigationActions({
    memos: context.memos,
    diagrams: context.diagrams,
    route: context.route,
    filesTree: context.filesTree,
    fileRootNode: context.fileRootNode,
    setSelectedVoiceMemoId: context.setSelectedVoiceMemoId,
    setSelectedDiagramId: context.setSelectedDiagramId,
    setDiagramSourceFormat: context.setDiagramSourceFormat,
    setDiagramDraft: context.setDiagramDraft,
    setDiagramMode: diagramActions.setDiagramMode,
    setDiagramDrawerOpen: context.setDiagramDrawerOpen,
    setRoute: context.setRoute,
    setStatus: context.setStatus,
    setSelectedFilePath: context.setSelectedFilePath,
    setActiveFilePath: context.setActiveFilePath,
    setMarkedFilePaths: context.setMarkedFilePaths,
    deriveParentPath: context.deriveParentPath,
    diagramDisplayName: context.diagramDisplayName,
    parseDrawioDiagramXml: context.parseDrawioDiagramXml,
    findFileNode: context.findFileNode,
    openMarkdownInNotes: noteActions.openMarkdownInNotes,
    showActionNotice: context.showActionNotice,
  })

  const fileMutationActions = createFileMutationActions({
    notes: context.notes,
    memos: context.memos,
    diagrams: context.diagrams,
    currentDirectoryPath: context.currentDirectoryPath,
    selectedFileNode: context.selectedFileNode,
    selectedFilePath: context.selectedFilePath,
    activeFilePath: context.activeFilePath,
    currentRoleIsAdmin: context.currentRolePolicy.admin_panel,
    confirmFileDelete: context.adminSettings?.confirm_file_delete ?? true,
    newDriveFolderName: context.newDriveFolderName,
    activeFileNode: context.activeFileNode,
    setStatus: context.setStatus,
    setMemos: context.setMemos,
    setSelectedVoiceMemoId: context.setSelectedVoiceMemoId,
    setNewDriveFolderName: context.setNewDriveFolderName,
    setCreatingDriveFolder: context.setCreatingDriveFolder,
    setSelectedFilePath: context.setSelectedFilePath,
    setPendingDeletePaths: context.setPendingDeletePaths,
    setRenamingFilePath: context.setRenamingFilePath,
    setRenameFileName: context.setRenameFileName,
    setConvertingFilePath: context.setConvertingFilePath,
    setActiveFilePath: context.setActiveFilePath,
    setMarkedFilePaths: context.setMarkedFilePaths,
    setNotes: context.setNotes,
    setCustomFolders: context.setCustomFolders,
    setSelectedNoteId: context.setSelectedNoteId,
    setDiagrams: context.setDiagrams,
    setSelectedDiagramId: context.setSelectedDiagramId,
    createManagedFolderRecord: mediaActions.createManagedFolderLocalFirst,
    moveManagedPathRecord: managedFileLocalActions.moveManagedPathLocalFirst,
    renameManagedPathRecord: managedFileLocalActions.renameManagedPathLocalFirst,
    deleteManagedPathRecord: managedFileLocalActions.deleteManagedPathLocalFirst,
    uploadManagedFileRecord: mediaActions.uploadManagedFileLocalFirst,
    refreshFilesTree: context.refreshFilesTree,
    syncNotesAndFilesView: context.syncNotesAndFilesView,
    rememberPersistedNotes: noteActions.rememberPersistedNotes,
    mergeFolderPaths: context.mergeFolderPaths,
    noteIdFromPath: context.noteIdFromPath,
    diagramIdFromPath: fileNavigationActions.diagramIdFromPath,
    diagramDisplayName: context.diagramDisplayName,
    deriveParentPath: context.deriveParentPath,
    showActionNotice: context.showActionNotice,
  })

  return {
    ...mediaActions,
    ...voiceActions,
    activePresence,
    activeRemoteNoteCursors,
    clientLabel,
    notePresenceLabel,
    ...rtcActions,
    ...workspaceLocalActions,
    ...diagramLocalActions,
    ...noteActions,
    ...managedFileLocalActions,
    ...diagramActions,
    ...workspaceRefreshActions,
    ...comsLocalActions,
    ...comsActions,
    ...noteEditorActions,
    ...deletedItemActions,
    noteFileActions,
    ...fileNavigationActions,
    ...fileMutationActions,
  }
}
