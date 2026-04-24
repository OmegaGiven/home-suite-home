import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { api } from './api'
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
  leaveCall: () => void
  showActionNotice: (message: string) => void
}

export function createComsActions(context: CreateComsActionsContext) {
  async function createRoom(name: string, participantIds: string[] = []) {
    const trimmedName = name.trim() || `thread-${context.rooms.length + 1}`
    const kind = participantIds.length > 0 ? 'direct' : 'channel'
    const room = await api.createRoom(trimmedName, kind, participantIds)
    await context.refreshRooms({ preferredSelectedRoomId: room.id })
    context.showActionNotice(`${kind === 'direct' ? 'Created private thread' : 'Created thread'}: ${room.name}`)
  }

  async function createDirectRoom(participantIds: string[]) {
    const participants = context.comsParticipants.filter((participant) => participantIds.includes(participant.id))
    const roomName = participants.map((participant) => participant.display_name).join(', ')
    const room = await api.createRoom(roomName || 'New message', 'direct', participantIds)
    await context.refreshRooms({ preferredSelectedRoomId: room.id })
    context.showActionNotice(`Started message: ${room.name}`)
  }

  async function renameRoom(roomId: string, name: string) {
    const room = await api.updateRoom(roomId, name)
    await context.refreshRooms({ preferredSelectedRoomId: room.id })
    context.showActionNotice(`Renamed thread: ${room.name}`)
  }

  async function updateRoomParticipants(roomId: string, participantIds: string[]) {
    const room = context.rooms.find((entry) => entry.id === roomId)
    if (!room) return
    const updated = await api.updateRoom(roomId, room.name, participantIds)
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
    const message = await api.createMessage(targetRoomId, trimmedBody)
    context.setMessages((current) => {
      if (targetRoomId !== context.selectedRoomIdRef.current) return current
      if (current.some((entry) => entry.id === message.id)) return current
      return [...current, message]
    })
    void context.refreshRooms({ preferredSelectedRoomId: targetRoomId })
  }

  return {
    createRoom,
    createDirectRoom,
    renameRoom,
    updateRoomParticipants,
    deleteRoom,
    sendMessage,
  }
}
