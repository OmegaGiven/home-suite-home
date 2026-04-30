import type { DragEvent, KeyboardEventHandler, RefObject } from 'react'
import type { DiagramEditorMode } from './app-config'
import type { AdminDeletedItem, Diagram, FileNode } from './types'
import type { DiagramFolderNode } from './ui-helpers'
import type { DrawioDiagramEditorHandle } from '../components/DrawioDiagramEditor'

type BuildDiagramsPagePropsArgs = {
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
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
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

export function buildDiagramsPageProps(args: BuildDiagramsPagePropsArgs) {
  return { ...args }
}

