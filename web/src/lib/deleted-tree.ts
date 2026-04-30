import type { AdminDeletedItem, FileNode } from './types'
import type { FileTreeRowMeta } from '../components/FileTreeNode'

export type DeletedTreeKind = 'note' | 'diagram' | 'voice'

const CONFIG: Record<DeletedTreeKind, { rootPath: string; itemPrefix: string; label: string }> = {
  note: { rootPath: 'deleted-notes', itemPrefix: 'deleted-note:', label: 'Untitled note' },
  diagram: { rootPath: 'deleted-diagrams', itemPrefix: 'deleted-diagram:', label: 'Untitled diagram' },
  voice: { rootPath: 'deleted-voice', itemPrefix: 'deleted-voice:', label: 'Untitled memo' },
}

export function buildDeletedLibraryTreeNode(kind: DeletedTreeKind, items: AdminDeletedItem[]): FileNode | null {
  if (items.length === 0) return null
  const config = CONFIG[kind]
  return {
    name: 'Recently deleted',
    path: config.rootPath,
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: items[0]?.deleted_at ?? null,
    children: items.map((item) => ({
      name: item.label || config.label,
      path: `${config.itemPrefix}${item.id}`,
      kind: 'file',
      size_bytes: null,
      created_at: item.deleted_at,
      updated_at: item.deleted_at,
      children: [],
    })),
  }
}

export function deletedTreePathPrefix(kind: DeletedTreeKind) {
  return CONFIG[kind].itemPrefix
}

export function deletedItemFromTreePath(
  kind: DeletedTreeKind,
  path: string,
  items: AdminDeletedItem[],
) {
  const prefix = deletedTreePathPrefix(kind)
  if (!path.startsWith(prefix)) return null
  return items.find((entry) => `${prefix}${entry.id}` === path) ?? null
}

export function deletedTreeRowMeta(
  kind: DeletedTreeKind,
  treePath: string,
  items: AdminDeletedItem[],
): FileTreeRowMeta {
  const item = deletedItemFromTreePath(kind, treePath, items)
  if (!item) {
    return {
      type: 'Folder',
      modified: items[0] ? new Date(items[0].deleted_at).toLocaleString() : undefined,
    }
  }
  return {
    type: 'Deleted',
    modified: new Date(item.deleted_at).toLocaleString(),
    created: new Date(item.purge_at).toLocaleString(),
  }
}
