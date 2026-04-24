import { useEffect, useMemo, useRef, useState } from 'react'

type CategoryItem<T extends string> = {
  key: T
  label: string
}

type Props<T extends string> = {
  items: Array<CategoryItem<T>>
  activeKey: T
  ariaLabel: string
  onChange: (key: T) => void
}

export function OverflowCategoryNav<T extends string>({ items, activeKey, ariaLabel, onChange }: Props<T>) {
  const navRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const overflowRef = useRef<HTMLDivElement | null>(null)
  const [visibleCount, setVisibleCount] = useState(items.length)
  const [overflowOpen, setOverflowOpen] = useState(false)

  useEffect(() => {
    function recomputeVisibleCount() {
      const nav = navRef.current
      const measure = measureRef.current
      if (!nav || !measure) {
        setVisibleCount(items.length)
        return
      }

      const availableWidth = nav.clientWidth - 8
      const itemWidths = Array.from(measure.querySelectorAll<HTMLElement>('[data-measure-category-item="true"]')).map(
        (node) => node.offsetWidth,
      )
      const overflowButtonWidth = 64

      let used = 0
      let nextVisibleCount = items.length
      for (let index = 0; index < items.length; index += 1) {
        const remainingCount = items.length - (index + 1)
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
    if (measureRef.current) observer.observe(measureRef.current)
    window.addEventListener('resize', recomputeVisibleCount)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recomputeVisibleCount)
    }
  }, [items])

  useEffect(() => {
    setOverflowOpen(false)
  }, [activeKey, visibleCount])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (overflowRef.current?.contains(event.target as Node)) return
      setOverflowOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])
  const overflowItems = useMemo(() => items.slice(visibleCount), [items, visibleCount])

  return (
    <div className="settings-categorybar-wrap">
      <div ref={navRef} className="settings-categorybar" role="tablist" aria-label={ariaLabel}>
        {visibleItems.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={activeKey === item.key}
            className={`nav-link ${activeKey === item.key ? 'active' : ''}`}
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        ))}
        {overflowItems.length > 0 ? (
          <div ref={overflowRef} className="nav-overflow">
            <button
              type="button"
              className={`nav-link nav-overflow-toggle ${overflowItems.some((item) => item.key === activeKey) ? 'active' : ''}`}
              onClick={() => setOverflowOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
            >
              More
            </button>
            {overflowOpen ? (
              <div className="nav-overflow-menu" role="menu">
                {overflowItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className={`nav-overflow-item ${activeKey === item.key ? 'active' : ''}`}
                    onClick={() => {
                      setOverflowOpen(false)
                      onChange(item.key)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="nav-measure" ref={measureRef} aria-hidden="true">
        {items.map((item) => (
          <button key={item.key} className="nav-link" data-measure-category-item="true" tabIndex={-1}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
