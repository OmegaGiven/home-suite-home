type Props = {
  className: string
  active: boolean
  collapsed?: boolean
  drawerOpen?: boolean
  ariaExpanded?: boolean
  onStartResize: () => void
  onDoubleClick?: () => void
}

export function PaneSplitter({
  className,
  active,
  collapsed = false,
  drawerOpen = true,
  ariaExpanded,
  onStartResize,
  onDoubleClick,
}: Props) {
  const effectiveCollapsed = collapsed || !drawerOpen

  return (
    <div
      className={`${className} ${active ? 'active' : ''} ${effectiveCollapsed ? 'collapsed' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-expanded={ariaExpanded}
      onMouseDown={() => {
        if (!drawerOpen) return
        onStartResize()
      }}
      onTouchStart={() => {
        if (!drawerOpen) return
        onStartResize()
      }}
      onDoubleClick={onDoubleClick}
    />
  )
}
