import type { FileNode } from './types'
import { deriveParentPath } from './ui-helpers'

function sortNodes(nodes: FileNode[]) {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}

function rebaseNodePath(node: FileNode, sourcePath: string, destinationPath: string): FileNode {
  const nextPath =
    node.path === sourcePath ? destinationPath : `${destinationPath}${node.path.slice(sourcePath.length)}`
  return {
    ...node,
    path: nextPath,
    children: node.children.map((child) => rebaseNodePath(child, sourcePath, destinationPath)),
  }
}

function insertNodeIntoParent(nodes: FileNode[], parentPath: string, node: FileNode): FileNode[] {
  if (!parentPath) {
    return sortNodes([...nodes, node])
  }

  return nodes.map((entry) => {
    if (entry.kind !== 'directory') return entry
    if (entry.path === parentPath) {
      return { ...entry, children: sortNodes([...entry.children, node]) }
    }
    return { ...entry, children: insertNodeIntoParent(entry.children, parentPath, node) }
  })
}

export function createOptimisticDirectoryNode(path: string): FileNode {
  const leaf = path.split('/').filter(Boolean).pop() ?? path
  const timestamp = new Date().toISOString()
  return {
    name: leaf,
    path,
    kind: 'directory',
    size_bytes: null,
    created_at: timestamp,
    updated_at: timestamp,
    children: [],
  }
}

export function insertFileTreeNode(nodes: FileNode[], node: FileNode): FileNode[] {
  const parentPath = deriveParentPath(node.path) ?? ''
  return insertNodeIntoParent(nodes, parentPath, node)
}

export function removeFileTreeNode(
  nodes: FileNode[],
  path: string,
): { nodes: FileNode[]; removed: FileNode | null } {
  let removed: FileNode | null = null

  const nextNodes = nodes
    .map((node) => {
      if (node.path === path) {
        removed = node
        return null
      }
      if (node.kind !== 'directory') return node
      const result = removeFileTreeNode(node.children, path)
      if (result.removed) {
        removed = result.removed
        return { ...node, children: result.nodes }
      }
      return node
    })
    .filter((node): node is FileNode => node !== null)

  return { nodes: nextNodes, removed }
}

export function moveFileTreeNode(
  nodes: FileNode[],
  sourcePath: string,
  destinationDir: string,
): { nodes: FileNode[]; moved: FileNode | null } {
  const removal = removeFileTreeNode(nodes, sourcePath)
  if (!removal.removed) {
    return { nodes, moved: null }
  }

  const destinationPath = destinationDir ? `${destinationDir}/${removal.removed.name}` : removal.removed.name
  const rebased = rebaseNodePath(removal.removed, sourcePath, destinationPath)
  return {
    nodes: insertNodeIntoParent(removal.nodes, destinationDir, rebased),
    moved: rebased,
  }
}

export function renameFileTreeNode(
  nodes: FileNode[],
  sourcePath: string,
  newName: string,
): { nodes: FileNode[]; renamed: FileNode | null } {
  const removal = removeFileTreeNode(nodes, sourcePath)
  if (!removal.removed) {
    return { nodes, renamed: null }
  }

  const parentPath = deriveParentPath(sourcePath) ?? ''
  const destinationPath = parentPath ? `${parentPath}/${newName}` : newName
  const rebased = rebaseNodePath({ ...removal.removed, name: newName }, sourcePath, destinationPath)
  return {
    nodes: insertNodeIntoParent(removal.nodes, parentPath, rebased),
    renamed: rebased,
  }
}

export function replaceFileTreeNode(
  nodes: FileNode[],
  sourcePath: string,
  nextNode: FileNode,
): { nodes: FileNode[]; replaced: FileNode | null } {
  const removal = removeFileTreeNode(nodes, sourcePath)
  if (!removal.removed) {
    return { nodes, replaced: null }
  }
  const mergedNode =
    removal.removed.kind === 'directory'
      ? { ...nextNode, children: removal.removed.children }
      : nextNode
  return {
    nodes: insertNodeIntoParent(removal.nodes, deriveParentPath(mergedNode.path) ?? '', mergedNode),
    replaced: mergedNode,
  }
}
