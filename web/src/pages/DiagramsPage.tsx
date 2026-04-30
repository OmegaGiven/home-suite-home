import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler, type RefObject } from 'react'
import { DrawioDiagramEditor, type DrawioDiagramEditorHandle } from '../components/DrawioDiagramEditor'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { DiagramLibraryTreeNode } from '../components/DiagramLibraryTreeNode'
import { FileTreeHeader, FileTreeNodes } from '../components/FileTreeNode'
import { LibraryDeletedTreeNode } from '../components/LibraryDeletedTreeNode'
import { LibraryActionBar } from '../components/LibraryActionBar'
import { NewDiagramIcon, NewFolderIcon, RenameIcon, UploadIcon } from '../components/LibraryActionIcons'
import { LibraryShell } from '../components/LibraryShell'
import type { DiagramEditorMode } from '../lib/app-config'
import type { AdminDeletedItem, Diagram, FileNode } from '../lib/types'
import { aggregateFileNodeSize, ancestorDirectoryPaths, deriveDirectoryPath, diagramDisplayName, fileTypeLabel, filterDiagramFolderNode, filterFileNode, formatFileSize, formatFileTimestamp, normalizeDiagramFolderPath, sortFileTree, toggleFileTreeSortState, type DiagramFolderNode } from '../lib/ui-helpers'
import { buildDeletedLibraryTreeNode } from '../lib/deleted-tree'
import { getTreeRangeSelection, toggleMarkedTreePath, useLibraryTreeControls } from '../lib/library-tree-controls'

type Props = {
  diagramFullscreen: boolean
  standaloneDrawio: boolean
  diagramManagerRef: RefObject<HTMLDivElement | null>
  diagramDrawerOpen: boolean
  activeDiagramSplitter: boolean
  diagramPaneSize: { width: number; height: number }
  diagramTree: DiagramFolderNode[]
  diagramTreeNode?: FileNode | null
  diagrams: Diagram[]
  deletedItems: AdminDeletedItem[]
  selectedDiagramId: string | null
  selectedDiagramPath?: string | null
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  selectedDiagram: Diagram | null
  diagramEditorMode: DiagramEditorMode
  diagramDraft: string
  diagramLoadVersion: number
  diagramSourceFormat: 'drawio' | 'legacy' | 'empty'
  drawioEditorRef: RefObject<DrawioDiagramEditorHandle | null>
  onCreateDiagram: () => void
  onCreateFolder: (name: string, parentPath: string) => void
  onUploadFile: (file: File) => void
  onRenameFolder: (name: string, path: string) => void
  onOpenStandaloneDrawio: () => void
  onSelectDiagram: (diagramId: string) => void
  onSelectDiagramPath?: (path: string) => void
  onSetMarkedPaths: (paths: string[] | ((current: string[]) => string[])) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onSetActiveDiagramSplitter: (active: boolean) => void
  onToggleDiagramDrawer: () => void
  onChangeSelectedDiagramTitle: (value: string) => void
  onSetDiagramMode: (mode: DiagramEditorMode) => void
  onSaveDiagram: () => void
  onChangeDiagramDraft: (value: string) => void
  onDiagramDraftKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPersistDiagramXml: (xml: string) => void
  onRestoreDeletedDiagram: (id: string) => void
}

