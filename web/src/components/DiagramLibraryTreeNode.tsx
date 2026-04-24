import type { DragEvent } from 'react'
import { FileTreeNode } from './FileTreeNode'
import type { FileNode } from '../lib/types'
import type { DiagramFolderNode } from '../lib/ui-helpers'
import { diagramDisplayName } from '../lib/ui-helpers'

type Props = {
  node: DiagramFolderNode
  selectedDiagramId: string | null
  draggingPath: string | null
  dropTargetPath: string | null
  onSelectDiagram: (id: string) => void
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
}

export function DiagramLibraryTreeNode({
  node,
  selectedDiagramId,
  draggingPath,
  dropTargetPath,
  onSelectDiagram,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
}: Props) {
  const fileNode = convertDiagramFolderNode(node)

  return (
    <FileTreeNode
      node={fileNode}
      getDisplayName={(treeNode) => treeNode.name}
      selectedPath={selectedDiagramId ? `diagram:${selectedDiagramId}` : ''}
      activePath={selectedDiagramId ? `diagram:${selectedDiagramId}` : null}
      markedPaths={[]}
      draggingPath={draggingPath}
      dropTargetPath={dropTargetPath}
      onSelect={(path) => {
        if (!path.startsWith('diagram:')) return
        onSelectDiagram(path.slice('diagram:'.length))
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDropTargetChange={onDropTargetChange}
      onDrop={onDrop}
      canDragNode={(treeNode) =>
        treeNode.kind === 'file'
          ? treeNode.path.startsWith('diagram:')
          : treeNode.path !== 'Diagrams'
      }
      isNodeActive={(treeNode) =>
        treeNode.kind === 'directory'
          ? directoryContainsDiagramId(node, treeNode.path, selectedDiagramId)
          : treeNode.path === (selectedDiagramId ? `diagram:${selectedDiagramId}` : '')
      }
    />
  )
}

function convertDiagramFolderNode(node: DiagramFolderNode): FileNode {
  return {
    name: node.name,
    path: node.path,
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: null,
    children: [
      ...node.diagrams.map((diagram) => ({
        name: diagramDisplayName(diagram.title),
        path: `diagram:${diagram.id}`,
        kind: 'file' as const,
        size_bytes: null,
        created_at: diagram.created_at,
        updated_at: diagram.updated_at,
        children: [],
      })),
      ...node.children.map((child) => convertDiagramFolderNode(child)),
    ],
  }
}

function directoryContainsDiagramId(node: DiagramFolderNode, path: string, selectedDiagramId: string | null): boolean {
  if (!selectedDiagramId) return false
  if (node.path === path) {
    return containsDiagramId(node, selectedDiagramId)
  }
  for (const child of node.children) {
    if (directoryContainsDiagramId(child, path, selectedDiagramId)) return true
  }
  return false
}

function containsDiagramId(node: DiagramFolderNode, selectedDiagramId: string): boolean {
  if (node.diagrams.some((diagram) => diagram.id === selectedDiagramId)) return true
  return node.children.some((child) => containsDiagramId(child, selectedDiagramId))
}
