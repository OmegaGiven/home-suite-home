import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import type { CalendarConnection, CalendarEvent, Room, TaskItem } from './types'

type CreateWorkspaceRefreshActionsContext = {
  selectedRoomId: string | null
  setRooms: Dispatch<SetStateAction<Room[]>>
  chooseRoom: (roomId: string | null) => void
  setCalendarConnections: Dispatch<SetStateAction<CalendarConnection[]>>
  setSelectedCalendarConnectionIds: Dispatch<SetStateAction<string[]>>
  setTasks: Dispatch<SetStateAction<TaskItem[]>>
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
}

export function createWorkspaceRefreshActions(context: CreateWorkspaceRefreshActionsContext) {
  async function refreshRooms(options?: { preferredSelectedRoomId?: string | null }) {
    const nextRooms = await api.listRooms()
    context.setRooms(nextRooms)
    const preferred = options?.preferredSelectedRoomId ?? context.selectedRoomId
    context.chooseRoom(preferred && nextRooms.some((room) => room.id === preferred) ? preferred : (nextRooms[0]?.id ?? null))
    return nextRooms
  }

  async function refreshCalendarConnections(options?: { preferredSelectedConnectionIds?: string[] | null }) {
    const nextConnections = await api.listCalendarConnections()
    context.setCalendarConnections(nextConnections)
    context.setSelectedCalendarConnectionIds((current) => {
      const preferred = options?.preferredSelectedConnectionIds ?? current
      const valid = (preferred ?? []).filter((id) => nextConnections.some((connection) => connection.id === id))
      if (valid.length > 0) return valid
      return nextConnections[0] ? [nextConnections[0].id] : []
    })
    return nextConnections
  }

  async function refreshTasks(options?: { preferredSelectedTaskId?: string | null }) {
    const nextTasks = await api.listTasks()
    context.setTasks(nextTasks)
    context.setSelectedTaskId((current) => {
      const preferred = options?.preferredSelectedTaskId ?? current
      if (preferred && nextTasks.some((task) => task.id === preferred)) {
        return preferred
      }
      return nextTasks[0]?.id ?? null
    })
    return nextTasks
  }

  async function refreshCalendarEvents(connectionIds: string[]) {
    if (connectionIds.length === 0) {
      context.setCalendarEvents([])
      return []
    }
    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + 30)
    const grouped = await Promise.all(
      connectionIds.map((connectionId) => api.listCalendarEvents(connectionId, start.toISOString(), end.toISOString())),
    )
    const nextEvents = grouped
      .flat()
      .sort((left, right) => {
        const byStart = left.start_at.localeCompare(right.start_at)
        return byStart !== 0 ? byStart : left.title.localeCompare(right.title)
      })
    context.setCalendarEvents(nextEvents)
    return nextEvents
  }

  return {
    refreshRooms,
    refreshCalendarConnections,
    refreshTasks,
    refreshCalendarEvents,
  }
}
