import type { CalendarConnection, TaskItem, TaskStatus } from './types'

type BuildTasksPagePropsArgs = {
  tasks: TaskItem[]
  selectedTaskId: string | null
  calendars: CalendarConnection[]
  onSelectTask: (id: string) => void
  onCreateTask: (payload: {
    title: string
    description: string
    start_at?: string | null
    end_at?: string | null
    all_day: boolean
    calendar_connection_id?: string | null
  }) => Promise<void>
  onUpdateTask: (
    id: string,
    payload: {
      title: string
      description: string
      status: TaskStatus
      start_at?: string | null
      end_at?: string | null
      all_day: boolean
      calendar_connection_id?: string | null
    },
  ) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
}

export function buildTasksPageProps(args: BuildTasksPagePropsArgs) {
  return { ...args }
}

