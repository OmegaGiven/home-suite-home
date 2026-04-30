import { useRef, useState } from 'react'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode } from './app-config'
import { demoMarkdown } from './app-config'
import type { Note } from './types'

type RemoteNoteCursor = {
  clientId: string
  user: string
  offset: number
  cursorB64?: string | null
  seenAt: number
  color: string
}

type NotePresenceEntry = {
  user: string
  seenAt: number
}

export function useNoteUiState(initialFolderPath: string) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState(demoMarkdown)
  const [noteEditorMode, setNoteEditorMode] = useState<NoteEditorMode>('rich')
  const [noteContextMenu, setNoteContextMenu] = useState<NoteContextMenuState>(null)
  const [noteContextSubmenu, setNoteContextSubmenu] = useState<NoteContextSubmenu>(null)
  const [noteClipboardText, setNoteClipboardText] = useState('')
  const [noteContextMenuOpenLeft, setNoteContextMenuOpenLeft] = useState(false)
  const [noteContextSubmenuOpenUp, setNoteContextSubmenuOpenUp] = useState(false)
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(true)
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>(initialFolderPath)
  const [noteTitleModalOpen, setNoteTitleModalOpen] = useState(false)
  const [noteSaveState, setNoteSaveState] = useState<'idle' | 'saving'>('idle')
  const [, setNoteDirtyVersion] = useState(0)
  const [notePresence, setNotePresence] = useState<Record<string, NotePresenceEntry[]>>({})
  const [noteCursors, setNoteCursors] = useState<Record<string, RemoteNoteCursor[]>>({})

  const noteManagerRef = useRef<HTMLDivElement | null>(null)
  const notesSectionRef = useRef<HTMLElement | null>(null)
  const noteEditorRef = useRef<HTMLDivElement | null>(null)
  const noteContextMenuRef = useRef<HTMLDivElement | null>(null)
  const noteContextRangeRef = useRef<Range | null>(null)
  const noteContextTableRef = useRef<HTMLTableElement | null>(null)
  const noteContextCellRef = useRef<HTMLTableCellElement | null>(null)
  const noteDraftBroadcastTimeoutRef = useRef<number | null>(null)
  const noteLiveSaveTimeoutRef = useRef<number | null>(null)
  const pendingLiveSaveNoteIdRef = useRef<string | null>(null)
  const selectedNoteIdRef = useRef<string | null>(null)
  const selectedNoteRef = useRef<Note | null>(null)
  const noteSessionIdRef = useRef<string | null>(null)
  const noteEditorModeRef = useRef<NoteEditorMode>('rich')
  const selectedFolderPathRef = useRef(initialFolderPath)
  const noteDraftRef = useRef(demoMarkdown)
  const persistedNoteStateRef = useRef<Record<string, { title: string; folder: string; markdown: string }>>({})
  const realtimeDraftBaseRef = useRef<Record<string, string>>({})
  const locallyDirtyNoteIdsRef = useRef<Set<string>>(new Set())
  const pendingLocalDraftRestoreRef = useRef<{ noteId: string; markdown: string } | null>(null)
  const noteSavePromiseRef = useRef<Promise<boolean> | null>(null)

  return {
    selectedNoteId,
    setSelectedNoteId,
    noteDraft,
    setNoteDraft,
    noteEditorMode,
    setNoteEditorMode,
    noteContextMenu,
    setNoteContextMenu,
    noteContextSubmenu,
    setNoteContextSubmenu,
    noteClipboardText,
    setNoteClipboardText,
    noteContextMenuOpenLeft,
    setNoteContextMenuOpenLeft,
    noteContextSubmenuOpenUp,
    setNoteContextSubmenuOpenUp,
    noteDrawerOpen,
    setNoteDrawerOpen,
    selectedFolderPath,
    setSelectedFolderPath,
    noteTitleModalOpen,
    setNoteTitleModalOpen,
    noteSaveState,
    setNoteSaveState,
    setNoteDirtyVersion,
    notePresence,
    setNotePresence,
    noteCursors,
    setNoteCursors,
    noteManagerRef,
    notesSectionRef,
    noteEditorRef,
    noteContextMenuRef,
    noteContextRangeRef,
    noteContextTableRef,
    noteContextCellRef,
    noteDraftBroadcastTimeoutRef,
    noteLiveSaveTimeoutRef,
    pendingLiveSaveNoteIdRef,
    selectedNoteIdRef,
    selectedNoteRef,
    noteSessionIdRef,
    noteEditorModeRef,
    selectedFolderPathRef,
    noteDraftRef,
    persistedNoteStateRef,
    realtimeDraftBaseRef,
    locallyDirtyNoteIdsRef,
    pendingLocalDraftRestoreRef,
    noteSavePromiseRef,
  }
}
