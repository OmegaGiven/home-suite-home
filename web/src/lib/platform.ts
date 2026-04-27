import type { SessionResponse } from './types'

type PreferencesPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

type CapacitorRuntime = {
  isNativePlatform?: () => boolean
  Plugins?: {
    Preferences?: PreferencesPlugin
  }
}

declare global {
  interface Window {
    Capacitor?: CapacitorRuntime
  }
}

const SESSION_KEY = 'sweet.session'

function getPreferencesPlugin(): PreferencesPlugin | null {
  if (typeof window === 'undefined') return null
  return window.Capacitor?.Plugins?.Preferences ?? null
}

export function isNativePlatform() {
  if (typeof window === 'undefined') return false
  return window.Capacitor?.isNativePlatform?.() ?? false
}

export const sessionStore = {
  async get(): Promise<SessionResponse | null> {
    const preferences = getPreferencesPlugin()
    const raw = preferences
      ? (await preferences.get({ key: SESSION_KEY })).value
      : window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SessionResponse
    } catch {
      await this.clear()
      return null
    }
  },

  async set(session: SessionResponse) {
    const raw = JSON.stringify(session)
    const preferences = getPreferencesPlugin()
    if (preferences) {
      await preferences.set({ key: SESSION_KEY, value: raw })
      return
    }
    window.localStorage.setItem(SESSION_KEY, raw)
  },

  async clear() {
    const preferences = getPreferencesPlugin()
    if (preferences) {
      await preferences.remove({ key: SESSION_KEY })
      return
    }
    window.localStorage.removeItem(SESSION_KEY)
  },
}

export function getConnectivityState() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function subscribeToConnectivity(callback: (online: boolean) => void) {
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

export const mobilePlatform = {
  kind: isNativePlatform() ? 'capacitor' : 'web',
}
