import type { SessionResponse } from './types'

const SESSION_KEY = 'sweet.session'
const SERVER_BASE_KEY = 'sweet.serverBaseUrl'

export function isNativePlatform() {
  return false
}

export const sessionStore = {
  async get(): Promise<SessionResponse | null> {
    const raw = window.localStorage.getItem(SESSION_KEY)
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
    window.localStorage.setItem(SESSION_KEY, raw)
  },

  async clear() {
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
    const raw = window.localStorage.getItem(SERVER_BASE_KEY)
    const normalized = normalizeServerBaseUrl(raw ?? '')
    return normalized || null
  },

  async set(value: string) {
    const normalized = normalizeServerBaseUrl(value)
    window.localStorage.setItem(SERVER_BASE_KEY, normalized)
  },

  async clear() {
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
