export type UserRole = string

export interface UserProfile {
  id: string
  username: string
  email: string
  display_name: string
  avatar_path?: string | null
  avatar_content_type?: string | null
  role: UserRole
  roles: UserRole[]
  must_change_password: boolean
}

export interface UserToolScope {
  notes: boolean
  files: boolean
  diagrams: boolean
  voice: boolean
  coms: boolean
}

export interface RolePolicy {
  tool_scope: UserToolScope
  admin_panel: boolean
  manage_users: boolean
  manage_org_settings: boolean
  customize_appearance: boolean
}

export type RolePolicies = Record<string, RolePolicy>

export interface SessionResponse {
  user: UserProfile
  token: string
}

export interface SetupStatusResponse {
  admin_exists: boolean
  user_count: number
  sso_configured: boolean
}

export interface SetupAdminRequest {
  username: string
  email: string
  display_name: string
  password: string
  password_confirm: string
}

export interface AdminUserSummary {
  id: string
  username: string
  email: string
  display_name: string
  avatar_path?: string | null
  avatar_content_type?: string | null
  role: UserRole
  roles: UserRole[]
  must_change_password: boolean
  linked_sso: boolean
  storage_used_bytes: number
  storage_limit_mb: number
  tool_scope: UserToolScope
  pending_credential_change?: PendingCredentialChangeRequest | null
  created_at: string
  updated_at: string
}

export interface CreateUserRequest {
  username: string
  email: string
  display_name: string
  password: string
  role: UserRole
  roles: UserRole[]
  storage_limit_mb: number
}

export interface ChangePasswordRequest {
  identifier: string
  current_password: string
  new_password: string
  new_password_confirm: string
}

export interface UpdateAccountCredentialsRequest {
  username: string
  email: string
}

export interface ChangeCurrentUserPasswordRequest {
  current_password: string
  new_password: string
  new_password_confirm: string
}

export interface PendingCredentialChangeRequest {
  id: string
  user_id: string
  requested_username: string
  requested_email: string
  created_at: string
}

export interface UpdateUserAccessRequest {
  role: UserRole
  roles: UserRole[]
  storage_limit_mb: number
  tool_scope: UserToolScope
}

export interface AdminStorageOverview {
  public_storage_mb: number
  detected_total_mb: number
  detected_available_mb: number
}

export interface AdminSettings {
  allow_member_notes: boolean
  allow_member_files: boolean
  allow_member_diagrams: boolean
  allow_member_voice: boolean
  allow_member_coms: boolean
  require_account_email: boolean
  allow_user_credential_changes: boolean
  confirm_file_delete: boolean
  allow_user_custom_appearance: boolean
  enforce_org_appearance: boolean
  role_policies: RolePolicies
  org_font_family: string
  org_accent: string
  org_page_gutter: number
  org_radius: number
  per_user_storage_mb: number
  public_storage_mb: number
  voice_upload_limit_mb: number
}

export interface Note {
  id: string
  title: string
  folder: string
  markdown: string
  rendered_html: string
  revision: number
  created_at: string
  updated_at: string
  author_id: string
  last_editor_id: string
}

export type ResourceVisibility = 'private' | 'org' | 'users'

export interface ResourceShare {
  resource_key: string
  visibility: ResourceVisibility
  user_ids: string[]
  updated_at: string
  updated_by: string
}

export interface Diagram {
  id: string
  title: string
  xml: string
  revision: number
  created_at: string
  updated_at: string
  author_id: string
  last_editor_id: string
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface TranscriptSegment {
  start_ms: number
  end_ms: number
  text: string
}

export interface VoiceMemo {
  id: string
  title: string
  audio_path: string
  transcript?: string | null
  transcript_segments: TranscriptSegment[]
  status: JobStatus
  model: string
  device: string
  created_at: string
  updated_at: string
  failure_reason?: string | null
  owner_id: string
}

export interface TranscriptionJob {
  id: string
  memo_id: string
  status: JobStatus
  failure_reason?: string | null
}

export type RoomKind = 'channel' | 'direct'

export interface Room {
  id: string
  name: string
  kind: RoomKind
  created_at: string
  participant_ids: string[]
  participant_labels: string[]
}

export interface Message {
  id: string
  room_id: string
  author: UserProfile
  body: string
  created_at: string
}

export interface OidcConfig {
  issuer: string
  client_id: string
  authorization_url: string
  redirect_url: string
}

export interface RtcConfig {
  turn_urls: string[]
  username: string
  credential: string
}

export type RealtimeEvent =
  | { type: 'note_patch'; note_id: string; title: string; folder: string; markdown: string; revision: number }
  | { type: 'note_draft'; note_id: string; title: string; folder: string; markdown: string; revision: number; client_id: string; user: string }
  | { type: 'chat_message'; room_id: string; body: string; author: string; author_id: string }
  | { type: 'chat_rooms_updated' }
  | { type: 'signal'; room_id: string; from: string; payload: unknown }
  | { type: 'note_presence'; note_id: string; user: string }

export type FileNodeKind = 'directory' | 'file'

export interface FileNode {
  name: string
  path: string
  kind: FileNodeKind
  size_bytes?: number | null
  created_at?: string | null
  updated_at?: string | null
  children: FileNode[]
}
