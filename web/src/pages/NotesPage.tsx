import { useLayoutEffect, useMemo, useState, type FormEventHandler, type KeyboardEventHandler, type MouseEventHandler, type RefObject } from 'react'
import { ConfirmModal } from '../components/ConfirmModal'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { FileTreeHeader, type FileTreeRowMetaVisibility } from '../components/FileTreeNode'
import { LibraryActionBar } from '../components/LibraryActionBar'
import { NewFolderIcon, NewNoteIcon, RenameIcon, UploadIcon } from '../components/LibraryActionIcons'
import { LibraryShell } from '../components/LibraryShell'
import { NotesFormatToolbar } from './notes/NotesFormatToolbar'
import { NoteLibraryTreeNode } from '../components/NoteLibraryTreeNode'
import { ensureEditorBlocks } from '../lib/markdown-editor'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode } from '../lib/app-config'
import type { Note, ResourceVisibility } from '../lib/types'
import type { FileTreeSortState, NoteInsertKind, NoteFolderNode, NoteToolbarAction } from '../lib/ui-helpers'
import { filterNoteFolderNode, getCaretRectForOffset, normalizeFolderPath, toggleFileTreeSortState } from '../lib/ui-helpers'

type NotePresence = {
  user: string
  seenAt: number
}

type RemoteCursor = {
  clientId: string
  user: string
  offset: number
  color: string
}

type RemoteCursorDecoration = RemoteCursor & {
  top: number
  left: number
  height: number
}

type Props = {
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
  selectedNoteId: string | null
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
  onSetActiveNoteSplitter: (active: boolean) => void
  onToggleNoteDrawer: () => void
  onSelectNote: (note: Note) => void
  onDragStart: MouseEventHandler<HTMLElement> | ((event: React.DragEvent<HTMLElement>, path: string) => void)
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onOpenTitleModal: () => void
  onCloseTitleModal: () => void
  onChangeSelectedNoteTitle: (value: string) => void
  onRequestSave: () => void
  onDeleteNote: () => void
  confirmNoteDelete: boolean
  onEnterFullscreen: () => void
  onExitFullscreen: () => void
  onOpenShareDialog: (target: { resourceKey: string; label: string; visibility?: ResourceVisibility }) => void
  resourceKeyForNote: (noteId: string) => string
  onSetNoteEditorMode: (mode: NoteEditorMode) => void
  handleNoteEditorClick: MouseEventHandler<HTMLDivElement>
  openNoteContextMenu: MouseEventHandler<HTMLDivElement>
  handleNoteEditorInput: FormEventHandler<HTMLDivElement>
  handleNoteEditorKeyDown: KeyboardEventHandler<HTMLDivElement>
  onRawDraftChange: (value: string) => void
  onRawDraftKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onCopySelection: () => Promise<void>
  onPasteFromClipboard: () => Promise<void>
  onSetNoteContextMenu: (state: NoteContextMenuState) => void
  onSetNoteContextSubmenu: (submenu: NoteContextSubmenu) => void
  onInsertNoteElement: (kind: NoteInsertKind) => void
  onRunToolbarAction: (action: NoteToolbarAction) => void
  onAddTableRow: (position: 'before' | 'after') => void
  onAddTableColumn: (position: 'before' | 'after') => void
}

