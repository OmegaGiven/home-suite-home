import type { Dispatch, SetStateAction } from 'react'
import { sessionStore } from './platform'
import type { Message, UserProfile } from './types'

type AdminUserSummary = import('./types').AdminUserSummary

type CreateSessionProfileActionsContext = {
  setSession: Dispatch<SetStateAction<import('./types').SessionResponse | null>>
  setAdminUsers: Dispatch<SetStateAction<AdminUserSummary[]>>
  setComsParticipants: Dispatch<SetStateAction<UserProfile[]>>
  setMessages: Dispatch<SetStateAction<Message[]>>
}

export function createSessionProfileActions(context: CreateSessionProfileActionsContext) {
  function applyUpdatedUserProfile(profile: UserProfile) {
    context.setSession((current) => {
      if (!current) return current
      const next = { ...current, user: profile }
      void sessionStore.set(next)
      return next
    })
    context.setAdminUsers((current) =>
      current.map((user) =>
        user.id === profile.id
          ? {
              ...user,
              username: profile.username,
              email: profile.email,
              display_name: profile.display_name,
              avatar_path: profile.avatar_path,
              avatar_content_type: profile.avatar_content_type,
              role: profile.role,
              roles: profile.roles,
              must_change_password: profile.must_change_password,
            }
          : user,
      ),
    )
    context.setComsParticipants((current) =>
      current.map((participant) => (participant.id === profile.id ? { ...participant, ...profile } : participant)),
    )
    context.setMessages((current) =>
      current.map((message) =>
        message.author.id === profile.id
          ? { ...message, author: { ...message.author, ...profile } }
          : message,
      ),
    )
  }

  return {
    applyUpdatedUserProfile,
  }
}
