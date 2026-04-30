import { api } from './api'
import { getConnectivityState } from './platform'
import { queueSyncOperation } from './sync-engine'
import type { Message, SessionResponse } from './types'

type CreateComsLocalActionsContext = {
  session: SessionResponse | null
  messages: Message[]
  createEntityId: () => string
}

export function createComsLocalActions(context: CreateComsLocalActionsContext) {
  async function createMessageLocalFirst(roomId: string, body: string) {
    if (getConnectivityState()) {
      return api.createMessage(roomId, body)
    }
    if (!context.session) {
      throw new Error('You must be signed in to send messages offline.')
    }
    const message: Message = {
      id: context.createEntityId(),
      room_id: roomId,
      author: context.session.user,
      body,
      created_at: new Date().toISOString(),
      reactions: [],
    }
    await queueSyncOperation({
      kind: 'create_message',
      client_generated_id: message.id,
      room_id: roomId,
      body,
    })
    return message
  }

  async function toggleMessageReactionLocalFirst(roomId: string, messageId: string, emoji: string) {
    if (getConnectivityState()) {
      return api.toggleMessageReaction(roomId, messageId, emoji)
    }
    if (!context.session) {
      throw new Error('You must be signed in to react offline.')
    }
    const current = context.messages.find((entry) => entry.id === messageId)
    if (!current) {
      throw new Error('Message not found.')
    }
    const nextReactions = current.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      user_ids: [...reaction.user_ids],
    }))
    const existing = nextReactions.find((reaction) => reaction.emoji === emoji)
    if (existing) {
      const index = existing.user_ids.indexOf(context.session.user.id)
      if (index >= 0) {
        existing.user_ids.splice(index, 1)
      } else {
        existing.user_ids.push(context.session.user.id)
      }
    } else {
      nextReactions.push({ emoji, user_ids: [context.session.user.id] })
    }
    const filtered = nextReactions
      .filter((reaction) => reaction.user_ids.length > 0)
      .sort((left, right) => left.emoji.localeCompare(right.emoji))
    const updated: Message = { ...current, reactions: filtered }
    await queueSyncOperation({ kind: 'toggle_message_reaction', room_id: roomId, message_id: messageId, emoji })
    return updated
  }

  return {
    createMessageLocalFirst,
    toggleMessageReactionLocalFirst,
  }
}
