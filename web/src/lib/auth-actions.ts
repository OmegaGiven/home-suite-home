import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import type { RoutePath } from './app-config'
import type { AdminSettings, Diagram, FileNode, OidcConfig, RtcConfig, SessionResponse, SetupAdminRequest, SetupStatusResponse, VoiceMemo, Note, UserProfile, Message, Room } from './types'

type AdminUserSummary = import('./types').AdminUserSummary
type AdminStorageOverview = import('./types').AdminStorageOverview
type ChangePasswordRequest = import('./types').ChangePasswordRequest

type CreateAuthActionsContext = {
  adminSettings: AdminSettings | null
  session: SessionResponse | null
  setStatus: Dispatch<SetStateAction<string>>
  setOidc: Dispatch<SetStateAction<OidcConfig | null>>
  setSetupStatus: Dispatch<SetStateAction<SetupStatusResponse | null>>
  setAuthMode: Dispatch<SetStateAction<'boot' | 'setup' | 'login' | 'change-password' | 'ready'>>
  setRoute: Dispatch<SetStateAction<RoutePath>>
  setSession: Dispatch<SetStateAction<SessionResponse | null>>
  setAdminSettings: Dispatch<SetStateAction<AdminSettings | null>>
  setAdminUsers: Dispatch<SetStateAction<AdminUserSummary[]>>
  setAdminStorageOverview: Dispatch<SetStateAction<AdminStorageOverview | null>>
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
  setRooms: Dispatch<SetStateAction<Room[]>>
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>
  setComsParticipants: Dispatch<SetStateAction<UserProfile[]>>
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setRtcConfig: Dispatch<SetStateAction<RtcConfig | null>>
  rememberPersistedNotes: (nextNotes: Note[]) => void
  normalizeFolderPath: (path: string) => string
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  applyUpdatedUserProfile: (profile: UserProfile) => void
  showActionNotice: (message: string) => void
}

export function createAuthActions(context: CreateAuthActionsContext) {
  async function hydrateWorkspace(sessionData: SessionResponse) {
    window.localStorage.setItem('sweet.session', JSON.stringify(sessionData))
    context.setSession(sessionData)
    const [
      nextNotes,
      nextFiles,
      nextDiagrams,
      nextMemos,
      nextRooms,
      nextComsParticipants,
      nextRtc,
      nextAdminSettings,
      nextUsers,
      nextAdminStorageOverview,
    ] = await Promise.all([
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

    context.setAdminSettings(nextAdminSettings)
    context.setAdminUsers(nextUsers)
    context.setAdminStorageOverview(nextAdminStorageOverview)
    context.rememberPersistedNotes(nextNotes)
    context.setNotes(nextNotes)
    context.setFilesTree(nextFiles)
    context.setSelectedFilePath('')
    context.setSelectedNoteId(nextNotes[0]?.id ?? null)
    context.setSelectedFolderPath(context.normalizeFolderPath(nextNotes[0]?.folder ?? 'Inbox'))
    context.setCustomFolders((current) => context.mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
    context.setDiagrams(nextDiagrams)
    context.setSelectedDiagramId(nextDiagrams[0]?.id ?? null)
    context.setMemos(nextMemos)
    context.setSelectedVoiceMemoId(nextMemos[0]?.id ?? null)
    context.setRooms(nextRooms)
    context.setRoomUnreadCounts({})
    context.setComsParticipants(nextComsParticipants)
    context.setSelectedRoomId(nextRooms[0]?.id ?? null)
    context.setMessages([])
    context.setRtcConfig(nextRtc)
    context.setAuthMode(sessionData.user.must_change_password ? 'change-password' : 'ready')
    context.setStatus('Workspace ready')
  }

  async function bootstrap() {
    try {
      context.setStatus('Connecting to API')
      const callbackParams = new URLSearchParams(window.location.search)
      const callbackCode = callbackParams.get('code')
      const callbackState = callbackParams.get('state') ?? undefined
      const [oidcConfig, setup] = await Promise.all([api.oidcConfig(), api.setupStatus()])
      context.setOidc(oidcConfig)
      context.setSetupStatus(setup)
      if (!setup.admin_exists) {
        context.setAuthMode('setup')
        context.setStatus('Create the first admin account')
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
      context.setStatus(error instanceof Error ? error.message : 'Failed to connect')
    }
  }

  async function loginWithPassword(identifier: string, password: string) {
    const sessionData = await api.login(identifier, password)
    await hydrateWorkspace(sessionData)
  }

  async function changePasswordFirstUse(payload: ChangePasswordRequest) {
    const sessionData = await api.changePassword(payload)
    await hydrateWorkspace(sessionData)
    context.showActionNotice('Password changed')
  }

  async function setupAdminAccount(payload: SetupAdminRequest) {
    const sessionData = await api.setupAdmin(payload)
    context.setSetupStatus((current) => (current ? { ...current, admin_exists: true, user_count: 1 } : current))
    await hydrateWorkspace(sessionData)
  }

  async function uploadCurrentUserAvatar(file: File) {
    const profile = await api.uploadCurrentUserAvatar(file, file.name)
    context.applyUpdatedUserProfile(profile)
    context.showActionNotice('Updated user icon')
  }

  async function updateCurrentUserCredentials(payload: { username: string; email: string }) {
    if (!context.session) return null
    const currentVisibleEmail = context.session.user.email.endsWith('@local.sweet') ? '' : context.session.user.email
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
    window.localStorage.setItem('sweet.session', JSON.stringify(sessionData))
    context.setSession(sessionData)
    context.applyUpdatedUserProfile(sessionData.user)
    context.showActionNotice('Password changed')
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
  }
}
