import type { CSSProperties, ReactNode } from 'react'

type AppReadyShellProps = {
  appearanceMode: string
  appearanceStyle: CSSProperties
  topNav: ReactNode
  syncNotice: ReactNode
  actionNotice: ReactNode
  syncConflictsPanel: ReactNode
  shareModal: ReactNode
  floatingPanels: ReactNode
  pageRenderer: ReactNode
}

export function AppReadyShell(props: AppReadyShellProps) {
  return (
    <div className={`app-shell theme-${props.appearanceMode}`} style={props.appearanceStyle}>
      {props.topNav}
      {props.syncNotice}
      {props.actionNotice}
      {props.syncConflictsPanel}
      {props.shareModal}
      {props.floatingPanels}
      {props.pageRenderer}
    </div>
  )
}
