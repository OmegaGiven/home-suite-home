import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEventHandler, type MouseEventHandler, type RefObject } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { ConfirmModal } from '../components/ConfirmModal'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { FileTreeHeader } from '../components/FileTreeNode'
import { LibraryDeletedTreeNode } from '../components/LibraryDeletedTreeNode'
import { LibraryActionBar } from '../components/LibraryActionBar'
import { NewFolderIcon, NewNoteIcon, RenameIcon, UploadIcon } from '../components/LibraryActionIcons'
import { LibraryShell } from '../components/LibraryShell'
import { NotesFormatToolbar } from './notes/NotesFormatToolbar'
import { NoteLibraryTreeNode } from '../components/NoteLibraryTreeNode'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode } from '../lib/app-config'
import type { AdminDeletedItem, Note, ResourceVisibility } from '../lib/types'
import type { NoteFolderNode, NoteToolbarAction } from '../lib/ui-helpers'
import { filterNoteFolderNode, getCaretRectForOffset, normalizeFolderPath, toggleFileTreeSortState } from '../lib/ui-helpers'
import { buildDeletedLibraryTreeNode } from '../lib/deleted-tree'
import { api } from '../lib/api'
import { getTreeRangeSelection, toggleMarkedTreePath, useLibraryTreeControls } from '../lib/library-tree-controls'
import { createMarkdownBinding, replaceMarkdownContent, resolveStableTextCursorOffset, type LoroMarkdownBinding } from '../lib/loro-note'

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

type RemoteCursorDecoration = RemoteCursor & {
  top: number
  left: number
  height: number
}

