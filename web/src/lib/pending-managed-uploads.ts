import { insertFileTreeNode } from './file-tree-state'
import type { FileNode, PendingManagedUploadRecord } from './types'

export function pendingManagedUploadPath(record: PendingManagedUploadRecord) {
  return `${record.path}/${record.filename}`.replace(/\/+/g, '/')
}

export function pendingManagedUploadToFileNode(record: PendingManagedUploadRecord): FileNode {
  return {
    name: record.filename,
    path: pendingManagedUploadPath(record),
    kind: 'file',
    size_bytes: record.size_bytes,
    created_at: record.created_at,
    updated_at: record.created_at,
    children: [],
  }
}

export function mergePendingManagedUploads(fileTree: FileNode[], uploads: PendingManagedUploadRecord[]): FileNode[] {
  const existingPaths = new Set<string>()
  const stack = [...fileTree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    existingPaths.add(node.path)
    if (node.children.length > 0) {
      stack.push(...node.children)
    }
  }

  return uploads.reduce((current, record) => {
    const node = pendingManagedUploadToFileNode(record)
    if (existingPaths.has(node.path)) {
      return current
    }
    existingPaths.add(node.path)
    return insertFileTreeNode(current, node)
  }, fileTree)
}
