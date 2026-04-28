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
  drawio_public_url: string
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

export interface AdminDatabaseTable {
  key: string
  label: string
  row_count: number
  columns: string[]
  rows: Record<string, unknown>[]
}

export interface AdminDatabaseOverview {
  backend: string
  generated_at: string
  tables: AdminDatabaseTable[]
}

export type DeletedResourceKind = 'note' | 'diagram' | 'voice_memo' | 'drive_path'

export interface AdminDeletedItem {
  id: string
  kind: DeletedResourceKind
  label: string
  original_path: string
  deleted_at: string
  purge_at: string
}

export interface AdminAuditEntry {
  id: string
  occurred_at: string
  actor_id: string
  actor_label: string
  source: string
  action: string
  target_kind: string
  target_id: string
  target_label: string
  details: Record<string, unknown> | null
}

export interface SystemUpdateStatus {
  current_version: string
  update_target: string
  update_enabled: boolean
  update_in_progress: boolean
  last_started_at?: string | null
  last_finished_at?: string | null
  last_exit_code?: number | null
  last_message: string
  last_error?: string | null
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
  oidc: OidcProviderSettings
  oidc_providers: OidcProviderSettings[]
  active_oidc_provider_id: string
  google_calendar_enabled: boolean
  google_calendar_client_id: string
  google_calendar_client_secret: string
  role_policies: RolePolicies
  org_font_family: string
  org_accent: string
  org_background: string
  org_disable_gradients: boolean
  org_gradient_top_left: string
  org_gradient_top_right: string
  org_gradient_bottom_left: string
  org_gradient_bottom_right: string
  org_gradient_strength: number
  org_page_gutter: number
  org_radius: number
  per_user_storage_mb: number
  public_storage_mb: number
  voice_upload_limit_mb: number
}

export interface OidcProviderSettings {
  id: string
  title: string
  enabled: boolean
  provider: string
  issuer: string
  client_id: string
  client_secret: string
  authorization_url: string
  token_url: string
  userinfo_url: string
  scopes: string
}

export type WorkspaceObjectKind = 'note_document' | 'managed_file' | 'folder' | 'audio_memo' | 'diagram'
export type ObjectNamespaceKind = 'private' | 'synced' | 'shared'

export interface ObjectNamespace {
  root: string
  owner_id: string
  kind: ObjectNamespaceKind
  label: string
}

export type NoteBlockKind =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'bullet_list'
  | 'checklist'
  | 'numbered_list'
  | 'code'
  | 'table'

export interface NoteBlock {
  id: string
  kind: NoteBlockKind
  text: string
  attrs: Record<string, string>
  order: number
  deleted: boolean
  last_modified_by: string
  last_modified_counter: number
}

export interface NoteDocument {
  blocks: NoteBlock[]
  clock: Record<string, number>
  last_operation_id: string
}

export type NoteOperation =
  | { type: 'set_title'; title: string }
  | { type: 'set_folder'; folder: string }
  | { type: 'replace_document'; blocks: NoteBlock[] }
  | { type: 'insert_block'; block: NoteBlock; after_block_id?: string | null }
  | { type: 'update_block_text'; block_id: string; text: string }
  | { type: 'update_block_attrs'; block_id: string; attrs: Record<string, string> }
  | { type: 'delete_block'; block_id: string }
  | { type: 'move_block'; block_id: string; after_block_id?: string | null }

export interface NoteDocumentOperationBatch {
  actor_id: string
  client_id: string
  operation_id: string
  base_clock: Record<string, number>
  base_markdown?: string | null
  base_document?: NoteDocument | null
  operations: NoteOperation[]
}

export interface NoteOperationRecord {
  note_id: string
  operation_id: string
  actor_id: string
  client_id: string
  created_at: string
  resulting_revision: number
  batch: NoteDocumentOperationBatch
}

export interface NoteSession {
  session_id: string
  note_id: string
  user_id: string
  user_label: string
  user_avatar_path?: string | null
  client_id: string
  opened_at: string
  last_seen_at: string
}

export interface NoteConflictRecord {
  id: string
  note_id: string
  operation_id: string
  reason: string
  forked_note_ids: string[]
  created_at: string
}

export interface NoteOperationsPullResponse {
  note: Note
  operations: NoteOperationRecord[]
  conflicts: NoteConflictRecord[]
  share: ResourceShare
}

