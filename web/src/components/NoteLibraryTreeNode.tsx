import type { DragEvent } from 'react'
import { FileTreeNode } from './FileTreeNode'
import type { FileNode, Note } from '../lib/types'
import type { NoteFolderNode } from '../lib/ui-helpers'

type Props = {
  node: NoteFolderNode
  activeFolderPath: string | null
  selectedNoteId: string | null
  draggingPath: string | null
  dropTargetPath: string | null
  onSelectNote: (note: Note) => void
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
}

export function NoteLibraryTreeNode({
  node,
  activeFolderPath,
  selectedNoteId,
  draggingPath,
  dropTargetPath,
  onSelectNote,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
}: Props) {
  const fileNode: FileNode = {
    name: node.name,
    path: node.path,
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: null,
    children: [
      ...node.notes.map((note) => ({
        name: note.title,
        path: `note:${note.id}`,
        kind: 'file' as const,
        size_bytes: null,
        created_at: note.created_at,
        updated_at: note.updated_at,
        children: [],
      })),
      ...node.children.map((child) => convertNoteFolderNode(child)),
    ],
  }

  return (
    <FileTreeNode
      node={fileNode}
      getDisplayName={(treeNode) => treeNode.name}
      selectedPath={selectedNoteId ? `note:${selectedNoteId}` : ''}
      activePath={selectedNoteId ? `note:${selectedNoteId}` : null}
      markedPaths={[]}
      draggingPath={draggingPath}
      dropTargetPath={dropTargetPath}
      onSelect={(path) => {
        if (!path.startsWith('note:')) return
        const note = findNoteInFolderNode(node, path.slice('note:'.length))
        if (note) onSelectNote(note)
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDropTargetChange={onDropTargetChange}
      onDrop={onDrop}
      canDragNode={(treeNode) =>
        treeNode.kind === 'file'
          ? treeNode.path.startsWith('note:')
          : treeNode.path !== 'Inbox'
      }
      isNodeActive={(treeNode) =>
        treeNode.kind === 'directory'
          ? activeFolderPath === treeNode.path || (activeFolderPath?.startsWith(`${treeNode.path}/`) ?? false)
          : treeNode.path === (selectedNoteId ? `note:${selectedNoteId}` : '')
      }
    />
  )
}

function convertNoteFolderNode(node: NoteFolderNode): FileNode {
  return {
    name: node.name,
    path: node.path,
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: null,
    children: [
      ...node.notes.map((note) => ({
        name: note.title,
        path: `note:${note.id}`,
        kind: 'file' as const,
        size_bytes: null,
        created_at: note.created_at,
        updated_at: note.updated_at,
        children: [],
      })),
      ...node.children.map((child) => convertNoteFolderNode(child)),
    ],
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
