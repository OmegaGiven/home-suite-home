import { useEffect, useMemo, useRef, useState } from 'react'
import type { NavItemPath, RoutePath } from '../lib/app-config'
import type { UserProfile } from '../lib/types'
import { UserAvatar } from './UserAvatar'

type NavItem = {
  path: NavItemPath
  label: string
}

type Props = {
  orderedNavItems: NavItem[]
  route: RoutePath
  currentUser: UserProfile | null
  navUnreadCounts?: Partial<Record<NavItemPath, number>>
  shortcutsHelpOpen: boolean
  onNavigate: (path: RoutePath) => void
  onToggleShortcutsHelp: () => void
  onSetShortcutsHelpOpen: (open: boolean) => void
  shortcutsContent: React.ReactNode
}

export function TopNav({
  orderedNavItems,
  route,
  currentUser,
  navUnreadCounts,
  shortcutsHelpOpen,
  onNavigate,
  onToggleShortcutsHelp,
  onSetShortcutsHelpOpen,
  shortcutsContent,
}: Props) {
  const primaryNavItems = orderedNavItems.filter((item) => item.path !== '/admin')
  const adminNavItem = orderedNavItems.find((item) => item.path === '/admin')
  const navRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const overflowRef = useRef<HTMLDivElement | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(primaryNavItems.length)

  useEffect(() => {
    function recomputeVisibleCount() {
      const nav = navRef.current
      const actions = actionsRef.current
      const measure = measureRef.current
      if (!nav || !actions || !measure) {
        setVisibleCount(primaryNavItems.length)
        return
      }

      const availableWidth = nav.clientWidth - 8
      const itemWidths = Array.from(measure.querySelectorAll<HTMLElement>('[data-measure-nav-item="true"]')).map(
        (node) => node.offsetWidth,
      )
      const overflowButtonWidth = 56

      let used = 0
      let nextVisibleCount = primaryNavItems.length
      for (let index = 0; index < primaryNavItems.length; index += 1) {
        const remainingCount = primaryNavItems.length - (index + 1)
        const reserveOverflow = remainingCount > 0 ? overflowButtonWidth : 0
        if (used + itemWidths[index] + reserveOverflow > availableWidth) {
          nextVisibleCount = index
          break
        }
        used += itemWidths[index]
      }

      setVisibleCount(Math.max(0, nextVisibleCount))
    }

    recomputeVisibleCount()
    const observer = new ResizeObserver(() => recomputeVisibleCount())
    if (navRef.current) observer.observe(navRef.current)
    if (actionsRef.current) observer.observe(actionsRef.current)
    if (measureRef.current) observer.observe(measureRef.current)
    window.addEventListener('resize', recomputeVisibleCount)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recomputeVisibleCount)
    }
  }, [primaryNavItems, navUnreadCounts])

  useEffect(() => {
    setOverflowOpen(false)
  }, [route, visibleCount])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (overflowRef.current?.contains(event.target as Node)) return
      setOverflowOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const visibleItems = useMemo(() => primaryNavItems.slice(0, visibleCount), [primaryNavItems, visibleCount])
  const overflowItems = useMemo(() => primaryNavItems.slice(visibleCount), [primaryNavItems, visibleCount])

  return (
    <header className="topbar">
      <nav ref={navRef} className="nav-links" aria-label="Primary">
        {visibleItems.map((item) => (
          <button
            key={item.path}
            className={`nav-link ${route === item.path ? 'active' : ''}`}
            onClick={() => onNavigate(item.path)}
          >
            <span>{item.label}</span>
            {(navUnreadCounts?.[item.path] ?? 0) > 0 ? (
              <span className="nav-unread-badge" aria-label={`${navUnreadCounts?.[item.path]} unread`}>
                {navUnreadCounts?.[item.path]}
              </span>
            ) : null}
          </button>
        ))}
        {overflowItems.length > 0 ? (
          <div ref={overflowRef} className="nav-overflow">
            <button
              className={`nav-link nav-overflow-toggle ${overflowItems.some((item) => item.path === route) ? 'active' : ''}`}
              onClick={() => setOverflowOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
            >
              <span>More</span>
            </button>
            {overflowOpen ? (
              <div className="nav-overflow-menu" role="menu">
                {overflowItems.map((item) => (
                  <button
                    key={item.path}
                    className={`nav-overflow-item ${route === item.path ? 'active' : ''}`}
                    onClick={() => {
                      setOverflowOpen(false)
                      onNavigate(item.path)
                    }}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                    {(navUnreadCounts?.[item.path] ?? 0) > 0 ? (
                      <span className="nav-unread-badge" aria-label={`${navUnreadCounts?.[item.path]} unread`}>
                        {navUnreadCounts?.[item.path]}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>
      <div ref={actionsRef} className="topbar-actions">
        <div
          className="shortcuts-help-anchor"
          onMouseEnter={() => onSetShortcutsHelpOpen(true)}
          onMouseLeave={() => onSetShortcutsHelpOpen(false)}
        >
          <button
            className={`icon-button ${shortcutsHelpOpen ? 'active' : ''}`}
            aria-label="Open shortcuts help"
            onClick={onToggleShortcutsHelp}
          >
            ?
          </button>
          {shortcutsHelpOpen ? shortcutsContent : null}
        </div>
        {adminNavItem ? (
          <button
            className={`icon-button ${route === adminNavItem.path ? 'active' : ''}`}
            onClick={() => onNavigate(adminNavItem.path)}
            aria-label={adminNavItem.label}
            title={adminNavItem.label}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        <button
          className={`icon-button ${route === '/settings' ? 'active' : ''}`}
          aria-label="Open settings"
          title="Account and settings"
          onClick={() => onNavigate('/settings')}
        >
          {currentUser ? <UserAvatar user={currentUser} /> : '⚙'}
        </button>
      </div>
      <div className="nav-measure" ref={measureRef} aria-hidden="true">
        {primaryNavItems.map((item) => (
          <button key={item.path} className="nav-link" data-measure-nav-item="true" tabIndex={-1}>
            <span>{item.label}</span>
            {(navUnreadCounts?.[item.path] ?? 0) > 0 ? (
              <span className="nav-unread-badge">{navUnreadCounts?.[item.path]}</span>
            ) : null}
          </button>
        ))}
      </div>
    </header>
  )
}
