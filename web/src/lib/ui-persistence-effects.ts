import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppearanceSettings, NavItemPath, ShortcutSettings } from './app-config'

type FileColumnVisibility = {
  name: boolean
  directory: boolean
  type: boolean
  size: boolean
  modified: boolean
  created: boolean
}

type UseUiPersistenceEffectsContext = {
  customFolders: string[]
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  customDiagramFolders: string[]
  setCustomDiagramFolders: Dispatch<SetStateAction<string[]>>
  filePaneWidths: { left: number; right: number }
  setFilePaneWidths: Dispatch<SetStateAction<{ left: number; right: number }>>
  filePreviewOpen: boolean
  setFilePreviewOpen: Dispatch<SetStateAction<boolean>>
  filePaneHeights: { top: number; middle: number }
  setFilePaneHeights: Dispatch<SetStateAction<{ top: number; middle: number }>>
  fileColumnWidths: { name: number; directory: number; type: number; size: number; modified: number; created: number }
  setFileColumnWidths: Dispatch<
    SetStateAction<{ name: number; directory: number; type: number; size: number; modified: number; created: number }>
  >
  fileColumnVisibility: FileColumnVisibility
  setFileColumnVisibility: Dispatch<SetStateAction<FileColumnVisibility>>
  notePaneSize: { width: number; height: number }
  setNotePaneSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  diagramPaneSize: { width: number; height: number }
  setDiagramPaneSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  voicePaneSize: { width: number; height: number }
  setVoicePaneSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  chatPaneSize: { width: number; height: number }
  setChatPaneSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  appearance: AppearanceSettings
  setAppearance: Dispatch<SetStateAction<AppearanceSettings>>
  shortcuts: ShortcutSettings
  setShortcuts: Dispatch<SetStateAction<ShortcutSettings>>
  navOrder: NavItemPath[]
  setNavOrder: Dispatch<SetStateAction<NavItemPath[]>>
  setIsCompactViewport: Dispatch<SetStateAction<boolean>>
  defaultAppearance: AppearanceSettings
  defaultShortcuts: ShortcutSettings
  defaultNavOrder: NavItemPath[]
  normalizeShortcutBinding: (value: string) => string
}

