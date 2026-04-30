import { mergeConcurrentMarkdown, normalizeFolderPath } from './ui-helpers'

export function useSelectedEntityRuntime(context: any) {
  const selectedNote = context.notes.find((note: any) => note.id === context.selectedNoteId) ?? null
  const selectedNoteFolderPath = selectedNote ? normalizeFolderPath(selectedNote.folder || 'Inbox') : null
  const selectedDiagram = context.diagrams.find((diagram: any) => diagram.id === context.selectedDiagramId) ?? null
  const standaloneDrawio = context.route === '/diagrams' && new URLSearchParams(context.locationSearch).get('drawio') === '1'
  const standaloneDrawioDiagramId = standaloneDrawio ? new URLSearchParams(context.locationSearch).get('diagram') : null
  const selectedRoom = context.rooms.find((room: any) => room.id === context.selectedRoomId) ?? null
  const activeCallRoom = context.rooms.find((room: any) => room.id === context.activeCallRoomId) ?? null
  const selectedVoiceMemo = context.memos.find((memo: any) => memo.id === context.selectedVoiceMemoId) ?? null

  function applySelectedNoteMarkdown(markdown: string, options?: { note?: any }) {
    const note = options?.note ?? context.selectedNoteRef.current
    context.setNoteDraft(markdown)
    if (note && note.id === context.selectedNoteIdRef.current) {
      const existingNote = context.notesRef.current.find((entry: any) => entry.id === note.id) ?? null
      const nextNote = {
        ...note,
        markdown,
      }
      context.selectedNoteRef.current = nextNote
      context.notesRef.current = context.notesRef.current.map((entry: any) => (entry.id === nextNote.id ? nextNote : entry))
      const shouldRefreshNoteCollection =
        !existingNote ||
        existingNote.title !== nextNote.title ||
        existingNote.folder !== nextNote.folder ||
        existingNote.revision !== nextNote.revision ||
        existingNote.updated_at !== nextNote.updated_at ||
        existingNote.visibility !== nextNote.visibility ||
        existingNote.conflict_tag !== nextNote.conflict_tag ||
        existingNote.forked_from_note_id !== nextNote.forked_from_note_id
      if (shouldRefreshNoteCollection) {
        context.setNotes((current: any[]) => current.map((entry) => (entry.id === nextNote.id ? nextNote : entry)))
      }
    }
  }

  function rebaseDirtySelectedNote(authoritativeNote: any, currentSelected: any, localMarkdown: string) {
    const localFolder = context.selectedFolderPathRef.current || currentSelected.folder
    const localNote = {
      ...currentSelected,
      title: currentSelected.title,
      folder: localFolder,
      markdown: localMarkdown,
    }
    const persisted = context.persistedNoteStateRef.current[authoritativeNote.id]
    const baseMarkdown = persisted?.markdown ?? authoritativeNote.markdown
    const baseNote = {
      ...authoritativeNote,
      title: persisted?.title ?? authoritativeNote.title,
      folder: persisted?.folder ?? authoritativeNote.folder,
      markdown: baseMarkdown,
    }
    if (baseNote.markdown === localMarkdown && baseNote.folder === localNote.folder && baseNote.title === localNote.title) {
      return {
        note: {
          ...authoritativeNote,
          title: localNote.title,
          folder: localNote.folder,
        },
        hadConflict: false,
      }
    }

    const merged = mergeConcurrentMarkdown(baseNote.markdown, localMarkdown, authoritativeNote.markdown)
    return {
      note: {
        ...authoritativeNote,
        title: localNote.title,
        folder: localNote.folder,
        markdown: merged.markdown,
      },
      hadConflict: merged.hadConflict,
    }
  }

  return {
    selectedNote,
    selectedNoteFolderPath,
    selectedDiagram,
    standaloneDrawio,
    standaloneDrawioDiagramId,
    selectedRoom,
    activeCallRoom,
    selectedVoiceMemo,
    applySelectedNoteMarkdown,
    rebaseDirtySelectedNote,
  }
}
