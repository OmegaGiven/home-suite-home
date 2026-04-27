import type { CSSProperties } from 'react'
import type { Diagram, FileNode, Note } from './types'

export type FileTreeSortKey = 'name' | 'type' | 'size' | 'modified' | 'created'
export type FileTreeSortDirection = 'desc' | 'asc'
export type FileTreeSortState = {
  key: FileTreeSortKey
  direction: FileTreeSortDirection
}

export type FolderNode = {
  name: string
  path: string
  children: FolderNode[]
}

export type NoteFolderNode = {
  name: string
  path: string
  children: NoteFolderNode[]
  notes: Note[]
}

export type DiagramFolderNode = {
  name: string
  path: string
  children: DiagramFolderNode[]
  diagrams: Diagram[]
}

export type NoteInsertKind =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'quote'
  | 'bullet-list'
  | 'numbered-list'
  | 'task-list'
  | 'code-block'
  | 'divider'
  | 'table'

export type NoteToolbarAction =
  | 'undo'
  | 'redo'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'divider'
  | 'bullet-list'
  | 'code-block'
  | 'table'
  | 'quote'
  | 'link'

export function defaultNoteTitle() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `Note ${year}-${month}-${day} ${hours}:${minutes}`
}

export function defaultVoiceMemoTitle(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `Memo ${year}-${month}-${day} ${hours}:${minutes}`
}

export function voiceMemoDisplayTitle(createdAt?: string | null, fallback = 'Memo') {
  if (!createdAt) return fallback
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return fallback
  return defaultVoiceMemoTitle(parsed)
}

export function formatDurationSeconds(totalSeconds?: number | null) {
  if (!Number.isFinite(totalSeconds) || totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
    return '—'
  }
  const rounded = Math.round(totalSeconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const seconds = rounded % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.isContentEditable) return true
  if (element.closest('[contenteditable="true"]')) return true
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function blurEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return
  const editableRoot = element.isContentEditable
    ? element
    : (element.closest('[contenteditable="true"]') as HTMLElement | null)
  const focusTarget = editableRoot ?? element
  if (typeof focusTarget.blur === 'function') {
    focusTarget.blur()
  }
  const selection = window.getSelection()
  selection?.removeAllRanges()
}

export function insertTextAtSelection(text: string) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function getCaretOffsetInContentEditable(root: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  const beforeRange = range.cloneRange()
  beforeRange.selectNodeContents(root)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  return beforeRange.toString().length
}

export function getCaretRectForOffset(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(offset, 0)
  let currentNode = walker.nextNode()

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0
    if (remaining <= textLength) {
      const range = document.createRange()
      range.setStart(currentNode, Math.min(remaining, textLength))
      range.collapse(true)
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
      if (rect && (rect.width || rect.height)) return rect
      break
    }
    remaining -= textLength
    currentNode = walker.nextNode()
  }

  const fallbackRect = root.getBoundingClientRect()
  if (!fallbackRect.width && !fallbackRect.height) return null
  return fallbackRect
}