export interface NoteOperationsPushResponse {
  note: Note
  applied: boolean
  operation?: NoteOperationRecord | null
  conflicts: NoteConflictRecord[]
}

export interface NoteSessionOpenResponse {
  note: Note
  share: ResourceShare
  sessions: NoteSession[]
  conflicts: NoteConflictRecord[]
}

export interface Note {
  id: string
  object_id: string
  namespace: ObjectNamespace
  visibility: ResourceVisibility
  shared_user_ids: string[]
  title: string
  folder: string
  markdown: string
  rendered_html: string
  document: NoteDocument
  revision: number
  created_at: string
  updated_at: string
  author_id: string
  last_editor_id: string
  forked_from_note_id?: string | null
  conflict_tag?: string | null
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
  object_id: string
  namespace: ObjectNamespace
  visibility: ResourceVisibility
  shared_user_ids: string[]
  title: string
  audio_path: string
  transcript?: string | null
  transcript_segments: TranscriptSegment[]
  transcript_tags: string[]
  topic_summary?: string | null
  source_channels: string[]
  status: JobStatus
  model: string
  device: string
  created_at: string
  updated_at: string
  failure_reason?: string | null
  owner_id: string
  sync_state?: SyncState
  local_only?: boolean
  pending_upload_id?: string | null
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
  folder: string
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
  reactions: MessageReaction[]
}

export interface MessageReaction {
  emoji: string
  user_ids: string[]
}

