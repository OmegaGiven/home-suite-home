import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { listQueuedSyncConflicts, retryQueuedSyncConflict, discardQueuedSyncConflict } from './sync-engine'
import type { Note, QueuedSyncConflict } from './types'
import type { RoutePath } from './app-config'

type CreateSyncConflictActionsContext = {
  syncConflicts: QueuedSyncConflict[]
  notesRef: MutableRefObject<Note[]>
  setSyncConflicts: Dispatch<SetStateAction<QueuedSyncConflict[]>>
  setSyncConflictsOpen: Dispatch<SetStateAction<boolean>>
  setActionNotice: Dispatch<SetStateAction<{ id: string; message: string } | null>>
  createClientId: () => string
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>
  setSelectedCalendarConnectionIds: Dispatch<SetStateAction<string[]>>
  chooseRoom: (roomId: string | null) => void
  setSelectedFilePath: Dispatch<SetStateAction<string>>
  setActiveFilePath: Dispatch<SetStateAction<string | null>>
  navigate: (nextRoute: RoutePath) => Promise<void>
  normalizeFolderPath: (path: string) => string
}

export function createSyncConflictActions(context: CreateSyncConflictActionsContext) {
  function showActionNotice(message: string) {
    context.setActionNotice({ id: context.createClientId(), message })
  }

  async function refreshQueuedSyncConflicts() {
    const nextConflicts = await listQueuedSyncConflicts()
    context.setSyncConflicts(nextConflicts)
    if (nextConflicts.length === 0) {
      context.setSyncConflictsOpen(false)
    }
    return nextConflicts
  }

  async function retrySyncConflict(id: string) {
    await retryQueuedSyncConflict(id)
    await refreshQueuedSyncConflicts()
    showActionNotice('Queued conflict retry')
  }

  async function discardSyncConflict(id: string) {
    await discardQueuedSyncConflict(id)
    await refreshQueuedSyncConflicts()
    showActionNotice('Discarded offline conflict')
  }

  async function retryAllSyncConflicts() {
    const conflicts = await listQueuedSyncConflicts()
    for (const conflict of conflicts) {
      await retryQueuedSyncConflict(conflict.id)
    }
    await refreshQueuedSyncConflicts()
    showActionNotice(`Queued ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} for retry`)
  }

  async function discardAllSyncConflicts() {
    const conflicts = await listQueuedSyncConflicts()
    for (const conflict of conflicts) {
      await discardQueuedSyncConflict(conflict.id)
    }
    await refreshQueuedSyncConflicts()
    showActionNotice(`Discarded ${conflicts.length} offline conflict${conflicts.length === 1 ? '' : 's'}`)
  }

  async function openSyncConflictTarget(id: string) {
    const conflict = context.syncConflicts.find((entry) => entry.id === id)
    if (!conflict) {
      return
    }
    const operation = conflict.queued_operation.operation
    switch (operation.kind) {
      case 'create_note':
        context.setSelectedFolderPath(context.normalizeFolderPath(operation.folder || 'Inbox'))
        await context.navigate('/notes')
        return
      case 'update_note_document':
      case 'delete_note': {
        const note = context.notesRef.current.find((entry) => entry.id === operation.id)
        if (note) {
          context.setSelectedFolderPath(context.normalizeFolderPath(note.folder || 'Inbox'))
          context.setSelectedNoteId(note.id)
        }
        await context.navigate('/notes')
        return
      }
      case 'create_diagram':
        await context.navigate('/diagrams')
        return
      case 'update_diagram':
        context.setSelectedDiagramId(operation.id)
        await context.navigate('/diagrams')
        return
      case 'create_task':
        context.setSelectedTaskId(operation.client_generated_id)
        await context.navigate('/tasks')
        return
      case 'update_task':
      case 'delete_task':
        context.setSelectedTaskId(operation.id)
        await context.navigate('/tasks')
        return
      case 'create_local_calendar':
        await context.navigate('/calendar')
        return
      case 'rename_calendar':
      case 'delete_calendar':
        context.setSelectedCalendarConnectionIds([operation.id])
        await context.navigate('/calendar')
        return
      case 'create_calendar_event':
      case 'update_calendar_event':
      case 'delete_calendar_event':
        context.setSelectedCalendarConnectionIds([operation.connection_id])
        await context.navigate('/calendar')
        return
      case 'create_message':
      case 'toggle_message_reaction':
        context.chooseRoom(operation.room_id)
        await context.navigate('/coms')
        return
      case 'create_managed_folder':
        context.setSelectedFilePath(operation.path)
        context.setActiveFilePath(operation.path)
        await context.navigate('/files')
        return
      case 'move_managed_path':
        context.setSelectedFilePath(operation.source_path)
        context.setActiveFilePath(operation.source_path)
        await context.navigate('/files')
        return
      case 'rename_managed_path':
      case 'delete_managed_path':
        context.setSelectedFilePath(operation.path)
        context.setActiveFilePath(operation.path)
        await context.navigate('/files')
        return
    }
  }

  return {
    showActionNotice,
    refreshQueuedSyncConflicts,
    retrySyncConflict,
    discardSyncConflict,
    retryAllSyncConflicts,
    discardAllSyncConflicts,
    openSyncConflictTarget,
  }
}
