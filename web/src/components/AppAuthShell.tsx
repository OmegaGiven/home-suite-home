import type { CSSProperties } from 'react'
import { AuthPage } from '../pages/AuthPage'
import type { ChangePasswordRequest, SetupAdminRequest, SetupStatusResponse } from '../lib/types'

type AppAuthShellProps = {
  appearanceMode: string
  appearanceStyle: CSSProperties
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  status: string
  setupStatus: SetupStatusResponse | null
  serverUrl: string
  onSaveServerUrl: (url: string) => Promise<void>
  onEditServerUrl?: () => void
  onLogin: (identifier: string, password: string) => Promise<void>
  onSetupAdmin: (payload: SetupAdminRequest) => Promise<void>
  onChangePassword: (payload: ChangePasswordRequest) => Promise<void>
}

export function AppAuthShell(props: AppAuthShellProps) {
  return (
    <div className={`app-shell theme-${props.appearanceMode}`} style={props.appearanceStyle}>
      <AuthPage
        mode={props.authMode === 'connect' ? 'connect' : props.authMode === 'setup' ? 'setup' : props.authMode === 'change-password' ? 'change-password' : 'login'}
        status={props.status}
        ssoConfigured={props.setupStatus?.sso_configured ?? false}
        serverUrl={props.serverUrl}
        onSaveServerUrl={props.onSaveServerUrl}
        onEditServerUrl={props.onEditServerUrl}
        onLogin={props.onLogin}
        onSetupAdmin={props.onSetupAdmin}
        onChangePassword={props.onChangePassword}
      />
    </div>
  )
}
