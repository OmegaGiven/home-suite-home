import { api } from './api'
import { getConnectivityState } from './platform'
import type { ShareTarget } from './share-actions'

type CreateCalendarPageActionsContext = {
  sessionUserId: string | null
  googleCalendarConfig: import('./types').GoogleCalendarConfig | null
  calendarConnections: import('./types').CalendarConnection[]
  selectedCalendarConnectionIds: string[]
  calendarEvents: import('./types').CalendarEvent[]
  setSelectedCalendarConnectionIds: React.Dispatch<React.SetStateAction<string[]>>
  setCalendarConnections: React.Dispatch<React.SetStateAction<import('./types').CalendarConnection[]>>
  setCalendarEvents: React.Dispatch<React.SetStateAction<import('./types').CalendarEvent[]>>
  createLocalCalendarConnectionLocalFirst: (title: string) => Promise<import('./types').CalendarConnection>
  renameCalendarConnectionLocalFirst: (id: string, title: string) => Promise<import('./types').CalendarConnection>
  deleteCalendarConnectionLocalFirst: (id: string) => Promise<void>
  createCalendarEventLocalFirst: (
    connectionId: string,
    payload: {
      title: string
      description: string
      location: string
      start_at: string
      end_at: string
      all_day: boolean
    },
  ) => Promise<import('./types').CalendarEvent>
  updateCalendarEventLocalFirst: (
    connectionId: string,
    eventId: string,
    payload: {
      title: string
      description: string
      location: string
      start_at: string
      end_at: string
      all_day: boolean
    },
  ) => Promise<import('./types').CalendarEvent>
  deleteCalendarEventLocalFirst: (connectionId: string, eventId: string) => Promise<void>
  refreshCalendarConnections: (options?: { preferredSelectedConnectionIds?: string[] | null }) => Promise<import('./types').CalendarConnection[]>
  refreshCalendarEvents: (connectionIds: string[]) => Promise<unknown>
  openShareDialog: (target: ShareTarget) => Promise<void>
  resourceKeyForCalendar: (connectionId: string) => string
  showActionNotice: (message: string) => void
}

export function createCalendarPageActions(context: CreateCalendarPageActionsContext) {
  const primarySelectedCalendarConnectionId = context.selectedCalendarConnectionIds[0] ?? null

  return {
    currentUserId: context.sessionUserId,
    onToggleConnection: (id: string) =>
      context.setSelectedCalendarConnectionIds((current) => {
        const exists = current.includes(id)
        if (exists) {
          const next = current.filter((entry) => entry !== id)
          return next.length > 0 ? next : current
        }
        return [...current, id]
      }),
    onStartGoogleConnect: () => {
      if (!context.googleCalendarConfig?.enabled || !context.googleCalendarConfig.client_id) {
        context.showActionNotice('Google Calendar is not configured by an admin.')
        return
      }
      const state = globalThis.crypto?.randomUUID?.() || `calendar-${Date.now()}`
      window.sessionStorage.setItem('sweet.calendar.google.state', state)
      const params = new URLSearchParams({
        client_id: context.googleCalendarConfig.client_id,
        redirect_uri: context.googleCalendarConfig.redirect_url,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: context.googleCalendarConfig.scope,
        state,
      })
      window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
    },
    onCreateIcsConnection: async (title: string, url: string) => {
      const connection = await api.createIcsCalendarConnection(title, url)
      await context.refreshCalendarConnections({ preferredSelectedConnectionIds: [connection.id] })
      context.setSelectedCalendarConnectionIds([connection.id])
      context.showActionNotice(`Added ${connection.title}`)
    },
    onCreateLocalConnection: async (title: string) => {
      const connection = await context.createLocalCalendarConnectionLocalFirst(title)
      if (getConnectivityState()) {
        await context.refreshCalendarConnections({ preferredSelectedConnectionIds: [connection.id] })
      } else {
        context.setCalendarConnections((current) => [connection, ...current])
      }
      context.setSelectedCalendarConnectionIds([connection.id])
      context.showActionNotice(`Added ${connection.title}`)
    },
    onRenameConnection: async (id: string, title: string) => {
      const connection = await context.renameCalendarConnectionLocalFirst(id, title)
      context.setCalendarConnections((current) => current.map((entry) => (entry.id === connection.id ? connection : entry)))
      context.showActionNotice(`Renamed ${connection.title}`)
    },
    onDeleteConnection: async (id: string) => {
      await context.deleteCalendarConnectionLocalFirst(id)
      if (getConnectivityState()) {
        await context.refreshCalendarConnections({
          preferredSelectedConnectionIds: context.selectedCalendarConnectionIds.filter((entry) => entry !== id),
        })
        if (context.selectedCalendarConnectionIds.includes(id)) {
          context.setCalendarEvents([])
        }
      } else {
        context.setCalendarConnections((current) => current.filter((entry) => entry.id !== id))
        context.setCalendarEvents((current) => current.filter((event) => event.connection_id !== id))
        context.setSelectedCalendarConnectionIds((current) => {
          const next = current.filter((entry) => entry !== id)
          return next.length > 0
            ? next
            : (context.calendarConnections.find((entry) => entry.id !== id)?.id
                ? [context.calendarConnections.find((entry) => entry.id !== id)!.id]
                : [])
        })
      }
      context.showActionNotice('Removed calendar')
    },
    onRefresh: async () => {
      if (context.selectedCalendarConnectionIds.length === 0) return
      await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
    },
    onCreateEvent: async (payload: {
      title: string
      description: string
      location: string
      start_at: string
      end_at: string
      all_day: boolean
    }) => {
      if (!primarySelectedCalendarConnectionId) return
      const created = await context.createCalendarEventLocalFirst(primarySelectedCalendarConnectionId, payload)
      if (getConnectivityState()) {
        await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
      } else {
        context.setCalendarEvents((current) => [...current, created].sort((left, right) => left.start_at.localeCompare(right.start_at)))
      }
      context.showActionNotice(`Added ${payload.title}`)
    },
    onUpdateEvent: async (
      eventId: string,
      payload: {
        title: string
        description: string
        location: string
        start_at: string
        end_at: string
        all_day: boolean
      },
    ) => {
      if (!primarySelectedCalendarConnectionId) return
      const updated = await context.updateCalendarEventLocalFirst(primarySelectedCalendarConnectionId, eventId, payload)
      if (getConnectivityState()) {
        await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
      } else {
        context.setCalendarEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)))
      }
      context.showActionNotice(`Updated ${payload.title}`)
    },
    onDeleteEvent: async (eventId: string) => {
      const existingEvent = context.calendarEvents.find((event) => event.id === eventId)
      if (!existingEvent) return
      await context.deleteCalendarEventLocalFirst(existingEvent.connection_id, eventId)
      if (getConnectivityState()) {
        await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
      } else {
        context.setCalendarEvents((current) => current.filter((event) => event.id !== eventId))
      }
      context.showActionNotice('Deleted event')
    },
    onOpenShareDialog: (target: ShareTarget) => void context.openShareDialog(target),
    resourceKeyForCalendar: context.resourceKeyForCalendar,
  }
}

