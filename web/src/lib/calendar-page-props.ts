import type { CalendarConnection, CalendarEvent, GoogleCalendarConfig } from './types'
import type { ShareTarget } from './share-actions'

type BuildCalendarPagePropsArgs = {
  currentUserId: string | null
  googleConfig: GoogleCalendarConfig | null
  connections: CalendarConnection[]
  selectedConnectionIds: string[]
  events: CalendarEvent[]
  onToggleConnection: (id: string) => void
  onStartGoogleConnect: () => void
  onCreateIcsConnection: (title: string, url: string) => Promise<void>
  onCreateLocalConnection: (title: string) => Promise<void>
  onRenameConnection: (id: string, title: string) => Promise<void>
  onDeleteConnection: (id: string) => Promise<void>
  onRefresh: () => Promise<void>
  onCreateEvent: (payload: {
    title: string
    description: string
    location: string
    start_at: string
    end_at: string
    all_day: boolean
  }) => Promise<void>
  onUpdateEvent: (
    eventId: string,
    payload: {
      title: string
      description: string
      location: string
      start_at: string
      end_at: string
      all_day: boolean
    },
  ) => Promise<void>
  onDeleteEvent: (eventId: string) => Promise<void>
  onOpenShareDialog: (target: ShareTarget) => void
  resourceKeyForCalendar: (connectionId: string) => string
}

export function buildCalendarPageProps(args: BuildCalendarPagePropsArgs) {
  return { ...args }
}
