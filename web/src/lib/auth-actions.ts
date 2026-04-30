import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import type { RoutePath } from './app-config'
import { isNativePlatform, sessionStore } from './platform'
import { bootstrapWorkspace, loadCachedWorkspaceSnapshot } from './sync-engine'
import type { AdminDatabaseOverview, AdminSettings, Diagram, FileNode, OidcConfig, RtcConfig, SessionResponse, SetupAdminRequest, SetupStatusResponse, VoiceMemo, Note, UserProfile, Message, Room } from './types'

type AdminUserSummary = import('./types').AdminUserSummary
type AdminStorageOverview = import('./types').AdminStorageOverview
type ChangePasswordRequest = import('./types').ChangePasswordRequest

type AuthMode = 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'

type CreateAuthActionsContext = {
  adminSettings: AdminSettings | null
  session: SessionResponse | null
  setStatus: Dispatch<SetStateAction<string>>
  setOidc: Dispatch<SetStateAction<OidcConfig | null>>
  setSetupStatus: Dispatch<SetStateAction<SetupStatusResponse | null>>
  setAuthMode: Dispatch<SetStateAction<AuthMode>>
  setRoute: Dispatch<SetStateAction<RoutePath>>
  setSession: Dispatch<SetStateAction<SessionResponse | null>>
  setAdminSettings: Dispatch<SetStateAction<AdminSettings | null>>
  setAdminUsers: Dispatch<SetStateAction<AdminUserSummary[]>>
  setAdminStorageOverview: Dispatch<SetStateAction<AdminStorageOverview | null>>
  setAdminDatabaseOverview: Dispatch<SetStateAction<AdminDatabaseOverview | null>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setFilesTree: Dispatch<SetStateAction<FileNode[]>>
  setSelectedFilePath: Dispatch<SetStateAction<string>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setSelectedVoiceMemoId: Dispatch<SetStateAction<string | null>>
  setCalendarConnections: Dispatch<SetStateAction<import('./types').CalendarConnection[]>>
  setTasks: Dispatch<SetStateAction<import('./types').TaskItem[]>>
  setRooms: Dispatch<SetStateAction<Room[]>>
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>
  setComsParticipants: Dispatch<SetStateAction<UserProfile[]>>
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setRtcConfig: Dispatch<SetStateAction<RtcConfig | null>>
  setSyncCursors: Dispatch<SetStateAction<import('./types').SyncCursorSet>>
  rememberPersistedNotes: (nextNotes: Note[]) => void
  normalizeFolderPath: (path: string) => string
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  applyUpdatedUserProfile: (profile: UserProfile) => void
  showActionNotice: (message: string) => void
}

function filterHiddenConflictNoteNodes(nodes: FileNode[]): FileNode[] {
  return nodes
    .flatMap((node) => {
      if (node.path === 'notes' || node.path.startsWith('notes/')) return []
      const children = filterHiddenConflictNoteNodes(node.children)
      return [{ ...node, children }]
    })
}

function isConflictForkNote(note: Note) {
  return Boolean(note.conflict_tag || note.forked_from_note_id)
}

function filterVisibleNotes(notes: Note[]) {
  return notes.filter((note) => !isConflictForkNote(note))
}

