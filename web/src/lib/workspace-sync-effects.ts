import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { flushQueuedOperations, persistWorkspaceSnapshot, refreshWorkspace } from './sync-engine'
import { getConnectivityState } from './platform'
import { buildVisibleFilesTree, filterVisibleNotes } from './notes-runtime'
import type { SyncCursorSet, Note, Diagram, VoiceMemo, Room, CalendarConnection, CalendarEvent, TaskItem, SessionResponse, FileNode } from './types'

type UseWorkspaceSyncEffectsContext = {
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  session: SessionResponse | null
  selectedRoomId: string | null
  syncCursors: SyncCursorSet
  notes: Note[]
  diagrams: Diagram[]
  memos: VoiceMemo[]
  rooms: Room[]
  messages: any[]
  calendarConnections: CalendarConnection[]
  calendarEvents: CalendarEvent[]
  tasks: TaskItem[]
  filesTree: FileNode[]
  flushPendingVoiceUploads: () => Promise<void>
  flushPendingManagedUploads: () => Promise<void>
  refreshQueuedSyncConflicts: () => Promise<Array<unknown>>
  rememberPersistedNotes: (nextNotes: Note[]) => void
  showSyncNotice: (tone: 'offline' | 'error', message: string, timeoutMs?: number) => void
  setSyncCursors: Dispatch<SetStateAction<SyncCursorSet>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setFilesTree: Dispatch<SetStateAction<FileNode[]>>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setRooms: Dispatch<SetStateAction<Room[]>>
  setTasks: Dispatch<SetStateAction<TaskItem[]>>
  setCalendarConnections: Dispatch<SetStateAction<CalendarConnection[]>>
  setMessages: Dispatch<SetStateAction<any[]>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  setSelectedVoiceMemoId: Dispatch<SetStateAction<string | null>>
  selectComsRoom: Dispatch<SetStateAction<string | null>>
  setSelectedCalendarConnectionIds: Dispatch<SetStateAction<string[]>>
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>
  setSyncNotice: Dispatch<SetStateAction<{ tone: 'offline' | 'error'; message: string } | null>>
  setSyncConflictsOpen: Dispatch<SetStateAction<boolean>>
}

export function useWorkspaceSyncEffects(context: UseWorkspaceSyncEffectsContext) {
  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session) return

    let cancelled = false

    async function runSyncCycle() {
      if (!getConnectivityState()) {
        return
      }

      try {
        await context.flushPendingVoiceUploads()
        await context.flushPendingManagedUploads()
        const pushResponse = await flushQueuedOperations()
        const nextConflicts = await context.refreshQueuedSyncConflicts()
        const snapshot = await refreshWorkspace(pushResponse?.envelope.cursors ?? context.syncCursors, true)
        if (cancelled) return
        const visibleNotes = filterVisibleNotes(snapshot.notes)
        context.setSyncCursors(snapshot.cursors)
        context.rememberPersistedNotes(visibleNotes)
        context.setNotes(visibleNotes)
        context.setFilesTree(buildVisibleFilesTree(snapshot.file_tree, snapshot.notes))
        context.setDiagrams(snapshot.diagrams)
        context.setMemos(snapshot.voice_memos)
        context.setRooms(snapshot.rooms)
        context.setTasks(snapshot.tasks)
        context.setCalendarConnections(snapshot.calendar_connections)
        if (context.selectedRoomId) {
          context.setMessages(snapshot.messages.filter((message) => message.room_id === context.selectedRoomId))
        }
        context.setSelectedNoteId((current) =>
          current && visibleNotes.some((note) => note.id === current) ? current : (visibleNotes[0]?.id ?? null),
        )
        context.setSelectedDiagramId((current) =>
          current && snapshot.diagrams.some((diagram) => diagram.id === current) ? current : (snapshot.diagrams[0]?.id ?? null),
        )
        context.setSelectedVoiceMemoId((current) =>
          current && snapshot.voice_memos.some((memo) => memo.id === current) ? current : (snapshot.voice_memos[0]?.id ?? null),
        )
        context.selectComsRoom((current) =>
          current && snapshot.rooms.some((room) => room.id === current) ? current : (snapshot.rooms[0]?.id ?? null),
        )
        context.setSelectedCalendarConnectionIds((current) => {
          const valid = current.filter((id) => snapshot.calendar_connections.some((connection) => connection.id === id))
          if (valid.length > 0) return valid
          return snapshot.calendar_connections[0] ? [snapshot.calendar_connections[0].id] : []
        })
        context.setSelectedTaskId((current) =>
          current && snapshot.tasks.some((task) => task.id === current) ? current : (snapshot.tasks[0]?.id ?? null),
        )
        context.setSyncNotice(null)
        if (nextConflicts.length > 0) {
          context.setSyncConflictsOpen(true)
          context.showSyncNotice(
            'error',
            `${nextConflicts.length} offline change${nextConflicts.length === 1 ? '' : 's'} need review.`,
            6500,
          )
        }
      } catch (error) {
        if (!cancelled) {
          context.showSyncNotice('error', error instanceof Error ? error.message : 'Sync failed')
        }
      }
    }

    void runSyncCycle()
    const interval = window.setInterval(() => {
      void runSyncCycle()
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [context.authMode, context.session?.token, context.selectedRoomId])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session) return
    void persistWorkspaceSnapshot({
      source: 'remote',
      synced_at: new Date().toISOString(),
      cursors: context.syncCursors,
      notes: context.notes,
      diagrams: context.diagrams,
      voice_memos: context.memos,
      rooms: context.rooms,
      messages: context.messages,
      calendar_connections: context.calendarConnections,
      calendar_events: context.calendarEvents,
      tasks: context.tasks,
      file_tree: context.filesTree,
      resource_shares: [],
      tombstones: [],
    })
  }, [
    context.authMode,
    context.session?.token,
    context.syncCursors,
    context.notes,
    context.diagrams,
    context.memos,
    context.rooms,
    context.messages,
    context.calendarConnections,
    context.calendarEvents,
    context.tasks,
    context.filesTree,
  ])
}