export function useUiPersistenceEffects(context: UseUiPersistenceEffectsContext) {
  const usePaneSizePersistence = (
    key: string,
    value: { width: number; height: number },
    setter: Dispatch<SetStateAction<{ width: number; height: number }>>,
  ) => {
    useEffect(() => {
      const stored = window.localStorage.getItem(key)
      if (!stored) return
      try {
        const parsed = JSON.parse(stored) as Partial<typeof value>
        setter({
          width: typeof parsed.width === 'number' ? parsed.width : 280,
          height: typeof parsed.height === 'number' ? parsed.height : 220,
        })
      } catch {}
    }, [key, setter])

    useEffect(() => {
      window.localStorage.setItem(key, JSON.stringify(value))
    }, [key, value])
  }

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.noteFolders')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed)) {
        context.setCustomFolders(parsed.filter((value) => typeof value === 'string' && value.trim() !== ''))
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.noteFolders', JSON.stringify(context.customFolders))
  }, [context.customFolders])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.diagramFolders')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed)) {
        context.setCustomDiagramFolders(parsed.filter((value) => typeof value === 'string' && value.trim() !== ''))
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.diagramFolders', JSON.stringify(context.customDiagramFolders))
  }, [context.customDiagramFolders])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.filePaneWidths')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof context.filePaneWidths>
      if (typeof parsed.left === 'number' && typeof parsed.right === 'number') {
        context.setFilePaneWidths({ left: parsed.left, right: parsed.right })
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.filePaneWidths', JSON.stringify(context.filePaneWidths))
  }, [context.filePaneWidths])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.filePreviewOpen')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (typeof parsed === 'boolean') {
        context.setFilePreviewOpen(parsed)
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.filePreviewOpen', JSON.stringify(context.filePreviewOpen))
  }, [context.filePreviewOpen])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.filePaneHeights')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof context.filePaneHeights>
      if (typeof parsed.top === 'number' && typeof parsed.middle === 'number') {
        context.setFilePaneHeights({ top: parsed.top, middle: parsed.middle })
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.filePaneHeights', JSON.stringify(context.filePaneHeights))
  }, [context.filePaneHeights])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.fileColumnWidths')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<typeof context.fileColumnWidths>
      context.setFileColumnWidths({
        name: typeof parsed.name === 'number' ? parsed.name : 260,
        directory: typeof parsed.directory === 'number' ? parsed.directory : 220,
        type: typeof parsed.type === 'number' ? parsed.type : 56,
        size: typeof parsed.size === 'number' ? parsed.size : 56,
        modified: typeof parsed.modified === 'number' ? parsed.modified : 150,
        created: typeof parsed.created === 'number' ? parsed.created : 150,
      })
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.fileColumnWidths', JSON.stringify(context.fileColumnWidths))
  }, [context.fileColumnWidths])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.fileColumnVisibility')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<FileColumnVisibility>
      context.setFileColumnVisibility((current) => ({
        ...current,
        directory: typeof parsed.directory === 'boolean' ? parsed.directory : current.directory,
        type: typeof parsed.type === 'boolean' ? parsed.type : current.type,
        size: typeof parsed.size === 'boolean' ? parsed.size : current.size,
        modified: typeof parsed.modified === 'boolean' ? parsed.modified : current.modified,
        created: typeof parsed.created === 'boolean' ? parsed.created : current.created,
      }))
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.fileColumnVisibility', JSON.stringify(context.fileColumnVisibility))
  }, [context.fileColumnVisibility])

  usePaneSizePersistence('sweet.notePaneSize', context.notePaneSize, context.setNotePaneSize)
  usePaneSizePersistence('sweet.diagramPaneSize', context.diagramPaneSize, context.setDiagramPaneSize)
  usePaneSizePersistence('sweet.voicePaneSize', context.voicePaneSize, context.setVoicePaneSize)
  usePaneSizePersistence('sweet.chatPaneSize', context.chatPaneSize, context.setChatPaneSize)

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.appearance')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<AppearanceSettings>
      context.setAppearance({
        mode: parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'custom' ? parsed.mode : 'dark',
        pageGutter: typeof parsed.pageGutter === 'number' ? parsed.pageGutter : context.defaultAppearance.pageGutter,
        radius: typeof parsed.radius === 'number' ? parsed.radius : context.defaultAppearance.radius,
        surfaceOpacity:
          typeof parsed.surfaceOpacity === 'number' ? parsed.surfaceOpacity : context.defaultAppearance.surfaceOpacity,
        accent: typeof parsed.accent === 'string' ? parsed.accent : context.defaultAppearance.accent,
        secondaryBackground:
          typeof parsed.secondaryBackground === 'string'
            ? parsed.secondaryBackground
            : context.defaultAppearance.secondaryBackground,
        fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : context.defaultAppearance.fontFamily,
        background: typeof parsed.background === 'string' ? parsed.background : context.defaultAppearance.background,
        backgroundImage:
          typeof parsed.backgroundImage === 'string'
            ? parsed.backgroundImage
            : context.defaultAppearance.backgroundImage,
        disableGradients:
          typeof parsed.disableGradients === 'boolean'
            ? parsed.disableGradients
            : context.defaultAppearance.disableGradients,
        gradientTopLeftEnabled:
          typeof parsed.gradientTopLeftEnabled === 'boolean'
            ? parsed.gradientTopLeftEnabled
            : context.defaultAppearance.gradientTopLeftEnabled,
        gradientTopRightEnabled:
          typeof parsed.gradientTopRightEnabled === 'boolean'
            ? parsed.gradientTopRightEnabled
            : context.defaultAppearance.gradientTopRightEnabled,
        gradientBottomLeftEnabled:
          typeof parsed.gradientBottomLeftEnabled === 'boolean'
            ? parsed.gradientBottomLeftEnabled
            : context.defaultAppearance.gradientBottomLeftEnabled,
        gradientBottomRightEnabled:
          typeof parsed.gradientBottomRightEnabled === 'boolean'
            ? parsed.gradientBottomRightEnabled
            : context.defaultAppearance.gradientBottomRightEnabled,
        gradientTopLeft:
          typeof parsed.gradientTopLeft === 'string'
            ? parsed.gradientTopLeft
            : typeof (parsed as Partial<{ gradientStart: string }>).gradientStart === 'string'
              ? (parsed as Partial<{ gradientStart: string }>).gradientStart!
              : context.defaultAppearance.gradientTopLeft,
        gradientTopRight:
          typeof parsed.gradientTopRight === 'string'
            ? parsed.gradientTopRight
            : typeof (parsed as Partial<{ gradientEnd: string }>).gradientEnd === 'string'
              ? (parsed as Partial<{ gradientEnd: string }>).gradientEnd!
              : context.defaultAppearance.gradientTopRight,
        gradientBottomLeft:
          typeof parsed.gradientBottomLeft === 'string'
            ? parsed.gradientBottomLeft
            : typeof (parsed as Partial<{ gradientStart: string }>).gradientStart === 'string'
              ? (parsed as Partial<{ gradientStart: string }>).gradientStart!
              : context.defaultAppearance.gradientBottomLeft,
        gradientBottomRight:
          typeof parsed.gradientBottomRight === 'string'
            ? parsed.gradientBottomRight
            : typeof (parsed as Partial<{ gradientEnd: string }>).gradientEnd === 'string'
              ? (parsed as Partial<{ gradientEnd: string }>).gradientEnd!
              : context.defaultAppearance.gradientBottomRight,
        gradientStrength:
          typeof parsed.gradientStrength === 'number'
            ? parsed.gradientStrength
            : context.defaultAppearance.gradientStrength,
      })
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.appearance', JSON.stringify(context.appearance))
  }, [context.appearance])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.shortcuts')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as Partial<ShortcutSettings>
      context.setShortcuts({
        previousSection: context.normalizeShortcutBinding(parsed.previousSection ?? context.defaultShortcuts.previousSection),
        nextSection: context.normalizeShortcutBinding(parsed.nextSection ?? context.defaultShortcuts.nextSection),
        notesJump: context.normalizeShortcutBinding(parsed.notesJump ?? context.defaultShortcuts.notesJump),
        filesJump: context.normalizeShortcutBinding(parsed.filesJump ?? context.defaultShortcuts.filesJump),
        diagramsJump: context.normalizeShortcutBinding(parsed.diagramsJump ?? context.defaultShortcuts.diagramsJump),
        voiceJump: context.normalizeShortcutBinding(parsed.voiceJump ?? context.defaultShortcuts.voiceJump),
        chatJump: context.normalizeShortcutBinding(parsed.chatJump ?? context.defaultShortcuts.chatJump),
        callsJump: context.normalizeShortcutBinding(parsed.callsJump ?? context.defaultShortcuts.callsJump),
        settingsJump: context.normalizeShortcutBinding(parsed.settingsJump ?? context.defaultShortcuts.settingsJump),
        focusNext: context.normalizeShortcutBinding(parsed.focusNext ?? context.defaultShortcuts.focusNext),
        focusPrev: context.normalizeShortcutBinding(parsed.focusPrev ?? context.defaultShortcuts.focusPrev),
        routeLeft: (() => {
          const normalized = context.normalizeShortcutBinding(parsed.routeLeft ?? context.defaultShortcuts.routeLeft)
          return normalized === 'ArrowLeft' ? '' : normalized
        })(),
        routeRight: (() => {
          const normalized = context.normalizeShortcutBinding(parsed.routeRight ?? context.defaultShortcuts.routeRight)
          return normalized === 'ArrowRight' ? '' : normalized
        })(),
        notesNew: context.normalizeShortcutBinding(parsed.notesNew ?? context.defaultShortcuts.notesNew),
        notesSave: context.normalizeShortcutBinding(parsed.notesSave ?? context.defaultShortcuts.notesSave),
        notesHideLibrary:
          context.normalizeShortcutBinding(parsed.notesHideLibrary ?? context.defaultShortcuts.notesHideLibrary),
        notesShowLibrary:
          context.normalizeShortcutBinding(parsed.notesShowLibrary ?? context.defaultShortcuts.notesShowLibrary),
        diagramsNew: context.normalizeShortcutBinding(parsed.diagramsNew ?? context.defaultShortcuts.diagramsNew),
        diagramsSave: context.normalizeShortcutBinding(parsed.diagramsSave ?? context.defaultShortcuts.diagramsSave),
        voiceRecord: context.normalizeShortcutBinding(parsed.voiceRecord ?? context.defaultShortcuts.voiceRecord),
        chatCreateRoom:
          context.normalizeShortcutBinding(parsed.chatCreateRoom ?? context.defaultShortcuts.chatCreateRoom),
      })
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.shortcuts', JSON.stringify(context.shortcuts))
  }, [context.shortcuts])

  useEffect(() => {
    const stored = window.localStorage.getItem('sweet.navOrder')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      const nextOrder = parsed.filter((path): path is typeof context.defaultNavOrder[number] =>
        context.defaultNavOrder.includes(path as typeof context.defaultNavOrder[number]),
      )
      if (nextOrder.length > 0) {
        context.setNavOrder([
          ...nextOrder,
          ...context.defaultNavOrder.filter((path) => !nextOrder.includes(path)),
        ])
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.navOrder', JSON.stringify(context.navOrder))
  }, [context.navOrder])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)')
    const apply = () => context.setIsCompactViewport(mediaQuery.matches)
    apply()
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [context.setIsCompactViewport])
}
