import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { api } from './api'
import type { RoutePath, NoteEditorMode } from './app-config'
import type { FileNode, Note, RealtimeEvent } from './types'

export type NotePresenceEntry = {
  user: string
  seenAt: number
}

type PersistedNoteState = Record<string, { title: string; folder: string; markdown: string }>

type CreateNoteActionsContext = {
  noteEditorMode: NoteEditorMode
  noteEditorRef: RefObject<HTMLDivElement | null>
  noteDraftRef: MutableRefObject<string>
  selectedNoteRef: MutableRefObject<Note | null>
  selectedNoteIdRef: MutableRefObject<string | null>
  selectedFolderPathRef: MutableRefObject<string>
  notesRef: MutableRefObject<Note[]>
  persistedNoteStateRef: MutableRefObject<PersistedNoteState>
  locallyDirtyNoteIdsRef: MutableRefObject<Set<string>>
  noteSavePromiseRef: MutableRefObject<Promise<boolean> | null>
  noteDraftBroadcastTimeoutRef: MutableRefObject<number | null>
  noteLiveSaveTimeoutRef: MutableRefObject<number | null>
  pendingLiveSaveNoteIdRef: MutableRefObject<string | null>
  socketRef: MutableRefObject<WebSocket | null>
  clientIdRef: MutableRefObject<string>
  notePresenceLabel: string
  noteSaveState: 'idle' | 'saving'
  route: RoutePath
  notes: Note[]
  selectedFolderPath: string
  setNoteDirtyVersion: Dispatch<SetStateAction<number>>
  setNotePresence: Dispatch<SetStateAction<Record<string, NotePresenceEntry[]>>>
  setNoteSaveState: Dispatch<SetStateAction<'idle' | 'saving'>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setNoteDraft: Dispatch<SetStateAction<string>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  setStatus: Dispatch<SetStateAction<string>>
  setRoute: Dispatch<SetStateAction<RoutePath>>
  createNoteRecord: (title: string, folder?: string, markdown?: string) => Promise<Note>
  updateNoteRecord: (
    note: Note,
    payload: { markdown: string; folder: string },
    options?: { keepalive?: boolean },
  ) => Promise<Note>
  refreshFilesTree: () => Promise<void>
  showActionNotice: (message: string) => void
  normalizeFolderPath: (path: string) => string
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  defaultNoteTitle: () => string
  noteIdFromPath: (path: string) => string | null
  noteTitleFromPath: (path: string) => string
  importedFolderForPath: (path: string) => string
  editableHtmlToMarkdown: (element: HTMLDivElement) => string
  displayNameForFileNode: (node: FileNode) => string
}