type CreateTasksPageActionsContext = {
  tasks: import('./types').TaskItem[]
  selectedTaskId: string | null
  selectedCalendarConnectionIds: string[]
  setTasks: React.Dispatch<React.SetStateAction<import('./types').TaskItem[]>>
  setSelectedTaskId: React.Dispatch<React.SetStateAction<string | null>>
  setCalendarEvents: React.Dispatch<React.SetStateAction<import('./types').CalendarEvent[]>>
  createTaskLocalFirst: (payload: {
    title: string
    description: string
    start_at?: string | null
    end_at?: string | null
    all_day: boolean
    calendar_connection_id?: string | null
  }) => Promise<import('./types').TaskItem>
  updateTaskLocalFirst: (
    id: string,
    payload: {
      title: string
      description: string
      status: 'open' | 'completed'
      start_at?: string | null
      end_at?: string | null
      all_day: boolean
      calendar_connection_id?: string | null
    },
  ) => Promise<import('./types').TaskItem>
  deleteTaskLocalFirst: (id: string) => Promise<void>
  refreshTasks: (options?: { preferredSelectedTaskId?: string | null }) => Promise<unknown>
  refreshCalendarEvents: (connectionIds: string[]) => Promise<unknown>
  showActionNotice: (message: string) => void
}

export function createTasksPageActions(context: CreateTasksPageActionsContext) {
  return {
    onSelectTask: (id: string) => context.setSelectedTaskId(id),
    onCreateTask: async (payload: {
      title: string
      description: string
      start_at?: string | null
      end_at?: string | null
      all_day: boolean
      calendar_connection_id?: string | null
    }) => {
      const created = await context.createTaskLocalFirst(payload)
      context.setSelectedTaskId(created.id)
      if (getConnectivityState()) {
        await context.refreshTasks({ preferredSelectedTaskId: created.id })
        if (payload.calendar_connection_id && context.selectedCalendarConnectionIds.includes(payload.calendar_connection_id)) {
          await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
        }
      } else {
        context.setTasks((current) => [created, ...current])
      }
      context.showActionNotice(`Added ${payload.title}`)
    },
    onUpdateTask: async (
      id: string,
      payload: {
        title: string
        description: string
        status: 'open' | 'completed'
        start_at?: string | null
        end_at?: string | null
        all_day: boolean
        calendar_connection_id?: string | null
      },
    ) => {
      const previous = context.tasks.find((task) => task.id === id)
      const updated = await context.updateTaskLocalFirst(id, payload)
      context.setSelectedTaskId(updated.id)
      if (getConnectivityState()) {
        await context.refreshTasks({ preferredSelectedTaskId: updated.id })
      } else {
        context.setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)))
      }
      const refreshIds = new Set<string>()
      if (previous?.calendar_connection_id) refreshIds.add(previous.calendar_connection_id)
      if (payload.calendar_connection_id) refreshIds.add(payload.calendar_connection_id)
      if (context.selectedCalendarConnectionIds.some((entry) => refreshIds.has(entry))) {
        if (getConnectivityState()) {
          await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
        } else {
          context.setCalendarEvents((current) => current)
        }
      }
    },
    onDeleteTask: async (id: string) => {
      const previous = context.tasks.find((task) => task.id === id)
      await context.deleteTaskLocalFirst(id)
      if (getConnectivityState()) {
        const remaining = context.tasks.filter((task) => task.id !== id)
        const fallbackSelection = remaining.find((task) => task.id === context.selectedTaskId)?.id ?? remaining[0]?.id ?? null
        await context.refreshTasks({ preferredSelectedTaskId: fallbackSelection })
      } else {
        context.setTasks((current) => current.filter((task) => task.id !== id))
        context.setSelectedTaskId((current) => (current === id ? context.tasks.find((task) => task.id !== id)?.id ?? null : current))
      }
      if (previous?.calendar_connection_id && context.selectedCalendarConnectionIds.includes(previous.calendar_connection_id)) {
        if (getConnectivityState()) {
          await context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
        }
      }
      context.showActionNotice('Deleted task')
    },
  }
}
