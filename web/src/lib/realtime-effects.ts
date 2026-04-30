import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import TurndownService from 'turndown'
import { api } from './api'
import { createMarkdownBinding, encodeStableTextCursor } from './loro-note'
import { getConnectivityState } from './platform'
import { applyRemoteNoteCursor, pruneRemoteNoteCursors } from './notes-runtime'
import { getCaretOffsetInContentEditable } from './ui-helpers'
import type { NoteEditorMode, RoutePath } from './app-config'
import type { Note, RealtimeEvent, RtcConfig, SessionResponse } from './types'
import type { NotePresenceEntry } from './note-actions'
import type { SignalPayload } from './rtc-actions'

type RemoteNoteCursor = {
  clientId: string
  user: string
  offset: number
  seenAt: number
  color: string
}

type UseRealtimeEffectsContext = {
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  session: SessionResponse | null
  route: RoutePath
  selectedRoomId: string | null
  selectedNoteId: string | null
  noteEditorMode: NoteEditorMode
  socketRef: MutableRefObject<WebSocket | null>
  clientIdRef: MutableRefObject<string>
  routeRef: MutableRefObject<RoutePath>
  sessionUserIdRef: MutableRefObject<string | null>
  selectedRoomIdRef: MutableRefObject<string | null>
  selectedNoteIdRef: MutableRefObject<string | null>
  selectedNoteRef: MutableRefObject<Note | null>
  noteEditorRef: RefObject<HTMLDivElement | null>
  noteEditorModeRef: MutableRefObject<NoteEditorMode>
  noteSessionIdRef: MutableRefObject<string | null>
  activeCallRoomIdRef: MutableRefObject<string | null>
  notesRef: MutableRefObject<Note[]>
  persistedNoteStateRef: MutableRefObject<Record<string, { title: string; folder: string; markdown: string }>>
  realtimeDraftBaseRef: MutableRefObject<Record<string, string>>
  locallyDirtyNoteIdsRef: MutableRefObject<Set<string>>
  peerConnectionsRef: MutableRefObject<Map<string, RTCPeerConnection>>
  rtcConfigRef: MutableRefObject<RtcConfig | null>
  activeCallRoomId: string | null
  currentNoteIsDirty: () => boolean
  currentNoteMarkdown: () => string
  rebaseDirtySelectedNote: (authoritativeNote: Note, currentSelected: Note, localMarkdown: string) => { note: Note; hadConflict: boolean }
  applySelectedNoteMarkdown: (markdown: string, options?: { note?: Note | null }) => void
  clearNoteLocallyDirty: (noteId: string) => void
  registerPresence: (noteId: string, user: string) => void
  prunePresence: () => void
  broadcastPresence: () => void
  broadcastNoteCursor: (cursor: { offset: number | null; cursorB64?: string | null }) => void
  refreshRooms: () => Promise<unknown>
  handleSignal: (from: string, payload: SignalPayload) => Promise<void>
  setStatus: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<any[]>>
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>
  setNotePresence: Dispatch<SetStateAction<Record<string, NotePresenceEntry[]>>>
  setNoteCursors: Dispatch<SetStateAction<Record<string, RemoteNoteCursor[]>>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
}

function getMarkdownOffsetFromSelection(root: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.endContainer)) return null
  const prefixRange = document.createRange()
  prefixRange.setStart(root, 0)
  prefixRange.setEnd(range.endContainer, range.endOffset)
  const container = document.createElement('div')
  container.appendChild(prefixRange.cloneContents())
  const turndown = new TurndownService()
  return turndown.turndown(container.innerHTML).length
}

