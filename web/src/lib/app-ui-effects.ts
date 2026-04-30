import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import type { NoteEditorMode, RoutePath } from './app-config'

type UseAppUiEffectsContext = {
  route: RoutePath
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  selectedRoomId: string | null
  selectedNoteId: string | null
  selectedNote: import('./types').Note | null
  selectedFolderPath: string
  noteDraft: string
  noteEditorMode: NoteEditorMode
  actionNotice: { id: string; message: string } | null
  pendingDeletePathsLength: number
  displayedFileNodes: import('./types').FileNode[]
  activeFilePath: string | null
  currentDirectoryPath: string
  selectedFileNode: import('./types').FileNode | null
  pendingFileKey: string | null
  pendingAppKey: string | null
  fileSearchOpen: boolean
  renamingFilePath: string | null
  fileColumnViewOpen: boolean
  orderedNavItems: Array<{ path: RoutePath }>
  canAccessRoute: (path: RoutePath) => boolean
  navigate: (path: RoutePath) => Promise<void>
  setFileColumnViewOpen: Dispatch<SetStateAction<boolean>>
  setPendingDeletePaths: Dispatch<SetStateAction<string[]>>
  setActiveFilePath: Dispatch<SetStateAction<string | null>>
  setPendingFileKey: Dispatch<SetStateAction<string | null>>
  setPendingAppKey: Dispatch<SetStateAction<string | null>>
  setActionNotice: Dispatch<SetStateAction<{ id: string; message: string } | null>>
  selectedRoomIdRef: MutableRefObject<string | null>
  routeRef: MutableRefObject<RoutePath>
  sessionUserIdRef: MutableRefObject<string | null>
  selectedNoteIdRef: MutableRefObject<string | null>
  selectedNoteRef: MutableRefObject<import('./types').Note | null>
  noteEditorModeRef: MutableRefObject<NoteEditorMode>
  selectedFolderPathRef: MutableRefObject<string>
  noteDraftRef: MutableRefObject<string>
  rtcConfigRef: MutableRefObject<import('./types').RtcConfig | null>
  callJoinedRef: MutableRefObject<boolean>
  activeCallRoomIdRef: MutableRefObject<string | null>
  fileSearchInputRef: RefObject<HTMLInputElement | null>
  renameInputRef: RefObject<HTMLInputElement | null>
  fileColumnViewRef: RefObject<HTMLDivElement | null>
  deleteConfirmButtonRef: RefObject<HTMLButtonElement | null>
  deleteCancelButtonRef: RefObject<HTMLButtonElement | null>
  sessionUserId: string | null
  rtcConfig: import('./types').RtcConfig | null
  callJoined: boolean
  activeCallRoomId: string | null
}

