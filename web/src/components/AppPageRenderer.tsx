import type { ComponentProps } from 'react'
import type { RoutePath } from '../lib/app-config'
import { AdminPage } from '../pages/AdminPage'
import { CalendarPage } from '../pages/CalendarPage'
import { ChatPage } from '../pages/ChatPage'
import { DiagramsPage } from '../pages/DiagramsPage'
import { FilesPage } from '../pages/FilesPage'
import { NotesPage } from '../pages/NotesPage'
import { SettingsPage } from '../pages/SettingsPage'
import { TasksPage } from '../pages/TasksPage'
import { VoicePage } from '../pages/VoicePage'

type AppPageRendererProps = {
  route: RoutePath
  notesPageProps: ComponentProps<typeof NotesPage>
  filesPageProps: ComponentProps<typeof FilesPage>
  diagramsPageProps: ComponentProps<typeof DiagramsPage>
  voicePageProps: ComponentProps<typeof VoicePage>
  calendarPageProps: ComponentProps<typeof CalendarPage>
  tasksPageProps: ComponentProps<typeof TasksPage>
  chatPageProps: ComponentProps<typeof ChatPage>
  settingsPageProps: ComponentProps<typeof SettingsPage>
  adminPageProps: ComponentProps<typeof AdminPage>
}

export function AppPageRenderer({
  route,
  notesPageProps,
  filesPageProps,
  diagramsPageProps,
  voicePageProps,
  calendarPageProps,
  tasksPageProps,
  chatPageProps,
  settingsPageProps,
  adminPageProps,
}: AppPageRendererProps) {
  switch (route) {
    case '/notes':
      return <NotesPage {...notesPageProps} />
    case '/files':
      return <FilesPage {...filesPageProps} />
    case '/diagrams':
      return <DiagramsPage {...diagramsPageProps} />
    case '/voice':
      return <VoicePage {...voicePageProps} />
    case '/coms':
      return <ChatPage {...chatPageProps} />
    case '/calendar':
      return <CalendarPage {...calendarPageProps} />
    case '/tasks':
      return <TasksPage {...tasksPageProps} />
    case '/settings':
      return <SettingsPage {...settingsPageProps} />
    case '/admin':
      return <AdminPage {...adminPageProps} />
    default:
      return <NotesPage {...notesPageProps} />
  }
}
