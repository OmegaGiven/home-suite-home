import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import type { AdminSettings, Message, SessionResponse, UserProfile } from './types'

type AdminUserSummary = import('./types').AdminUserSummary
type AdminStorageOverview = import('./types').AdminStorageOverview
type SetupStatusResponse = import('./types').SetupStatusResponse
type CreateUserRequest = import('./types').CreateUserRequest
type UpdateUserAccessRequest = import('./types').UpdateUserAccessRequest

type CreateAdminActionsContext = {
  session: SessionResponse | null
  setAdminSettings: Dispatch<SetStateAction<AdminSettings | null>>
  setAdminStorageOverview: Dispatch<SetStateAction<AdminStorageOverview | null>>
  setAdminUsers: Dispatch<SetStateAction<AdminUserSummary[]>>
  setSetupStatus: Dispatch<SetStateAction<SetupStatusResponse | null>>
  setComsParticipants: Dispatch<SetStateAction<UserProfile[]>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  applyUpdatedUserProfile: (profile: UserProfile) => void
  showActionNotice: (message: string) => void
}

export function createAdminActions(context: CreateAdminActionsContext) {
  async function saveAdminSettings(settings: AdminSettings) {
    const next = await api.updateAdminSettings(settings)
    context.setAdminSettings(next)
    context.setAdminStorageOverview((current) =>
      current
        ? {
            ...current,
            public_storage_mb: next.public_storage_mb,
          }
        : current,
    )
    context.showActionNotice('Saved admin settings')
  }

  async function createAdminUser(payload: CreateUserRequest) {
    const created = await api.createUser(payload)
    context.setAdminUsers((current) => [...current, created].sort((left, right) => left.username.localeCompare(right.username)))
    context.setSetupStatus((current) => (current ? { ...current, user_count: current.user_count + 1 } : current))
    context.showActionNotice(`Created user: ${created.username}`)
  }

  async function resetAdminUserPassword(userId: string, password: string) {
    const updated = await api.resetUserPassword(userId, password)
    context.setAdminUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
    context.showActionNotice(`Reset password for ${updated.username}`)
  }

  async function updateAdminUserAccess(userId: string, payload: UpdateUserAccessRequest) {
    const updated = await api.updateUserAccess(userId, payload)
    context.setAdminUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
    context.showActionNotice(`Updated access for ${updated.username}`)
  }

  async function resolveAdminUserCredentialRequest(userId: string, approve: boolean) {
    const updated = await api.resolveUserCredentialRequest(userId, approve)
    context.setAdminUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
    context.setComsParticipants((current) =>
      current.map((participant) =>
        participant.id === updated.id
          ? {
              ...participant,
              username: updated.username,
              email: updated.email,
              display_name: updated.display_name,
              avatar_path: updated.avatar_path,
              avatar_content_type: updated.avatar_content_type,
              role: updated.role,
              roles: updated.roles,
              must_change_password: updated.must_change_password,
            }
          : participant,
      ),
    )
    context.setMessages((current) =>
      current.map((message) =>
        message.author.id === updated.id
          ? {
              ...message,
              author: {
                ...message.author,
                username: updated.username,
                email: updated.email,
                display_name: updated.display_name,
                avatar_path: updated.avatar_path,
                avatar_content_type: updated.avatar_content_type,
                role: updated.role,
                roles: updated.roles,
                must_change_password: updated.must_change_password,
              },
            }
          : message,
      ),
    )
    if (context.session?.user.id === updated.id && approve) {
      context.applyUpdatedUserProfile({
        ...context.session.user,
        username: updated.username,
        email: updated.email,
        display_name: updated.display_name,
        avatar_path: updated.avatar_path,
        avatar_content_type: updated.avatar_content_type,
        role: updated.role,
        roles: updated.roles,
        must_change_password: updated.must_change_password,
      })
    }
    context.showActionNotice(
      approve ? `Approved account request for ${updated.username}` : `Denied account request for ${updated.username}`,
    )
  }

  return {
    saveAdminSettings,
    createAdminUser,
    resetAdminUserPassword,
    updateAdminUserAccess,
    resolveAdminUserCredentialRequest,
  }
}