export function useAppUiEffects(context: UseAppUiEffectsContext) {
  useEffect(() => {
    const pathname = window.location.pathname
    if ((pathname === '/chat' || pathname === '/calls') && context.route === '/coms') {
      window.history.replaceState({}, '', '/coms')
    }
  }, [context.route])

  useEffect(() => {
    if (context.authMode !== 'ready') return
    if (context.canAccessRoute(context.route)) return
    const routeOptions: RoutePath[] = [...context.orderedNavItems.map((item) => item.path), '/settings']
    const fallback = routeOptions.find((path) => context.canAccessRoute(path))
    if (fallback && fallback !== context.route) {
      void context.navigate(fallback)
    }
  }, [context.authMode, context.canAccessRoute, context.orderedNavItems, context.route, context.navigate])

  useEffect(() => {
    if (!context.fileColumnViewOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (context.fileColumnViewRef.current?.contains(event.target as Node)) return
      context.setFileColumnViewOpen(false)
    }
    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [context.fileColumnViewOpen, context.fileColumnViewRef, context.setFileColumnViewOpen])

  useEffect(() => {
    context.selectedRoomIdRef.current = context.selectedRoomId
  }, [context.selectedRoomId])

  useEffect(() => {
    context.routeRef.current = context.route
  }, [context.route])

  useEffect(() => {
    context.sessionUserIdRef.current = context.sessionUserId
  }, [context.sessionUserId])

  useEffect(() => {
    context.selectedNoteIdRef.current = context.selectedNoteId
  }, [context.selectedNoteId])

  useEffect(() => {
    context.selectedNoteRef.current = context.selectedNote
  }, [context.selectedNote])

  useEffect(() => {
    context.noteEditorModeRef.current = context.noteEditorMode
  }, [context.noteEditorMode])

  useEffect(() => {
    context.selectedFolderPathRef.current = context.selectedFolderPath
  }, [context.selectedFolderPath])

  useEffect(() => {
    context.noteDraftRef.current = context.noteDraft
  }, [context.noteDraft])

  useEffect(() => {
    context.rtcConfigRef.current = context.rtcConfig
  }, [context.rtcConfig])

  useEffect(() => {
    context.callJoinedRef.current = context.callJoined
  }, [context.callJoined])

  useEffect(() => {
    context.activeCallRoomIdRef.current = context.activeCallRoomId
  }, [context.activeCallRoomId])

  useEffect(() => {
    if (!context.actionNotice) return
    const timeout = window.setTimeout(() => context.setActionNotice(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [context.actionNotice, context.setActionNotice])

  useEffect(() => {
    if (context.pendingDeletePathsLength === 0) return
    context.deleteConfirmButtonRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        context.setPendingDeletePaths([])
        return
      }
      if (event.key !== 'Tab') return
      const focusables = [context.deleteConfirmButtonRef.current, context.deleteCancelButtonRef.current].filter(Boolean) as HTMLElement[]
      if (focusables.length === 0) return
      const active = document.activeElement as HTMLElement | null
      const currentIndex = active ? focusables.findIndex((element) => element === active) : -1
      const direction = event.shiftKey ? -1 : 1
      const nextIndex = currentIndex === -1
        ? (event.shiftKey ? focusables.length - 1 : 0)
        : (currentIndex + direction + focusables.length) % focusables.length
      event.preventDefault()
      focusables[nextIndex]?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [context.pendingDeletePathsLength, context.setPendingDeletePaths])

  useEffect(() => {
    if (context.displayedFileNodes.length === 0) {
      context.setActiveFilePath(context.selectedFileNode?.kind === 'file' ? context.selectedFileNode.path : null)
      return
    }
    if (!context.activeFilePath || !context.displayedFileNodes.some((node) => node.path === context.activeFilePath)) {
      context.setActiveFilePath(context.displayedFileNodes[0].path)
    }
  }, [context.currentDirectoryPath, context.displayedFileNodes, context.selectedFileNode?.path, context.activeFilePath, context.setActiveFilePath])

  useEffect(() => {
    if (context.route !== '/files' || !context.pendingFileKey) return
    const timeout = window.setTimeout(() => context.setPendingFileKey(null), 400)
    return () => window.clearTimeout(timeout)
  }, [context.pendingFileKey, context.route, context.setPendingFileKey])

  useEffect(() => {
    if (!context.fileSearchOpen) return
    window.requestAnimationFrame(() => {
      context.fileSearchInputRef.current?.focus()
      context.fileSearchInputRef.current?.select()
    })
  }, [context.fileSearchOpen, context.fileSearchInputRef])

  useEffect(() => {
    if (!context.renamingFilePath) return
    window.requestAnimationFrame(() => {
      context.renameInputRef.current?.focus()
      context.renameInputRef.current?.select()
    })
  }, [context.renamingFilePath, context.renameInputRef])

  useEffect(() => {
    if (!context.pendingAppKey) return
    const timeout = window.setTimeout(() => context.setPendingAppKey(null), 500)
    return () => window.clearTimeout(timeout)
  }, [context.pendingAppKey, context.setPendingAppKey])
}
