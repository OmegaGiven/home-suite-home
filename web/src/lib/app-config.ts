import type { CSSProperties } from 'react'

export const demoMarkdown = `# Sweet Notes\n\n- Collaborative markdown editing\n- Live preview\n- Websocket note sync`

export const NAV_ITEMS = [
  { path: '/files', label: 'Files' },
  { path: '/notes', label: 'Notes' },
  { path: '/diagrams', label: 'Diagrams' },
  { path: '/voice', label: 'Voice' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/coms', label: 'Coms' },
  { path: '/admin', label: 'Admin' },
] as const

export type RoutePath = (typeof NAV_ITEMS)[number]['path'] | '/settings'
export type NavItemPath = (typeof NAV_ITEMS)[number]['path']

export type NoteEditorMode = 'rich' | 'raw'
export type DiagramEditorMode = 'diagram' | 'xml'
export type NoteContextMenuState = { x: number; y: number; kind: 'default' | 'table' } | null
export type NoteContextSubmenu = 'elements' | 'table' | null

export type AppearanceMode = 'dark' | 'light' | 'custom'

export type AppearanceSettings = {
  mode: AppearanceMode
  pageGutter: number
  radius: number
  accent: string
  fontFamily: string
  background: string
  backgroundImage: string
  disableGradients: boolean
  gradientTopLeftEnabled: boolean
  gradientTopRightEnabled: boolean
  gradientBottomLeftEnabled: boolean
  gradientBottomRightEnabled: boolean
  gradientTopLeft: string
  gradientTopRight: string
  gradientBottomLeft: string
  gradientBottomRight: string
  gradientStrength: number
}

export const FONT_OPTIONS = [
  { label: 'Plex Sans', value: '"IBM Plex Sans", "Segoe UI", sans-serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { label: 'Avenir', value: '"Avenir Next", "Helvetica Neue", sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"IBM Plex Mono", "SFMono-Regular", monospace' },
] as const

export type ActionNotice = {
  id: string
  message: string
}

export type ShortcutSettings = {
  previousSection: string
  nextSection: string
  notesJump: string
  filesJump: string
  diagramsJump: string
  voiceJump: string
  chatJump: string
  callsJump: string
  settingsJump: string
  focusNext: string
  focusPrev: string
  routeLeft: string
  routeRight: string
  notesNew: string
  notesSave: string
  notesHideLibrary: string
  notesShowLibrary: string
  diagramsNew: string
  diagramsSave: string
  voiceRecord: string
  chatCreateRoom: string
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'dark',
  pageGutter: 16,
  radius: 20,
  accent: '#41b883',
  fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
  background: '#0d1520',
  backgroundImage: '',
  disableGradients: false,
  gradientTopLeftEnabled: true,
  gradientTopRightEnabled: true,
  gradientBottomLeftEnabled: true,
  gradientBottomRightEnabled: true,
  gradientTopLeft: '#142235',
  gradientTopRight: '#0b3a2d',
  gradientBottomLeft: '#24163a',
  gradientBottomRight: '#123046',
  gradientStrength: 36,
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  previousSection: 'Shift+H',
  nextSection: 'Shift+L',
  notesJump: 'g n',
  filesJump: 'g f',
  diagramsJump: 'g d',
  voiceJump: 'g v',
  chatJump: 'g c',
  callsJump: 'g a',
  settingsJump: 'g s',
  focusNext: 'j',
  focusPrev: 'k',
  routeLeft: '',
  routeRight: '',
  notesNew: 'n',
  notesSave: 's',
  notesHideLibrary: 'h',
  notesShowLibrary: 'l',
  diagramsNew: 'n',
  diagramsSave: 's',
  voiceRecord: 'r',
  chatCreateRoom: 'c',
}

export const DEFAULT_NAV_ORDER: NavItemPath[] = [
  '/files',
  '/notes',
  '/diagrams',
  '/voice',
  '/calendar',
  '/tasks',
  '/coms',
  '/admin',
]

export function normalizeRoute(pathname: string): RoutePath {
  if (pathname === '/auth/oidc/callback' || pathname === '/') {
    return '/notes'
  }
  if (pathname === '/chat' || pathname === '/calls' || pathname === '/coms') {
    return '/coms'
  }
  if (pathname === '/settings') return '/settings'
  if (pathname === '/admin') return '/admin'
  const match = NAV_ITEMS.find((item) => item.path === pathname)
  return match?.path ?? '/notes'
}

export function buildAppearanceStyle(appearance: AppearanceSettings): CSSProperties {
  const gradientStrength = appearance.gradientStrength / 100
  const topCornerReach = 42 + gradientStrength * 58
  const bottomCornerReach = 46 + gradientStrength * 54
  const customGradientLayers = appearance.disableGradients
    ? []
    : [
        appearance.gradientTopLeftEnabled
          ? `radial-gradient(circle at top left, ${hexToRgba(appearance.gradientTopLeft, 0.16 + gradientStrength * 0.34)}, transparent ${topCornerReach}%)`
          : null,
        appearance.gradientTopRightEnabled
          ? `radial-gradient(circle at top right, ${hexToRgba(appearance.gradientTopRight, 0.16 + gradientStrength * 0.34)}, transparent ${topCornerReach}%)`
          : null,
        appearance.gradientBottomLeftEnabled
          ? `radial-gradient(circle at bottom left, ${hexToRgba(appearance.gradientBottomLeft, 0.12 + gradientStrength * 0.28)}, transparent ${bottomCornerReach}%)`
          : null,
        appearance.gradientBottomRightEnabled
          ? `radial-gradient(circle at bottom right, ${hexToRgba(appearance.gradientBottomRight, 0.12 + gradientStrength * 0.28)}, transparent ${bottomCornerReach}%)`
          : null,
      ].filter((layer): layer is string => Boolean(layer))
  const customGradient = customGradientLayers.length > 0 ? customGradientLayers.join(', ') : 'none'
  const backgroundPhoto = appearance.backgroundImage ? `url("${appearance.backgroundImage.replace(/"/g, '\\"')}")` : 'none'
  const palette =
    appearance.mode === 'light'
      ? {
          bg: '#eef3f8',
          text: '#14202c',
          muted: '#546679',
          surface: 'rgba(255, 255, 255, 0.88)',
          surfaceSubtle: 'rgba(255, 255, 255, 0.7)',
          surfaceStrong: '#ffffff',
          border: 'rgba(20, 32, 44, 0.12)',
          navBg: 'rgba(248, 251, 255, 0.96)',
          shadow: '0 18px 42px rgba(43, 63, 89, 0.12)',
          bgGradient:
            'radial-gradient(circle at top left, rgba(160, 191, 224, 0.42), transparent 44%), radial-gradient(circle at top right, rgba(188, 225, 213, 0.38), transparent 40%)',
        }
      : appearance.mode === 'custom'
        ? {
            bg: appearance.background,
            text: '#edf5fb',
            muted: '#95a7bb',
            surface: hexToRgba(mixHex(appearance.background, '#ffffff', 0.08), 0.86),
            surfaceSubtle: hexToRgba(mixHex(appearance.background, '#ffffff', 0.14), 0.38),
            surfaceStrong: hexToRgba(mixHex(appearance.background, '#000000', 0.16), 0.92),
            border: 'rgba(255, 255, 255, 0.1)',
            navBg: hexToRgba(mixHex(appearance.background, '#000000', 0.14), 0.95),
            shadow: '0 24px 60px rgba(0, 0, 0, 0.26)',
            bgGradient: customGradient,
          }
        : {
            bg: '#09111b',
            text: '#edf5fb',
            muted: '#9aabbe',
            surface: 'rgba(10, 18, 29, 0.78)',
            surfaceSubtle: 'rgba(255, 255, 255, 0.04)',
            surfaceStrong: 'rgba(8, 13, 22, 0.86)',
            border: 'rgba(255, 255, 255, 0.1)',
            navBg: 'rgba(7, 13, 22, 0.94)',
            shadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
            bgGradient:
              'radial-gradient(circle at top left, rgba(24, 45, 73, 0.28), transparent 42%), radial-gradient(circle at top right, rgba(10, 75, 56, 0.22), transparent 38%)',
          }

  return {
    ['--page-gutter' as string]: `${appearance.pageGutter}px`,
    ['--space-xs' as string]: `${Math.round(appearance.pageGutter * 0.35)}px`,
    ['--space-sm' as string]: `${Math.round(appearance.pageGutter * 0.5)}px`,
    ['--space-md' as string]: `${Math.round(appearance.pageGutter * 0.75)}px`,
    ['--space-lg' as string]: `${appearance.pageGutter}px`,
    ['--space-xl' as string]: `${Math.round(appearance.pageGutter * 1.25)}px`,
    ['--panel-radius' as string]: `${appearance.radius}px`,
    ['--card-radius' as string]: `${Math.max(appearance.radius - 4, 0)}px`,
    ['--field-radius' as string]: `${Math.max(appearance.radius - 6, 0)}px`,
    ['--accent' as string]: appearance.accent,
    ['--accent-soft' as string]: hexToRgba(appearance.accent, 0.16),
    ['--accent-border' as string]: hexToRgba(appearance.accent, 0.7),
    ['--accent-contrast' as string]: pickContrastColor(appearance.accent),
    ['--app-font-family' as string]: appearance.fontFamily,
    ['--bg' as string]: palette.bg,
    ['--bg-gradient' as string]: palette.bgGradient,
    ['--bg-photo' as string]: backgroundPhoto,
    ['--text' as string]: palette.text,
    ['--muted' as string]: palette.muted,
    ['--surface' as string]: palette.surface,
    ['--surface-subtle' as string]: palette.surfaceSubtle,
    ['--surface-strong' as string]: palette.surfaceStrong,
    ['--border' as string]: palette.border,
    ['--nav-bg' as string]: palette.navBg,
    ['--shadow' as string]: palette.shadow,
  } as CSSProperties
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3 ? clean.split('').map((value) => value + value).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(65, 184, 131, ${alpha})`
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function mixHex(baseHex: string, targetHex: string, factor: number) {
  const base = normalizeHex(baseHex)
  const target = normalizeHex(targetHex)
  if (!base || !target) return baseHex

  const mix = (from: number, to: number) => Math.round(from + (to - from) * factor)
  const red = mix(Number.parseInt(base.slice(0, 2), 16), Number.parseInt(target.slice(0, 2), 16))
  const green = mix(Number.parseInt(base.slice(2, 4), 16), Number.parseInt(target.slice(2, 4), 16))
  const blue = mix(Number.parseInt(base.slice(4, 6), 16), Number.parseInt(target.slice(4, 6), 16))

  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function normalizeHex(hex: string) {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3 ? clean.split('').map((value) => value + value).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null
  return expanded
}

function pickContrastColor(hex: string) {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3 ? clean.split('').map((value) => value + value).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return '#071019'
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance > 150 ? '#071019' : '#f5fbff'
}