export function colorForPresenceLabel(label: string) {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue} 78% 68%)`
}

export function normalizeFolderPath(value: string) {
  const normalized = value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
  return normalized || 'Inbox'
}

export function normalizeDiagramTitlePath(value: string) {
  return value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/') || 'Diagrams/Untitled'
}

export function normalizeDiagramFolderPath(title: string) {
  const parts = normalizeDiagramTitlePath(title).split('/')
  if (parts.length <= 1) return 'Diagrams'
  return parts.slice(0, -1).join('/')
}

export function normalizeDiagramDirectoryPath(value: string) {
  const normalized = value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
  return normalized || 'Diagrams'
}

export function managedPathForNoteFolder(folderPath: string) {
  return `notes/${normalizeFolderPath(folderPath)}`
}

export function managedPathForDiagramFolder(folderPath: string) {
  const normalized = normalizeDiagramDirectoryPath(folderPath)
  const withoutRoot = normalized.replace(/^Diagrams(?:\/|$)/, '')
  return withoutRoot ? `diagrams/${withoutRoot}` : 'diagrams'
}

export function normalizeVoiceDirectoryPath(value: string) {
  const normalized = value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
  return normalized || 'voice'
}

export function managedPathForVoiceFolder(folderPath: string) {
  const normalized = normalizeVoiceDirectoryPath(folderPath)
  const withoutRoot = normalized.replace(/^voice(?:\/|$)/, '')
  return withoutRoot ? `voice/${withoutRoot}` : 'voice'
}

export function diagramDisplayName(title: string) {
  const parts = normalizeDiagramTitlePath(title).split('/')
  return parts[parts.length - 1] || 'Untitled'
}

export function fileTypeLabel(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (!extension || extension === name.toLowerCase()) return 'File'
  if (extension === 'md') return 'Markdown'
  if (extension === 'drawio') return 'Diagram'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'Image'
  if (['mp3', 'wav', 'm4a', 'webm'].includes(extension)) return 'Audio'
  if (['zip', 'tar', 'gz'].includes(extension)) return 'Archive'
  return extension.toUpperCase()
}

export function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatFileTimestamp(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${year}.${month}.${day}:${hours}:${minutes}`
}

export function aggregateFileNodeSize(node: FileNode): number | null {
  if (node.kind === 'file') return node.size_bytes ?? null
  let total = 0
  let hasSize = false
  for (const child of node.children) {
    const childSize = aggregateFileNodeSize(child)
    if (typeof childSize === 'number') {
      total += childSize
      hasSize = true
    }
  }
  return hasSize ? total : null
}

export function filterFileTree(
  nodes: FileNode[],
  query: string,
  getDisplayName: (node: FileNode) => string = (node) => node.name,
): FileNode[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return nodes

  const filterNode = (node: FileNode): FileNode | null => {
    const matchesSelf =
      getDisplayName(node).toLowerCase().includes(normalized) ||
      node.path.toLowerCase().includes(normalized)
    const filteredChildren =
      node.kind === 'directory'
        ? node.children.map(filterNode).filter((child): child is FileNode => child !== null)
        : []

    if (!matchesSelf && filteredChildren.length === 0) return null
    return filteredChildren === node.children ? node : { ...node, children: filteredChildren }
  }

  return nodes.map(filterNode).filter((node): node is FileNode => node !== null)
}

export function filterFileNode(
  node: FileNode | null | undefined,
  query: string,
  getDisplayName: (node: FileNode) => string = (treeNode) => treeNode.name,
): FileNode | null {
  if (!node) return null
  const result = filterFileTree([node], query, getDisplayName)
  return result[0] ?? null
}

export function toggleFileTreeSortState(
  current: FileTreeSortState | null,
  key: FileTreeSortKey,
): FileTreeSortState {
  if (!current || current.key !== key) {
    return { key, direction: 'desc' }
  }
  return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
}

export function sortFileTree(
  nodes: FileNode[],
  sort: FileTreeSortState | null,
  getDisplayName: (node: FileNode) => string = (node) => node.name,
): FileNode[] {
  if (!sort) return nodes

  const compareValues = (left: FileNode, right: FileNode) => {
    switch (sort.key) {
      case 'name':
        return getDisplayName(left).localeCompare(getDisplayName(right), undefined, { sensitivity: 'base' })
      case 'type': {
        const leftType = left.kind === 'directory' ? 'Folder' : fileTypeLabel(left.name)
        const rightType = right.kind === 'directory' ? 'Folder' : fileTypeLabel(right.name)
        return leftType.localeCompare(rightType, undefined, { sensitivity: 'base' })
      }
      case 'size': {
        const leftSize = left.kind === 'directory' ? (aggregateFileNodeSize(left) ?? -1) : (left.size_bytes ?? -1)
        const rightSize = right.kind === 'directory' ? (aggregateFileNodeSize(right) ?? -1) : (right.size_bytes ?? -1)
        return leftSize - rightSize
      }
      case 'modified': {
        const leftTime = left.updated_at ? new Date(left.updated_at).getTime() : -1
        const rightTime = right.updated_at ? new Date(right.updated_at).getTime() : -1
        return leftTime - rightTime
      }
      case 'created': {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : -1
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : -1
        return leftTime - rightTime
      }
    }
  }

  const multiplier = sort.direction === 'desc' ? -1 : 1

  return [...nodes]
    .map((node) =>
      node.kind === 'directory'
        ? { ...node, children: sortFileTree(node.children, sort, getDisplayName) }
        : node,
    )
    .sort((left, right) => compareValues(left, right) * multiplier)
}

