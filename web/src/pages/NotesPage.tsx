import { useRef, useState, type FormEventHandler, type KeyboardEventHandler, type MouseEventHandler, type RefObject } from 'react'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { LibraryShell } from '../components/LibraryShell'
import { NoteLibraryTreeNode } from '../components/NoteLibraryTreeNode'
import { ensureEditorBlocks } from '../lib/markdown-editor'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode } from '../lib/app-config'
import type { Note, ResourceVisibility } from '../lib/types'
import type { NoteInsertKind, NoteFolderNode } from '../lib/ui-helpers'
import { normalizeFolderPath } from '../lib/ui-helpers'

function NewNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true">
      <path
        d="M6 3.75h8.7l3.3 3.35v13.15H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14.7 3.75V7.1H18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.75v6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.75 13h6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function NewFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true">
      <path
        d="M3.75 7.25A2.25 2.25 0 0 1 6 5h4.15l1.55 1.7H18A2.25 2.25 0 0 1 20.25 9v7.75A2.25 2.25 0 0 1 18 19H6a2.25 2.25 0 0 1-2.25-2.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15.75 10.25v5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13 13h5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true">
      <path
        d="M12 4.75v10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M8.6 8.35 12 4.75l3.4 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 15.75v1.5c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true">
      <path
        d="M4.75 19.25h4.1l9.35-9.35-4.1-4.1-9.35 9.35v4.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="m12.95 6.95 4.1 4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type NotePresence = {
  user: string
  seenAt: number
}

type Props = {
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
  onAddTableRow: (position: 'before' | 'after') => void
  onAddTableColumn: (position: 'before' | 'after') => void
}

export function NotesPage({
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
  onAddTableRow,
  onAddTableColumn,
}: Props) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renameFolderName, setRenameFolderName] = useState(currentLibraryFolderPath.split('/').pop() ?? '')

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
      <LibraryShell
        managerRef={noteManagerRef}
        managerClassName={`notes-manager ${noteDrawerOpen ? '' : 'library-hidden'} ${activeNoteSplitter ? 'resizing' : ''}`}
        drawerOpen={noteDrawerOpen}
        activeSplitter={activeNoteSplitter}
        paneSize={notePaneSize}
        sidebarClassName="notes-sidebar"
        onStartResize={() => onSetActiveNoteSplitter(true)}
        onToggleDrawer={onToggleNoteDrawer}
        sidebar={
          <>
            <div className="file-sidebar-header-row">
              <div className="button-row files-actions">
                <button
                  className="button-secondary notes-new-button"
                  onClick={() => setCreateFolderOpen(true)}
                  aria-label="New folder"
                  title="New folder"
                >
                  <NewFolderIcon />
                </button>
                <button
                  className="button-secondary notes-new-button"
                  onClick={() => {
                    setRenameFolderName(currentLibraryFolderPath.split('/').pop() ?? '')
                    setRenameFolderOpen(true)
                  }}
                  aria-label="Rename folder"
                  title="Rename folder"
                  disabled={currentLibraryFolderPath === 'Inbox'}
                >
                  <RenameIcon />
                </button>
                <button
                  className="button-secondary notes-new-button"
                  onClick={onCreateNote}
                  aria-label="New note"
                  title="New note"
                >
                  <NewNoteIcon />
                </button>
                <button
                  className="button-secondary notes-new-button"
                  onClick={() => uploadInputRef.current?.click()}
                  aria-label="Upload note"
                  title="Upload note"
                >
                  <UploadIcon />
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onUploadFile(file)
                    event.currentTarget.value = ''
                  }}
                />
              </div>
            </div>
            <div className="folder-tree file-tree notes-folder-tree">
              <NoteLibraryTreeNode
                node={{
                  name: 'Inbox',
                  path: 'Inbox',
                  children: noteTree,
                  notes: notes
                    .filter((note) => normalizeFolderPath(note.folder || 'Inbox') === 'Inbox')
                    .sort((a, b) => a.title.localeCompare(b.title)),
                }}
                activeFolderPath={selectedNoteFolderPath}
                selectedNoteId={selectedNoteId}
                draggingPath={draggingPath}
                dropTargetPath={dropTargetPath}
                onSelectNote={onSelectNote}
                onDragStart={onDragStart as (event: React.DragEvent<HTMLElement>, path: string) => void}
                onDragEnd={onDragEnd}
                onDropTargetChange={onDropTargetChange}
                onDrop={onDrop}
                />
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
