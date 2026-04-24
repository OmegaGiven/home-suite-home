import type { ReactNode } from 'react'
import type { FileNode } from './types'
import { fileTypeLabel, formatFileSize, formatFileTimestamp } from './ui-helpers'
import { parentDirectoryLabel } from './file-display'

export type FileColumnKey = 'name' | 'directory' | 'type' | 'size' | 'modified' | 'created'

export function canDeleteManagedPath(path: string | null | undefined) {
  if (!path) return false
  return (
    path !== 'drive' &&
    path !== 'notes' &&
    path !== 'diagrams' &&
    path !== 'voice' &&
    (path.startsWith('drive/') ||
      path.startsWith('notes/') ||
      path.startsWith('diagrams/') ||
      path.startsWith('voice/'))
  )
}

export function canRenameManagedPath(path: string | null | undefined) {
  if (!path) return false
  return (
    path !== 'drive' &&
    path !== 'notes' &&
    path !== 'diagrams' &&
    path !== 'voice' &&
    (path.startsWith('drive/') ||
      path.startsWith('notes/') ||
      path.startsWith('diagrams/') ||
      path.startsWith('voice/'))
  )
}

export function normalizeManagedDeletePaths(paths: string[]) {
  return Array.from(new Set(paths))
    .filter((path) => canDeleteManagedPath(path))
    .sort((left, right) => left.length - right.length)
    .filter((path, index, values) => !values.slice(0, index).some((parent) => path.startsWith(`${parent}/`)))
}

export function convertibleTextExtension(path: string | null | undefined) {
  if (!path || !path.startsWith('drive/')) return null
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'txt') return 'md'
  if (extension === 'md') return 'txt'
  return null
}

export function canConvertManagedPath(path: string | null | undefined, isAdmin: boolean) {
  return convertibleTextExtension(path) !== null && isAdmin
}

export function importedFolderForPath(path: string) {
  const parts = path.split('/').slice(1, -1).filter(Boolean)
  return parts.length > 0 ? `Imported/${parts.join('/')}` : 'Imported'
}

export function renderFileColumnCell(
  node: FileNode,
  column: FileColumnKey,
  getDisplayName: (node: FileNode) => string,
): ReactNode {
  if (column === 'name') {
    return (
      <span className="file-name-cell">
        <span>{node.kind === 'directory' ? `/${getDisplayName(node)}` : getDisplayName(node)}</span>
      </span>
    )
  }
  if (column === 'directory') {
    return <span className="muted file-directory-cell">{parentDirectoryLabel(node.path)}</span>
  }
  if (column === 'type') {
    return <span className="muted">{node.kind === 'directory' ? 'Folder' : fileTypeLabel(node.name)}</span>
  }
  if (column === 'size') {
    return <span className="muted file-size-cell">{node.kind === 'directory' ? '—' : formatFileSize(node.size_bytes)}</span>
  }
  if (column === 'modified') {
    return <span className="muted file-modified-cell">{formatFileTimestamp(node.updated_at)}</span>
  }
  return <span className="muted file-created-cell">{formatFileTimestamp(node.created_at)}</span>
}
