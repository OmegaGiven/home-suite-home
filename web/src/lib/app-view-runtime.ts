import { useMemo } from 'react'
import { NAV_ITEMS, buildAppearanceStyle } from './app-config'
import type { NavItemPath } from './app-config'

export function useAppViewRuntime(context: any) {
  const orderedNavItems = useMemo(() => {
    const byPath = new Map(NAV_ITEMS.map((item) => [item.path, item]))
    const visibleItems = NAV_ITEMS.filter((item) => context.canAccessRoute(item.path))
    return (context.navOrder as NavItemPath[])
      .map((path) => byPath.get(path))
      .filter((item): item is (typeof NAV_ITEMS)[number] => Boolean(item))
      .concat(visibleItems.filter((item) => !context.navOrder.includes(item.path)))
      .filter((item) => context.canAccessRoute(item.path))
  }, [context.canAccessRoute, context.navOrder])

  const comsUnreadCount = useMemo(
    () => Object.values(context.roomUnreadCounts as Record<string, number>).reduce((total, count) => total + count, 0),
    [context.roomUnreadCounts],
  )

  const effectiveAppearance = useMemo(() => {
    if (context.adminSettings?.enforce_org_appearance) {
      return {
        ...context.appearance,
        fontFamily: context.adminSettings.org_font_family,
        accent: context.adminSettings.org_accent,
        background: context.adminSettings.org_background,
        disableGradients: context.adminSettings.org_disable_gradients,
        gradientTopLeft: context.adminSettings.org_gradient_top_left,
        gradientTopRight: context.adminSettings.org_gradient_top_right,
        gradientBottomLeft: context.adminSettings.org_gradient_bottom_left,
        gradientBottomRight: context.adminSettings.org_gradient_bottom_right,
        gradientStrength: context.adminSettings.org_gradient_strength,
        pageGutter: context.adminSettings.org_page_gutter,
        radius: context.adminSettings.org_radius,
      }
    }
    return context.appearance
  }, [context.appearance, context.adminSettings])

  const appearanceStyle = useMemo(() => buildAppearanceStyle(effectiveAppearance), [effectiveAppearance])

  return {
    orderedNavItems,
    comsUnreadCount,
    effectiveAppearance,
    appearanceStyle,
  }
}

export function showSyncNoticeWithTimeout(
  context: {
    syncNoticeTimeoutRef: { current: number | null }
    setSyncNotice: (value: { tone: 'offline' | 'error'; message: string } | null | ((current: { tone: 'offline' | 'error'; message: string } | null) => { tone: 'offline' | 'error'; message: string } | null)) => void
  },
  tone: 'offline' | 'error',
  message: string,
  timeoutMs = 4500,
) {
  if (context.syncNoticeTimeoutRef.current != null) {
    window.clearTimeout(context.syncNoticeTimeoutRef.current)
    context.syncNoticeTimeoutRef.current = null
  }
  context.setSyncNotice({ tone, message })
  if (timeoutMs > 0) {
    context.syncNoticeTimeoutRef.current = window.setTimeout(() => {
      context.setSyncNotice((current) => (current?.message === message ? null : current))
      context.syncNoticeTimeoutRef.current = null
    }, timeoutMs)
  }
}

export function rebaseFolderEntries(paths: string[], sourcePath: string, renamedPath: string) {
  return Array.from(
    new Set(
      paths.map((entry) =>
        entry === sourcePath || entry.startsWith(`${sourcePath}/`)
          ? `${renamedPath}${entry.slice(sourcePath.length)}`
          : entry,
      ),
    ),
  ).sort((left, right) => left.localeCompare(right))
}