function renderedTextOffsetFromMarkdown(markdown: string) {
  const html = marked.parse(markdown, { async: false })
  const container = document.createElement('div')
  container.innerHTML = html
  return container.textContent?.length ?? 0
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
  onSetActiveNoteSplitter: (active: boolean) => void
  onToggleNoteDrawer: () => void
  onSelectNote: (note: Note) => void
  onSetMarkedPaths: (paths: string[] | ((current: string[]) => string[])) => void
  onDragStart: MouseEventHandler<HTMLElement> | ((event: React.DragEvent<HTMLElement>, path: string) => void)
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
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
  deletedItems,
  selectedNoteId,
  markedPaths,
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
  onSetMarkedPaths,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  onOpenTitleModal,
  onCloseTitleModal,
  onChangeSelectedNoteTitle,
  onRequestSave,
  onDeleteNote,
  onRestoreDeletedNote,
  confirmNoteDelete,
  onEnterFullscreen,
  onExitFullscreen,
  onOpenShareDialog,
  resourceKeyForNote,
  onSetNoteEditorMode,
  openNoteContextMenu,
  onRawDraftChange,
  onRawDraftKeyDown,
  onCopySelection,
  onPasteFromClipboard,
  onSetNoteContextMenu,
  onSetNoteContextSubmenu,
}: Props) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [deleteNoteOpen, setDeleteNoteOpen] = useState(false)
  const {
    sidebarSearchOpen,
    setSidebarSearchOpen,
    sidebarSearchQuery,
    setSidebarSearchQuery,
    metaFilterOpen,
    setMetaFilterOpen,
    sortState,
    setSortState,
    rowMetaVisibility,
    setRowMetaVisibility,
  } = useLibraryTreeControls()
  const [showToc, setShowToc] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renameFolderName, setRenameFolderName] = useState(currentLibraryFolderPath.split('/').pop() ?? '')
  const noteRootNode = useMemo(
    () => ({
      name: 'Notes',
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
  const deletedNoteTreeNode = useMemo(() => buildDeletedLibraryTreeNode('note', deletedItems), [deletedItems])
  const [remoteCursorDecorations, setRemoteCursorDecorations] = useState<RemoteCursorDecoration[]>([])
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const loroBindingRef = useRef<LoroMarkdownBinding | null>(null)
  const loroPushTimeoutRef = useRef<number | null>(null)
  const turndown = useMemo(() => new TurndownService(), [])
  void isCompactViewport

  const toc = useMemo(
    () =>
      noteDraft
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /^#{1,6}\s/.test(line))
        .map(({ line, index }) => ({
          id: `${index}`,
          level: line.match(/^#{1,6}/)?.[0].length ?? 1,
          label: line.replace(/^#{1,6}\s/, ''),
        })),
    [noteDraft],
  )

  useEffect(() => {
    let cancelled = false
    if (!selectedNote?.id) {
      loroBindingRef.current = null
      return
    }
    void api
      .pullNoteDocument(selectedNote.id)
      .then((response) => {
        if (cancelled) return
        loroBindingRef.current = createMarkdownBinding(
          response.document.snapshot_b64 || selectedNote.loro_snapshot_b64,
          response.document.legacy_markdown || noteDraft,
          response.document.updates_b64?.length ? response.document.updates_b64 : selectedNote.loro_updates_b64,
        )
      })
      .catch(() => {
        if (!cancelled) {
          loroBindingRef.current = createMarkdownBinding(
            selectedNote.loro_snapshot_b64,
            noteDraft,
            selectedNote.loro_updates_b64,
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedNote?.id, selectedNote?.loro_snapshot_b64, selectedNote?.loro_updates_b64, noteDraft])

  const tiptapEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: typeof marked.parse(noteDraft) === 'string' ? marked.parse(noteDraft) : '',
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const markdown = turndown.turndown(editor.getHTML())
      if (markdown !== noteDraft) {
        onRawDraftChange(markdown)
      }
      if (!selectedNote?.id || !loroBindingRef.current) return
      const exported = replaceMarkdownContent(loroBindingRef.current, markdown)
      if (!exported) return
      if (loroPushTimeoutRef.current) {
        window.clearTimeout(loroPushTimeoutRef.current)
      }
      const contentHtml = editor.getHTML()
      loroPushTimeoutRef.current = window.setTimeout(() => {
        void api.pushNoteDocumentUpdates(selectedNote.id!, {
          client_id: `web-${selectedNote.id}`,
          snapshot_b64: exported.snapshotB64,
          update_b64: exported.updateB64,
          editor_format: 'tiptap_loro',
          content_markdown: markdown,
          content_html: contentHtml,
        })
      }, 400)
    },
  })

  useEffect(() => {
    if (!tiptapEditor) return
    const nextHtml = typeof marked.parse(noteDraft) === 'string' ? marked.parse(noteDraft) : ''
    if (tiptapEditor.getHTML() !== nextHtml) {
      tiptapEditor.commands.setContent(nextHtml, { emitUpdate: false })
    }
  }, [noteDraft, tiptapEditor])

  useEffect(() => {
    return () => {
      if (loroPushTimeoutRef.current) {
        window.clearTimeout(loroPushTimeoutRef.current)
      }
    }
  }, [])

  function runTiptapToolbarAction(action: NoteToolbarAction) {
    if (!tiptapEditor) {
      return
    }
    const chain = tiptapEditor.chain().focus()
    switch (action) {
      case 'undo':
        chain.undo().run()
        return
      case 'redo':
        chain.redo().run()
        return
      case 'bold':
        chain.toggleBold().run()
        return
      case 'italic':
        chain.toggleItalic().run()
        return
      case 'underline':
        chain.toggleUnderline().run()
        return
      case 'heading-1':
        chain.toggleHeading({ level: 1 }).run()
        return
      case 'heading-2':
        chain.toggleHeading({ level: 2 }).run()
        return
      case 'heading-3':
        chain.toggleHeading({ level: 3 }).run()
        return
      case 'quote':
        chain.toggleBlockquote().run()
        return
      case 'bullet-list':
        chain.toggleBulletList().run()
        return
      case 'code-block':
        chain.toggleCodeBlock().run()
        return
      case 'table':
        if (!tiptapEditor.isActive('table')) {
          chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        return
      case 'divider':
        chain.setHorizontalRule().run()
        return
      case 'link': {
        const url = window.prompt('Enter link URL', 'https://')
        if (!url?.trim()) return
        chain.setLink({ href: url.trim() }).run()
        return
      }
    }
  }

  function insertTiptapElement(kind: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'quote' | 'bullet-list' | 'numbered-list' | 'task-list' | 'code-block' | 'divider' | 'table') {
    if (!tiptapEditor) {
      return
    }
    const chain = tiptapEditor.chain().focus()
    switch (kind) {
      case 'paragraph':
        chain.setParagraph().run()
        return
      case 'heading-1':
        chain.setHeading({ level: 1 }).run()
        return
      case 'heading-2':
        chain.setHeading({ level: 2 }).run()
        return
      case 'heading-3':
        chain.setHeading({ level: 3 }).run()
        return
      case 'quote':
        chain.toggleBlockquote().run()
        return
      case 'bullet-list':
        chain.toggleBulletList().run()
        return
      case 'numbered-list':
        chain.toggleOrderedList().run()
        return
      case 'task-list':
        chain.toggleTaskList().run()
        return
      case 'code-block':
        chain.toggleCodeBlock().run()
        return
      case 'divider':
        chain.setHorizontalRule().run()
        return
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        return
    }
  }

  function mutateTiptapTable(kind: 'row-before' | 'row-after' | 'col-before' | 'col-after') {
    if (!tiptapEditor) return
    const chain = tiptapEditor.chain().focus()
    if (kind === 'row-before') chain.addRowBefore().run()
    if (kind === 'row-after') chain.addRowAfter().run()
    if (kind === 'col-before') chain.addColumnBefore().run()
    if (kind === 'col-after') chain.addColumnAfter().run()
  }

  function handleTreeSelection(path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    if (options?.shiftKey && selectedNoteId) {
      const range = getTreeRangeSelection(treeContainerRef.current, `note:${selectedNoteId}`, path, (entry) => entry.startsWith('note:'))
      if (range) {
        onSetMarkedPaths(Array.from(new Set(range)))
        const noteId = path.startsWith('note:') ? path.slice('note:'.length) : null
        const note = noteId ? notes.find((entry) => entry.id === noteId) : null
        if (note) onSelectNote(note)
        return
      }
    }

    if (options?.metaKey || options?.ctrlKey) {
      onSetMarkedPaths((current) => toggleMarkedTreePath(current, path))
      const noteId = path.startsWith('note:') ? path.slice('note:'.length) : null
      const note = noteId ? notes.find((entry) => entry.id === noteId) : null
      if (note) onSelectNote(note)
      return
    }

    onSetMarkedPaths(path.startsWith('note:') ? [path] : [])
    const noteId = path.startsWith('note:') ? path.slice('note:'.length) : null
    const note = noteId ? notes.find((entry) => entry.id === noteId) : null
    if (note) onSelectNote(note)
  }

  function handleTreeOpen(path: string) {
    if (path.startsWith('deleted-note:')) {
      void onRestoreDeletedNote(path.slice('deleted-note:'.length))
      return
    }
    if (!path.startsWith('note:')) return
    const noteId = path.slice('note:'.length)
    const note = notes.find((entry) => entry.id === noteId)
    if (note) onSelectNote(note)
  }

  useLayoutEffect(() => {
    if (noteEditorMode !== 'rich' || !noteEditorRef.current || remoteCursors.length === 0) {
      setRemoteCursorDecorations([])
      return
    }

    const editorRect = noteEditorRef.current.getBoundingClientRect()
    const nextDecorations = remoteCursors
      .map((cursor) => {
        const markdownOffset =
          cursor.cursorB64 && loroBindingRef.current
            ? resolveStableTextCursorOffset(loroBindingRef.current, cursor.cursorB64) ?? cursor.offset
            : cursor.offset
        const renderedOffset =
          markdownOffset > 0 ? renderedTextOffsetFromMarkdown(noteDraft.slice(0, markdownOffset)) : 0
        const rect = getCaretRectForOffset(noteEditorRef.current!, renderedOffset)
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
            <div ref={treeContainerRef} className="folder-tree file-tree notes-folder-tree">
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
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelectPath={handleTreeSelection}
                  onOpenPath={handleTreeOpen}
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
              {deletedNoteTreeNode ? (
                <LibraryDeletedTreeNode
                  kind="note"
                  node={deletedNoteTreeNode}
                  deletedItems={deletedItems}
                  selectedPath={selectedNoteId ? `note:${selectedNoteId}` : ''}
                  activePath={selectedNoteId ? `note:${selectedNoteId}` : null}
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={handleTreeSelection}
                  onOpen={handleTreeOpen}
                  onDragStart={onDragStart as (event: React.DragEvent<HTMLElement>, path: string) => void}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  rowMetaVisibility={rowMetaVisibility}
                />
              ) : null}
            </div>
          </>
        }
        content={
        <div className="notes-editor-shell">
          {selectedNote ? (
            <>
              <div className="notes-editor-header">
                <button
                  className="button-secondary notes-title-button"
                  onClick={onOpenTitleModal}
                  title={selectedNote.title}
                >
                  {selectedNote.title || 'Untitled note'}
                </button>
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
                    className="notes-share-button notes-toc-button"
                    aria-label="Table of contents"
                    title="Table of contents"
                    onClick={() => setShowToc(true)}
                  >
                    <svg viewBox="0 0 24 24" className="notes-share-button-icon" aria-hidden="true">
                      <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      <path d="M5 12h10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      <path d="M5 17h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
                    </svg>
                  </button>
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
              {noteTitleModalOpen ? (
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
              {showToc ? (
                <div className="modal-backdrop" onClick={() => setShowToc(false)}>
                  <div className="modal-card notes-toc-modal" onClick={(event) => event.stopPropagation()}>
                    <h3>Table of contents</h3>
                    <div className="notes-toc-list">
                      {toc.length > 0 ? (
                        toc.map((item) => (
                          <div key={item.id} className="notes-toc-item" style={{ marginLeft: `${(item.level - 1) * 16}px` }}>
                            {item.label}
                          </div>
                        ))
                      ) : (
                        <div className="muted notes-toc-empty">No headings yet.</div>
                      )}
                    </div>
                    <div className="button-row">
                      <button className="button" onClick={() => setShowToc(false)}>
                        Close
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
                {noteEditorMode === 'rich' ? <NotesFormatToolbar onRunAction={runTiptapToolbarAction} /> : null}
                {noteEditorMode === 'rich' ? (
                  <>
                    <div ref={noteEditorRef} className="markdown-editor note-tiptap-shell" onContextMenu={openNoteContextMenu}>
                      <EditorContent editor={tiptapEditor} />
                    </div>
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
                                    insertTiptapElement(kind)
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
                                      mutateTiptapTable('row-before')
                                      onSetNoteContextMenu(null)
                                      onSetNoteContextSubmenu(null)
                                    }}
                                >
                                  Add row before
                                </button>
                                <button
                                  className="note-context-menu-item"
                                    onClick={() => {
                                      mutateTiptapTable('row-after')
                                      onSetNoteContextMenu(null)
                                      onSetNoteContextSubmenu(null)
                                    }}
                                >
                                  Add row after
                                </button>
                                <button
                                  className="note-context-menu-item"
                                    onClick={() => {
                                      mutateTiptapTable('col-before')
                                      onSetNoteContextMenu(null)
                                      onSetNoteContextSubmenu(null)
                                    }}
                                >
                                  Add column before
                                </button>
                                <button
                                  className="note-context-menu-item"
                                    onClick={() => {
                                      mutateTiptapTable('col-after')
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
                    className="textarea note-markdown-editor"
                    value={noteDraft}
                    placeholder="Edit markdown"
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
