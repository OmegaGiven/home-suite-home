import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { blurEditableTarget, isEditableTarget } from './ui-helpers'
import { eventShortcutStroke, normalizeShortcutBinding } from './shortcuts'
import type { RoutePath, ShortcutSettings } from './app-config'
import type { FileNode } from './types'

type UseFilesKeyboardEffectsContext = {
  route: RoutePath
  activeFileNode: FileNode | null
  displayedFileNodes: FileNode[]
  pendingFileKey: string | null
  markedFilePaths: string[]
  creatingDriveFolder: boolean
  pendingDeletePathsLength: number
  setActiveFilePath: Dispatch<SetStateAction<string | null>>
  setPendingFileKey: Dispatch<SetStateAction<string | null>>
  setFileHelpOpen: Dispatch<SetStateAction<boolean>>
  setMarkedFilePaths: Dispatch<SetStateAction<string[]>>
  setStatus: Dispatch<SetStateAction<string>>
  activateRelativeFile: (offset: number) => void
  goToParentDirectory: () => void
  openFileNode: (node: FileNode | null | undefined) => void
  toggleMarkedPath: (path: string | null | undefined) => void
  downloadManagedPaths: (paths: string[]) => void
  beginRenameCurrentFile: () => void
  normalizedDeletePaths: (paths: string[]) => string[]
  requestDeletePaths: (paths: string[]) => void
}

type UseGlobalKeyboardEffectsContext = {
  route: RoutePath
  pendingAppKey: string | null
  shortcuts: ShortcutSettings
  fileSearchOpen: boolean
  setFileSearchOpen: Dispatch<SetStateAction<boolean>>
  setFileSearchQuery: Dispatch<SetStateAction<string>>
  setPendingAppKey: Dispatch<SetStateAction<string | null>>
  setNoteDrawerOpen: Dispatch<SetStateAction<boolean>>
  createNote: () => Promise<unknown> | void
  saveNote: () => Promise<unknown> | void
  createDiagram: () => Promise<unknown> | void
  saveDiagram: () => Promise<unknown> | void
  toggleRecording: () => Promise<unknown> | void
  createRoom: (name: string, participants: string[]) => Promise<unknown> | void
  roomsLength: number
  routeJumpFromShortcut: (binding: string) => RoutePath | null
  navigate: (route: RoutePath) => Promise<void>
  cycleRoute: (offset: number) => Promise<void>
  moveRouteFocus: (offset: number) => void
}

export function useFilesKeyboardEffects(context: UseFilesKeyboardEffectsContext) {
  useEffect(() => {
    if (context.route !== '/files') return

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isEditable || context.creatingDriveFolder || context.pendingDeletePathsLength > 0) return

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        context.activateRelativeFile(1)
        return
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        context.activateRelativeFile(-1)
        return
      }
      if (event.key === 'G') {
        event.preventDefault()
        if (context.displayedFileNodes.length > 0) {
          context.setActiveFilePath(context.displayedFileNodes[context.displayedFileNodes.length - 1]?.path ?? null)
        }
        return
      }
      if (event.key === 'g') {
        event.preventDefault()
        if (context.pendingFileKey === 'g') {
          context.setActiveFilePath(context.displayedFileNodes[0]?.path ?? null)
          context.setPendingFileKey(null)
        } else {
          context.setPendingFileKey('g')
        }
        return
      }
      context.setPendingFileKey(null)

      if (event.key === 'h' || event.key === 'ArrowLeft') {
        event.preventDefault()
        context.goToParentDirectory()
        return
      }
      if (event.key === 'l' || event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        context.openFileNode(context.activeFileNode)
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        context.toggleMarkedPath(context.activeFileNode?.path)
        context.activateRelativeFile(1)
        return
      }
      if (event.key === 'y') {
        event.preventDefault()
        const payload = (context.markedFilePaths.length > 0 ? context.markedFilePaths : [context.activeFileNode?.path])
          .filter(Boolean)
          .join('\n')
        if (payload) {
          void navigator.clipboard.writeText(payload).then(() => context.setStatus('Copied path(s)')).catch(() => undefined)
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        context.downloadManagedPaths(
          context.markedFilePaths.length > 0 ? context.markedFilePaths : [context.activeFileNode?.path ?? ''],
        )
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        context.beginRenameCurrentFile()
        return
      }
      if (event.key === '?' || event.key === 'F1') {
        event.preventDefault()
        context.setFileHelpOpen((current) => !current)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        const targets = context.normalizedDeletePaths(
          context.markedFilePaths.length > 0 ? context.markedFilePaths : [context.activeFileNode?.path ?? ''],
        )
        if (targets.length > 0) {
          context.requestDeletePaths(targets)
        }
        return
      }
      if (event.key === 'Escape') {
        context.setFileHelpOpen(false)
        context.setMarkedFilePaths([])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    context.route,
    context.activeFileNode?.path,
    context.displayedFileNodes,
    context.pendingFileKey,
    context.markedFilePaths,
    context.creatingDriveFolder,
    context.pendingDeletePathsLength,
    context.activateRelativeFile,
    context.goToParentDirectory,
    context.openFileNode,
    context.toggleMarkedPath,
    context.downloadManagedPaths,
    context.beginRenameCurrentFile,
    context.normalizedDeletePaths,
    context.requestDeletePaths,
    context.setActiveFilePath,
    context.setPendingFileKey,
    context.setFileHelpOpen,
    context.setMarkedFilePaths,
    context.setStatus,
  ])
}

