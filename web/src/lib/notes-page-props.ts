import type {
  DragEvent,
  KeyboardEventHandler,
  MouseEventHandler,
  RefObject,
} from 'react'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode } from './app-config'
import type { AdminDeletedItem, Note, ResourceVisibility } from './types'
import type { NoteFolderNode } from './ui-helpers'

type NotePresence = {
  user: string
  seenAt: number
}

type RemoteCursor = {
  clientId: string
  user: string
  offset: number
  cursorB64?: string | null
  color: string
}

type BuildNotesPagePropsArgs = {
  noteFullscreen: boolean
  notesSectionRef: RefObject<HTMLElement | null>
  notePersistenceState: 'saving' | 'unsaved' | 'saved' | null
  selectedNote: Note | null
  noteSaveState: 'idle' | 'saving'
  noteDrawerOpen: boolean
  activeNoteSplitter: boolean
  notePaneSize: { width: number; height: number }
  noteManagerRef: RefObject<HTMLDivElement | null>
  selectedNoteFolderPath: string | null
  noteTree: NoteFolderNode[]
  notes: Note[]
  deletedItems: AdminDeletedItem[]
  selectedNoteId: string | null
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  isCompactViewport: boolean
  noteTitleModalOpen: boolean
  noteEditorMode: NoteEditorMode
  noteDraft: string
  activePresence: NotePresence[]
  remoteCursors: RemoteCursor[]
  noteEditorRef: RefObject<HTMLDivElement | null>
  noteContextMenu: NoteContextMenuState
  noteContextMenuRef: RefObject<HTMLDivElement | null>
  noteContextMenuOpenLeft: boolean
  noteContextSubmenuOpenUp: boolean
  noteContextSubmenu: NoteContextSubmenu
  noteClipboardText: string
  currentLibraryFolderPath: string
  onCreateNote: () => void
  onCreateFolder: (name: string, parentPath: string | null) => void
  onUploadFile: (file: File) => void
  onRenameFolder: (name: string, path: string) => void
  onSelectFolderPath: (path: string) => void
  onSetActiveNoteSplitter: (active: boolean) => void
  onToggleNoteDrawer: () => void
  onSelectNote: (note: Note) => void
  onSetMarkedPaths: (paths: string[] | ((current: string[]) => string[])) => void
  onDragStart: MouseEventHandler<HTMLElement> | ((event: DragEvent<HTMLElement>, path: string) => void)
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onOpenTitleModal: () => void
  onCloseTitleModal: () => void
  onChangeSelectedNoteTitle: (value: string) => void
  onRequestSave: () => void
  onDeleteNote: () => void
  onRestoreDeletedNote: (id: string) => void
  confirmNoteDelete: boolean
  onEnterFullscreen: () => void
  onExitFullscreen: () => void
  onOpenShareDialog: (target: { resourceKey: string; label: string; visibility?: ResourceVisibility }) => void
  resourceKeyForNote: (noteId: string) => string
  onSetNoteEditorMode: (mode: NoteEditorMode) => void
  openNoteContextMenu: MouseEventHandler<HTMLDivElement>
  onRawDraftChange: (value: string) => void
  onRawDraftKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onCopySelection: () => Promise<void>
  onPasteFromClipboard: () => Promise<void>
  onSetNoteContextMenu: (state: NoteContextMenuState) => void
  onSetNoteContextSubmenu: (submenu: NoteContextSubmenu) => void
}

export function buildNotesPageProps(args: BuildNotesPagePropsArgs) {
  return { ...args }
}
