import type { CSSProperties, ReactNode, RefObject } from 'react'
import { PaneSplitter } from './PaneSplitter'

type Props = {
  sectionClassName?: string
  sectionRef?: RefObject<HTMLElement | null>
  managerRef?: RefObject<HTMLDivElement | null>
  managerClassName: string
  drawerOpen: boolean
  activeSplitter: boolean
  paneSize: { width: number; height: number }
  style?: CSSProperties
  sidebarVisible?: boolean
  showSplitter?: boolean
  sidebarClassName?: string
  splitterClassName?: string
  sidebar: ReactNode
  content: ReactNode
  onStartResize: () => void
  onToggleDrawer?: () => void
}

export function LibraryShell({
  sectionClassName = 'panel',
  sectionRef,
  managerRef,
  managerClassName,
  drawerOpen,
  activeSplitter,
  paneSize,
  style,
  sidebarVisible = drawerOpen,
  showSplitter = true,
  sidebarClassName = 'notes-sidebar',
  splitterClassName = 'pane-splitter notes-pane-splitter',
  sidebar,
  content,
  onStartResize,
  onToggleDrawer,
}: Props) {
  return (
    <section ref={sectionRef} className={sectionClassName}>
      <div
        ref={managerRef}
        className={managerClassName}
        style={
          {
            ['--notes-pane-width' as string]: `${paneSize.width}px`,
            ['--notes-pane-height' as string]: `${paneSize.height}px`,
            ...style,
          } as CSSProperties
        }
      >
        {sidebarVisible ? <aside className={sidebarClassName}>{sidebar}</aside> : null}
        {showSplitter ? (
          <PaneSplitter
            className={splitterClassName}
            active={activeSplitter}
            drawerOpen={drawerOpen}
            onStartResize={onStartResize}
            onDoubleClick={onToggleDrawer}
          />
        ) : null}
        {content}
      </div>
    </section>
  )
}