export function useGlobalKeyboardEffects(context: UseGlobalKeyboardEffectsContext) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editable = isEditableTarget(event.target)
      const stroke = eventShortcutStroke(event)
      const saveChord = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
      const routeJumpBindings = [
        context.shortcuts.notesJump,
        context.shortcuts.filesJump,
        context.shortcuts.diagramsJump,
        context.shortcuts.voiceJump,
        context.shortcuts.chatJump,
        context.shortcuts.callsJump,
        context.shortcuts.settingsJump,
      ].map(normalizeShortcutBinding)

      if (saveChord && context.route === '/notes') {
        event.preventDefault()
        void context.saveNote()
        return
      }

      if (saveChord && context.route === '/diagrams') {
        event.preventDefault()
        void context.saveDiagram()
        return
      }

      if (saveChord && context.route === '/files') {
        event.preventDefault()
        context.setFileSearchOpen(true)
        return
      }

      if (editable) {
        if (event.key === 'Escape') {
          event.preventDefault()
          blurEditableTarget(event.target)
          if (context.route === '/files' && context.fileSearchOpen) {
            context.setFileSearchOpen(false)
            context.setFileSearchQuery('')
          }
          context.setPendingAppKey(null)
        }
        return
      }

      if (context.pendingAppKey) {
        const jumpRoute = context.routeJumpFromShortcut(`${context.pendingAppKey} ${stroke}`)
        context.setPendingAppKey(null)
        if (jumpRoute) {
          event.preventDefault()
          void context.navigate(jumpRoute)
          return
        }
      }

      if (stroke === normalizeShortcutBinding(context.shortcuts.previousSection)) {
        event.preventDefault()
        void context.cycleRoute(-1)
        return
      }

      if (stroke === normalizeShortcutBinding(context.shortcuts.nextSection)) {
        event.preventDefault()
        void context.cycleRoute(1)
        return
      }

      if (
        context.route !== '/files' &&
        stroke !== 'ArrowLeft' &&
        context.shortcuts.routeLeft &&
        stroke === normalizeShortcutBinding(context.shortcuts.routeLeft)
      ) {
        event.preventDefault()
        void context.cycleRoute(-1)
        return
      }

      if (
        context.route !== '/files' &&
        stroke !== 'ArrowRight' &&
        context.shortcuts.routeRight &&
        stroke === normalizeShortcutBinding(context.shortcuts.routeRight)
      ) {
        event.preventDefault()
        void context.cycleRoute(1)
        return
      }

      const jumpPrefix = routeJumpBindings
        .filter((binding) => binding.includes(' '))
        .map((binding) => binding.split(' ')[0])
        .find((prefix) => prefix === stroke)
      if (context.route !== '/files' && jumpPrefix) {
        context.setPendingAppKey(jumpPrefix)
        return
      }

      if (context.route !== '/files' && stroke === normalizeShortcutBinding(context.shortcuts.focusNext)) {
        event.preventDefault()
        context.moveRouteFocus(1)
        return
      }

      if (context.route !== '/files' && stroke === normalizeShortcutBinding(context.shortcuts.focusPrev)) {
        event.preventDefault()
        context.moveRouteFocus(-1)
        return
      }

      if (context.route === '/notes' && stroke === normalizeShortcutBinding(context.shortcuts.notesNew)) {
        event.preventDefault()
        void context.createNote()
        return
      }

      if (context.route === '/notes' && stroke === normalizeShortcutBinding(context.shortcuts.notesSave)) {
        event.preventDefault()
        void context.saveNote()
        return
      }

      if (
        context.route === '/notes' &&
        (stroke === normalizeShortcutBinding(context.shortcuts.notesHideLibrary) ||
          stroke === normalizeShortcutBinding(context.shortcuts.notesShowLibrary))
      ) {
        event.preventDefault()
        context.setNoteDrawerOpen((current) => !current)
        return
      }

      if (context.route === '/diagrams' && stroke === normalizeShortcutBinding(context.shortcuts.diagramsNew)) {
        event.preventDefault()
        void context.createDiagram()
        return
      }

      if (context.route === '/diagrams' && stroke === normalizeShortcutBinding(context.shortcuts.diagramsSave)) {
        event.preventDefault()
        void context.saveDiagram()
        return
      }

      if (context.route === '/voice' && stroke === normalizeShortcutBinding(context.shortcuts.voiceRecord)) {
        event.preventDefault()
        void context.toggleRecording()
        return
      }

      if (context.route === '/coms' && stroke === normalizeShortcutBinding(context.shortcuts.chatCreateRoom)) {
        event.preventDefault()
        void context.createRoom(`thread-${context.roomsLength + 1}`, [])
        return
      }

      if (event.key === 'Escape') {
        context.setPendingAppKey(null)
        if (context.route === '/files') {
          context.setFileSearchOpen(false)
          context.setFileSearchQuery('')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    context.route,
    context.pendingAppKey,
    context.shortcuts,
    context.fileSearchOpen,
    context.roomsLength,
    context.setFileSearchOpen,
    context.setFileSearchQuery,
    context.setPendingAppKey,
    context.setNoteDrawerOpen,
    context.createNote,
    context.saveNote,
    context.createDiagram,
    context.saveDiagram,
    context.toggleRecording,
    context.createRoom,
    context.routeJumpFromShortcut,
    context.navigate,
    context.cycleRoute,
    context.moveRouteFocus,
  ])
}