export function deriveParentPath(path: string) {
  if (!path) return null
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function deriveDirectoryPath(path: string, isDirectory = false) {
  if (!path) return ''
  if (isDirectory) return path
  return deriveParentPath(path) ?? path
}

export function ancestorDirectoryPaths(path?: string | null) {
  if (!path) return []
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return []
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function mergeFolderPaths(existing: string[], incoming: string[]) {
  return Array.from(
    new Set([...existing, ...incoming].map(normalizeFolderPath).filter((value) => value !== 'Inbox')),
  ).sort((a, b) => a.localeCompare(b))
}

export function mergeConcurrentMarkdown(
  baseMarkdown: string,
  localMarkdown: string,
  remoteMarkdown: string,
): { markdown: string; hadConflict: boolean } {
  if (localMarkdown === remoteMarkdown) {
    return { markdown: localMarkdown, hadConflict: false }
  }
  if (localMarkdown === baseMarkdown) {
    return { markdown: remoteMarkdown, hadConflict: false }
  }
  if (remoteMarkdown === baseMarkdown) {
    return { markdown: localMarkdown, hadConflict: false }
  }

  const baseLines = baseMarkdown.split('\n')
  const localLines = localMarkdown.split('\n')
  const remoteLines = remoteMarkdown.split('\n')
  const maxLength = Math.max(baseLines.length, localLines.length, remoteLines.length)
  const merged: string[] = []
  let hadConflict = false

  for (let index = 0; index < maxLength; index += 1) {
    const baseLine = baseLines[index]
    const localLine = localLines[index]
    const remoteLine = remoteLines[index]

    if (localLine === remoteLine) {
      if (localLine !== undefined) merged.push(localLine)
      continue
    }
    if (localLine === baseLine) {
      if (remoteLine !== undefined) merged.push(remoteLine)
      continue
    }
    if (remoteLine === baseLine) {
      if (localLine !== undefined) merged.push(localLine)
      continue
    }

    hadConflict = true
    merged.push('<<<<<<< Your edit')
    if (localLine !== undefined) merged.push(localLine)
    merged.push('=======')
    if (remoteLine !== undefined) merged.push(remoteLine)
    merged.push('>>>>>>> Remote edit')
  }

  return {
    markdown: merged.join('\n'),
    hadConflict,
  }
}

export function filterNoteFolderNode(node: NoteFolderNode, query: string): NoteFolderNode | null {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return node
  const matchesSelf = node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized)
  const filteredNotes = node.notes.filter((note) => note.title.toLowerCase().includes(normalized))
  const filteredChildren = node.children
    .map((child) => filterNoteFolderNode(child, normalized))
    .filter((child): child is NoteFolderNode => child !== null)

  if (!matchesSelf && filteredNotes.length === 0 && filteredChildren.length === 0) return null
  return {
    ...node,
    notes: filteredNotes,
    children: filteredChildren,
  }
}

export function filterDiagramFolderNode(node: DiagramFolderNode, query: string): DiagramFolderNode | null {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return node
  const matchesSelf = node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized)
  const filteredDiagrams = node.diagrams.filter((diagram) => diagramDisplayName(diagram.title).toLowerCase().includes(normalized))
  const filteredChildren = node.children
    .map((child) => filterDiagramFolderNode(child, normalized))
    .filter((child): child is DiagramFolderNode => child !== null)

  if (!matchesSelf && filteredDiagrams.length === 0 && filteredChildren.length === 0) return null
  return {
    ...node,
    diagrams: filteredDiagrams,
    children: filteredChildren,
  }
}

