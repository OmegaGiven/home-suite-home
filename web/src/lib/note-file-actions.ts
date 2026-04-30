import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { api } from './api'
import { getConnectivityState } from './platform'
import { buildVisibleFilesTree, deleteNoteFamily, filterVisibleNotes } from './notes-runtime'
import type { FileNode, Note } from './types'

type CreateNoteFileActionsContext = {
  notesRef: MutableRefObject<Note[]>
  selectedNoteRef: MutableRefObject<Note | null>
  noteSavePromiseRef: MutableRefObject<Promise<boolean> | null>
  noteDraftBroadcastTimeoutRef: MutableRefObject<number | null>
  noteLiveSaveTimeoutRef: MutableRefObject<number | null>
  pendingLiveSaveNoteIdRef: MutableRefObject<string | null>
  locallyDirtyNoteIdsRef: MutableRefObject<Set<string>>
  setFilesTree: Dispatch<SetStateAction<FileNode[]>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  setNotePresence: Dispatch<SetStateAction<Record<string, import('./note-actions').NotePresenceEntry[]>>>
  setNoteCursors: Dispatch<SetStateAction<Record<string, any[]>>>
  clearNoteLocallyDirty: (noteId: string) => void
  applySelectedNoteMarkdown: (markdown: string, options?: { note?: Note | null }) => void
  rememberPersistedNotes: (nextNotes: Note[]) => void
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  normalizeFolderPath: (path: string) => string
  deleteNoteLocalFirst: (note: Note) => Promise<unknown>
  refreshUserDeletedItems: () => Promise<void>
  showActionNotice: (message: string) => void
}

export function createNoteFileActions(context: CreateNoteFileActionsContext) {
  async function refreshFilesTree() {
    if (!getConnectivityState()) return
    const nextTree = await api.listFilesTree()
    context.setFilesTree(buildVisibleFilesTree(nextTree, context.notesRef.current))
  }

  async function syncNotesAndFilesView() {
    if (!getConnectivityState()) return
    const [rawNotes, nextTree] = await Promise.all([api.listNotes(), api.listFilesTree()])
    const nextNotes = filterVisibleNotes(rawNotes)
    context.rememberPersistedNotes(nextNotes)
    context.setNotes(nextNotes)
    context.setFilesTree(buildVisibleFilesTree(nextTree, rawNotes))
    context.setCustomFolders(
      Array.from(new Set(nextNotes.map((note) => context.normalizeFolderPath(note.folder || 'Inbox')))).sort((left, right) =>
        left.localeCompare(right),
      ),
    )
    context.setSelectedNoteId((current) => {
      if (current && nextNotes.some((note) => note.id === current)) {
        return current
      }
      return nextNotes[0]?.id ?? null
    })
    context.setSelectedFolderPath((current) => {
      const currentStillExists = nextNotes.some(
        (note) => context.normalizeFolderPath(note.folder || 'Inbox') === context.normalizeFolderPath(current || 'Inbox'),
      )
      if (currentStillExists) return current
      return context.normalizeFolderPath(nextNotes[0]?.folder || 'Inbox')
    })
  }

  async function deleteSelectedNote() {
    const note = context.selectedNoteRef.current
    if (!note) return

    if (context.noteSavePromiseRef.current) {
      await context.noteSavePromiseRef.current
    }

    if (context.noteDraftBroadcastTimeoutRef.current) {
      window.clearTimeout(context.noteDraftBroadcastTimeoutRef.current)
      context.noteDraftBroadcastTimeoutRef.current = null
    }
    if (context.noteLiveSaveTimeoutRef.current) {
      window.clearTimeout(context.noteLiveSaveTimeoutRef.current)
      context.noteLiveSaveTimeoutRef.current = null
    }
    context.pendingLiveSaveNoteIdRef.current = null

    await context.deleteNoteLocalFirst(note)

    context.locallyDirtyNoteIdsRef.current.delete(note.id)
    context.clearNoteLocallyDirty(note.id)
    context.setNotePresence((current) => {
      const next = { ...current }
      delete next[note.id]
      return next
    })
    context.setNoteCursors((current) => {
      const next = { ...current }
      delete next[note.id]
      return next
    })

    const nextNotes = getConnectivityState()
      ? filterVisibleNotes(await api.listNotes())
      : deleteNoteFamily(context.notesRef.current, note.id)
    context.rememberPersistedNotes(nextNotes)
    context.setNotes(nextNotes)
    context.setCustomFolders((current) =>
      context.mergeFolderPaths(
        current,
        nextNotes.map((entry) => entry.folder || 'Inbox'),
      ),
    )

    const nextSelected =
      nextNotes.find((entry) => context.normalizeFolderPath(entry.folder || 'Inbox') === context.normalizeFolderPath(note.folder || 'Inbox')) ??
      nextNotes[0] ??
      null

    context.setSelectedNoteId(nextSelected?.id ?? null)
    context.setSelectedFolderPath(context.normalizeFolderPath(nextSelected?.folder || note.folder || 'Inbox'))
    if (nextSelected) {
      context.applySelectedNoteMarkdown(nextSelected.markdown, { note: nextSelected })
    } else {
      context.applySelectedNoteMarkdown('', { note: null })
    }
    await refreshFilesTree()
    await context.refreshUserDeletedItems()
    context.showActionNotice(`Deleted note: ${note.title || 'Untitled note'}`)
  }

  return {
    refreshFilesTree,
    syncNotesAndFilesView,
    deleteSelectedNote,
  }
}
