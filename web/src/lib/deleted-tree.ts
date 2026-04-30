import type { AdminDeletedItem, DeletedResourceKind, FileNode } from './types'
import type { FileTreeRowMeta } from '../components/FileTreeNode'

export type DeletedTreeKind = 'note' | 'diagram' | 'voice' | 'drive'

const CONFIG: Record<
  DeletedTreeKind,
  { rootPath: string; itemPrefix: string; label: string; resourceKind: DeletedResourceKind; sectionLabel: string }
> = {
  note: { rootPath: 'deleted-notes', itemPrefix: 'deleted-note:', label: 'Untitled note', resourceKind: 'note', sectionLabel: 'Notes' },
  diagram: { rootPath: 'deleted-diagrams', itemPrefix: 'deleted-diagram:', label: 'Untitled diagram', resourceKind: 'diagram', sectionLabel: 'Diagrams' },
  voice: { rootPath: 'deleted-voice', itemPrefix: 'deleted-voice:', label: 'Untitled memo', resourceKind: 'voice_memo', sectionLabel: 'Voice' },
  drive: { rootPath: 'deleted-files', itemPrefix: 'deleted-drive:', label: 'Untitled file', resourceKind: 'drive_path', sectionLabel: 'Files' },
}

function displayLabelForDeletedItem(kind: DeletedTreeKind, item: AdminDeletedItem) {
  const label = item.label?.trim()
  if (label) return label
  if (kind === 'drive') {
    const segments = item.original_path.split('/').filter(Boolean)
    return segments[segments.length - 1] || CONFIG[kind].label
  }
  return CONFIG[kind].label
}

function buildDeletedItemNode(kind: DeletedTreeKind, item: AdminDeletedItem): FileNode {
  const config = CONFIG[kind]
  return {
    name: displayLabelForDeletedItem(kind, item),
    path: `${config.itemPrefix}${item.id}`,
    kind: 'file',
    size_bytes: null,
    created_at: item.deleted_at,
    updated_at: item.deleted_at,
    children: [],
  }
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
    children: items.map((item) => buildDeletedItemNode(kind, item)),
  }
}

export function buildDeletedFilesTreeNode(items: AdminDeletedItem[]): FileNode | null {
  const sections: FileNode[] = []
  for (const kind of Object.keys(CONFIG) as DeletedTreeKind[]) {
      const config = CONFIG[kind]
      const matchingItems = items.filter((item) => item.kind === config.resourceKind)
      if (matchingItems.length === 0) continue
      sections.push({
        name: config.sectionLabel,
        path: `deleted-group:${kind}`,
        kind: 'directory' as const,
        size_bytes: null,
        created_at: null,
        updated_at: matchingItems[0]?.deleted_at ?? null,
        children: matchingItems.map((item) => buildDeletedItemNode(kind, item)),
      })
  }

  return {
    name: 'Recently deleted',
    path: 'deleted-items',
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: sections[0]?.updated_at ?? null,
    children: sections,
  }
}

export function deletedTreePathPrefix(kind: DeletedTreeKind) {
  return CONFIG[kind].itemPrefix
}

function deletedTreeKindFromPath(path: string): DeletedTreeKind | null {
  for (const kind of Object.keys(CONFIG) as DeletedTreeKind[]) {
    if (path.startsWith(CONFIG[kind].itemPrefix)) {
      return kind
    }
  }
  return null
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

export function deletedItemFromAnyTreePath(path: string, items: AdminDeletedItem[]) {
  const kind = deletedTreeKindFromPath(path)
  if (!kind) return null
  return deletedItemFromTreePath(kind, path, items)
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
