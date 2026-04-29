import type { DragEvent } from 'react'
import { FileTreeNode, FileTreeNodes, type FileTreeRowMeta, type FileTreeRowMetaVisibility } from './FileTreeNode'
import type { FileNode } from '../lib/types'
import type { DiagramFolderNode, FileTreeSortState } from '../lib/ui-helpers'
import { aggregateFileNodeSize, ancestorDirectoryPaths, diagramDisplayName, formatFileSize, formatFileTimestamp, sortFileTree } from '../lib/ui-helpers'

type Props = {
  node: DiagramFolderNode
  selectedDiagramId: string | null
  activeFolderPath: string | null
  hideRoot?: boolean
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  onSelectPath: (path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void
  onOpenPath?: (path: string) => void
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  rowMetaVisibility?: FileTreeRowMetaVisibility
  sortState?: FileTreeSortState | null
}

export function DiagramLibraryTreeNode({
  node,
  selectedDiagramId,
  activeFolderPath,
  hideRoot = false,
  markedPaths,
  draggingPath,
  dropTargetPath,
  onSelectPath,
  onOpenPath,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  rowMetaVisibility,
  sortState = null,
}: Props) {
  const fileNode = convertDiagramFolderNode(node)
  const highlightedPaths = ancestorDirectoryPaths(activeFolderPath)
  const rootContents =
    hideRoot && node.path === 'Diagrams'
      ? sortFileTree([
          ...node.diagrams.map((diagram) => ({
            name: diagramDisplayName(diagram.title),
            path: `diagram:${diagram.id}`,
            kind: 'file' as const,
            size_bytes: new TextEncoder().encode(diagram.xml || '').length,
            created_at: diagram.created_at,
            updated_at: diagram.updated_at,
            children: [],
          })),
          ...node.children.map((child) => convertDiagramFolderNode(child)),
        ], sortState)
      : null

  const sharedProps = {
    getDisplayName: (treeNode: FileNode) => treeNode.name,
    selectedPath: selectedDiagramId ? `diagram:${selectedDiagramId}` : '',
    activePath: selectedDiagramId ? `diagram:${selectedDiagramId}` : null,
    highlightedPaths,
    markedPaths,
    draggingPath,
    dropTargetPath,
    onSelect: onSelectPath,
    onOpen: onOpenPath,
    onDragStart,
    onDragEnd,
    onDropTargetChange,
    onDrop,
    canDragNode: (treeNode: FileNode) =>
      treeNode.kind === 'file'
        ? treeNode.path.startsWith('diagram:')
        : treeNode.path !== 'Diagrams',
    getRowMeta: buildRowMeta,
    rowMetaVisibility,
  }

  if (rootContents) {
    return <FileTreeNodes nodes={rootContents} {...sharedProps} />
  }

  return (
    <FileTreeNode
      node={sortState ? sortFileTree([fileNode], sortState)[0] : fileNode}
      {...sharedProps}
    />
  )
}

function convertDiagramFolderNode(node: DiagramFolderNode): FileNode {
  const childNodes = [
    ...node.diagrams.map((diagram) => ({
      name: diagramDisplayName(diagram.title),
      path: `diagram:${diagram.id}`,
      kind: 'file' as const,
      size_bytes: new TextEncoder().encode(diagram.xml || '').length,
      created_at: diagram.created_at,
      updated_at: diagram.updated_at,
      children: [],
    })),
    ...node.children.map((child) => convertDiagramFolderNode(child)),
  ]
  const latestUpdatedAt = childNodes.reduce<string | null>((latest, child) => {
    const candidate = child.updated_at ?? null
    if (!candidate) return latest
    if (!latest) return candidate
    return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest
  }, null)

  return {
    name: node.name,
    path: node.path,
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: latestUpdatedAt,
    children: childNodes,
  }
}

function buildRowMeta(node: FileNode): FileTreeRowMeta {
  return {
    type: node.kind === 'directory' ? 'Folder' : 'Diagram',
    size: formatFileSize(node.kind === 'directory' ? aggregateFileNodeSize(node) : node.size_bytes),
    modified: formatFileTimestamp(node.updated_at),
    created: formatFileTimestamp(node.created_at),
  }
}