export function DiagramsPage({
  diagramFullscreen,
  standaloneDrawio,
  diagramManagerRef,
  diagramDrawerOpen,
  activeDiagramSplitter,
  diagramPaneSize,
  diagramTree,
  diagramTreeNode,
  diagrams,
  deletedItems,
  selectedDiagramId,
  selectedDiagramPath,
  markedPaths,
  draggingPath,
  dropTargetPath,
  selectedDiagram,
  diagramEditorMode,
  diagramDraft,
  diagramLoadVersion,
  diagramSourceFormat,
  drawioEditorRef,
  onCreateDiagram,
  onCreateFolder,
  onUploadFile,
  onRenameFolder,
  onOpenStandaloneDrawio,
  onSelectDiagram,
  onSelectDiagramPath,
  onSetMarkedPaths,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  onSetActiveDiagramSplitter,
  onToggleDiagramDrawer,
  onChangeSelectedDiagramTitle,
  onSetDiagramMode,
  onSaveDiagram,
  onChangeDiagramDraft,
  onDiagramDraftKeyDown,
  onPersistDiagramXml,
  onRestoreDeletedDiagram,
}: Props) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [selectedLibraryFolderPath, setSelectedLibraryFolderPath] = useState<string | null>(null)
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
  const [newFolderName, setNewFolderName] = useState('')
  const selectedDiagramFolderPath = useMemo(
    () => (selectedDiagram ? normalizeDiagramFolderPath(selectedDiagram.title) : 'Diagrams'),
    [selectedDiagram],
  )
  const currentLibraryFolderPath = selectedLibraryFolderPath ?? selectedDiagramFolderPath
  const [renameFolderName, setRenameFolderName] = useState('') 
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const diagramRootNode = useMemo(() => {
    const existingRoot = diagramTree.find((node) => node.path === 'Diagrams')
    if (existingRoot) return existingRoot
    return {
      name: 'Diagrams',
      path: 'Diagrams',
      children: diagramTree,
      diagrams: diagrams
        .filter((diagram) => normalizeDiagramFolderPath(diagram.title) === 'Diagrams')
        .sort((a, b) => diagramDisplayName(a.title).localeCompare(diagramDisplayName(b.title))),
    }
  }, [diagramTree, diagrams])
  const filteredDiagramTreeNode = useMemo(
    () => filterFileNode(diagramTreeNode, sidebarSearchQuery, (node) => node.name),
    [diagramTreeNode, sidebarSearchQuery],
  )
  const visibleDiagramNodes = useMemo(
    () => (filteredDiagramTreeNode ? [filteredDiagramTreeNode] : []),
    [filteredDiagramTreeNode],
  )
  const sortedVisibleDiagramNodes = useMemo(
    () => sortFileTree(visibleDiagramNodes, sortState, (node) => node.name),
    [visibleDiagramNodes, sortState],
  )
  const filteredDiagramRootNode = useMemo(
    () => filterDiagramFolderNode(diagramRootNode, sidebarSearchQuery),
    [diagramRootNode, sidebarSearchQuery],
  )
  const deletedDiagramTreeNode = useMemo(() => buildDeletedLibraryTreeNode('diagram', deletedItems), [deletedItems])
  const highlightedPaths = useMemo(
    () =>
      selectedDiagramPath
        ? ancestorDirectoryPaths(deriveDirectoryPath(selectedDiagramPath, false)).filter((path) => path !== 'diagrams')
        : [],
    [selectedDiagramPath],
  )

  function applySelection(targetPath: string) {
    if ((targetPath === 'diagrams' || targetPath.startsWith('diagrams/')) && !targetPath.toLowerCase().endsWith('.drawio')) {
      const nextFolderPath = targetPath.replace(/^diagrams\/?/, 'Diagrams/')
      setSelectedLibraryFolderPath(nextFolderPath.replace(/\/$/, '') || 'Diagrams')
    } else if (targetPath === 'Diagrams' || targetPath.startsWith('Diagrams/')) {
      setSelectedLibraryFolderPath(targetPath)
    } else {
      setSelectedLibraryFolderPath(null)
    }
    if (onSelectDiagramPath) {
      onSelectDiagramPath(targetPath)
      return
    }
    if (targetPath.startsWith('diagram:')) {
      onSelectDiagram(targetPath.slice('diagram:'.length))
    }
  }

  useEffect(() => {
    setSelectedLibraryFolderPath(null)
  }, [selectedDiagramId])

  function handleTreeSelection(path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    if (options?.shiftKey && selectedDiagramPath) {
      const range = getTreeRangeSelection(
        treeContainerRef.current,
        selectedDiagramPath,
        path,
        (entry) => entry.startsWith('diagram:') || entry.startsWith('diagrams/'),
      )
      if (range) {
        onSetMarkedPaths(Array.from(new Set(range)))
        applySelection(path)
        return
      }
    }

    if (options?.metaKey || options?.ctrlKey) {
      onSetMarkedPaths((current) => toggleMarkedTreePath(current, path))
      applySelection(path)
      return
    }

    onSetMarkedPaths(
      path.startsWith('diagram:') || path.startsWith('diagrams/')
        ? [path]
        : [],
    )
    applySelection(path)
  }

  function handleTreeOpen(path: string) {
    if (path.startsWith('deleted-diagram:')) {
      void onRestoreDeletedDiagram(path.slice('deleted-diagram:'.length))
      return
    }
    applySelection(path)
  }

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
          onCreateFolder(trimmed, currentLibraryFolderPath)
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
        sectionClassName={`panel diagrams-panel ${diagramFullscreen || standaloneDrawio ? 'fullscreen' : ''}`}
        managerRef={diagramManagerRef}
        managerClassName={`notes-manager diagrams-manager ${diagramDrawerOpen && !standaloneDrawio ? '' : 'library-hidden'} ${activeDiagramSplitter ? 'resizing' : ''} ${diagramFullscreen || standaloneDrawio ? 'fullscreen' : ''}`}
        drawerOpen={diagramDrawerOpen}
        activeSplitter={activeDiagramSplitter}
        paneSize={diagramPaneSize}
        sidebarVisible={diagramDrawerOpen && !standaloneDrawio}
        showSplitter={!standaloneDrawio}
        sidebarClassName="notes-sidebar diagrams-sidebar"
        onStartResize={() => onSetActiveDiagramSplitter(true)}
        onToggleDrawer={onToggleDiagramDrawer}
        sidebar={
          <>
            <LibraryActionBar
              searchOpen={sidebarSearchOpen}
              searchQuery={sidebarSearchQuery}
              searchPlaceholder="Search diagrams"
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
              rootDropPath="Diagrams"
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onDropTargetChange={onDropTargetChange}
              onDropRoot={onDrop}
              commonActions={[
                { key: 'folder', label: 'New folder', icon: <NewFolderIcon />, onClick: () => setCreateFolderOpen(true) },
                {
                  key: 'rename',
                  label: selectedLibraryFolderPath ? 'Rename folder' : 'Rename diagram',
                  icon: <RenameIcon />,
                  disabled: selectedLibraryFolderPath ? currentLibraryFolderPath === 'Diagrams' : !selectedDiagram,
                  onClick: () => {
                    if (!selectedLibraryFolderPath) {
                      titleInputRef.current?.focus()
                      titleInputRef.current?.select()
                      return
                    }
                    setRenameFolderName(currentLibraryFolderPath.split('/').pop() ?? '')
                    setRenameFolderOpen(true)
                  },
                },
                {
                  key: 'upload',
                  kind: 'upload',
                  label: 'Upload diagram',
                  icon: <UploadIcon />,
                  accept: '.drawio,.xml,text/xml,application/xml',
                  onFileSelected: onUploadFile,
                },
              ]}
              pageActions={[{ key: 'diagram', label: 'New diagram', icon: <NewDiagramIcon />, onClick: onCreateDiagram }]}
            />
            <div ref={treeContainerRef} className="folder-tree file-tree notes-folder-tree">
              <FileTreeHeader
                rowMetaVisibility={rowMetaVisibility}
                sortState={sortState}
                onSort={(key) => setSortState((current) => toggleFileTreeSortState(current, key))}
              />
              {sortedVisibleDiagramNodes.length > 0 && diagramTreeNode && onSelectDiagramPath ? (
                <FileTreeNodes
                  nodes={sortedVisibleDiagramNodes}
                  getDisplayName={(treeNode) => treeNode.name}
                  selectedPath={selectedDiagramPath ?? ''}
                  activePath={selectedDiagramPath ?? null}
                  highlightedPaths={highlightedPaths}
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={handleTreeSelection}
                  onOpen={handleTreeOpen}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  canDragNode={(treeNode) =>
                    treeNode.kind === 'file'
                      ? treeNode.path.startsWith('diagrams/') && treeNode.path.toLowerCase().endsWith('.drawio')
                      : treeNode.path !== 'diagrams'
                  }
                  getRowMeta={(treeNode) => ({
                    type: treeNode.kind === 'directory' ? 'Folder' : fileTypeLabel(treeNode.name),
                    size: formatFileSize(treeNode.kind === 'directory' ? aggregateFileNodeSize(treeNode) : treeNode.size_bytes),
                    modified: formatFileTimestamp(treeNode.updated_at),
                    created: formatFileTimestamp(treeNode.created_at),
                  })}
                  rowMetaVisibility={rowMetaVisibility}
                />
              ) : filteredDiagramRootNode ? (
                <DiagramLibraryTreeNode
                  node={filteredDiagramRootNode}
                  selectedDiagramId={selectedDiagramId}
                  activeFolderPath={currentLibraryFolderPath}
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelectPath={handleTreeSelection}
                  onOpenPath={handleTreeOpen}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  rowMetaVisibility={rowMetaVisibility}
                />
              ) : (
                <div className="empty-state">No matching diagrams.</div>
              )}
              {deletedDiagramTreeNode ? (
                <LibraryDeletedTreeNode
                  kind="diagram"
                  node={deletedDiagramTreeNode}
                  deletedItems={deletedItems}
                  selectedPath={selectedDiagramPath ?? ''}
                  activePath={selectedDiagramPath ?? null}
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={handleTreeSelection}
                  onOpen={handleTreeOpen}
                  onDragStart={onDragStart}
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
        <div className="notes-editor-shell diagrams-editor-shell">
          <div className="notes-editor-header">
            <input
              ref={titleInputRef}
              className="input note-title-input notes-title-input"
              value={selectedDiagram?.title ?? ''}
              placeholder="Select or create a diagram"
              disabled={!selectedDiagram}
              onChange={(event) => onChangeSelectedDiagramTitle(event.target.value)}
            />
            {!standaloneDrawio ? (
              <button
                className="button-secondary"
                type="button"
                title="Open self-hosted draw.io"
                onClick={onOpenStandaloneDrawio}
                disabled={!selectedDiagram}
              >
                draw.io
              </button>
            ) : null}
            <div className="notes-editor-actions">
              <div
                className="notes-mode-toggle"
                role="tablist"
                aria-label="Diagram editor mode"
              >
                <button
                  type="button"
                  className={
                    diagramEditorMode === 'diagram'
                      ? 'notes-mode-toggle-button active'
                      : 'notes-mode-toggle-button'
                  }
                  role="tab"
                  aria-selected={diagramEditorMode === 'diagram'}
                  onClick={() => onSetDiagramMode('diagram')}
                >
                  Diagram
                </button>
                <button
                  type="button"
                  className={
                    diagramEditorMode === 'xml'
                      ? 'notes-mode-toggle-button active'
                      : 'notes-mode-toggle-button'
                  }
                  role="tab"
                  aria-selected={diagramEditorMode === 'xml'}
                  onClick={() => onSetDiagramMode('xml')}
                >
                  XML
                </button>
              </div>
              <button
                type="button"
                className="notes-save-indicator"
                onClick={onSaveDiagram}
                title="Save diagram"
                aria-label="Save diagram"
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
              </button>
            </div>
          </div>
          <div className="diagrams-workspace">
            {diagramEditorMode === 'xml' ? (
              <textarea
                className="textarea diagram-xml-pane"
                value={diagramDraft}
                placeholder="Select a diagram to inspect or edit XML"
                disabled={!selectedDiagram}
                onChange={(event) => onChangeDiagramDraft(event.target.value)}
                onKeyDown={onDiagramDraftKeyDown}
              />
            ) : (
              <DrawioDiagramEditor
                ref={drawioEditorRef}
                loadKey={`${selectedDiagram?.id ?? 'empty'}-${diagramLoadVersion}`}
                xml={diagramDraft}
                title={selectedDiagram?.title ?? 'Diagram'}
                sourceFormat={diagramSourceFormat}
                disabled={!selectedDiagram}
                onChange={onChangeDiagramDraft}
                onSave={onPersistDiagramXml}
              />
            )}
          </div>
        </div>
        }
      />
    </>
  )
}
