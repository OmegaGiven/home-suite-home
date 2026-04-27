import type { SessionResponse } from './types'

type PreferencesPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

type BrowserPlugin = {
  open(options: { url: string }): Promise<void>
}

type CapacitorRuntime = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: {
    Preferences?: PreferencesPlugin
    Browser?: BrowserPlugin
  }
}

declare global {
  interface Window {
    Capacitor?: CapacitorRuntime
  }
}

const SESSION_KEY = 'sweet.session'
const SERVER_BASE_KEY = 'sweet.serverBaseUrl'

function getPreferencesPlugin(): PreferencesPlugin | null {
  if (typeof window === 'undefined') return null
  return window.Capacitor?.Plugins?.Preferences ?? null
}

export function isNativePlatform() {
  if (typeof window === 'undefined') return false
  return window.Capacitor?.isNativePlatform?.() ?? false
}

export function getNativePlatform() {
  if (typeof window === 'undefined') return 'web'
  return window.Capacitor?.getPlatform?.() ?? 'web'
}

export async function openExternalUrl(url: string) {
  if (typeof window === 'undefined') return
  const browser = window.Capacitor?.Plugins?.Browser
  if (browser?.open) {
    await browser.open({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
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

function normalizeServerBaseUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

export const serverBaseStore = {
  async get(): Promise<string | null> {
    const preferences = getPreferencesPlugin()
    const raw = preferences
      ? (await preferences.get({ key: SERVER_BASE_KEY })).value
      : window.localStorage.getItem(SERVER_BASE_KEY)
    const normalized = normalizeServerBaseUrl(raw ?? '')
    return normalized || null
  },

  async set(value: string) {
    const normalized = normalizeServerBaseUrl(value)
    const preferences = getPreferencesPlugin()
    if (preferences) {
      await preferences.set({ key: SERVER_BASE_KEY, value: normalized })
      return
    }
    window.localStorage.setItem(SERVER_BASE_KEY, normalized)
  },

  async clear() {
    const preferences = getPreferencesPlugin()
    if (preferences) {
      await preferences.remove({ key: SERVER_BASE_KEY })
      return
    }
    window.localStorage.removeItem(SERVER_BASE_KEY)
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
