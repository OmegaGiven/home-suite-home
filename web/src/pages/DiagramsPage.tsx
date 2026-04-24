import { useMemo, useRef, useState, type KeyboardEventHandler, type RefObject } from 'react'
import { DrawioDiagramEditor, type DrawioDiagramEditorHandle } from '../components/DrawioDiagramEditor'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { DiagramLibraryTreeNode } from '../components/DiagramLibraryTreeNode'
import { FileTreeNode } from '../components/FileTreeNode'
import { LibraryShell } from '../components/LibraryShell'
import type { DiagramEditorMode } from '../lib/app-config'
import type { Diagram, FileNode } from '../lib/types'
import { diagramDisplayName, normalizeDiagramFolderPath, type DiagramFolderNode } from '../lib/ui-helpers'

function NewDiagramIcon() {
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
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
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
                  disabled={currentLibraryFolderPath === 'Diagrams'}
                >
                  <RenameIcon />
                </button>
                <button
                  className="button-secondary notes-new-button"
                  onClick={onCreateDiagram}
                  aria-label="New diagram"
                  title="New diagram"
                >
                  <NewDiagramIcon />
                </button>
                <button
                  className="button-secondary notes-new-button"
                  onClick={() => uploadInputRef.current?.click()}
                  aria-label="Upload diagram"
                  title="Upload diagram"
                >
                  <UploadIcon />
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".drawio,.xml,text/xml,application/xml"
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
              {diagramTreeNode && onSelectDiagramPath ? (
                <FileTreeNode
                  node={diagramTreeNode}
                  getDisplayName={(treeNode) => treeNode.name}
                  selectedPath={selectedDiagramPath ?? ''}
                  activePath={selectedDiagramPath ?? null}
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
                />
              ) : (
                <DiagramLibraryTreeNode
                  node={diagramRootNode}
                  selectedDiagramId={selectedDiagramId}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelectDiagram={onSelectDiagram}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                />
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
              <button className="button" onClick={onSaveDiagram}>
                Save
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