export function createAuthActions(context: CreateAuthActionsContext) {
  async function hydrateWorkspace(sessionData: SessionResponse) {
    await sessionStore.set(sessionData)
    context.setSession(sessionData)
    const workspace = await bootstrapWorkspace(true)
    const [nextComsParticipants, nextRtc, nextAdminSettings, nextUsers, nextAdminStorageOverview] = await Promise.all([
      api.listComsParticipants(),
      api.callConfig(),
      api.getAdminSettings(),
      api.listUsers(),
      api.getAdminStorageOverview(),
    ])

    context.setAdminSettings(nextAdminSettings)
    context.setAdminUsers(nextUsers)
    context.setAdminStorageOverview(nextAdminStorageOverview)
    context.setAdminDatabaseOverview(null)
    context.setSyncCursors(workspace.cursors)
    const visibleNotes = filterVisibleNotes(workspace.notes)
    context.rememberPersistedNotes(visibleNotes)
    context.setNotes(visibleNotes)
    context.setFilesTree(filterHiddenConflictNoteNodes(workspace.file_tree))
    context.setSelectedFilePath('')
    context.setSelectedNoteId(visibleNotes[0]?.id ?? null)
    context.setSelectedFolderPath(context.normalizeFolderPath(visibleNotes[0]?.folder ?? 'Inbox'))
    context.setCustomFolders((current) =>
      context.mergeFolderPaths(current, visibleNotes.map((note) => note.folder || 'Inbox')),
    )
    context.setDiagrams(workspace.diagrams)
    context.setSelectedDiagramId(workspace.diagrams[0]?.id ?? null)
    context.setMemos(workspace.voice_memos)
    context.setSelectedVoiceMemoId(workspace.voice_memos[0]?.id ?? null)
    context.setCalendarConnections(workspace.calendar_connections)
    context.setTasks(workspace.tasks)
    context.setRooms(workspace.rooms)
    context.setRoomUnreadCounts({})
    context.setComsParticipants(nextComsParticipants)
    context.setSelectedRoomId(workspace.rooms[0]?.id ?? null)
    context.setMessages([])
    context.setRtcConfig(nextRtc)
    context.setAuthMode(sessionData.user.must_change_password ? 'change-password' : 'ready')
    context.setStatus(workspace.source === 'cache' ? 'Workspace ready (offline cache)' : 'Workspace ready')
  }

  async function bootstrap() {
    try {
      context.setStatus('Connecting to API')
      if (isNativePlatform()) {
        const configuredServer = await api.getServerBaseUrl()
        if (!configuredServer) {
          context.setAuthMode('connect')
          context.setStatus('Enter your Home Suite Home server URL')
          return
        }
      }
      const callbackParams = new URLSearchParams(window.location.search)
      const callbackCode = callbackParams.get('code')
      const callbackState = callbackParams.get('state') ?? undefined
      const [oidcConfig, setup] = await Promise.all([api.oidcConfig(), api.setupStatus()])
      context.setOidc(oidcConfig)
      context.setSetupStatus(setup)
      api.setDrawioBaseUrl(setup.drawio_public_url)
      if (!setup.admin_exists) {
        context.setAuthMode('setup')
        context.setStatus('Create the first admin account')
        return
      }

      let sessionData: SessionResponse | null = null
      if (window.location.pathname === '/auth/oidc/callback' && callbackCode) {
        sessionData = await api.oidcCallback(callbackCode, callbackState)
      } else {
        sessionData = await sessionStore.get()
      }

      if (!sessionData) {
        context.setAuthMode('login')
        context.setStatus('Sign in to continue')
        return
      }

      await hydrateWorkspace(sessionData)
      if (window.location.pathname === '/auth/oidc/callback') {
        window.history.replaceState({}, '', '/notes')
        context.setRoute('/notes')
      }
    } catch (error) {
      const cachedSession = await sessionStore.get()
      const cachedWorkspace = await loadCachedWorkspaceSnapshot()
      if (cachedSession && cachedWorkspace) {
        context.setSession(cachedSession)
        context.setSyncCursors(cachedWorkspace.cursors)
        const visibleNotes = filterVisibleNotes(cachedWorkspace.notes)
        context.rememberPersistedNotes(visibleNotes)
        context.setNotes(visibleNotes)
        context.setFilesTree(filterHiddenConflictNoteNodes(cachedWorkspace.file_tree))
        context.setSelectedNoteId(visibleNotes[0]?.id ?? null)
        context.setSelectedFolderPath(context.normalizeFolderPath(visibleNotes[0]?.folder ?? 'Inbox'))
        context.setCustomFolders((current) =>
          context.mergeFolderPaths(current, visibleNotes.map((note) => note.folder || 'Inbox')),
        )
        context.setDiagrams(cachedWorkspace.diagrams)
        context.setSelectedDiagramId(cachedWorkspace.diagrams[0]?.id ?? null)
        context.setMemos(cachedWorkspace.voice_memos)
        context.setSelectedVoiceMemoId(cachedWorkspace.voice_memos[0]?.id ?? null)
        context.setCalendarConnections(cachedWorkspace.calendar_connections)
        context.setTasks(cachedWorkspace.tasks)
        context.setRooms(cachedWorkspace.rooms)
        context.setSelectedRoomId(cachedWorkspace.rooms[0]?.id ?? null)
        context.setMessages([])
        context.setAuthMode(cachedSession.user.must_change_password ? 'change-password' : 'ready')
        context.setStatus('Offline mode using cached workspace')
        return
      }
      if (isNativePlatform()) {
        context.setAuthMode('connect')
      }
      context.setStatus(error instanceof Error ? error.message : 'Failed to connect')
    }
  }

  async function loginWithPassword(identifier: string, password: string) {
    try {
      context.setStatus('Signing in…')
      const sessionData = await api.login(identifier, password)
      await hydrateWorkspace(sessionData)
    } catch (error) {
      context.setStatus(error instanceof Error ? error.message : 'Sign in failed')
      throw error
    }
  }

  async function changePasswordFirstUse(payload: ChangePasswordRequest) {
    try {
      context.setStatus('Changing password…')
      const sessionData = await api.changePassword(payload)
      await hydrateWorkspace(sessionData)
      context.showActionNotice('Password changed')
    } catch (error) {
      context.setStatus(error instanceof Error ? error.message : 'Password change failed')
      throw error
    }
  }

  async function setupAdminAccount(payload: SetupAdminRequest) {
    try {
      context.setStatus('Creating admin account…')
      const sessionData = await api.setupAdmin(payload)
      context.setSetupStatus((current) => (current ? { ...current, admin_exists: true, user_count: 1 } : current))
      await hydrateWorkspace(sessionData)
    } catch (error) {
      context.setStatus(error instanceof Error ? error.message : 'Admin setup failed')
      throw error
    }
  }

  async function uploadCurrentUserAvatar(file: File) {
    const profile = await api.uploadCurrentUserAvatar(file, file.name)
    context.applyUpdatedUserProfile(profile)
    context.showActionNotice('Updated user icon')
  }

  async function updateCurrentUserCredentials(payload: { username: string; email: string }) {
    if (!context.session) return null
    const currentVisibleEmail =
      context.session.user.email.endsWith('@local.sweet') || context.session.user.email.endsWith('@local.home-suite-home')
        ? ''
        : context.session.user.email
    const usernameChanged = payload.username.trim() !== context.session.user.username
    const emailChanged = payload.email.trim() !== currentVisibleEmail
    const updated = await api.updateCurrentUserCredentials(payload)
    if (context.adminSettings?.allow_user_credential_changes || (!usernameChanged && !emailChanged)) {
      context.applyUpdatedUserProfile(updated)
      if (usernameChanged || emailChanged) {
        context.showActionNotice('Updated account')
      }
      return usernameChanged || emailChanged ? 'Account updated' : 'No account changes'
    }
    const refreshedUsers = await api.listUsers()
    context.setAdminUsers(refreshedUsers)
    context.showActionNotice('Sent account change request for admin approval')
    return 'Request sent for admin approval'
  }

  async function changeCurrentUserPassword(payload: {
    current_password: string
    new_password: string
    new_password_confirm: string
  }) {
    const sessionData = await api.changeCurrentUserPassword(payload)
    await sessionStore.set(sessionData)
    context.setSession(sessionData)
    context.applyUpdatedUserProfile(sessionData.user)
    context.showActionNotice('Password changed')
  }

  function logout() {
    void sessionStore.clear()
    context.setSession(null)
    context.setAdminSettings(null)
    context.setAdminUsers([])
    context.setAdminStorageOverview(null)
    context.setAdminDatabaseOverview(null)
    context.setNotes([])
    context.setFilesTree([])
    context.setSelectedFilePath('')
    context.setSelectedNoteId(null)
    context.setSelectedFolderPath(context.normalizeFolderPath('Inbox'))
    context.setCustomFolders([])
    context.setDiagrams([])
    context.setSelectedDiagramId(null)
    context.setMemos([])
    context.setSelectedVoiceMemoId(null)
    context.setRooms([])
    context.setRoomUnreadCounts({})
    context.setComsParticipants([])
    context.setSelectedRoomId(null)
    context.setMessages([])
    context.setRtcConfig(null)
    context.setAuthMode('login')
    context.setRoute('/notes')
    context.setStatus('Signed out')
    context.showActionNotice('Logged out')
  }

  return {
    bootstrap,
    hydrateWorkspace,
    loginWithPassword,
    changePasswordFirstUse,
    setupAdminAccount,
    uploadCurrentUserAvatar,
    updateCurrentUserCredentials,
    changeCurrentUserPassword,
    logout,
  }
}