export function useRealtimeEffects(context: UseRealtimeEffectsContext) {
  useEffect(() => {
    if (context.authMode !== 'ready') return

    let cancelled = false
    let socket: WebSocket | null = null

    async function connectRealtime() {
      try {
        const socketUrl = await api.realtimeUrl('/ws/realtime')
        if (cancelled) return

        socket = new WebSocket(socketUrl)
        context.socketRef.current = socket

        socket.onopen = () => {
          context.setStatus((current) => (current === 'Workspace ready' ? current : 'Realtime connected'))
          context.broadcastPresence()
        }

        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data) as RealtimeEvent
          if (payload.type === 'chat_rooms_updated') {
            void context.refreshRooms()
          }
          if (payload.type === 'chat_message') {
            void context.refreshRooms()
            const isOwnMessage = payload.author_id === context.sessionUserIdRef.current
            const isVisibleRoom = context.routeRef.current === '/coms' && payload.room_id === context.selectedRoomIdRef.current
            if (!isOwnMessage && !isVisibleRoom) {
              context.setRoomUnreadCounts((current) => ({
                ...current,
                [payload.room_id]: (current[payload.room_id] ?? 0) + 1,
              }))
            }
            if (payload.room_id === context.selectedRoomIdRef.current) {
              void api.listMessages(payload.room_id).then(context.setMessages)
            }
          }
          if (payload.type === 'chat_message_reactions_updated') {
            if (payload.room_id === context.selectedRoomIdRef.current) {
              void api.listMessages(payload.room_id).then(context.setMessages)
            }
          }
          if (payload.type === 'note_document_update') {
            if (payload.client_id === context.clientIdRef.current) return
            const currentSelected = context.selectedNoteRef.current
            const currentNote =
              context.notesRef.current.find((note) => note.id === payload.note_id) ??
              (currentSelected?.id === payload.note_id ? currentSelected : null)
            if (!currentNote) return
            void api.pullNoteDocument(payload.note_id).then((response) => {
              const authoritativeNote: Note = {
                ...currentNote,
                ...response.note,
                visibility: response.note.visibility ?? currentNote.visibility,
              }
              context.setNotes((current) =>
                current.map((note) => (note.id === payload.note_id ? authoritativeNote : note)),
              )
              if (payload.note_id === context.selectedNoteIdRef.current) {
                context.applySelectedNoteMarkdown(authoritativeNote.markdown, {
                  note: authoritativeNote,
                })
                context.setSelectedFolderPath(authoritativeNote.folder || 'Inbox')
              }
            }).catch((error) => {
              console.error(error)
            })
          }
          if (payload.type === 'note_presence') {
            context.registerPresence(payload.note_id, payload.user)
          }
          if (payload.type === 'note_cursor') {
            if (payload.client_id === context.clientIdRef.current) return
            context.setNoteCursors((current) => applyRemoteNoteCursor(current, payload))
          }
          if (payload.type === 'signal' && payload.room_id === context.activeCallRoomIdRef.current) {
            void context.handleSignal(payload.from, payload.payload as SignalPayload)
          }
        }

        socket.onclose = () => {
          if (!cancelled) {
            context.setStatus('Realtime disconnected')
          }
        }
      } catch (error) {
        if (!cancelled && error instanceof Error && error.message !== 'Server not configured') {
          context.setStatus(error.message)
        }
      }
    }

    void connectRealtime()

    return () => {
      cancelled = true
      socket?.close()
      if (context.socketRef.current === socket) {
        context.socketRef.current = null
      }
    }
  }, [context])

  useEffect(() => {
    if (!context.selectedNoteId || !context.session) {
      return
    }
    context.broadcastPresence()
    const interval = window.setInterval(() => {
      context.broadcastPresence()
      context.prunePresence()
      context.setNoteCursors((current) => pruneRemoteNoteCursors(current))
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [context])

  useEffect(() => {
    if (context.authMode !== 'ready' || !context.session || !context.selectedNoteId) {
      return
    }

    let cancelled = false

    async function reconcileSelectedNote() {
      const currentSession = context.session
      const currentSelected = context.selectedNoteRef.current
      if (!currentSession || !currentSelected || currentSelected.id !== context.selectedNoteId || !getConnectivityState()) {
        return
      }

      try {
        const response = await api.pullNoteDocument(context.selectedNoteId)
        if (cancelled || response.note.revision <= currentSelected.revision) {
          return
        }
        const authoritativeNote: Note = {
          ...currentSelected,
          ...response.note,
          visibility: response.note.visibility ?? currentSelected.visibility,
        }
        context.setNotes((current) =>
          current.map((note) => (note.id === context.selectedNoteId ? authoritativeNote : note)),
        )
        context.applySelectedNoteMarkdown(authoritativeNote.markdown, {
          note: authoritativeNote,
        })
        context.setSelectedFolderPath(authoritativeNote.folder || 'Inbox')
      } catch (error) {
        if (!cancelled) {
          console.error(error)
        }
      }
    }

    void reconcileSelectedNote()
    const interval = window.setInterval(() => {
      void reconcileSelectedNote()
    }, 4000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [context])

  useEffect(() => {
    if (context.route !== '/notes' || context.noteEditorMode !== 'rich' || !context.selectedNoteId) return

    const publishCursor = () => {
      const editor = context.noteEditorRef.current
      if (!editor) return
      const activeElement = document.activeElement as HTMLElement | null
      const editorFocused = activeElement === editor || !!activeElement?.closest('.markdown-editor')
      if (!editorFocused) {
        context.broadcastNoteCursor({ offset: null, cursorB64: null })
        return
      }
      const offset = getMarkdownOffsetFromSelection(editor) ?? getCaretOffsetInContentEditable(editor)
      const markdown = context.currentNoteMarkdown()
      const binding = createMarkdownBinding(
        context.selectedNoteRef.current?.loro_snapshot_b64,
        markdown,
        context.selectedNoteRef.current?.loro_updates_b64,
      )
      const cursorB64 = offset === null ? null : encodeStableTextCursor(binding, offset)
      context.broadcastNoteCursor({ offset, cursorB64 })
    }

    const handleSelectionChange = () => publishCursor()
    const handleBlur = () => window.setTimeout(() => publishCursor(), 0)

    document.addEventListener('selectionchange', handleSelectionChange)
    context.noteEditorRef.current?.addEventListener('blur', handleBlur, true)
    publishCursor()

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      context.noteEditorRef.current?.removeEventListener('blur', handleBlur, true)
      context.broadcastNoteCursor({ offset: null, cursorB64: null })
    }
  }, [context])
}
