import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { api } from './api'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode, RoutePath } from './app-config'
import type { Note, SessionResponse } from './types'

type UseNoteEditorEffectsContext = {
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  route: RoutePath
  session: SessionResponse | null
  clientId: string
  selectedNoteId: string | null
  selectedNote: Note | null
  notes: Note[]
  selectedFolderPath: string
  noteDraft: string
  noteEditorMode: NoteEditorMode
  noteSaveState: 'idle' | 'saving'
  noteContextMenu: NoteContextMenuState
  noteContextSubmenu: NoteContextSubmenu
  noteContextMenuOpenLeft: boolean
  noteContextSubmenuOpenUp: boolean
  noteSessionIdRef: MutableRefObject<string | null>
  noteDraftBroadcastTimeoutRef: MutableRefObject<number | null>
  noteLiveSaveTimeoutRef: MutableRefObject<number | null>
  pendingLocalDraftRestoreRef: MutableRefObject<{ noteId: string; markdown: string } | null>
  noteContextTableRef: MutableRefObject<HTMLTableElement | null>
  noteContextCellRef: MutableRefObject<HTMLTableCellElement | null>
  noteEditorRef: RefObject<HTMLDivElement | null>
  noteContextMenuRef: RefObject<HTMLDivElement | null>
  setNoteDraft: Dispatch<SetStateAction<string>>
  setNoteTitleModalOpen: Dispatch<SetStateAction<boolean>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setNoteContextMenu: Dispatch<SetStateAction<NoteContextMenuState>>
  setNoteContextSubmenu: Dispatch<SetStateAction<NoteContextSubmenu>>
  setNoteClipboardText: Dispatch<SetStateAction<string>>
  setNoteContextMenuOpenLeft: Dispatch<SetStateAction<boolean>>
  setNoteContextSubmenuOpenUp: Dispatch<SetStateAction<boolean>>
  applySelectedNoteMarkdown: (markdown: string, options?: { note?: Note | null }) => void
  noteHasPendingPersistence: () => boolean
  currentNoteIsDirty: () => boolean
  saveNote: (options?: { quiet?: boolean; keepalive?: boolean }) => Promise<boolean>
}

export function useNoteEditorEffects(context: UseNoteEditorEffectsContext) {
  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session || !context.selectedNoteId) {
      return
    }
    const noteId = context.selectedNoteId

    let cancelled = false
    void api
      .openNoteSession(noteId, context.clientId)
      .then((response) => {
        if (cancelled) return
        context.noteSessionIdRef.current = response.sessions[0]?.session_id ?? null
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error)
        }
      })

    return () => {
      cancelled = true
      const sessionId = context.noteSessionIdRef.current
      context.noteSessionIdRef.current = null
      if (sessionId) {
        void api.closeNoteSession(noteId, sessionId).catch((error) => {
          console.error(error)
        })
      }
    }
  }, [context.authMode, context.clientId, context.selectedNoteId, context.session])

  useEffect(
    () => () => {
      if (context.noteDraftBroadcastTimeoutRef.current) {
        window.clearTimeout(context.noteDraftBroadcastTimeoutRef.current)
      }
      if (context.noteLiveSaveTimeoutRef.current) {
        window.clearTimeout(context.noteLiveSaveTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!context.noteHasPendingPersistence()) return
      if (context.currentNoteIsDirty()) {
        void context.saveNote({ quiet: true, keepalive: true })
      }
      event.preventDefault()
      event.returnValue = ''
    }

    function onPageHide() {
      if (!context.currentNoteIsDirty()) return
      void context.saveNote({ quiet: true, keepalive: true })
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [context.currentNoteIsDirty, context.noteHasPendingPersistence, context.noteSaveState, context.noteEditorMode, context.route, context.saveNote, context.selectedFolderPath])

  useEffect(() => {
    if (context.selectedNote) {
      context.applySelectedNoteMarkdown(context.selectedNote.markdown, {
        note: context.selectedNote,
      })
      return
    }
    context.setNoteDraft('')
  }, [context.selectedNote?.id])

  useEffect(() => {
    if (!context.selectedNoteId) {
      context.setNoteTitleModalOpen(false)
    }
  }, [context.selectedNoteId])

  useEffect(() => {
    if (context.selectedNoteId && !context.notes.some((note) => note.id === context.selectedNoteId)) {
      context.setSelectedNoteId(null)
    }
  }, [context.notes, context.selectedNoteId])

  useEffect(() => {
    context.setNoteContextMenu(null)
    context.setNoteContextSubmenu(null)
    context.setNoteClipboardText('')
    context.setNoteContextMenuOpenLeft(false)
    context.setNoteContextSubmenuOpenUp(false)
    context.noteContextTableRef.current = null
    context.noteContextCellRef.current = null
  }, [context.noteEditorMode, context.selectedNote?.id, context.route])

  useEffect(() => {
    if (!context.noteContextMenu) return

    function closeMenu() {
      context.setNoteContextMenu(null)
      context.setNoteContextSubmenu(null)
    }

    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        context.setNoteContextMenu(null)
        context.setNoteContextSubmenu(null)
      }
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', onWindowKeyDown)
    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  }, [context.noteContextMenu])

  useEffect(() => {
    if (!context.noteContextMenu || !context.noteContextMenuRef.current) return

    const margin = 8
    const submenuWidth = 188 + 8
    const submenuHeight = 320
    const rect = context.noteContextMenuRef.current.getBoundingClientRect()
    const openLeft = rect.right + submenuWidth > window.innerWidth - margin
    const openUp = rect.top + submenuHeight > window.innerHeight - margin
    const clampedX = Math.max(
      margin,
      Math.min(
        context.noteContextMenu.x,
        window.innerWidth - margin - rect.width - (openLeft ? 0 : submenuWidth),
      ),
    )
    const clampedY = Math.max(margin, Math.min(context.noteContextMenu.y, window.innerHeight - margin - rect.height))

    if (openLeft !== context.noteContextMenuOpenLeft) {
      context.setNoteContextMenuOpenLeft(openLeft)
    }
    if (openUp !== context.noteContextSubmenuOpenUp) {
      context.setNoteContextSubmenuOpenUp(openUp)
    }
    if (clampedX !== context.noteContextMenu.x || clampedY !== context.noteContextMenu.y) {
      context.setNoteContextMenu({ ...context.noteContextMenu, x: clampedX, y: clampedY })
    }
  }, [context.noteContextMenu, context.noteContextSubmenu, context.noteContextMenuOpenLeft, context.noteContextSubmenuOpenUp])
}
