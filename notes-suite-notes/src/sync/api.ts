import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import type {
  NoteDocumentOperationBatch,
  NoteOperationsPullResponse,
  NoteOperationsPushResponse,
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
  document: unknown
  revision: number
  updated_at: string
  visibility?: 'private' | 'org' | 'users'
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
    throw new Error(await response.text())
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
      const notes = await requestJson<RemoteNoteSnapshot[]>(`${normalizedBaseUrl}/api/v1/notes`, undefined, token)
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
  return requestJson<RemoteNoteSnapshot[]>(`${baseUrl.replace(/\/$/, '')}/api/v1/notes`)
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
    `${baseUrl}/api/v1/notes/${noteId}/session/open`,
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
  payload: { title: string; folder: string; markdown: string; document: unknown; visibility: 'private' | 'org' | 'users' },
) {
  return requestJson<{
    id: string
    title: string
    folder: string
    markdown: string
    document: unknown
    revision: number
    updated_at: string
  }>(
    `${baseUrl}/api/v1/notes`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export async function updateRemoteNote(
  baseUrl: string,
  token: string,
  noteId: string,
  payload: {
    title?: string
    folder?: string
    markdown?: string
    revision: number
    document?: unknown
    visibility?: 'private' | 'org' | 'users'
  },
) {
  return requestJson<{
    id: string
    title: string
    folder: string
    markdown: string
    document: unknown
    revision: number
    updated_at: string
  }>(
    `${baseUrl}/api/v1/notes/${noteId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export async function closeNoteSession(baseUrl: string, token: string, noteId: string, sessionId: string) {
  return requestJson<{ ok: boolean }>(
    `${baseUrl}/api/v1/notes/${noteId}/session/close`,
    {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    },
    token,
  )
}

export async function pullNoteOperations(baseUrl: string, token: string, noteId: string, sinceRevision: number) {
  return requestJson<NoteOperationsPullResponse>(
    `${baseUrl}/api/v1/notes/${noteId}/operations?since_revision=${sinceRevision}`,
    undefined,
    token,
  )
}

export async function pushNoteOperations(
  baseUrl: string,
  token: string,
  noteId: string,
  batch: NoteDocumentOperationBatch,
) {
  return requestJson<NoteOperationsPushResponse>(
    `${baseUrl}/api/v1/notes/${noteId}/operations`,
    {
      method: 'POST',
      body: JSON.stringify({ batch }),
    },
    token,
  )
}

export function noteSocketUrl(baseUrl: string, noteId: string) {
  return `${baseUrl.replace(/^http/i, 'ws')}/ws/notes/${noteId}`
}
