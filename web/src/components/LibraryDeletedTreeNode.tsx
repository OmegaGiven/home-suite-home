import { FileTreeNode, type FileTreeRowMetaVisibility } from './FileTreeNode'
import type { FileNode } from '../lib/types'
import { deletedTreeRowMeta, type DeletedTreeKind } from '../lib/deleted-tree'
import type { AdminDeletedItem } from '../lib/types'
import type { TreeSelectionOptions } from '../lib/library-tree-controls'

type Props = {
  kind: DeletedTreeKind
  node: FileNode
  deletedItems: AdminDeletedItem[]
  selectedPath: string
  activePath: string | null
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  onSelect: (path: string, options?: TreeSelectionOptions) => void
  onOpen: (path: string) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  rowMetaVisibility: FileTreeRowMetaVisibility
}

export function LibraryDeletedTreeNode({
  kind,
  node,
  deletedItems,
  selectedPath,
  activePath,
  markedPaths,
  draggingPath,
  dropTargetPath,
  onSelect,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  rowMetaVisibility,
}: Props) {
  return (
    <FileTreeNode
      node={node}
      getDisplayName={(treeNode) => treeNode.name}
      selectedPath={selectedPath}
      activePath={activePath}
      markedPaths={markedPaths}
      draggingPath={draggingPath}
      dropTargetPath={dropTargetPath}
      onSelect={onSelect}
      onOpen={onOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDropTargetChange={onDropTargetChange}
      onDrop={onDrop}
      canDragNode={() => false}
      getRowMeta={(treeNode) => deletedTreeRowMeta(kind, treeNode.path, deletedItems)}
      rowMetaVisibility={rowMetaVisibility}
    />
  )
}