function buildFolderTree(notes: Note[], customFolders: string[]): FolderNode[] {
  const allPaths = mergeFolderPaths(
    customFolders,
    notes.map((note) => normalizeFolderPath(note.folder || 'Inbox')),
  )
  const rootNodes: FolderNode[] = []
  const byPath = new Map<string, FolderNode>()

  for (const folderPath of allPaths) {
    const parts = folderPath.split('/').filter(Boolean)
    let path = ''
    let parent: FolderNode | null = null

    for (const part of parts) {
      path = path ? `${path}/${part}` : part
      let node = byPath.get(path)
      if (!node) {
        node = { name: part, path, children: [] }
        byPath.set(path, node)
        if (parent) {
          parent.children.push(node)
        } else {
          rootNodes.push(node)
        }
      }
      parent = node
    }
  }

  const sortNodes = (items: FolderNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name))
    items.forEach((item) => sortNodes(item.children))
  }
  sortNodes(rootNodes)
  return rootNodes
}

export function buildNoteTree(notes: Note[], customFolders: string[]): NoteFolderNode[] {
  const folderNodes = buildFolderTree(notes, customFolders)
  const noteMap = new Map<string, Note[]>()

  for (const note of notes) {
    const path = normalizeFolderPath(note.folder || 'Inbox')
    if (path === 'Inbox') continue
    const existing = noteMap.get(path) ?? []
    existing.push(note)
    noteMap.set(path, existing)
  }

  const mapNodes = (items: FolderNode[]): NoteFolderNode[] =>
    items.map((item) => ({
      ...item,
      notes: [...(noteMap.get(item.path) ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
      children: mapNodes(item.children),
    }))

  return mapNodes(folderNodes)
}

export function buildDiagramTree(diagrams: Diagram[], customFolders: string[] = []): DiagramFolderNode[] {
  const folderNodes: DiagramFolderNode[] = []
  const byPath = new Map<string, DiagramFolderNode>()
  const folderDiagrams = new Map<string, Diagram[]>()

  const allFolders = Array.from(
    new Set(
      [
        ...customFolders,
        ...diagrams.map((diagram) => normalizeDiagramFolderPath(diagram.title)),
      ].map((path) => normalizeDiagramFolderPath(path)),
    ),
  )

  for (const folderPath of allFolders) {
    let path = ''
    let parent: DiagramFolderNode | null = null
    for (const part of folderPath.split('/').filter(Boolean)) {
      path = path ? `${path}/${part}` : part
      let node = byPath.get(path)
      if (!node) {
        node = { name: part, path, children: [], diagrams: [] }
        byPath.set(path, node)
        if (parent) parent.children.push(node)
        else folderNodes.push(node)
      }
      parent = node
    }
  }

  for (const diagram of diagrams) {
    const normalized = normalizeDiagramTitlePath(diagram.title)
    const parts = normalized.split('/')
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Diagrams'
    const existing = folderDiagrams.get(folderPath) ?? []
    existing.push(diagram)
    folderDiagrams.set(folderPath, existing)
  }

  const assignDiagrams = (items: DiagramFolderNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) {
      item.diagrams = [...(folderDiagrams.get(item.path) ?? [])].sort((a, b) =>
        diagramDisplayName(a.title).localeCompare(diagramDisplayName(b.title)),
      )
      assignDiagrams(item.children)
    }
  }

  assignDiagrams(folderNodes)
  return folderNodes
}

export function findFileNode(nodes: FileNode[], path: string): FileNode | null {
  if (path === '') return null
  for (const node of nodes) {
    if (node.path === path) return node
    const child = findFileNode(node.children, path)
    if (child) return child
  }
  return null
}

export function flattenFileNodes(nodes: FileNode[]): FileNode[] {
  const flat: FileNode[] = []
  for (const node of nodes) {
    flat.push(node)
    if (node.children.length > 0) {
      flat.push(...flattenFileNodes(node.children))
    }
  }
  return flat
}

export function inlinePaneStyle(variableName: string, pixels: number) {
  return { [variableName]: `${pixels}px` } as CSSProperties
}