export interface OidcConfig {
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

export interface GoogleCalendarConfig {
  enabled: boolean
  client_id: string
  redirect_url: string
  scope: string
}

export type CalendarProvider = 'google' | 'ics' | 'sweet'

export interface CalendarConnection {
  id: string
  owner_id: string
  owner_display_name: string
  title: string
  provider: CalendarProvider
  external_id: string
  calendar_id: string
  account_label: string
  access_token?: string | null
  refresh_token?: string | null
  token_expires_at?: string | null
  ics_url?: string | null
  created_at: string
  updated_at: string
}

export interface CalendarEvent {
  id: string
  connection_id: string
  title: string
  description: string
  location: string
  start_at: string
  end_at: string
  all_day: boolean
  source_url: string
  organizer: string
  updated_at?: string | null
}

export type TaskStatus = 'open' | 'completed'

export interface TaskItem {
  id: string
  owner_id: string
  owner_display_name: string
  title: string
  description: string
  status: TaskStatus
  start_at?: string | null
  end_at?: string | null
  all_day: boolean
  calendar_connection_id?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export interface RtcConfig {
  turn_urls: string[]
  username: string
  credential: string
}

export type RealtimeEvent =
  | { type: 'note_patch'; note_id: string; title: string; folder: string; markdown: string; revision: number; document?: NoteDocument | null }
  | { type: 'note_draft'; note_id: string; title: string; folder: string; markdown: string; revision: number; client_id: string; user: string; document?: NoteDocument | null }
  | {
      type: 'note_operations'
      note_id: string
      title: string
      folder: string
      markdown: string
      revision: number
      client_id: string
      user: string
      batch: NoteDocumentOperationBatch
      document?: NoteDocument | null
    }
  | { type: 'note_cursor'; note_id: string; user: string; client_id: string; offset: number | null }
  | { type: 'chat_message'; room_id: string; body: string; author: string; author_id: string }
  | { type: 'chat_message_reactions_updated'; room_id: string; message_id: string }
  | { type: 'chat_rooms_updated' }
  | { type: 'signal'; room_id: string; from: string; payload: unknown }
  | { type: 'note_presence'; note_id: string; user: string }

export type FileNodeKind = 'directory' | 'file'

export interface FileNode {
  name: string
  path: string
  kind: FileNodeKind
  object_id?: string | null
  object_kind?: WorkspaceObjectKind | null
  namespace?: ObjectNamespace | null
  visibility?: ResourceVisibility | null
  resource_key?: string | null
  size_bytes?: number | null
  created_at?: string | null
  updated_at?: string | null
  children: FileNode[]
}

export type SyncEntityKind =
  | 'notes'
  | 'diagrams'
  | 'voice_memos'
  | 'rooms'
  | 'messages'
  | 'calendar_connections'
  | 'calendar_events'
  | 'tasks'
  | 'file_tree'
  | 'resource_shares'

export type SyncState = 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflicted'

export interface SyncCursorSet {
  generated_at: string
  notes?: string | null
  diagrams?: string | null
  voice_memos?: string | null
  rooms?: string | null
  messages?: string | null
  calendar_connections?: string | null
  calendar_events?: string | null
  tasks?: string | null
  file_tree?: string | null
  resource_shares?: string | null
}

export interface SyncTombstone {
  entity: SyncEntityKind
  id: string
  deleted_at: string
}

export interface SyncConflict {
  entity: SyncEntityKind
  id: string
  reason: string
  field: string
  local_value: string
  remote_value: string
  forked_note_ids: string[]
}

export interface SyncEnvelope {
  cursors: SyncCursorSet
  notes: Note[]
  diagrams: Diagram[]
  voice_memos: VoiceMemo[]
  rooms: Room[]
  messages: Message[]
  calendar_connections: CalendarConnection[]
  calendar_events: CalendarEvent[]
  tasks: TaskItem[]
  file_tree: FileNode[]
  resource_shares: ResourceShare[]
  tombstones: SyncTombstone[]
}

export type SyncOperation =
  | { kind: 'create_note'; client_generated_id: string; title: string; folder?: string | null; markdown?: string | null }
  | { kind: 'update_note'; id: string; title?: string | null; folder?: string | null; markdown?: string | null; revision: number }
  | { kind: 'apply_note_operations'; id: string; batch: NoteDocumentOperationBatch }
  | { kind: 'delete_note'; id: string }
  | { kind: 'create_diagram'; client_generated_id: string; title: string; xml?: string | null }
  | { kind: 'update_diagram'; id: string; title?: string | null; xml: string; revision: number }
  | { kind: 'create_task'; client_generated_id: string; title: string; description: string; start_at?: string | null; end_at?: string | null; all_day: boolean; calendar_connection_id?: string | null }
  | { kind: 'update_task'; id: string; title: string; description: string; status: TaskStatus; start_at?: string | null; end_at?: string | null; all_day: boolean; calendar_connection_id?: string | null }
  | { kind: 'delete_task'; id: string }
  | { kind: 'create_local_calendar'; client_generated_id: string; title: string }
  | { kind: 'rename_calendar'; id: string; title: string }
  | { kind: 'delete_calendar'; id: string }
  | { kind: 'create_calendar_event'; client_generated_id: string; connection_id: string; title: string; description: string; location: string; start_at: string; end_at: string; all_day: boolean }
  | { kind: 'update_calendar_event'; connection_id: string; event_id: string; title: string; description: string; location: string; start_at: string; end_at: string; all_day: boolean }
  | { kind: 'delete_calendar_event'; connection_id: string; event_id: string }
  | { kind: 'create_message'; client_generated_id: string; room_id: string; body: string }
  | { kind: 'create_managed_folder'; path: string }
  | { kind: 'move_managed_path'; source_path: string; destination_dir: string }
  | { kind: 'rename_managed_path'; path: string; new_name: string }
  | { kind: 'delete_managed_path'; path: string }
  | { kind: 'toggle_message_reaction'; room_id: string; message_id: string; emoji: string }

export interface SyncPushResponse {
  envelope: SyncEnvelope
  conflicts: SyncConflict[]
}

export interface OfflineRecordMeta {
  sync_state: SyncState
  last_synced_at?: string | null
  deleted_at?: string | null
  local_operation_id?: string | null
}

export interface QueuedSyncOperation {
  id: string
  operation: SyncOperation
  created_at: string
  attempts: number
}

export interface QueuedSyncConflict {
  id: string
  created_at: string
  queued_operation: QueuedSyncOperation
  conflict: SyncConflict
}

export interface PendingVoiceUploadRecord {
  id: string
  title: string
  filename: string
  mime_type: string
  size_bytes: number
  browser_transcript?: string | null
  created_at: string
  blob: Blob
}

export interface PendingManagedUploadRecord {
  id: string
  path: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: string
  blob: Blob
}

export interface WorkspaceSnapshot {
  source: 'cache' | 'remote'
  synced_at: string
  cursors: SyncCursorSet
  notes: Note[]
  diagrams: Diagram[]
  voice_memos: VoiceMemo[]
  rooms: Room[]
  messages: Message[]
  calendar_connections: CalendarConnection[]
  calendar_events: CalendarEvent[]
  tasks: TaskItem[]
  file_tree: FileNode[]
  resource_shares: ResourceShare[]
  tombstones: SyncTombstone[]
}
