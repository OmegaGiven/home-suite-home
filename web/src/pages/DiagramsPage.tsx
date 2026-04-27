import { useMemo, useState, type KeyboardEventHandler, type RefObject } from 'react'
import { DrawioDiagramEditor, type DrawioDiagramEditorHandle } from '../components/DrawioDiagramEditor'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { DiagramLibraryTreeNode } from '../components/DiagramLibraryTreeNode'
import { FileTreeHeader, FileTreeNodes, type FileTreeRowMetaVisibility } from '../components/FileTreeNode'
import { LibraryActionBar } from '../components/LibraryActionBar'
import { NewDiagramIcon, NewFolderIcon, RenameIcon, UploadIcon } from '../components/LibraryActionIcons'
import { LibraryShell } from '../components/LibraryShell'
import type { DiagramEditorMode } from '../lib/app-config'
import type { Diagram, FileNode } from '../lib/types'
import { aggregateFileNodeSize, ancestorDirectoryPaths, deriveDirectoryPath, diagramDisplayName, fileTypeLabel, filterDiagramFolderNode, filterFileNode, formatFileSize, formatFileTimestamp, normalizeDiagramFolderPath, sortFileTree, toggleFileTreeSortState, type DiagramFolderNode, type FileTreeSortState } from '../lib/ui-helpers'

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
  selectedDiagramId: string | null
  selectedDiagramPath?: string | null
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
  selectedDiagramId,
  selectedDiagramPath,
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
}: Props) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
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
  const currentLibraryFolderPath = useMemo(
    () => (selectedDiagram ? normalizeDiagramFolderPath(selectedDiagram.title) : 'Diagrams'),
    [selectedDiagram],
  )
  const [renameFolderName, setRenameFolderName] = useState('') 
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
    () =>
      filteredDiagramTreeNode?.path === 'diagrams'
        ? filteredDiagramTreeNode.children
        : filteredDiagramTreeNode
          ? [filteredDiagramTreeNode]
          : [],
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
  const highlightedPaths = useMemo(
    () =>
      selectedDiagramPath
        ? ancestorDirectoryPaths(deriveDirectoryPath(selectedDiagramPath, false)).filter((path) => path !== 'diagrams')
        : [],
    [selectedDiagramPath],
  )

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
                  label: 'Rename folder',
                  icon: <RenameIcon />,
                  disabled: currentLibraryFolderPath === 'Diagrams',
                  onClick: () => {
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
            <div className="folder-tree file-tree notes-folder-tree">
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
                  markedPaths={[]}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={onSelectDiagramPath}
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
                  hideRoot
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelectDiagram={onSelectDiagram}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  rowMetaVisibility={rowMetaVisibility}
                />
              ) : (
                <div className="empty-state">No matching diagrams.</div>
              )}
            </div>
          </>
        }
        content={
        <div className="notes-editor-shell diagrams-editor-shell">
          <div className="notes-editor-header">
            <input
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
              <button
                className={diagramEditorMode === 'diagram' ? 'button' : 'button-secondary'}
                onClick={() => onSetDiagramMode('diagram')}
              >
                Diagram
              </button>
              <button
                className={diagramEditorMode === 'xml' ? 'button' : 'button-secondary'}
                onClick={() => onSetDiagramMode('xml')}
              >
                XML
              </button>
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