export function createNoteActions(context: CreateNoteActionsContext) {
  function currentNoteMarkdown() {
    if (context.noteEditorMode === 'rich' && context.noteEditorRef.current) {
      return context.editableHtmlToMarkdown(context.noteEditorRef.current)
    }
    return context.noteDraftRef.current
  }

  function markNoteLocallyDirty(noteId: string | null | undefined) {
    if (!noteId) return
    if (context.locallyDirtyNoteIdsRef.current.has(noteId)) return
    context.locallyDirtyNoteIdsRef.current.add(noteId)
    context.setNoteDirtyVersion((version) => version + 1)
  }

  function clearNoteLocallyDirty(noteId: string | null | undefined) {
    if (!noteId || !context.locallyDirtyNoteIdsRef.current.delete(noteId)) return
    context.setNoteDirtyVersion((version) => version + 1)
  }

  function rememberPersistedNotes(nextNotes: Note[]) {
    context.persistedNoteStateRef.current = Object.fromEntries(
      nextNotes.map((note) => [
        note.id,
        {
          title: note.title,
          folder: note.folder,
          markdown: note.markdown,
        },
      ]),
    )
  }

  function currentNoteIsDirty() {
    const note = context.selectedNoteRef.current
    if (!note) return false
    if (!context.locallyDirtyNoteIdsRef.current.has(note.id)) return false
    const persisted = context.persistedNoteStateRef.current[note.id]
    if (!persisted) return currentNoteMarkdown() !== note.markdown
    return (
      note.title !== persisted.title ||
      (context.selectedFolderPathRef.current || note.folder) !== persisted.folder ||
      currentNoteMarkdown() !== persisted.markdown
    )
  }

  function noteHasPendingPersistence() {
    return context.noteSaveState === 'saving' || currentNoteIsDirty()
  }

  function registerPresence(noteId: string, user: string) {
    if (!user) return
    const seenAt = Date.now()
    context.setNotePresence((current) => {
      const existing = current[noteId] ?? []
      const next = [{ user, seenAt }, ...existing.filter((entry) => entry.user !== user)].filter(
        (entry) => seenAt - entry.seenAt < 20_000,
      )
      return { ...current, [noteId]: next }
    })
  }

  function prunePresence() {
    const now = Date.now()
    context.setNotePresence((current) =>
      Object.fromEntries(
        Object.entries(current).map(([noteId, entries]) => [
          noteId,
          entries.filter((entry) => now - entry.seenAt < 20_000),
        ]),
      ),
    )
  }

  function broadcastPresence() {
    if (
      !context.selectedNoteIdRef.current ||
      !context.socketRef.current ||
      context.socketRef.current.readyState !== WebSocket.OPEN
    ) {
      return
    }
    const event: RealtimeEvent = {
      type: 'note_presence',
      note_id: context.selectedNoteIdRef.current,
      user: context.notePresenceLabel,
    }
    context.socketRef.current.send(JSON.stringify(event))
    registerPresence(context.selectedNoteIdRef.current, context.notePresenceLabel)
  }

  function broadcastNoteCursor(offset: number | null) {
    if (
      !context.selectedNoteIdRef.current ||
      !context.socketRef.current ||
      context.socketRef.current.readyState !== WebSocket.OPEN
    ) {
      return
    }
    const event: RealtimeEvent = {
      type: 'note_cursor',
      note_id: context.selectedNoteIdRef.current,
      user: context.notePresenceLabel,
      client_id: context.clientIdRef.current,
      offset,
    }
    context.socketRef.current.send(JSON.stringify(event))
  }

  function broadcastNoteDraft(markdown: string) {
    const note = context.selectedNoteRef.current
    if (!note || !context.socketRef.current || context.socketRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    const event: RealtimeEvent = {
      type: 'note_draft',
      note_id: note.id,
      title: note.title,
      folder: context.selectedFolderPathRef.current || note.folder,
      markdown,
      revision: note.revision,
      client_id: context.clientIdRef.current,
      user: context.notePresenceLabel,
    }
    context.socketRef.current.send(JSON.stringify(event))
  }

  function flushLiveSaveForNote(noteId: string | null | undefined) {
    if (!noteId) return
    const targetNote =
      (context.selectedNoteRef.current?.id === noteId ? context.selectedNoteRef.current : null) ??
      context.notesRef.current.find((note) => note.id === noteId) ??
      null
    if (!targetNote) return
    if (context.noteSavePromiseRef.current) {
      context.pendingLiveSaveNoteIdRef.current = noteId
      return
    }
    void saveNote({
      note: targetNote,
      markdown: noteId === context.selectedNoteIdRef.current ? currentNoteMarkdown() : targetNote.markdown,
      quiet: true,
      notify: false,
      retryCount: 0,
    })
  }

  function scheduleLiveNoteSave(noteId: string | null | undefined) {
    if (!noteId) return
    if (context.noteLiveSaveTimeoutRef.current) {
      window.clearTimeout(context.noteLiveSaveTimeoutRef.current)
    }
    context.noteLiveSaveTimeoutRef.current = window.setTimeout(() => {
      context.noteLiveSaveTimeoutRef.current = null
      flushLiveSaveForNote(noteId)
    }, 700)
  }

  function scheduleNoteDraftBroadcast(markdown: string) {
    const noteId = context.selectedNoteRef.current?.id
    markNoteLocallyDirty(noteId)
    if (context.noteDraftBroadcastTimeoutRef.current) {
      window.clearTimeout(context.noteDraftBroadcastTimeoutRef.current)
    }
    context.noteDraftBroadcastTimeoutRef.current = window.setTimeout(() => {
      context.noteDraftBroadcastTimeoutRef.current = null
      broadcastNoteDraft(markdown)
    }, 180)
    scheduleLiveNoteSave(noteId)
  }

  async function createNote() {
    const note = await context.createNoteRecord(context.defaultNoteTitle(), context.selectedFolderPath || 'Inbox')
    context.setNotes((current) => [note, ...current])
    context.setSelectedNoteId(note.id)
    context.setSelectedFolderPath(context.normalizeFolderPath(note.folder))
    context.setCustomFolders((current) => context.mergeFolderPaths(current, [note.folder || 'Inbox']))
    await context.refreshFilesTree()
  }

  async function saveNote(options?: {
    note?: Note
    markdown?: string
    quiet?: boolean
    keepalive?: boolean
    notify?: boolean
    retryCount?: number
  }) {
    if (context.noteSavePromiseRef.current) {
      if (options?.note?.id) {
        context.pendingLiveSaveNoteIdRef.current = options.note.id
      }
      return context.noteSavePromiseRef.current
    }

    const targetNote = options?.note ?? context.selectedNoteRef.current
    if (!targetNote) return false
    if (!context.locallyDirtyNoteIdsRef.current.has(targetNote.id)) return true

    const markdown = options?.markdown ?? currentNoteMarkdown()
    const targetFolder =
      targetNote.id === context.selectedNoteIdRef.current
        ? context.selectedFolderPathRef.current || targetNote.folder
        : targetNote.folder
    const persisted = context.persistedNoteStateRef.current[targetNote.id]
    if (
      persisted &&
      targetNote.title === persisted.title &&
      targetFolder === persisted.folder &&
      markdown === persisted.markdown
    ) {
      return true
    }

    const task = (async () => {
      context.setNoteSaveState('saving')
      try {
        const updated = await context.updateNoteRecord(
          {
            ...targetNote,
            markdown,
            folder: targetFolder,
          },
          { markdown, folder: targetFolder },
          { keepalive: options?.keepalive },
        )
        context.setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)))
        context.persistedNoteStateRef.current[updated.id] = {
          title: updated.title,
          folder: updated.folder,
          markdown: updated.markdown,
        }
        clearNoteLocallyDirty(updated.id)
        if (updated.id === context.selectedNoteIdRef.current) {
          context.setNoteDraft(updated.markdown)
        }
        context.setCustomFolders((current) => context.mergeFolderPaths(current, [updated.folder || 'Inbox']))
        await context.refreshFilesTree()
        if (options?.notify !== false && !options?.quiet) {
          context.showActionNotice(`Saved note: ${updated.title}`)
        }
        return true
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes('revision mismatch') &&
          (options?.retryCount ?? 0) < 1
        ) {
          const latestNotes = await api.listNotes()
          const latest = latestNotes.find((note) => note.id === targetNote.id) ?? null
          rememberPersistedNotes(latestNotes)
          context.setNotes(latestNotes)
          context.setCustomFolders((current) =>
            context.mergeFolderPaths(
              current,
              latestNotes.map((note) => note.folder || 'Inbox'),
            ),
          )
          if (latest) {
            const localNote =
              (targetNote.id === context.selectedNoteIdRef.current ? context.selectedNoteRef.current : null) ??
              context.notesRef.current.find((note) => note.id === targetNote.id) ??
              targetNote
            const rebased = await api.updateNote(
              {
                ...latest,
                title: localNote.title,
                folder:
                  targetNote.id === context.selectedNoteIdRef.current
                    ? context.selectedFolderPathRef.current || localNote.folder
                    : localNote.folder,
                markdown,
              },
              { keepalive: options?.keepalive },
            )
            context.setNotes((current) => current.map((note) => (note.id === rebased.id ? rebased : note)))
            context.persistedNoteStateRef.current[rebased.id] = {
              title: rebased.title,
              folder: rebased.folder,
              markdown: rebased.markdown,
            }
            clearNoteLocallyDirty(rebased.id)
            if (rebased.id === context.selectedNoteIdRef.current) {
              context.setNoteDraft(rebased.markdown)
            }
            await context.refreshFilesTree()
            if (options?.notify !== false && !options?.quiet) {
              context.showActionNotice(`Saved note: ${rebased.title}`)
            }
            return true
          }
          if (targetNote.id === context.selectedNoteIdRef.current) {
            context.setNoteDraft(markdown)
          }
          return false
        }
        throw error
      } finally {
        context.setNoteSaveState('idle')
        context.noteSavePromiseRef.current = null
        const pendingNoteId = context.pendingLiveSaveNoteIdRef.current
        context.pendingLiveSaveNoteIdRef.current = null
        if (pendingNoteId && context.locallyDirtyNoteIdsRef.current.has(pendingNoteId)) {
          window.setTimeout(() => flushLiveSaveForNote(pendingNoteId), 0)
        }
      }
    })()

    context.noteSavePromiseRef.current = task
    return task
  }

  async function autosaveCurrentNoteBeforeSwitch() {
    const currentNote = context.selectedNoteRef.current
    if (!currentNote || !currentNoteIsDirty()) return true
    return saveNote({ note: currentNote, markdown: currentNoteMarkdown(), quiet: true })
  }

  async function openNoteInNotes(note: Note) {
    try {
      if (context.selectedNoteRef.current?.id === note.id) {
        context.setSelectedFolderPath(context.normalizeFolderPath(note.folder || 'Inbox'))
        return
      }
      const autosaved = await autosaveCurrentNoteBeforeSwitch()
      if (!autosaved) return
      const folderPath = context.normalizeFolderPath(note.folder || 'Inbox')
      context.setSelectedFolderPath(folderPath)
      context.setSelectedNoteId(note.id)
      context.setCustomFolders((current) => context.mergeFolderPaths(current, [note.folder || 'Inbox']))
      if (context.route !== '/notes') {
        window.history.pushState({}, '', '/notes')
        context.setRoute('/notes')
      }
    } catch (error) {
      context.showActionNotice(error instanceof Error ? error.message : 'Could not switch notes')
    }
  }

  async function openMarkdownInNotes(node: FileNode) {
    if (node.path.startsWith('notes/')) {
      const noteId = context.noteIdFromPath(node.path)
      const existing = noteId ? context.notes.find((note) => note.id === noteId) : null
      if (existing) {
        await openNoteInNotes(existing)
        return
      }
      throw new Error('This managed note file is stale. Refresh the workspace to reload the current notes tree.')
    }

    const markdown = await api.fileText(node.path)
    const imported = await context.createNoteRecord(
      context.noteTitleFromPath(node.path),
      context.importedFolderForPath(node.path),
      markdown,
    )
    context.setNotes((current) => [imported, ...current])
    context.setCustomFolders((current) => context.mergeFolderPaths(current, [imported.folder || 'Inbox']))
    await context.refreshFilesTree()
    await openNoteInNotes(imported)
    context.setStatus(`Opened ${context.displayNameForFileNode(node)} in Notes`)
  }

  return {
    currentNoteMarkdown,
    markNoteLocallyDirty,
    clearNoteLocallyDirty,
    rememberPersistedNotes,
    currentNoteIsDirty,
    noteHasPendingPersistence,
    registerPresence,
    prunePresence,
    broadcastPresence,
    broadcastNoteCursor,
    scheduleNoteDraftBroadcast,
    flushLiveSaveForNote,
    scheduleLiveNoteSave,
    createNote,
    saveNote,
    autosaveCurrentNoteBeforeSwitch,
    openNoteInNotes,
    openMarkdownInNotes,
  }
}
