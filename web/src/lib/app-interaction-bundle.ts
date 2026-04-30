import type { FileColumnKey } from './file-browser'
import { createAppRouteActions } from './app-route-actions'
import { createAuthActions } from './auth-actions'
import { beginFileColumnResize as beginFileColumnResizeAction } from './app-shell'
import { createLibraryMoveActions } from './library-move-actions'
import { createNoteTreeActions } from './note-tree-actions'
import { createShareActions } from './share-actions'
import { createSyncConflictActions } from './sync-conflict-actions'
import { showSyncNoticeWithTimeout } from './app-view-runtime'

export function useAppInteractionBundle(context: any) {
  function showActionNotice(message: string) {
    context.appState.setActionNotice({ id: context.createClientId(), message })
  }

  function showSyncNotice(tone: 'offline' | 'error', message: string, timeoutMs = 4500) {
    showSyncNoticeWithTimeout(
      { syncNoticeTimeoutRef: context.appState.syncNoticeTimeoutRef, setSyncNotice: context.appState.setSyncNotice },
      tone,
      message,
      timeoutMs,
    )
  }

  function handleTextareaTabKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    onNextValue?: (value: string) => void,
  ) {
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd

    if (event.key === 'Tab') {
      event.preventDefault()
      const nextValue = `${target.value.slice(0, start)}\t${target.value.slice(end)}`
      setValue(nextValue)
      onNextValue?.(nextValue)
      window.requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 1
      })
      return
    }

    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    const beforeCursor = target.value.slice(0, start)
    const currentLine = beforeCursor.slice(beforeCursor.lastIndexOf('\n') + 1)
    const indent = currentLine.match(/^\s*/)?.[0] ?? ''
    const taskMatch = currentLine.match(/^(\s*[-*]\s\[(?: |x)\]\s)(.*)$/i)
    const bulletMatch = currentLine.match(/^(\s*[-*]\s)(.*)$/)
    const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/)

    let insertText = '\n'
    if (taskMatch) {
      insertText += taskMatch[2].trim().length === 0 ? indent : taskMatch[1]
    } else if (bulletMatch) {
      insertText += bulletMatch[2].trim().length === 0 ? indent : bulletMatch[1]
    } else if (orderedMatch) {
      insertText += orderedMatch[3].trim().length === 0 ? orderedMatch[1] : `${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `
    } else {
      insertText += indent
    }

    const nextValue = `${target.value.slice(0, start)}${insertText}${target.value.slice(end)}`
    setValue(nextValue)
    onNextValue?.(nextValue)
    window.requestAnimationFrame(() => {
      const nextCursor = start + insertText.length
      target.selectionStart = target.selectionEnd = nextCursor
    })
  }

  const routeActions = createAppRouteActions({
    orderedNavItems: context.supportBundle.orderedNavItems,
    route: context.appState.route,
    shortcuts: context.appState.shortcuts,
    displayedFileNodes: context.supportBundle.displayedFileNodes,
    activeFileNode: context.supportBundle.activeFileNode,
    currentDirectoryPath: context.supportBundle.currentDirectoryPath,
    filePreviewOpen: context.appState.filePreviewOpen,
    filePaneWidths: context.appState.filePaneWidths,
    filePreviewWidthRef: context.appState.filePreviewWidthRef,
    markedFilePaths: context.appState.markedFilePaths,
    draggingFilePath: context.appState.draggingFilePath,
    setRoute: context.appState.setRoute,
    setActiveFilePath: context.appState.setActiveFilePath,
    setDraggingFilePath: context.appState.setDraggingFilePath,
    setDropTargetPath: context.appState.setDropTargetPath,
    setFileColumnVisibility: context.appState.setFileColumnVisibility,
    setFilePaneWidths: context.appState.setFilePaneWidths,
    setFilePreviewOpen: context.appState.setFilePreviewOpen,
    displayNameForFileNode: context.supportBundle.displayNameForFileNode,
    autosaveCurrentNoteBeforeSwitch: context.actionBundle.autosaveCurrentNoteBeforeSwitch,
    moveDriveItem: context.actionBundle.moveDriveItem,
    goToParentDirectoryAction: context.actionBundle.goToParentDirectory,
  })

  const syncConflictActions = createSyncConflictActions({
    syncConflicts: context.appState.syncConflicts,
    notesRef: context.appState.notesRef,
    setSyncConflicts: context.appState.setSyncConflicts,
    setSyncConflictsOpen: context.appState.setSyncConflictsOpen,
    setActionNotice: context.appState.setActionNotice,
    createClientId: context.createClientId,
    setSelectedFolderPath: context.appState.setSelectedFolderPath,
    setSelectedNoteId: context.appState.setSelectedNoteId,
    setSelectedDiagramId: context.appState.setSelectedDiagramId,
    setSelectedTaskId: context.appState.setSelectedTaskId,
    setSelectedCalendarConnectionIds: context.appState.setSelectedCalendarConnectionIds,
    setSelectedRoomId: context.appState.setSelectedRoomId,
    setSelectedFilePath: context.appState.setSelectedFilePath,
    setActiveFilePath: context.appState.setActiveFilePath,
    navigate: routeActions.navigate,
    normalizeFolderPath: context.normalizeFolderPath,
  })

  const authActions = createAuthActions({
    adminSettings: context.appState.adminSettings,
    session: context.appState.session,
    setStatus: context.appState.setStatus,
    setOidc: context.appState.setOidc,
    setSetupStatus: context.appState.setSetupStatus,
    setAuthMode: context.appState.setAuthMode,
    setRoute: context.appState.setRoute,
    setSession: context.appState.setSession,
    setAdminSettings: context.appState.setAdminSettings,
    setAdminUsers: context.appState.setAdminUsers,
    setAdminStorageOverview: context.appState.setAdminStorageOverview,
    setAdminDatabaseOverview: context.appState.setAdminDatabaseOverview,
    setNotes: context.appState.setNotes,
    setFilesTree: context.appState.setFilesTree,
    setSelectedFilePath: context.appState.setSelectedFilePath,
    setSelectedNoteId: context.appState.setSelectedNoteId,
    setSelectedFolderPath: context.appState.setSelectedFolderPath,
    setCustomFolders: context.appState.setCustomFolders,
    setDiagrams: context.appState.setDiagrams,
    setSelectedDiagramId: context.appState.setSelectedDiagramId,
    setMemos: context.appState.setMemos,
    setSelectedVoiceMemoId: context.appState.setSelectedVoiceMemoId,
    setCalendarConnections: context.appState.setCalendarConnections,
    setTasks: context.appState.setTasks,
    setRooms: context.appState.setRooms,
    setRoomUnreadCounts: context.appState.setRoomUnreadCounts,
    setComsParticipants: context.appState.setComsParticipants,
    setSelectedRoomId: context.appState.setSelectedRoomId,
    setMessages: context.appState.setMessages,
    setRtcConfig: context.appState.setRtcConfig,
    setSyncCursors: context.appState.setSyncCursors,
    rememberPersistedNotes: context.actionBundle.rememberPersistedNotes,
    normalizeFolderPath: context.normalizeFolderPath,
    mergeFolderPaths: context.mergeFolderPaths,
    applyUpdatedUserProfile: context.supportBundle.applyUpdatedUserProfile,
    showActionNotice,
  })

  const shareActions = createShareActions({
    session: context.appState.session,
    shareTarget: context.appState.shareTarget,
    shareDraft: context.appState.shareDraft,
    setShareTarget: context.appState.setShareTarget,
    setShareUserQuery: context.appState.setShareUserQuery,
    setShareDraft: context.appState.setShareDraft,
    setShareSaving: context.appState.setShareSaving,
    showActionNotice,
  })

  const noteTreeActions = createNoteTreeActions({
    markedNotePaths: context.appState.markedNotePaths,
    draggingNoteTreePath: context.appState.draggingNoteTreePath,
    notesRef: context.appState.notesRef,
    selectedNoteIdRef: context.appState.selectedNoteIdRef,
    selectedNoteRef: context.appState.selectedNoteRef,
    selectedFolderPathRef: context.appState.selectedFolderPathRef,
    persistedNoteStateRef: context.appState.persistedNoteStateRef,
    locallyDirtyNoteIdsRef: context.appState.locallyDirtyNoteIdsRef,
    currentNoteMarkdown: context.actionBundle.currentNoteMarkdown,
    updateNoteLocalFirst: context.actionBundle.updateNoteLocalFirst,
    refreshFilesTree: context.refreshFilesTree,
    showActionNotice,
    mergeFolderPaths: context.mergeFolderPaths,
    setDraggingNoteTreePath: context.appState.setDraggingNoteTreePath,
    setNoteTreeDropTargetPath: context.appState.setNoteTreeDropTargetPath,
    setNotes: context.appState.setNotes,
    setCustomFolders: context.appState.setCustomFolders,
    setSelectedFolderPath: context.appState.setSelectedFolderPath,
    applySelectedNoteMarkdown: context.selectedEntityRuntime.applySelectedNoteMarkdown,
  })

  const libraryMoveActions = createLibraryMoveActions({
    markedDiagramPaths: context.appState.markedDiagramPaths,
    markedVoicePaths: context.appState.markedVoicePaths,
    draggingDiagramTreePath: context.appState.draggingDiagramTreePath,
    draggingVoiceTreePath: context.appState.draggingVoiceTreePath,
    diagrams: context.appState.diagrams,
    moveDriveItem: context.actionBundle.moveDriveItem,
    updateDiagramLocalFirst: context.actionBundle.updateDiagramLocalFirst,
    refreshFilesTree: context.refreshFilesTree,
    showActionNotice,
    normalizeDiagramFolderPath: context.normalizeDiagramFolderPath,
    diagramDisplayName: context.diagramDisplayName,
    setDraggingDiagramTreePath: context.appState.setDraggingDiagramTreePath,
    setDiagramTreeDropTargetPath: context.appState.setDiagramTreeDropTargetPath,
    setDraggingVoiceTreePath: context.appState.setDraggingVoiceTreePath,
    setVoiceTreeDropTargetPath: context.appState.setVoiceTreeDropTargetPath,
    setDiagrams: context.appState.setDiagrams,
    setCustomDiagramFolders: context.appState.setCustomDiagramFolders,
  })

  function beginFileColumnResize(splitter: FileColumnKey, clientX: number) {
    beginFileColumnResizeAction(
      splitter,
      clientX,
      context.appState.fileColumnWidths,
      context.appState.fileColumnResizeRef,
      context.appState.setActiveFileColumnSplitter,
    )
  }

  return {
    showSyncNotice,
    handleTextareaTabKeyDown,
    beginFileColumnResize,
    ...routeActions,
    ...syncConflictActions,
    ...authActions,
    ...shareActions,
    ...noteTreeActions,
    ...libraryMoveActions,
  }
}
