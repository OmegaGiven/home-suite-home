import type { Dispatch, DragEvent, MutableRefObject, SetStateAction } from 'react'
import { displayNameForFileNode as displayManagedFileNode } from './file-display'
import type { RoutePath, ShortcutSettings } from './app-config'
import type { FileColumnKey } from './file-browser'
import { renderFileColumnCell as renderManagedFileColumnCell } from './file-browser'
import type { Diagram, FileNode, Note, VoiceMemo } from './types'
import { normalizeShortcutBinding } from './shortcuts'

export function cycleRoutePath(
  orderedPaths: RoutePath[],
  currentRoute: RoutePath,
  offset: number,
) {
  const sequence: RoutePath[] = [...orderedPaths, '/settings']
  const index = sequence.indexOf(currentRoute)
  const nextIndex = (index + offset + sequence.length) % sequence.length
  return sequence[nextIndex]
}

export function routeJumpFromShortcut(binding: string, shortcuts: ShortcutSettings): RoutePath | null {
  const normalized = normalizeShortcutBinding(binding)
  if (normalized === normalizeShortcutBinding(shortcuts.notesJump)) return '/notes'
  if (normalized === normalizeShortcutBinding(shortcuts.filesJump)) return '/files'
  if (normalized === normalizeShortcutBinding(shortcuts.diagramsJump)) return '/diagrams'
  if (normalized === normalizeShortcutBinding(shortcuts.voiceJump)) return '/voice'
  if (normalized === normalizeShortcutBinding(shortcuts.chatJump)) return '/coms'
  if (normalized === normalizeShortcutBinding(shortcuts.callsJump)) return '/coms'
  if (normalized === normalizeShortcutBinding(shortcuts.settingsJump)) return '/settings'
  return null
}

export function routeNavigationTargets(route: RoutePath) {
  if (route === '/notes') {
    return Array.from(document.querySelectorAll<HTMLElement>('.notes-sidebar .folder-row, .notes-editor-actions button'))
  }
  if (route === '/diagrams') {
    return Array.from(document.querySelectorAll<HTMLElement>('.diagrams-sidebar .folder-row, .notes-editor-actions button'))
  }
  if (route === '/voice') {
    return Array.from(document.querySelectorAll<HTMLElement>('.panel-header .button, .memo-card button, .memo-card audio'))
  }
  if (route === '/coms') {
    return Array.from(document.querySelectorAll<HTMLElement>('.chat-sidebar .folder-row, .chat-thread-actions button, .chat-card form button'))
  }
  return []
}

export function moveRouteFocus(route: RoutePath, offset: number) {
  const targets = routeNavigationTargets(route)
  if (targets.length === 0) return
  const active = document.activeElement as HTMLElement | null
  const currentIndex = active ? targets.findIndex((target) => target === active) : -1
  const fallbackIndex = offset > 0 ? 0 : targets.length - 1
  const nextIndex =
    currentIndex === -1 ? fallbackIndex : Math.min(targets.length - 1, Math.max(0, currentIndex + offset))
  targets[nextIndex]?.focus()
}

export function beginFileDrag(
  event: DragEvent<HTMLElement>,
  path: string,
  setDraggingFilePath: Dispatch<SetStateAction<string | null>>,
) {
  if (!(path.startsWith('drive/') || path.startsWith('notes/') || path.startsWith('diagrams/'))) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', path)
  setDraggingFilePath(path)
}

export async function handleDirectoryDrop(
  event: DragEvent<HTMLElement>,
  destinationDir: string,
  draggingFilePath: string | null,
  setDropTargetPath: Dispatch<SetStateAction<string | null>>,
  setDraggingFilePath: Dispatch<SetStateAction<string | null>>,
  moveDriveItem: (sourcePath: string, destinationDir: string) => Promise<void>,
) {
  event.preventDefault()
  const sourcePath = event.dataTransfer.getData('text/plain') || draggingFilePath
  setDropTargetPath(null)
  setDraggingFilePath(null)
  if (!sourcePath || sourcePath === destinationDir) return
  await moveDriveItem(sourcePath, destinationDir)
}

export function activateRelativeFile(
  displayedFileNodes: FileNode[],
  activeFileNode: FileNode | null,
  offset: number,
  setActiveFilePath: Dispatch<SetStateAction<string | null>>,
) {
  if (displayedFileNodes.length === 0) return
  const currentIndex = Math.max(0, displayedFileNodes.findIndex((node) => node.path === activeFileNode?.path))
  const nextIndex = Math.min(displayedFileNodes.length - 1, Math.max(0, currentIndex + offset))
  setActiveFilePath(displayedFileNodes[nextIndex]?.path ?? null)
}

export function displayNameForManagedFileNode(node: FileNode, notes: Note[], memos: VoiceMemo[], diagrams: Diagram[]) {
  return displayManagedFileNode(node, { notes, memos, diagrams })
}

export function renderManagedFileCell(
  node: FileNode,
  column: FileColumnKey,
  displayNameForFileNode: (node: FileNode) => string,
) {
  return renderManagedFileColumnCell(node, column, displayNameForFileNode)
}

export function toggleFileColumnVisibility(
  column: FileColumnKey,
  setFileColumnVisibility: Dispatch<SetStateAction<Record<FileColumnKey, boolean>>>,
) {
  if (column === 'name') return
  setFileColumnVisibility((current) => ({ ...current, [column]: !current[column] }))
}

export function toggleFilePreviewPane(
  filePreviewOpen: boolean,
  filePaneWidths: { left: number; right: number },
  filePreviewWidthRef: MutableRefObject<number>,
  setFilePaneWidths: Dispatch<SetStateAction<{ left: number; right: number }>>,
  setFilePreviewOpen: Dispatch<SetStateAction<boolean>>,
) {
  if (filePreviewOpen) {
    if (filePaneWidths.right > 0) {
      filePreviewWidthRef.current = filePaneWidths.right
    }
    setFilePreviewOpen(false)
    return
  }

  setFilePaneWidths((current) => ({
    ...current,
    right: Math.max(180, filePreviewWidthRef.current || 240),
  }))
  setFilePreviewOpen(true)
}

export function beginFileColumnResize(
  splitter: FileColumnKey,
  clientX: number,
  fileColumnWidths: Record<FileColumnKey, number>,
  fileColumnResizeRef: MutableRefObject<{
    splitter: FileColumnKey
    startX: number
    startWidths: Record<FileColumnKey, number>
  } | null>,
  setActiveFileColumnSplitter: Dispatch<SetStateAction<FileColumnKey | null>>,
) {
  fileColumnResizeRef.current = {
    splitter,
    startX: clientX,
    startWidths: { ...fileColumnWidths },
  }
  setActiveFileColumnSplitter(splitter)
}
