import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { api } from './api'
import { getConnectivityState } from './platform'
import { loadCachedWorkspaceSnapshot } from './sync-engine'
import type { RoutePath } from './app-config'
import type {
  CalendarConnection,
  GoogleCalendarConfig,
  SessionResponse,
  SystemUpdateStatus,
  VoiceMemo,
} from './types'

type UsePageRefreshEffectsContext = {
  route: RoutePath
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  locationSearch: string
  session: SessionResponse | null
  memos: VoiceMemo[]
  selectedRoomId: string | null
  selectedCalendarConnectionIds: string[]
  systemUpdateStatus: SystemUpdateStatus | null
  currentRolePolicy: { manage_org_settings: boolean }
  cleanupCallState: () => void
  refreshCalendarConnections: (options?: { preferredSelectedConnectionIds?: string[] | null }) => Promise<CalendarConnection[]>
  refreshTasks: (options?: { preferredSelectedTaskId?: string | null }) => Promise<unknown>
  refreshCalendarEvents: (connectionIds: string[]) => Promise<unknown>
  refreshAdminDatabaseOverview: () => Promise<unknown>
  refreshAdminDeletedItems: () => Promise<unknown>
  refreshAdminAuditEntries: () => Promise<unknown>
  refreshUserDeletedItems: () => Promise<void>
  showActionNotice: (message: string) => void
  setMessages: Dispatch<SetStateAction<import('./types').Message[]>>
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setGoogleCalendarConfig: Dispatch<SetStateAction<GoogleCalendarConfig | null>>
  setSelectedCalendarConnectionIds: Dispatch<SetStateAction<string[]>>
  setCalendarEvents: Dispatch<SetStateAction<import('./types').CalendarEvent[]>>
  setTasks: Dispatch<SetStateAction<import('./types').TaskItem[]>>
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>
  setSyncCursors: Dispatch<SetStateAction<import('./types').SyncCursorSet>>
  setCalendarConnections: Dispatch<SetStateAction<CalendarConnection[]>>
  setSystemUpdateStatus: Dispatch<SetStateAction<SystemUpdateStatus | null>>
  setAdminDatabaseOverview: Dispatch<SetStateAction<import('./types').AdminDatabaseOverview | null>>
  setAdminDeletedItems: Dispatch<SetStateAction<import('./types').AdminDeletedItem[]>>
  setAdminAuditEntries: Dispatch<SetStateAction<import('./types').AdminAuditEntry[]>>
  setDeletedItems: Dispatch<SetStateAction<import('./types').AdminDeletedItem[]>>
  setLocationSearch: Dispatch<SetStateAction<string>>
}

