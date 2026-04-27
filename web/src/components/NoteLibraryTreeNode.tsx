import type { DragEvent } from 'react'
import { FileTreeNode, FileTreeNodes, type FileTreeRowMeta, type FileTreeRowMetaVisibility } from './FileTreeNode'
import type { FileNode, Note } from '../lib/types'
import type { FileTreeSortState, NoteFolderNode } from '../lib/ui-helpers'
import { aggregateFileNodeSize, ancestorDirectoryPaths, formatFileSize, formatFileTimestamp, sortFileTree } from '../lib/ui-helpers'

type Props = {
  node: NoteFolderNode
  activeFolderPath: string | null
  selectedNoteId: string | null
  hideRoot?: boolean
  draggingPath: string | null
  dropTargetPath: string | null
  onSelectNote: (note: Note) => void
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  rowMetaVisibility?: FileTreeRowMetaVisibility
  sortState?: FileTreeSortState | null
}

export function NoteLibraryTreeNode({
  node,
  activeFolderPath,
  selectedNoteId,
  hideRoot = false,
  draggingPath,
  dropTargetPath,
  onSelectNote,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  rowMetaVisibility,
  sortState = null,
}: Props) {
  const fileNode = convertNoteFolderNode(node)
  const highlightedPaths = ancestorDirectoryPaths(activeFolderPath)
  const rootContents =
    hideRoot && node.path === 'Inbox'
      ? sortFileTree([
          ...node.notes.map((note) => ({
            name: note.title,
            path: `note:${note.id}`,
            kind: 'file' as const,
            size_bytes: new TextEncoder().encode(note.markdown || '').length,
            created_at: note.created_at,
            updated_at: note.updated_at,
            children: [],
          })),
          ...node.children.map((child) => convertNoteFolderNode(child)),
        ], sortState)
      : null

  const sharedProps = {
    getDisplayName: (treeNode: FileNode) => treeNode.name,
    selectedPath: selectedNoteId ? `note:${selectedNoteId}` : '',
    activePath: selectedNoteId ? `note:${selectedNoteId}` : null,
    highlightedPaths,
    markedPaths: [],
    draggingPath,
    dropTargetPath,
    onSelect: (path: string) => {
      if (!path.startsWith('note:')) return
      const note = findNoteInFolderNode(node, path.slice('note:'.length))
      if (note) onSelectNote(note)
    },
    onDragStart,
    onDragEnd,
    onDropTargetChange,
    onDrop,
    canDragNode: (treeNode: FileNode) =>
      treeNode.kind === 'file'
        ? treeNode.path.startsWith('note:')
        : treeNode.path !== 'Inbox',
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

function convertNoteFolderNode(node: NoteFolderNode): FileNode {
  const childNodes = [
    ...node.notes.map((note) => ({
      name: note.title,
      path: `note:${note.id}`,
      kind: 'file' as const,
      size_bytes: new TextEncoder().encode(note.markdown || '').length,
      created_at: note.created_at,
      updated_at: note.updated_at,
      children: [],
    })),
    ...node.children.map((child) => convertNoteFolderNode(child)),
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
    type: node.kind === 'directory' ? 'Folder' : 'Note',
    size: formatFileSize(node.kind === 'directory' ? aggregateFileNodeSize(node) : node.size_bytes),
    modified: formatFileTimestamp(node.updated_at),
    created: formatFileTimestamp(node.created_at),
  }
}

function findNoteInFolderNode(node: NoteFolderNode, noteId: string): Note | null {
  const direct = node.notes.find((note) => note.id === noteId)
  if (direct) return direct
  for (const child of node.children) {
    const nested = findNoteInFolderNode(child, noteId)
    if (nested) return nested
  }
  return null
}
