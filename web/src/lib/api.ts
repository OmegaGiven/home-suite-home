import type {
  AdminUserSummary,
  AdminStorageOverview,
  Diagram,
  FileNode,
  Message,
  Note,
  OidcConfig,
  ResourceShare,
  ResourceVisibility,
  Room,
  RtcConfig,
  ChangePasswordRequest,
  ChangeCurrentUserPasswordRequest,
  CreateUserRequest,
  UpdateUserAccessRequest,
  SetupAdminRequest,
  SetupStatusResponse,
  SessionResponse,
  TranscriptionJob,
  VoiceMemo,
  AdminSettings,
  UpdateAccountCredentialsRequest,
  UserProfile,
} from './types'

function resolveRuntimeBaseUrl(configuredUrl: string | undefined, fallbackPort: number) {
  if (typeof window === 'undefined') {
    return configuredUrl ?? `http://localhost:${fallbackPort}`
  }

  const fallback = `${window.location.protocol}//${window.location.hostname}:${fallbackPort}`
  const raw = configuredUrl?.trim() || fallback

  try {
    const url = new URL(raw, window.location.origin)
    const currentHost = window.location.hostname
    const targetHost = url.hostname
    const isLoopback =
      targetHost === 'localhost' ||
      targetHost === '127.0.0.1' ||
      targetHost === '0.0.0.0' ||
      targetHost === '::1'

    if (isLoopback && currentHost && currentHost !== targetHost) {
      url.hostname = currentHost
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    return raw.replace(/\/$/, '')
  }
}

const API_BASE = resolveRuntimeBaseUrl(import.meta.env.VITE_API_BASE_URL, 18082)

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const storedSession = window.localStorage.getItem('sweet.session')
  const session = storedSession ? (JSON.parse(storedSession) as SessionResponse) : null
  const headers = new Headers(init?.headers)
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`)
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  apiBase: API_BASE,
  login(email: string, password: string) {
    return request<SessionResponse>('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password }),
    })
  },
  changePassword(payload: ChangePasswordRequest) {
    return request<SessionResponse>('/api/v1/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  setupStatus() {
    return request<SetupStatusResponse>('/api/v1/auth/setup')
  },
  setupAdmin(payload: SetupAdminRequest) {
    return request<SessionResponse>('/api/v1/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  oidcConfig() {
    return request<OidcConfig>('/api/v1/auth/oidc/config')
  },
  oidcCallback(code: string, state?: string) {
    const query = new URLSearchParams({ code })
    if (state) {
      query.set('state', state)
    }
    return request<SessionResponse>(`/api/v1/auth/oidc/callback?${query.toString()}`)
  },
  listNotes() {
    return request<Note[]>('/api/v1/notes')
  },
  createNote(title: string, folder?: string, markdown?: string) {
    return request<Note>('/api/v1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, folder, markdown }),
    })
  },
  updateNote(note: Note, options?: { keepalive?: boolean }) {
    return request<Note>(`/api/v1/notes/${note.id}`, {
      method: 'PUT',
      keepalive: options?.keepalive,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: note.title,
        folder: note.folder,
        markdown: note.markdown,
        revision: note.revision,
      }),
    })
  },
  listDiagrams() {
    return request<Diagram[]>('/api/v1/diagrams')
  },
  createDiagram(title: string, xml?: string) {
    return request<Diagram>('/api/v1/diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, xml }),
    })
  },
  updateDiagram(diagram: Diagram) {
    return request<Diagram>(`/api/v1/diagrams/${diagram.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: diagram.title,
        xml: diagram.xml,
        revision: diagram.revision,
      }),
    })
  },
  listVoiceMemos() {
    return request<VoiceMemo[]>('/api/v1/voice-memos')
  },
  uploadVoiceMemo(title: string, file: Blob, browserTranscript?: string) {
    const body = new FormData()
    body.set('title', title)
    body.set('file', file, 'memo.webm')
    if (browserTranscript?.trim()) {
      body.set('browser_transcript', browserTranscript.trim())
    }
    return request<VoiceMemo>('/api/v1/voice-memos', { method: 'POST', body })
  },
  getVoiceJob(id: string) {
    return request<TranscriptionJob>(`/api/v1/voice-memos/${id}/job`)
  },
  voiceMemoAudioUrl(id: string) {
    return `${API_BASE}/api/v1/voice-memos/${id}/audio`
  },
  userAvatarUrl(userId: string, avatarPath?: string | null) {
    const version = avatarPath ? `?v=${encodeURIComponent(avatarPath)}` : ''
    return `${API_BASE}/api/v1/users/${encodeURIComponent(userId)}/avatar${version}`
  },
  uploadCurrentUserAvatar(file: Blob, filename: string) {
    const body = new FormData()
    body.set('file', file, filename)
    return request<import('./types').UserProfile>('/api/v1/users/me/avatar', { method: 'POST', body })
  },
  updateCurrentUserCredentials(payload: UpdateAccountCredentialsRequest) {
    return request<UserProfile>('/api/v1/users/me/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  changeCurrentUserPassword(payload: ChangeCurrentUserPasswordRequest) {
    return request<SessionResponse>('/api/v1/users/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  retryVoiceJob(id: string) {
    return request<TranscriptionJob>(`/api/v1/voice-memos/${id}/retry`, { method: 'POST' })
  },
  deleteVoiceMemo(id: string) {
    return request<void>(`/api/v1/voice-memos/${id}`, { method: 'DELETE' })
  },
  listRooms() {
    return request<Room[]>('/api/v1/rooms')
  },
  listComsParticipants() {
    return request<import('./types').UserProfile[]>('/api/v1/coms/participants')
  },
  getResourceShare(resourceKey: string) {
    return request<ResourceShare>(`/api/v1/shares?resource_key=${encodeURIComponent(resourceKey)}`)
  },
  updateResourceShare(resourceKey: string, visibility: ResourceVisibility, userIds: string[]) {
    return request<ResourceShare>('/api/v1/shares', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_key: resourceKey, visibility, user_ids: userIds }),
    })
  },
  createRoom(name: string, kind: 'channel' | 'direct' = 'channel', participantIds: string[] = []) {
    return request<Room>('/api/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kind, participant_ids: participantIds }),
    })
  },
  updateRoom(roomId: string, name: string, participantIds?: string[]) {
    return request<Room>(`/api/v1/rooms/${roomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, participant_ids: participantIds }),
    })
  },
  deleteRoom(roomId: string) {
    return request<void>(`/api/v1/rooms/${roomId}`, {
      method: 'DELETE',
    })
  },
  getAdminSettings() {
    return request<AdminSettings>('/api/v1/admin/settings')
  },
  getAdminStorageOverview() {
    return request<AdminStorageOverview>('/api/v1/admin/storage-overview')
  },
  updateAdminSettings(settings: AdminSettings) {
    return request<AdminSettings>('/api/v1/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
  },
  listUsers() {
    return request<AdminUserSummary[]>('/api/v1/admin/users')
  },
  createUser(payload: CreateUserRequest) {
    return request<AdminUserSummary>('/api/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  updateUserAccess(userId: string, payload: UpdateUserAccessRequest) {
    return request<AdminUserSummary>(`/api/v1/admin/users/${userId}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  resetUserPassword(userId: string, password: string) {
    return request<AdminUserSummary>(`/api/v1/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  },
  resolveUserCredentialRequest(userId: string, approve: boolean) {
    return request<AdminUserSummary>(`/api/v1/admin/users/${userId}/credential-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    })
  },
  listMessages(roomId: string) {
    return request<Message[]>(`/api/v1/rooms/${roomId}/messages`)
  },
  createMessage(roomId: string, body: string) {
    return request<Message>(`/api/v1/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
  },
  listFilesTree() {
    return request<FileNode[]>('/api/v1/files/tree')
  },
  createDriveFolder(path: string) {
    return request<FileNode>('/api/v1/files/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
  },
  uploadFile(path: string, file: Blob, filename: string) {
    const body = new FormData()
    body.set('path', path)
    body.set('file', file, filename)
    return request<FileNode>('/api/v1/files/upload', { method: 'POST', body })
  },
  moveFile(sourcePath: string, destinationDir: string) {
    return request<FileNode>('/api/v1/files/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_path: sourcePath, destination_dir: destinationDir }),
    })
  },
  renameFile(path: string, newName: string) {
    return request<FileNode>('/api/v1/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, new_name: newName }),
    })
  },
  async deleteFile(path: string) {
    const response = await fetch(`${API_BASE}/api/v1/files/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(body || `Request failed: ${response.status}`)
    }
  },
  fileDownloadUrl(path: string) {
    return `${API_BASE}/api/v1/files/download?path=${encodeURIComponent(path)}`
  },
  async fileText(path: string) {
    const response = await fetch(`${API_BASE}/api/v1/files/download?path=${encodeURIComponent(path)}`)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(body || `Request failed: ${response.status}`)
    }
    return response.text()
  },
  callConfig() {
    return request<RtcConfig>('/api/v1/calls/config')
  },
}
