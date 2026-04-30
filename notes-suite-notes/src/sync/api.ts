import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import type {
  NoteShareState,
  NoteDocumentPullResponse,
  PushNoteDocumentUpdatesRequest,
  PushNoteDocumentUpdatesResponse,
  NoteSessionOpenResponse,
  ServerAccount,
  ServerIdentity,
  UserProfile,
} from 'notes-suite-contracts'
import { createId } from 'notes-suite-contracts'

type SessionResponse = {
  user: UserProfile
  token: string
}

type OidcConfig = {
  enabled: boolean
  provider: string
  issuer: string
  client_id: string
  authorization_url: string
  token_url: string
  userinfo_url: string
  scopes: string
  redirect_url: string
}

export type RemoteNoteSnapshot = {
  id: string
  title: string
  folder: string
  markdown: string
  document?: unknown
  revision: number
  updated_at: string
  visibility?: 'private' | 'org' | 'users'
  editor_format?: string
  loro_snapshot_b64?: string
  loro_updates_b64?: string[]
  loro_version?: number
  loro_needs_migration?: boolean
}

export type RemoteServerUser = {
  id: string
  username: string
  email: string
  display_name: string
  avatar_path?: string | null
}

async function requestJson<T>(url: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status}: ${body}`)
  }
  return response.json() as Promise<T>
}

export async function loginWithPassword(baseUrl: string, identifier: string, password: string) {
  const session = await requestJson<SessionResponse>(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
  return session
}

export async function loadOidcConfig(baseUrl: string) {
  return requestJson<OidcConfig>(`${baseUrl}/api/v1/auth/oidc/config`)
}

export async function testServerConnection(baseUrl: string, token?: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  const health = await requestJson<{ status: string }>(`${normalizedBaseUrl}/health`)
  let noteCount: number | null = null
  if (token) {
    try {
      const notes = await requestJson<RemoteNoteSnapshot[]>(`${normalizedBaseUrl}/api/v2/notes`, undefined, token)
      noteCount = notes.length
    } catch {
      noteCount = null
    }
  }
  return {
    status: health.status,
    noteCount,
  }
}

export async function listRemoteNotes(baseUrl: string) {
  return requestJson<RemoteNoteSnapshot[]>(`${baseUrl.replace(/\/$/, '')}/api/v2/notes`)
}

export async function loginWithOidc(baseUrl: string): Promise<SessionResponse> {
  const config = await loadOidcConfig(baseUrl)
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'notessuitenotes' })
  const result = await WebBrowser.openAuthSessionAsync(
    `${config.authorization_url}?client_id=${encodeURIComponent(config.client_id)}&response_type=code&scope=${encodeURIComponent(config.scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    redirectUri,
  )
  if (result.type !== 'success' || !result.url) {
    throw new Error('OIDC login was cancelled.')
  }
  const parsed = new URL(result.url)
  const code = parsed.searchParams.get('code')
  if (!code) {
    throw new Error('OIDC login did not return a code.')
  }
  return requestJson<SessionResponse>(`${baseUrl}/api/v1/auth/oidc/mobile/exchange`, {
    method: 'POST',
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
    }),
  })
}

export function createServerAccount(baseUrl: string, label: string, authType: 'password' | 'oidc', session: SessionResponse): ServerAccount {
  const accountId = createId('server')
  const identity: ServerIdentity = {
    id: createId('identity'),
    server_account_id: accountId,
    label: session.user.display_name || session.user.username,
    auth_type: authType,
    user: session.user,
    token: session.token,
  }
  return {
    id: accountId,
    label: label.trim() || new URL(baseUrl).host,
    base_url: baseUrl.replace(/\/$/, ''),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    identities: [identity],
  }
}

export async function openNoteSession(baseUrl: string, token: string, noteId: string, clientId: string) {
  return requestJson<NoteSessionOpenResponse>(
    `${baseUrl}/api/v2/notes/${noteId}/session/open`,
    {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId }),
    },
    token,
  )
}

export async function createRemoteNote(
  baseUrl: string,
  token: string,
  payload: { title: string; folder: string; markdown: string; visibility: 'private' | 'org' | 'users' },
) {
  return requestJson<{
    id: string
    title: string
    folder: string
    markdown: string
    document?: unknown
    revision: number
    updated_at: string
  }>(
    `${baseUrl}/api/v2/notes`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export async function updateRemoteNoteMetadata(
  baseUrl: string,
  token: string,
  noteId: string,
  payload: {
    title?: string
    folder?: string
    visibility?: 'private' | 'org' | 'users'
  },
) {
  return requestJson<{
    id: string
    title: string
    folder: string
    markdown: string
    document?: unknown
    revision: number
    updated_at: string
  }>(
    `${baseUrl}/api/v2/notes/${noteId}/metadata`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export async function closeNoteSession(baseUrl: string, token: string, noteId: string, sessionId: string) {
  return requestJson<{ ok: boolean }>(
    `${baseUrl}/api/v2/notes/${noteId}/session/close`,
    {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    },
    token,
  )
}

export async function pullNoteDocument(baseUrl: string, token: string, noteId: string) {
  return requestJson<NoteDocumentPullResponse>(
    `${baseUrl}/api/v2/notes/${noteId}/document`,
    undefined,
    token,
  )
}

export async function pushNoteDocumentUpdates(
  baseUrl: string,
  token: string,
  noteId: string,
  payload: PushNoteDocumentUpdatesRequest,
) {
  return requestJson<PushNoteDocumentUpdatesResponse>(
    `${baseUrl}/api/v2/notes/${noteId}/document/updates`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export async function listServerUsers(baseUrl: string, token: string) {
  return requestJson<RemoteServerUser[]>(`${baseUrl}/api/v1/admin/users`, undefined, token)
}

export async function getResourceShare(baseUrl: string, token: string, resourceKey: string) {
  return requestJson<NoteShareState>(
    `${baseUrl}/api/v1/shares?resource_key=${encodeURIComponent(resourceKey)}`,
    undefined,
    token,
  )
}

export async function updateResourceShare(
  baseUrl: string,
  token: string,
  payload: { resource_key: string; visibility: 'private' | 'org' | 'users'; user_ids: string[] },
) {
  return requestJson<NoteShareState>(
    `${baseUrl}/api/v1/shares`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function noteSocketUrl(baseUrl: string, noteId: string) {
  return `${baseUrl.replace(/^http/i, 'ws')}/ws/notes/${noteId}`
}
