import type { Dispatch, SetStateAction } from 'react'
import type { AppearanceSettings, NavItemPath, ShortcutSettings } from './app-config'
import type { SessionResponse } from './types'

type OrderedNavItem = {
  path: NavItemPath
  label: string
}

type BuildSettingsPagePropsArgs = {
  appearance: AppearanceSettings
  shortcuts: ShortcutSettings
  orderedNavItems: OrderedNavItem[]
  session: SessionResponse | null
  canCustomizeAppearance: boolean
  allowDirectCredentialChanges: boolean
  onSetAppearance: Dispatch<SetStateAction<AppearanceSettings>>
  onSetShortcuts: Dispatch<SetStateAction<ShortcutSettings>>
  onSetNavOrder: Dispatch<SetStateAction<NavItemPath[]>>
  onUploadAvatar: (file: File) => Promise<void>
  onUpdateCredentials: (payload: { username: string; email: string }) => Promise<string | null>
  onChangePassword: (payload: { current_password: string; new_password: string; new_password_confirm: string }) => Promise<void>
  onLogout: () => void
}

export function buildSettingsPageProps(args: BuildSettingsPagePropsArgs) {
  return { ...args }
}
