import type { Dispatch, DragEvent, MutableRefObject, SetStateAction } from 'react'
import { cycleRoutePath, routeJumpFromShortcut as routeJumpFromShortcutAction, moveRouteFocus as moveRouteFocusAction, beginFileDrag as beginFileDragAction, handleDirectoryDrop as handleDirectoryDropAction, activateRelativeFile as activateRelativeFileAction, toggleFileColumnVisibility as toggleFileColumnVisibilityAction, renderManagedFileCell, } from './app-shell'
import type { RoutePath, ShortcutSettings } from './app-config'
import type { FileColumnKey } from './file-browser'
import type { FileNode } from './types'

type CreateAppRouteActionsContext = {
  orderedNavItems: Array<{ path: RoutePath }>
  route: RoutePath
  shortcuts: ShortcutSettings
  displayedFileNodes: FileNode[]
  activeFileNode: FileNode | null
  currentDirectoryPath: string
  filePreviewOpen: boolean
  filePaneWidths: { left: number; right: number }
  filePreviewWidthRef: MutableRefObject<number>
  markedFilePaths: string[]
  draggingFilePath: string | null
  setRoute: Dispatch<SetStateAction<RoutePath>>
  setActiveFilePath: Dispatch<SetStateAction<string | null>>
  setDraggingFilePath: Dispatch<SetStateAction<string | null>>
  setDropTargetPath: Dispatch<SetStateAction<string | null>>
  setFileColumnVisibility: Dispatch<SetStateAction<Record<FileColumnKey, boolean>>>
  setFilePaneWidths: Dispatch<SetStateAction<{ left: number; right: number }>>
  setFilePreviewOpen: Dispatch<SetStateAction<boolean>>
  displayNameForFileNode: (node: FileNode) => string
  autosaveCurrentNoteBeforeSwitch: () => Promise<boolean>
  moveDriveItem: (sourcePath: string, destinationDir: string) => Promise<void>
  goToParentDirectoryAction: (currentDirectoryPath: string) => void
}

export function createAppRouteActions(context: CreateAppRouteActionsContext) {
  async function navigate(nextRoute: RoutePath) {
    if (nextRoute === context.route) return
    if (context.route === '/notes') {
      const autosaved = await context.autosaveCurrentNoteBeforeSwitch()
      if (!autosaved) return
    }
    window.history.pushState({}, '', nextRoute)
    context.setRoute(nextRoute)
  }

  async function cycleRoute(offset: number) {
    await navigate(cycleRoutePath(context.orderedNavItems.map((item) => item.path), context.route, offset))
  }

  function routeJumpFromShortcut(binding: string): RoutePath | null {
    return routeJumpFromShortcutAction(binding, context.shortcuts)
  }

  function moveRouteFocus(offset: number) {
    moveRouteFocusAction(context.route, offset)
  }

  function beginFileDrag(event: DragEvent<HTMLElement>, path: string) {
    beginFileDragAction(event, path, context.setDraggingFilePath, context.markedFilePaths)
  }

  async function handleDirectoryDrop(event: DragEvent<HTMLElement>, destinationDir: string) {
    await handleDirectoryDropAction(
      event,
      destinationDir,
      context.draggingFilePath,
      context.setDropTargetPath,
      context.setDraggingFilePath,
      context.moveDriveItem,
    )
  }

  function activateRelativeFile(offset: number) {
    activateRelativeFileAction(context.displayedFileNodes, context.activeFileNode, offset, context.setActiveFilePath)
  }

  function toggleFileColumnVisibility(column: FileColumnKey) {
    toggleFileColumnVisibilityAction(column, context.setFileColumnVisibility)
  }

  function renderFileColumnCell(node: FileNode, column: FileColumnKey) {
    return renderManagedFileCell(node, column, context.displayNameForFileNode)
  }

  function toggleFilePreviewPane() {
    if (context.filePreviewOpen) {
      if (context.filePaneWidths.right > 0) {
        context.filePreviewWidthRef.current = context.filePaneWidths.right
      }
      context.setFilePreviewOpen(false)
      return
    }
    context.setFilePaneWidths((current) => ({
      ...current,
      right: Math.max(180, context.filePreviewWidthRef.current || 240),
    }))
    context.setFilePreviewOpen(true)
  }

  function goToParentDirectory() {
    context.goToParentDirectoryAction(context.currentDirectoryPath)
  }

  return {
    navigate,
    cycleRoute,
    routeJumpFromShortcut,
    moveRouteFocus,
    beginFileDrag,
    handleDirectoryDrop,
    activateRelativeFile,
    toggleFileColumnVisibility,
    renderFileColumnCell,
    toggleFilePreviewPane,
    goToParentDirectory,
  }
}