export function usePageRefreshEffects(context: UsePageRefreshEffectsContext) {
  useEffect(() => {
    if (!context.selectedRoomId) {
      context.setMessages([])
      return
    }
    if (!getConnectivityState()) {
      void loadCachedWorkspaceSnapshot().then((snapshot) => {
        if (!snapshot) return
        context.setMessages(snapshot.messages.filter((message) => message.room_id === context.selectedRoomId))
      })
      return
    }
    void api.listMessages(context.selectedRoomId).then(context.setMessages)
  }, [context.selectedRoomId])

  useEffect(() => {
    if (context.route !== '/coms' || !context.selectedRoomId) return
    context.setRoomUnreadCounts((current) => {
      if (!current[context.selectedRoomId!]) return current
      const next = { ...current }
      delete next[context.selectedRoomId!]
      return next
    })
  }, [context.route, context.selectedRoomId])

  useEffect(() => {
    const pending = context.memos.some((memo) => memo.status === 'pending' || memo.status === 'running')
    if (!pending) return
    const interval = window.setInterval(() => {
      void api.listVoiceMemos().then(context.setMemos)
    }, 2500)
    return () => window.clearInterval(interval)
  }, [context.memos])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session) return
    void api
      .googleCalendarConfig()
      .then(context.setGoogleCalendarConfig)
      .catch((error) => {
        console.error(error)
        context.setGoogleCalendarConfig(null)
      })
    void context.refreshCalendarConnections().catch((error) => {
      console.error(error)
    })
    void context.refreshTasks().catch((error) => {
      console.error(error)
    })
  }, [context.authMode, context.session?.token])

  useEffect(() => {
    if (context.route !== '/calendar' || !context.session) return
    const params = new URLSearchParams(context.locationSearch)
    const code = params.get('code')
    const returnedState = params.get('state')
    if (!code) return

    const expectedState = window.sessionStorage.getItem('sweet.calendar.google.state')
    if (expectedState && returnedState && expectedState !== returnedState) {
      context.showActionNotice('Google calendar connection could not be verified.')
      window.history.replaceState({}, '', '/calendar')
      context.setLocationSearch('')
      return
    }

    const redirectUrl = `${window.location.origin}/calendar`
    window.sessionStorage.removeItem('sweet.calendar.google.state')
    void api
      .connectGoogleCalendar(code, redirectUrl)
      .then(async (connection) => {
        await context.refreshCalendarConnections({ preferredSelectedConnectionIds: [connection.id] })
        context.setSelectedCalendarConnectionIds([connection.id])
        context.showActionNotice(`Connected ${connection.title}`)
      })
      .catch((error) => {
        console.error(error)
        context.showActionNotice(error instanceof Error ? error.message : 'Could not connect Google calendar.')
      })
      .finally(() => {
        window.history.replaceState({}, '', '/calendar')
        context.setLocationSearch('')
      })
  }, [context.locationSearch, context.route, context.session?.token])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session || context.selectedCalendarConnectionIds.length === 0) {
      context.setCalendarEvents([])
      return
    }
    void context.refreshCalendarEvents(context.selectedCalendarConnectionIds)
      .catch((error) => {
        console.error(error)
        context.setCalendarEvents([])
        context.showActionNotice(error instanceof Error ? error.message : 'Could not load calendar events.')
      })
  }, [context.authMode, context.selectedCalendarConnectionIds, context.session?.token])

  useEffect(() => {
    if (context.session) return
    context.setGoogleCalendarConfig(null)
    context.setCalendarConnections([])
    context.setSelectedCalendarConnectionIds([])
    context.setCalendarEvents([])
    context.setTasks([])
    context.setSelectedTaskId(null)
    context.setSyncCursors({ generated_at: new Date(0).toISOString() })
  }, [context.session])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session || !context.currentRolePolicy.manage_org_settings) {
      context.setSystemUpdateStatus(null)
      return
    }
    void api.getSystemUpdateStatus().then(context.setSystemUpdateStatus).catch((error) => {
      console.error(error)
    })
  }, [context.authMode, context.session, context.currentRolePolicy.manage_org_settings])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session || !context.currentRolePolicy.manage_org_settings) {
      context.setAdminDatabaseOverview(null)
      context.setAdminDeletedItems([])
      context.setAdminAuditEntries([])
      return
    }
    if (context.route !== '/admin') return
    void Promise.all([
      context.refreshAdminDatabaseOverview(),
      context.refreshAdminDeletedItems(),
      context.refreshAdminAuditEntries(),
    ]).catch((error) => {
      console.error(error)
    })
  }, [context.authMode, context.session, context.currentRolePolicy.manage_org_settings, context.route])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session) {
      context.setDeletedItems([])
      return
    }
    if (context.route !== '/notes' && context.route !== '/diagrams' && context.route !== '/voice') return
    void context.refreshUserDeletedItems()
  }, [context.authMode, context.session, context.route])

  useEffect(() => {
    if (context.route !== '/admin' || !context.systemUpdateStatus?.update_in_progress || !context.currentRolePolicy.manage_org_settings) {
      return
    }
    const interval = window.setInterval(() => {
      void api.getSystemUpdateStatus().then(context.setSystemUpdateStatus).catch((error) => {
        console.error(error)
      })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [context.route, context.systemUpdateStatus?.update_in_progress, context.currentRolePolicy.manage_org_settings])

  useEffect(() => () => context.cleanupCallState(), [])
}