export function NotesPage({
  noteFullscreen,
  notesSectionRef,
  notePersistenceState,
  selectedNote,
  noteSaveState,
  noteDrawerOpen,
  activeNoteSplitter,
  notePaneSize,
  noteManagerRef,
  selectedNoteFolderPath,
  noteTree,
  notes,
  selectedNoteId,
  draggingPath,
  dropTargetPath,
  isCompactViewport,
  noteTitleModalOpen,
  noteEditorMode,
  noteDraft,
  activePresence,
  remoteCursors,
  noteEditorRef,
  noteContextMenu,
  noteContextMenuRef,
  noteContextMenuOpenLeft,
  noteContextSubmenuOpenUp,
  noteContextSubmenu,
  noteClipboardText,
  currentLibraryFolderPath,
  onCreateNote,
  onCreateFolder,
  onUploadFile,
  onRenameFolder,
  onSetActiveNoteSplitter,
  onToggleNoteDrawer,
  onSelectNote,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  onOpenTitleModal,
  onCloseTitleModal,
  onChangeSelectedNoteTitle,
  onRequestSave,
  onDeleteNote,
  confirmNoteDelete,
  onEnterFullscreen,
  onExitFullscreen,
  onOpenShareDialog,
  resourceKeyForNote,
  onSetNoteEditorMode,
  handleNoteEditorClick,
  openNoteContextMenu,
  handleNoteEditorInput,
  handleNoteEditorKeyDown,
  onRawDraftChange,
  onRawDraftKeyDown,
  onCopySelection,
  onPasteFromClipboard,
  onSetNoteContextMenu,
  onSetNoteContextSubmenu,
  onInsertNoteElement,
  onRunToolbarAction,
  onAddTableRow,
  onAddTableColumn,
}: Props) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [deleteNoteOpen, setDeleteNoteOpen] = useState(false)
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [metaFilterOpen, setMetaFilterOpen] = useState(false)
  const [sortState, setSortState] = useState<FileTreeSortState | null>(null)
  const [rowMetaVisibility, setRowMetaVisibility] = useState<FileTreeRowMetaVisibility>({
    type: true,
    size: true,
    modified: true,
    created: true,
  })
  const [newFolderName, setNewFolderName] = useState('')
  const [renameFolderName, setRenameFolderName] = useState(currentLibraryFolderPath.split('/').pop() ?? '')
  const noteRootNode = useMemo(
    () => ({
      name: 'Inbox',
      path: 'Inbox',
      children: noteTree,
      notes: notes
        .filter((note) => normalizeFolderPath(note.folder || 'Inbox') === 'Inbox')
        .sort((a, b) => a.title.localeCompare(b.title)),
    }),
    [noteTree, notes],
  )
  const filteredNoteRootNode = useMemo(
    () => filterNoteFolderNode(noteRootNode, sidebarSearchQuery),
    [noteRootNode, sidebarSearchQuery],
  )
  const [remoteCursorDecorations, setRemoteCursorDecorations] = useState<RemoteCursorDecoration[]>([])

  useLayoutEffect(() => {
    if (noteEditorMode !== 'rich' || !noteEditorRef.current || remoteCursors.length === 0) {
      setRemoteCursorDecorations([])
      return
    }

    const editorRect = noteEditorRef.current.getBoundingClientRect()
    const nextDecorations = remoteCursors
      .map((cursor) => {
        const rect = getCaretRectForOffset(noteEditorRef.current!, cursor.offset)
        if (!rect) return null
        return {
          ...cursor,
          top: rect.top - editorRect.top,
          left: rect.left - editorRect.left,
          height: Math.max(rect.height || 20, 20),
        }
      })
      .filter((cursor): cursor is RemoteCursorDecoration => cursor !== null)

    setRemoteCursorDecorations(nextDecorations)
  }, [noteDraft, noteEditorMode, noteEditorRef, remoteCursors])

  return (
    <>
      <FolderPromptModal
        open={createFolderOpen}
        title="Create folder"
        value={newFolderName}
        confirmLabel="Confirm"
        onChange={setNewFolderName}
        onConfirm={() => {
          const trimmed = newFolderName.trim()
          if (!trimmed) return
          onCreateFolder(trimmed, currentLibraryFolderPath || null)
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
        onClose={() => {
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
      />
      <FolderPromptModal
        open={renameFolderOpen}
        title="Rename folder"
        value={renameFolderName}
        confirmLabel="Rename"
        onChange={setRenameFolderName}
        onConfirm={() => {
          const trimmed = renameFolderName.trim()
          if (!trimmed) return
          onRenameFolder(trimmed, currentLibraryFolderPath)
          setRenameFolderOpen(false)
        }}
        onClose={() => {
          setRenameFolderOpen(false)
          setRenameFolderName(currentLibraryFolderPath.split('/').pop() ?? '')
        }}
      />
      {deleteNoteOpen && selectedNote ? (
        <ConfirmModal
          title="Delete note?"
          confirmLabel="Delete"
          onClose={() => setDeleteNoteOpen(false)}
          onConfirm={() => {
            setDeleteNoteOpen(false)
            onDeleteNote()
          }}
        >
          <p>{`Delete ${selectedNote.title || 'this note'}?`}</p>
        </ConfirmModal>
      ) : null}
      <LibraryShell
        sectionRef={notesSectionRef}
        sectionClassName={`panel notes-panel ${noteFullscreen ? 'fullscreen' : ''}`}
        managerRef={noteManagerRef}
        managerClassName={`notes-manager ${noteDrawerOpen ? '' : 'library-hidden'} ${activeNoteSplitter ? 'resizing' : ''} ${noteFullscreen ? 'fullscreen' : ''}`}
        drawerOpen={noteDrawerOpen}
        activeSplitter={activeNoteSplitter}
        paneSize={notePaneSize}
        sidebarVisible={!noteFullscreen && noteDrawerOpen}
        showSplitter={!noteFullscreen}
        sidebarClassName="notes-sidebar"
        onStartResize={() => onSetActiveNoteSplitter(true)}
        onToggleDrawer={onToggleNoteDrawer}
        sidebar={
          <>
            <LibraryActionBar
              searchOpen={sidebarSearchOpen}
              searchQuery={sidebarSearchQuery}
              searchPlaceholder="Search notes"
              onOpenSearch={() => setSidebarSearchOpen(true)}
              onCloseSearch={() => {
                setSidebarSearchOpen(false)
                setSidebarSearchQuery('')
              }}
              onChangeSearchQuery={setSidebarSearchQuery}
              metaFilterOpen={metaFilterOpen}
              rowMetaVisibility={rowMetaVisibility}
              onToggleMetaFilterOpen={() => setMetaFilterOpen((current) => !current)}
              onToggleMetaVisibility={(column) =>
                setRowMetaVisibility((current) => ({ ...current, [column]: !current[column] }))
              }
              rootDropPath="Inbox"
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onDropTargetChange={onDropTargetChange}
              onDropRoot={onDrop}
              commonActions={[
                { key: 'folder', label: 'New folder', icon: <NewFolderIcon />, onClick: () => setCreateFolderOpen(true) },
                {
                  key: 'rename',
                  label: 'Rename folder',
                  icon: <RenameIcon />,
                  disabled: currentLibraryFolderPath === 'Inbox',
                  onClick: () => {
                    setRenameFolderName(currentLibraryFolderPath.split('/').pop() ?? '')
                    setRenameFolderOpen(true)
                  },
                },
                {
                  key: 'upload',
                  kind: 'upload',
                  label: 'Upload note',
                  icon: <UploadIcon />,
                  accept: '.md,.markdown,.txt,text/markdown,text/plain',
                  onFileSelected: onUploadFile,
                },
              ]}
              pageActions={[{ key: 'note', label: 'New note', icon: <NewNoteIcon />, onClick: onCreateNote }]}
            />
            <div className="folder-tree file-tree notes-folder-tree">
              <FileTreeHeader
                rowMetaVisibility={rowMetaVisibility}
                sortState={sortState}
                onSort={(key) => setSortState((current) => toggleFileTreeSortState(current, key))}
              />
              {filteredNoteRootNode ? (
                <NoteLibraryTreeNode
                  node={filteredNoteRootNode}
                  activeFolderPath={selectedNoteFolderPath}
                  selectedNoteId={selectedNoteId}
                  hideRoot
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelectNote={onSelectNote}
                  onDragStart={onDragStart as (event: React.DragEvent<HTMLElement>, path: string) => void}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  rowMetaVisibility={rowMetaVisibility}
                  sortState={sortState}
                />
              ) : (
                <div className="empty-state">No matching notes.</div>
              )}
            </div>
          </>
        }
        content={
        <div className="notes-editor-shell">
          {selectedNote ? (
            <>
              <div className="notes-editor-header">
                {isCompactViewport ? (
                  <button
                    className="button-secondary notes-title-button"
                    onClick={onOpenTitleModal}
                    title={selectedNote.title}
                  >
                    {selectedNote.title || 'Untitled note'}
                  </button>
                ) : (
                  <input
                    className="input note-title-input notes-title-input"
                    value={selectedNote.title}
                    placeholder="Select or create a note"
                    onChange={(event) => onChangeSelectedNoteTitle(event.target.value)}
                  />
                )}
                <div className="notes-editor-actions">
                  {notePersistenceState ? (
                    <button
                      type="button"
                      className={`notes-save-indicator ${notePersistenceState}`}
                      onClick={onRequestSave}
                      disabled={noteSaveState === 'saving'}
                      title={
                        notePersistenceState === 'saving'
                          ? 'Saving to database'
                          : notePersistenceState === 'unsaved'
                            ? 'Unsaved changes'
                            : 'Saved to database'
                      }
                      aria-label={
                        notePersistenceState === 'saving'
                          ? 'Saving to database'
                          : notePersistenceState === 'unsaved'
                            ? 'Unsaved changes'
                            : 'Saved to database'
                      }
                    >
                      <span className="notes-save-indicator-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="notes-save-indicator-svg" aria-hidden="true">
                          <path
                            d="M5 3.75h11.25l3 3V20.25H5z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7.25 4.9h7.15v4.15H7.25z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M11.15 5.85h1.35v2.25h-1.35z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7.6 11.6h8.8v5.65H7.6z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="notes-save-indicator-dot" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="notes-share-button"
                    aria-label="Delete note"
                    title="Delete note"
                    onClick={() => {
                      if (confirmNoteDelete) {
                        setDeleteNoteOpen(true)
                        return
                      }
                      onDeleteNote()
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="notes-share-button-icon" aria-hidden="true">
                      <path d="M9 5h6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      <path d="M10 5V4c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      <path d="M6 7h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      <path d="M8 7.5v10c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5v-10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="notes-share-button"
                    onClick={() =>
                      onOpenShareDialog({
                        resourceKey: resourceKeyForNote(selectedNote.id),
                        label: selectedNote.title || 'this note',
                      })
                    }
                    aria-label="Share note"
                    title="Share note"
                  >
                    <svg viewBox="0 0 24 24" className="notes-share-button-icon" aria-hidden="true">
                      <circle cx="8.2" cy="8.8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
                      <circle cx="15.8" cy="8.8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
                      <path
                        d="M4.85 17.2c0-2.15 1.82-3.7 4.05-3.7s4.05 1.55 4.05 3.7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />
                      <path
                        d="M11.1 17.2c0-2.15 1.82-3.7 4.05-3.7s4.05 1.55 4.05 3.7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <div className="notes-mode-toggle" role="tablist" aria-label="Note editor mode">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={noteEditorMode === 'rich'}
                      className={noteEditorMode === 'rich' ? 'notes-mode-toggle-button active' : 'notes-mode-toggle-button'}
                      onClick={() => onSetNoteEditorMode('rich')}
                    >
                      .MD
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={noteEditorMode === 'raw'}
                      className={noteEditorMode === 'raw' ? 'notes-mode-toggle-button active' : 'notes-mode-toggle-button'}
                      onClick={() => onSetNoteEditorMode('raw')}
                    >
                      .txt
                    </button>
                  </div>
                  <button
                    type="button"
                    className="notes-fullscreen-button"
                    aria-label={noteFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={noteFullscreen ? 'Exit fullscreen' : 'Expand editor'}
                    onClick={noteFullscreen ? onExitFullscreen : onEnterFullscreen}
                  >
                    {noteFullscreen ? (
                      <svg viewBox="0 0 24 24" className="notes-share-button-icon" aria-hidden="true">
                        <path d="M9 5H5v4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 5h4v4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 19H5v-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 19h4v-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="notes-share-button-icon" aria-hidden="true">
                        <path d="M9 3H3v6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 3h6v6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 21H3v-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 21h6v-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8.5 8.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M15.5 8.5 21 3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M8.5 15.5 3 21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M15.5 15.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {isCompactViewport && noteTitleModalOpen ? (
                <div className="modal-backdrop" onClick={onCloseTitleModal}>
                  <div className="modal-card notes-title-modal" onClick={(event) => event.stopPropagation()}>
                    <h3>Edit title</h3>
                    <input
                      className="input notes-title-modal-input"
                      value={selectedNote.title}
                      placeholder="Select or create a note"
                      autoFocus
                      onChange={(event) => onChangeSelectedNoteTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' || event.key === 'Enter') {
                          event.preventDefault()
                          onCloseTitleModal()
                        }
                      }}
                    />
                    <div className="button-row">
                      <button className="button" onClick={onCloseTitleModal}>
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="notes-editor-status">
                <div className="presence-row">
                  {activePresence.map((presence) => (
                    <span className="presence-chip" key={presence.user}>
                      {presence.user}
                    </span>
                  ))}
                </div>
              </div>
              <div className="notes-editor-card">
                {noteEditorMode === 'rich' ? <NotesFormatToolbar onRunAction={onRunToolbarAction} /> : null}
                {noteEditorMode === 'rich' ? (
                  <>
                    <div
                      ref={noteEditorRef}
                      className="markdown-editor"
                      contentEditable
                      suppressContentEditableWarning
                      data-editor-root="true"
                      data-placeholder="Select a note to begin editing"
                      onFocus={() => {
                        if (noteEditorRef.current) ensureEditorBlocks(noteEditorRef.current)
                      }}
                      onClick={handleNoteEditorClick}
                      onContextMenu={openNoteContextMenu}
                      onInput={handleNoteEditorInput}
                      onKeyDown={handleNoteEditorKeyDown}
                    />
                    <div className="notes-remote-cursor-layer" aria-hidden="true">
                      {remoteCursorDecorations.map((cursor) => (
                        <div
                          key={cursor.clientId}
                          className="notes-remote-cursor"
                          style={{
                            top: `${cursor.top}px`,
                            left: `${cursor.left}px`,
                            height: `${cursor.height}px`,
                            color: cursor.color,
                          }}
                        >
                          <span className="notes-remote-cursor-label">{cursor.user}</span>
                        </div>
                      ))}
                    </div>
                    {noteContextMenu ? (
                      <div
                        ref={noteContextMenuRef}
                        className={`note-context-menu ${noteContextMenuOpenLeft ? 'open-left' : ''} ${noteContextSubmenuOpenUp ? 'submenu-open-up' : ''}`}
                        style={{ left: noteContextMenu.x, top: noteContextMenu.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className="note-context-menu-item"
                          disabled={!window.getSelection()?.toString().trim()}
                          onClick={() => {
                            void onCopySelection()
                            onSetNoteContextMenu(null)
                            onSetNoteContextSubmenu(null)
                          }}
                        >
                          Copy
                        </button>
                        {noteClipboardText.trim() ? (
                          <button
                            className="note-context-menu-item"
                            onClick={() => {
                              void onPasteFromClipboard()
                              onSetNoteContextMenu(null)
                              onSetNoteContextSubmenu(null)
                            }}
                          >
                            Paste
                          </button>
                        ) : null}
                        <div className="note-context-menu-separator" />
                        <div className="note-context-menu-row">
                          <button
                            className={`note-context-menu-item note-context-menu-parent ${noteContextSubmenu === 'elements' ? 'active' : ''}`}
                            onMouseEnter={() => onSetNoteContextSubmenu('elements')}
                            onClick={() => onSetNoteContextSubmenu(noteContextSubmenu === 'elements' ? null : 'elements')}
                          >
                            <span>Elements</span>
                            <span className="note-context-menu-arrow">›</span>
                          </button>
                          {noteContextSubmenu === 'elements' ? (
                            <div className="note-context-submenu">
                              {([
                                ['paragraph', 'Paragraph'],
                                ['heading-1', 'Heading 1'],
                                ['heading-2', 'Heading 2'],
                                ['heading-3', 'Heading 3'],
                                ['quote', 'Quote'],
                                ['bullet-list', 'Bullet list'],
                                ['numbered-list', 'Numbered list'],
                                ['task-list', 'Task list'],
                                ['code-block', 'Code block'],
                                ['divider', 'Divider'],
                                ['table', 'Table'],
                              ] as const).map(([kind, label]) => (
                                <button
                                  key={kind}
                                  className="note-context-menu-item"
                                  onClick={() => {
                                    onInsertNoteElement(kind)
                                    onSetNoteContextMenu(null)
                                    onSetNoteContextSubmenu(null)
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {noteContextMenu.kind === 'table' ? (
                          <div className="note-context-menu-row">
                            <button
                              className={`note-context-menu-item note-context-menu-parent ${noteContextSubmenu === 'table' ? 'active' : ''}`}
                              onMouseEnter={() => onSetNoteContextSubmenu('table')}
                              onClick={() => onSetNoteContextSubmenu(noteContextSubmenu === 'table' ? null : 'table')}
                            >
                              <span>Table</span>
                              <span className="note-context-menu-arrow">›</span>
                            </button>
                            {noteContextSubmenu === 'table' ? (
                              <div className="note-context-submenu">
                                <button
                                  className="note-context-menu-item"
                                  onClick={() => {
                                    onAddTableRow('before')
                                    onSetNoteContextMenu(null)
                                    onSetNoteContextSubmenu(null)
                                  }}
                                >
                                  Add row before
                                </button>
                                <button
                                  className="note-context-menu-item"
                                  onClick={() => {
                                    onAddTableRow('after')
                                    onSetNoteContextMenu(null)
                                    onSetNoteContextSubmenu(null)
                                  }}
                                >
                                  Add row after
                                </button>
                                <button
                                  className="note-context-menu-item"
                                  onClick={() => {
                                    onAddTableColumn('before')
                                    onSetNoteContextMenu(null)
                                    onSetNoteContextSubmenu(null)
                                  }}
                                >
                                  Add column before
                                </button>
                                <button
                                  className="note-context-menu-item"
                                  onClick={() => {
                                    onAddTableColumn('after')
                                    onSetNoteContextMenu(null)
                                    onSetNoteContextSubmenu(null)
                                  }}
                                >
                                  Add column after
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <textarea
                    className="textarea note-raw-editor"
                    value={noteDraft}
                    placeholder="Edit raw markdown"
                    onChange={(event) => onRawDraftChange(event.target.value)}
                    onKeyDown={onRawDraftKeyDown}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="notes-empty-state">
              <button
                className="button notes-new-button"
                onClick={onCreateNote}
                aria-label="New note"
                title="New note"
              >
                <NewNoteIcon />
              </button>
            </div>
          )}
        </div>
        }
      />
    </>
  )
}
