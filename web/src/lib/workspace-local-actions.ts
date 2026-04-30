import type { MutableRefObject } from 'react'
import { api } from './api'
import { buildMarkdownReplica, createMarkdownBinding, replaceMarkdownContent } from './loro-note'
import { getConnectivityState } from './platform'
import { queueSyncOperation } from './sync-engine'
import type { CalendarConnection, CalendarEvent, Note, SessionResponse, TaskItem } from './types'

type CreateWorkspaceLocalActionsContext = {
  session: SessionResponse | null
  clientId: string
  notesRef: MutableRefObject<Note[]>
  calendarConnections: CalendarConnection[]
  calendarEvents: CalendarEvent[]
  tasks: TaskItem[]
  createEntityId: () => string
}

export function createWorkspaceLocalActions(context: CreateWorkspaceLocalActionsContext) {
  async function createNoteLocalFirst(title: string, folder?: string, markdown?: string) {
    const noteMarkdown = markdown ?? '# New note\n\nStart writing.'
    if (getConnectivityState()) {
      return api.createNote(title, folder, noteMarkdown)
    }
    if (!context.session) {
      throw new Error('You must be signed in to create notes offline.')
    }
    const now = new Date().toISOString()
    const noteId = context.createEntityId()
    const replica = buildMarkdownReplica(noteMarkdown)
    const note: Note = {
      id: noteId,
      object_id: `note:${noteId}`,
      namespace: {
        root: `users/${context.session.user.id}/synced`,
        owner_id: context.session.user.id,
        kind: 'synced',
        label: 'Synced',
      },
      visibility: 'private',
      shared_user_ids: [],
      title,
      folder: folder || 'Inbox',
      markdown: noteMarkdown,
      rendered_html: '',
      editor_format: 'workspace_markdown',
      loro_snapshot_b64: replica.snapshotB64,
      loro_updates_b64: replica.updatesB64,
      loro_version: replica.version,
      loro_needs_migration: false,
      forked_from_note_id: null,
      conflict_tag: null,
      revision: 1,
      created_at: now,
      updated_at: now,
      author_id: context.session.user.id,
      last_editor_id: context.session.user.id,
    }
    await queueSyncOperation({
      kind: 'create_note',
      client_generated_id: note.id,
      title: note.title,
      folder: note.folder,
      markdown: note.markdown,
    })
    return note
  }

  async function updateNoteLocalFirst(note: Note, payload: { markdown: string; folder: string }) {
    if (payload.markdown === note.markdown && payload.folder === note.folder) {
      return note
    }
    const binding = createMarkdownBinding(
      note.loro_snapshot_b64,
      note.markdown,
      note.loro_updates_b64,
    )
    const replicaUpdate = replaceMarkdownContent(binding, payload.markdown)
    const replica = replicaUpdate
      ? {
          snapshotB64: replicaUpdate.snapshotB64,
          updatesB64: replicaUpdate.updateB64 ? [replicaUpdate.updateB64] : [],
          version: (note.loro_version ?? 0) + 1,
        }
      : buildMarkdownReplica(payload.markdown)
    const updated: Note = {
      ...note,
      markdown: payload.markdown,
      folder: payload.folder,
      editor_format: note.editor_format ?? 'workspace_markdown',
      loro_snapshot_b64: replica.snapshotB64,
      loro_updates_b64: replica.updatesB64,
      loro_version: (note.loro_version ?? 0) + 1,
      loro_needs_migration: false,
      revision: note.revision + 1,
      updated_at: new Date().toISOString(),
      last_editor_id: context.session?.user.id ?? note.last_editor_id,
    }
    if (getConnectivityState()) {
      const response = await api.pushNoteDocumentUpdates(note.id, {
        client_id: context.clientId,
        snapshot_b64: replica.snapshotB64,
        update_b64: replica.updatesB64[0] ?? '',
        editor_format: 'workspace_markdown',
        content_markdown: updated.markdown,
        content_html: updated.rendered_html,
      })
      return response.note
    }
    await queueSyncOperation({
      kind: 'update_note_document',
      id: note.id,
      editor_format: 'workspace_markdown',
      content_markdown: updated.markdown,
      snapshot_b64: replica.snapshotB64,
      update_b64: replica.updatesB64[0] ?? null,
      content_html: updated.rendered_html,
    })
    return updated
  }

  async function deleteNoteLocalFirst(note: Note) {
    if (getConnectivityState()) {
      await api.deleteNote(note.id)
      return
    }
    await queueSyncOperation({ kind: 'delete_note', id: note.id })
  }

  async function createLocalCalendarConnectionLocalFirst(title: string) {
    if (getConnectivityState()) {
      return api.createLocalCalendarConnection(title)
    }
    if (!context.session) {
      throw new Error('You must be signed in to create calendars offline.')
    }
    const now = new Date().toISOString()
    const connection: CalendarConnection = {
      id: context.createEntityId(),
      owner_id: context.session.user.id,
      owner_display_name: context.session.user.display_name,
      title,
      provider: 'sweet',
      external_id: '',
      calendar_id: `sweet:${title.toLowerCase().replace(/\s+/g, '-')}`,
      account_label: 'Home Suite Home calendar',
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      ics_url: null,
      created_at: now,
      updated_at: now,
    }
    await queueSyncOperation({ kind: 'create_local_calendar', client_generated_id: connection.id, title })
    return connection
  }

  async function renameCalendarConnectionLocalFirst(id: string, title: string) {
    if (getConnectivityState()) {
      return api.updateCalendarConnection(id, title)
    }
    const current = context.calendarConnections.find((connection) => connection.id === id)
    if (!current) {
      throw new Error('Calendar not found.')
    }
    const updated: CalendarConnection = { ...current, title, updated_at: new Date().toISOString() }
    await queueSyncOperation({ kind: 'rename_calendar', id, title })
    return updated
  }

  async function deleteCalendarConnectionLocalFirst(id: string) {
    if (getConnectivityState()) {
      await api.deleteCalendarConnection(id)
      return
    }
    await queueSyncOperation({ kind: 'delete_calendar', id })
  }

  async function createCalendarEventLocalFirst(
    connectionId: string,
    payload: { title: string; description: string; location: string; start_at: string; end_at: string; all_day: boolean },
  ) {
    if (getConnectivityState()) {
      return api.createCalendarEvent(connectionId, payload)
    }
    const event: CalendarEvent = {
      id: context.createEntityId(),
      connection_id: connectionId,
      title: payload.title,
      description: payload.description,
      location: payload.location,
      start_at: payload.start_at,
      end_at: payload.end_at,
      all_day: payload.all_day,
      source_url: '',
      organizer: context.session?.user.display_name ?? 'You',
      updated_at: new Date().toISOString(),
    }
    await queueSyncOperation({ kind: 'create_calendar_event', client_generated_id: event.id, connection_id: connectionId, ...payload })
    return event
  }

  async function updateCalendarEventLocalFirst(
    connectionId: string,
    eventId: string,
    payload: { title: string; description: string; location: string; start_at: string; end_at: string; all_day: boolean },
  ) {
    if (getConnectivityState()) {
      return api.updateCalendarEvent(connectionId, eventId, payload)
    }
    const current = context.calendarEvents.find((event) => event.id === eventId)
    if (!current) {
      throw new Error('Event not found.')
    }
    const updated: CalendarEvent = { ...current, ...payload, updated_at: new Date().toISOString() }
    await queueSyncOperation({ kind: 'update_calendar_event', connection_id: connectionId, event_id: eventId, ...payload })
    return updated
  }

  async function deleteCalendarEventLocalFirst(connectionId: string, eventId: string) {
    if (getConnectivityState()) {
      await api.deleteCalendarEvent(connectionId, eventId)
      return
    }
    await queueSyncOperation({ kind: 'delete_calendar_event', connection_id: connectionId, event_id: eventId })
  }

  async function createTaskLocalFirst(payload: {
    title: string
    description: string
    start_at?: string | null
    end_at?: string | null
    all_day: boolean
    calendar_connection_id?: string | null
  }) {
    if (getConnectivityState()) {
      return api.createTask(payload)
    }
    if (!context.session) {
      throw new Error('You must be signed in to create tasks offline.')
    }
    const now = new Date().toISOString()
    const task: TaskItem = {
      id: context.createEntityId(),
      owner_id: context.session.user.id,
      owner_display_name: context.session.user.display_name,
      title: payload.title,
      description: payload.description,
      status: 'open',
      start_at: payload.start_at ?? null,
      end_at: payload.end_at ?? null,
      all_day: payload.all_day,
      calendar_connection_id: payload.calendar_connection_id ?? null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    }
    await queueSyncOperation({ kind: 'create_task', client_generated_id: task.id, ...payload })
    return task
  }

  async function updateTaskLocalFirst(
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
  ) {
    if (getConnectivityState()) {
      return api.updateTask(id, payload)
    }
    const current = context.tasks.find((task) => task.id === id)
    if (!current) {
      throw new Error('Task not found.')
    }
    const updated: TaskItem = {
      ...current,
      ...payload,
      updated_at: new Date().toISOString(),
      completed_at: payload.status === 'completed' ? current.completed_at ?? new Date().toISOString() : null,
    }
    await queueSyncOperation({ kind: 'update_task', id, ...payload })
    return updated
  }

  async function deleteTaskLocalFirst(id: string) {
    if (getConnectivityState()) {
      await api.deleteTask(id)
      return
    }
    await queueSyncOperation({ kind: 'delete_task', id })
  }

  return {
    createNoteLocalFirst,
    updateNoteLocalFirst,
    deleteNoteLocalFirst,
    createLocalCalendarConnectionLocalFirst,
    renameCalendarConnectionLocalFirst,
    deleteCalendarConnectionLocalFirst,
    createCalendarEventLocalFirst,
    updateCalendarEventLocalFirst,
    deleteCalendarEventLocalFirst,
    createTaskLocalFirst,
    updateTaskLocalFirst,
    deleteTaskLocalFirst,
  }
}
