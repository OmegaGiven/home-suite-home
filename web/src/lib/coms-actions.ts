import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { api } from './api'
import { getConnectivityState } from './platform'
import type { Message, Room, UserProfile } from './types'

type CreateComsActionsContext = {
  rooms: Room[]
  comsParticipants: UserProfile[]
  selectedRoomId: string | null
  selectedRoomIdRef: MutableRefObject<string | null>
  activeCallRoomIdRef: MutableRefObject<string | null>
  callJoinedRef: MutableRefObject<boolean>
  setMessages: Dispatch<SetStateAction<Message[]>>
  refreshRooms: (options?: { preferredSelectedRoomId?: string | null }) => Promise<Room[]>
  createMessageRecord: (roomId: string, body: string) => Promise<Message>
  toggleMessageReactionRecord: (roomId: string, messageId: string, emoji: string) => Promise<Message>
  leaveCall: () => void
  showActionNotice: (message: string) => void
}

export function createComsActions(context: CreateComsActionsContext) {
  async function createRoom(name: string, participantIds: string[] = [], folder = '') {
    const trimmedName = name.trim() || `thread-${context.rooms.length + 1}`
    const kind = participantIds.length > 0 ? 'direct' : 'channel'
    const room = await api.createRoom(trimmedName, kind, participantIds, folder)
    await context.refreshRooms({ preferredSelectedRoomId: room.id })
    context.showActionNotice(`${kind === 'direct' ? 'Created private thread' : 'Created thread'}: ${room.name}`)
  }

  async function createDirectRoom(participantIds: string[]) {
    const participants = context.comsParticipants.filter((participant) => participantIds.includes(participant.id))
    const roomName = participants.map((participant) => participant.display_name).join(', ')
    const room = await api.createRoom(roomName || 'New message', 'direct', participantIds, '')
    await context.refreshRooms({ preferredSelectedRoomId: room.id })
    context.showActionNotice(`Started message: ${room.name}`)
  }

  async function renameRoom(roomId: string, name: string, folder?: string) {
    const existing = context.rooms.find((entry) => entry.id === roomId)
    const room = await api.updateRoom(roomId, name, undefined, folder ?? existing?.folder ?? '')
    await context.refreshRooms({ preferredSelectedRoomId: room.id })
    context.showActionNotice(`Renamed thread: ${room.name}`)
  }

  async function updateRoomParticipants(roomId: string, participantIds: string[]) {
    const room = context.rooms.find((entry) => entry.id === roomId)
    if (!room) return
    const updated = await api.updateRoom(roomId, room.name, participantIds, room.folder)
    await context.refreshRooms({ preferredSelectedRoomId: updated.id })
    context.showActionNotice(`Updated participants: ${updated.name}`)
  }

  async function deleteRoom(roomId: string) {
    const room = context.rooms.find((entry) => entry.id === roomId)
    if (!room) return
    if (context.activeCallRoomIdRef.current === roomId && context.callJoinedRef.current) {
      context.leaveCall()
    }
    await api.deleteRoom(roomId)
    await context.refreshRooms({ preferredSelectedRoomId: null })
    context.setMessages([])
    context.showActionNotice(`Deleted thread: ${room.name}`)
  }

  async function sendMessage(body: string) {
    const trimmedBody = body.trim()
    if (!trimmedBody || !context.selectedRoomId) return
    const targetRoomId = context.selectedRoomId
    const message = await context.createMessageRecord(targetRoomId, trimmedBody)
    context.setMessages((current) => {
      if (targetRoomId !== context.selectedRoomIdRef.current) return current
      if (current.some((entry) => entry.id === message.id)) return current
      return [...current, message]
    })
    if (getConnectivityState()) {
      void context.refreshRooms({ preferredSelectedRoomId: targetRoomId })
    }
  }

  async function toggleMessageReaction(messageId: string, emoji: string) {
    if (!context.selectedRoomId) return
    const targetRoomId = context.selectedRoomId
    const message = await context.toggleMessageReactionRecord(targetRoomId, messageId, emoji)
    context.setMessages((current) =>
      targetRoomId !== context.selectedRoomIdRef.current
        ? current
        : current.map((entry) => (entry.id === message.id ? message : entry)),
    )
  }

  return {
    createRoom,
    createDirectRoom,
    renameRoom,
    updateRoomParticipants,
    deleteRoom,
    sendMessage,
    toggleMessageReaction,
  }
}
