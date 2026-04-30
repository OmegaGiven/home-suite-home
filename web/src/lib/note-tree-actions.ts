import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { beginTreeDrag, draggedPathsFromEvent } from './app-shell'
import type { Note } from './types'
import { normalizeFolderPath } from './ui-helpers'

type CreateNoteTreeActionsContext = {
  markedNotePaths: string[]
  draggingNoteTreePath: string | null
  notesRef: MutableRefObject<Note[]>
  selectedNoteIdRef: MutableRefObject<string | null>
  selectedNoteRef: MutableRefObject<Note | null>
  selectedFolderPathRef: MutableRefObject<string>
  persistedNoteStateRef: MutableRefObject<Record<string, { title: string; folder: string; markdown: string }>>
  locallyDirtyNoteIdsRef: MutableRefObject<Set<string>>
  currentNoteMarkdown: () => string
  updateNoteLocalFirst: (note: Note, changes: { folder: string; markdown: string }) => Promise<Note>
  refreshFilesTree: () => Promise<void>
  showActionNotice: (message: string) => void
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  setDraggingNoteTreePath: Dispatch<SetStateAction<string | null>>
  setNoteTreeDropTargetPath: Dispatch<SetStateAction<string | null>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  applySelectedNoteMarkdown: (markdown: string, options?: { note?: Note | null }) => void
}

export function createNoteTreeActions(context: CreateNoteTreeActionsContext) {
  function beginNoteTreeDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (!path.startsWith('note:') && path === 'Inbox') return
    beginTreeDrag(event, path, context.setDraggingNoteTreePath, context.markedNotePaths)
  }

  async function handleNoteTreeDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePaths = draggedPathsFromEvent(event, context.draggingNoteTreePath)
    context.setNoteTreeDropTargetPath(null)
    context.setDraggingNoteTreePath(null)
    if (sourcePaths.length === 0) return

    if (sourcePaths.every((path) => path.startsWith('note:'))) {
      const nextFolder = normalizeFolderPath(destinationDir || 'Inbox')
      const sourceNoteIds = Array.from(new Set(sourcePaths.map((path) => path.slice('note:'.length))))
      const updatedNotes = await Promise.all(
        sourceNoteIds.map(async (noteId) => {
          const note = context.notesRef.current.find((entry) => entry.id === noteId)
          if (!note) return null
          const currentFolder = normalizeFolderPath(note.folder || 'Inbox')
          if (nextFolder === currentFolder) return null
          const markdown = noteId === context.selectedNoteIdRef.current ? context.currentNoteMarkdown() : note.markdown
          const title = noteId === context.selectedNoteIdRef.current ? (context.selectedNoteRef.current?.title ?? note.title) : note.title
          return context.updateNoteLocalFirst({ ...note, title }, { folder: nextFolder, markdown })
        }),
      )
      const movedNotes = updatedNotes.filter((note): note is Note => Boolean(note))
      if (movedNotes.length === 0) return
      const updatedById = new Map(movedNotes.map((note) => [note.id, note]))
      context.setNotes((current) => current.map((entry) => updatedById.get(entry.id) ?? entry))
      for (const updated of movedNotes) {
        context.persistedNoteStateRef.current[updated.id] = {
          title: updated.title,
          folder: updated.folder,
          markdown: updated.markdown,
        }
        context.locallyDirtyNoteIdsRef.current.delete(updated.id)
        if (updated.id === context.selectedNoteIdRef.current) {
          context.setSelectedFolderPath(nextFolder)
          context.applySelectedNoteMarkdown(updated.markdown, { note: updated })
        }
      }
      context.setCustomFolders((current) =>
        context.mergeFolderPaths(
          current,
          movedNotes.flatMap((note) => [context.notesRef.current.find((entry) => entry.id === note.id)?.folder || 'Inbox', note.folder || 'Inbox']),
        ),
      )
      await context.refreshFilesTree()
      context.showActionNotice(
        movedNotes.length === 1 ? `Moved note: ${movedNotes[0].title}` : `Moved ${movedNotes.length} notes`,
      )
      return
    }

    const sourcePath = sourcePaths[0]
    const sourceFolder = normalizeFolderPath(sourcePath)
    const targetFolder = normalizeFolderPath(destinationDir || 'Inbox')
    if (sourceFolder === 'Inbox') return
    if (targetFolder === sourceFolder || targetFolder.startsWith(`${sourceFolder}/`)) return

    const folderName = sourceFolder.split('/').pop() || sourceFolder
    const rebasedRoot = normalizeFolderPath(targetFolder === 'Inbox' ? folderName : `${targetFolder}/${folderName}`)
    if (rebasedRoot === sourceFolder) return

    const rebaseFolderPath = (folderPath: string) => {
      const normalized = normalizeFolderPath(folderPath || 'Inbox')
      if (normalized === sourceFolder) return rebasedRoot
      if (normalized.startsWith(`${sourceFolder}/`)) {
        return normalizeFolderPath(`${rebasedRoot}/${normalized.slice(sourceFolder.length + 1)}`)
      }
      return normalized
    }

    const affectedNotes = context.notesRef.current.filter((note) => {
      const normalized = normalizeFolderPath(note.folder || 'Inbox')
      return normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)
    })
    const updatedNotes = await Promise.all(
      affectedNotes.map(async (note) => {
        const updatedFolder = rebaseFolderPath(note.folder || 'Inbox')
        const markdown = note.id === context.selectedNoteIdRef.current ? context.currentNoteMarkdown() : note.markdown
        const title = note.id === context.selectedNoteIdRef.current ? (context.selectedNoteRef.current?.title ?? note.title) : note.title
        return context.updateNoteLocalFirst({ ...note, title }, { folder: updatedFolder, markdown })
      }),
    )

    const updatedById = new Map(updatedNotes.map((note) => [note.id, note]))
    context.setNotes((current) => current.map((note) => updatedById.get(note.id) ?? note))
    for (const updated of updatedNotes) {
      context.persistedNoteStateRef.current[updated.id] = {
        title: updated.title,
        folder: updated.folder,
        markdown: updated.markdown,
      }
      context.locallyDirtyNoteIdsRef.current.delete(updated.id)
    }

    const selectedNoteId = context.selectedNoteIdRef.current
    if (selectedNoteId) {
      const updatedSelected = updatedById.get(selectedNoteId)
      if (updatedSelected) {
        context.setSelectedFolderPath(normalizeFolderPath(updatedSelected.folder || 'Inbox'))
        context.applySelectedNoteMarkdown(updatedSelected.markdown, { note: updatedSelected })
      } else if (context.selectedFolderPathRef.current === sourceFolder || context.selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)) {
        context.setSelectedFolderPath(rebaseFolderPath(context.selectedFolderPathRef.current))
      }
    }

    context.setCustomFolders((current) =>
      context.mergeFolderPaths(
        current
          .map((folderPath) => {
            const normalized = normalizeFolderPath(folderPath)
            if (normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)) {
              return rebaseFolderPath(normalized)
            }
            return normalized
          })
          .concat(updatedNotes.map((note) => note.folder || 'Inbox')),
        [],
      ),
    )
    await context.refreshFilesTree()
    context.showActionNotice(`Moved folder: ${folderName}`)
  }

  return {
    beginNoteTreeDrag,
    handleNoteTreeDrop,
  }
}
