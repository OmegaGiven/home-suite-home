import { createAdminActions } from './admin-actions'
import { useAppDerivedState } from './app-derived-state'
import { createSessionProfileActions } from './session-profile-actions'
import { useAppViewRuntime } from './app-view-runtime'

export function useAppSupportBundle(context: any) {
  const { applyUpdatedUserProfile } = createSessionProfileActions({
    setSession: context.setSession,
    setAdminUsers: context.setAdminUsers,
    setComsParticipants: context.setComsParticipants,
    setMessages: context.setMessages,
  })

  const adminActions = createAdminActions({
    session: context.session,
    setAdminSettings: context.setAdminSettings,
    setAdminStorageOverview: context.setAdminStorageOverview,
    setAdminDatabaseOverview: context.setAdminDatabaseOverview,
    setAdminDeletedItems: context.setAdminDeletedItems,
    setAdminAuditEntries: context.setAdminAuditEntries,
    setSystemUpdateStatus: context.setSystemUpdateStatus,
    setAdminUsers: context.setAdminUsers,
    setSetupStatus: context.setSetupStatus,
    setComsParticipants: context.setComsParticipants,
    setMessages: context.setMessages,
    applyUpdatedUserProfile,
    showActionNotice: context.showActionNotice,
  })

  function displayNameForFileNode(node: any) {
    return context.displayNameForFileNodeFactory(node, context.notes, context.memos, context.diagrams)
  }

  const derivedState = useAppDerivedState({
    callJoined: context.callJoined,
    remoteParticipants: context.remoteParticipants,
    session: context.session,
    filesTree: context.filesTree,
    selectedFilePath: context.selectedFilePath,
    selectedVoiceMemo: context.selectedVoiceMemo,
    selectedDiagramId: context.selectedDiagramId,
    fileSearchQuery: context.fileSearchQuery,
    activeFilePath: context.activeFilePath,
    fileColumnWidths: context.fileColumnWidths,
    fileColumnVisibility: context.fileColumnVisibility,
    pendingDeletePaths: context.pendingDeletePaths,
    adminSettings: context.adminSettings,
    notes: context.notes,
    diagrams: context.diagrams,
    memos: context.memos,
    route: context.route,
    displayNameForFileNode,
    diagramIdFromManagedPath: context.diagramIdFromManagedPath,
  })

  const viewRuntime = useAppViewRuntime({
    navOrder: context.navOrder,
    canAccessRoute: derivedState.canAccessRoute,
    roomUnreadCounts: context.roomUnreadCounts,
    adminSettings: context.adminSettings,
    appearance: context.appearance,
  })

  return {
    applyUpdatedUserProfile,
    ...adminActions,
    displayNameForFileNode,
    ...derivedState,
    ...viewRuntime,
  }
}
