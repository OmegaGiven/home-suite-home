use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub timestamp: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SystemUpdateStatus {
    pub current_version: String,
    pub update_target: String,
    pub update_enabled: bool,
    pub update_in_progress: bool,
    pub last_started_at: Option<DateTime<Utc>>,
    pub last_finished_at: Option<DateTime<Utc>>,
    pub last_exit_code: Option<i32>,
    pub last_message: String,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct SessionResponse {
    pub user: UserProfile,
    pub token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct UserProfile {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: String,
    #[serde(default)]
    pub avatar_path: Option<String>,
    #[serde(default)]
    pub avatar_content_type: Option<String>,
    pub role: String,
    #[serde(default)]
    pub roles: Vec<String>,
    pub must_change_password: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct UserToolScope {
    pub notes: bool,
    pub files: bool,
    pub diagrams: bool,
    pub voice: bool,
    pub coms: bool,
}

impl Default for UserToolScope {
    fn default() -> Self {
        Self {
            notes: true,
            files: true,
            diagrams: true,
            voice: true,
            coms: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct RolePolicy {
    pub tool_scope: UserToolScope,
    pub admin_panel: bool,
    pub manage_users: bool,
    pub manage_org_settings: bool,
    pub customize_appearance: bool,
}

impl Default for RolePolicy {
    fn default() -> Self {
        Self {
            tool_scope: UserToolScope::default(),
            admin_panel: false,
            manage_users: false,
            manage_org_settings: false,
            customize_appearance: true,
        }
    }
}

pub type RolePolicies = HashMap<String, RolePolicy>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoredUser {
    pub profile: UserProfile,
    pub password_hash: String,
    pub linked_oidc_subject: Option<String>,
    #[serde(default)]
    pub storage_limit_mb: u64,
    #[serde(default)]
    pub tool_scope: UserToolScope,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LoginRequest {
    #[serde(alias = "email", alias = "username")]
    pub identifier: String,
    pub password: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetupStatusResponse {
    pub admin_exists: bool,
    pub user_count: usize,
    pub sso_configured: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SetupAdminRequest {
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub password: String,
    pub password_confirm: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdminUserSummary {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: String,
    #[serde(default)]
    pub avatar_path: Option<String>,
    #[serde(default)]
    pub avatar_content_type: Option<String>,
    pub role: String,
    pub roles: Vec<String>,
    pub must_change_password: bool,
    pub linked_sso: bool,
    pub storage_used_bytes: u64,
    pub storage_limit_mb: u64,
    pub tool_scope: UserToolScope,
    #[serde(default)]
    pub pending_credential_change: Option<PendingCredentialChangeRequest>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub password: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub roles: Vec<String>,
    pub storage_limit_mb: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AdminResetPasswordRequest {
    pub password: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateUserAccessRequest {
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub roles: Vec<String>,
    pub storage_limit_mb: u64,
    pub tool_scope: UserToolScope,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdminStorageOverview {
    pub public_storage_mb: u64,
    pub detected_total_mb: u64,
    pub detected_available_mb: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub identifier: String,
    pub current_password: String,
    pub new_password: String,
    pub new_password_confirm: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateAccountCredentialsRequest {
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub email: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ChangeCurrentUserPasswordRequest {
    pub current_password: String,
    pub new_password: String,
    pub new_password_confirm: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PendingCredentialChangeRequest {
    pub id: Uuid,
    pub user_id: Uuid,
    pub requested_username: String,
    pub requested_email: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AdminSettings {
    pub allow_member_notes: bool,
    pub allow_member_files: bool,
    pub allow_member_diagrams: bool,
    pub allow_member_voice: bool,
    pub allow_member_coms: bool,
    pub require_account_email: bool,
    pub allow_user_credential_changes: bool,
    pub confirm_file_delete: bool,
    pub allow_user_custom_appearance: bool,
    pub enforce_org_appearance: bool,
    #[serde(default)]
    pub oidc: OidcProviderSettings,
    #[serde(default)]
    pub oidc_providers: Vec<OidcProviderSettings>,
    #[serde(default)]
    pub active_oidc_provider_id: String,
    pub google_calendar_enabled: bool,
    pub google_calendar_client_id: String,
    pub google_calendar_client_secret: String,
    pub role_policies: RolePolicies,
    pub org_font_family: String,
    pub org_accent: String,
    pub org_background: String,
    pub org_disable_gradients: bool,
    pub org_gradient_top_left: String,
    pub org_gradient_top_right: String,
    pub org_gradient_bottom_left: String,
    pub org_gradient_bottom_right: String,
    pub org_gradient_strength: u16,
    pub org_page_gutter: u16,
    pub org_radius: u16,
    pub per_user_storage_mb: u64,
    pub public_storage_mb: u64,
    pub voice_upload_limit_mb: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct OidcProviderSettings {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    pub enabled: bool,
    pub provider: String,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    pub authorization_url: String,
    pub token_url: String,
    pub userinfo_url: String,
    pub scopes: String,
}

impl Default for OidcProviderSettings {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: "Authentication".into(),
            enabled: false,
            provider: "authentik".into(),
            issuer: String::new(),
            client_id: String::new(),
            client_secret: String::new(),
            authorization_url: String::new(),
            token_url: String::new(),
            userinfo_url: String::new(),
            scopes: "openid profile email".into(),
        }
    }
}

impl Default for AdminSettings {
    fn default() -> Self {
        let mut role_policies = HashMap::new();
        role_policies.insert(
            "admin".into(),
            RolePolicy {
                tool_scope: UserToolScope::default(),
                admin_panel: true,
                manage_users: true,
                manage_org_settings: true,
                customize_appearance: true,
            },
        );
        role_policies.insert("member".into(), RolePolicy::default());
        Self {
            allow_member_notes: true,
            allow_member_files: true,
            allow_member_diagrams: true,
            allow_member_voice: true,
            allow_member_coms: true,
            require_account_email: false,
            allow_user_credential_changes: true,
            confirm_file_delete: true,
            allow_user_custom_appearance: true,
            enforce_org_appearance: false,
            oidc: OidcProviderSettings::default(),
            oidc_providers: Vec::new(),
            active_oidc_provider_id: String::new(),
            google_calendar_enabled: false,
            google_calendar_client_id: String::new(),
            google_calendar_client_secret: String::new(),
            role_policies,
            org_font_family: "\"IBM Plex Sans\", \"Segoe UI\", sans-serif".into(),
            org_accent: "#41b883".into(),
            org_background: "#0d1520".into(),
            org_disable_gradients: false,
            org_gradient_top_left: "#142235".into(),
            org_gradient_top_right: "#0b3a2d".into(),
            org_gradient_bottom_left: "#24163a".into(),
            org_gradient_bottom_right: "#123046".into(),
            org_gradient_strength: 36,
            org_page_gutter: 16,
            org_radius: 20,
            per_user_storage_mb: 2048,
            public_storage_mb: 4096,
            voice_upload_limit_mb: 256,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct OidcConfigResponse {
    pub enabled: bool,
    pub provider: String,
    pub issuer: String,
    pub client_id: String,
    pub authorization_url: String,
    pub token_url: String,
    pub userinfo_url: String,
    pub scopes: String,
    pub redirect_url: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct GoogleCalendarConfigResponse {
    pub enabled: bool,
    pub client_id: String,
    pub redirect_url: String,
    pub scope: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CalendarProvider {
    Google,
    Ics,
    Sweet,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CalendarConnection {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub owner_display_name: String,
    pub title: String,
    pub provider: CalendarProvider,
    pub external_id: String,
    pub calendar_id: String,
    pub account_label: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<DateTime<Utc>>,
    pub ics_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub connection_id: Uuid,
    pub title: String,
    pub description: String,
    pub location: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub all_day: bool,
    pub source_url: String,
    pub organizer: String,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ConnectGoogleCalendarRequest {
    pub code: String,
    pub redirect_url: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateIcsCalendarConnectionRequest {
    pub title: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateLocalCalendarConnectionRequest {
    pub title: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateCalendarConnectionRequest {
    pub title: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateCalendarEventRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub location: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    #[serde(default)]
    pub all_day: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateCalendarEventRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub location: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    #[serde(default)]
    pub all_day: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Open,
    Completed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskItem {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub owner_display_name: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub all_day: bool,
    pub calendar_connection_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub start_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub calendar_connection_id: Option<Uuid>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub status: TaskStatus,
    #[serde(default)]
    pub start_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub calendar_connection_id: Option<Uuid>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: Uuid,
    pub title: String,
    pub folder: String,
    pub markdown: String,
    pub rendered_html: String,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub author_id: Uuid,
    #[serde(default)]
    pub last_editor_id: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceVisibility {
    Private,
    Org,
    Users,
}

impl Default for ResourceVisibility {
    fn default() -> Self {
        Self::Private
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResourceShare {
    pub resource_key: String,
    #[serde(default)]
    pub visibility: ResourceVisibility,
    #[serde(default)]
    pub user_ids: Vec<Uuid>,
    pub updated_at: DateTime<Utc>,
    pub updated_by: Uuid,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateResourceShareRequest {
    pub resource_key: String,
    pub visibility: ResourceVisibility,
    #[serde(default)]
    pub user_ids: Vec<Uuid>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    pub folder: Option<String>,
    pub markdown: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateNoteRequest {
    pub title: Option<String>,
    pub folder: Option<String>,
    pub markdown: Option<String>,
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileNodeKind {
    Directory,
    File,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: FileNodeKind,
    pub size_bytes: Option<u64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub children: Vec<FileNode>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateFolderRequest {
    pub path: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MoveFileRequest {
    pub source_path: String,
    pub destination_dir: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DeleteFileRequest {
    pub path: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RenameFileRequest {
    pub path: String,
    pub new_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Diagram {
    pub id: Uuid,
    pub title: String,
    pub xml: String,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub author_id: Uuid,
    #[serde(default)]
    pub last_editor_id: Uuid,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateDiagramRequest {
    pub title: String,
    pub xml: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateDiagramRequest {
    pub title: Option<String>,
    pub xml: String,
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VoiceMemo {
    pub id: Uuid,
    pub title: String,
    pub audio_path: String,
    pub transcript: Option<String>,
    pub transcript_segments: Vec<TranscriptSegment>,
    pub status: JobStatus,
    pub model: String,
    pub device: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub failure_reason: Option<String>,
    #[serde(default)]
    pub owner_id: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TranscriptionJob {
    pub id: Uuid,
    pub memo_id: Uuid,
    pub status: JobStatus,
    pub failure_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    #[serde(default)]
    pub folder: String,
    pub kind: RoomKind,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub participant_ids: Vec<Uuid>,
    #[serde(default)]
    pub participant_labels: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoomKind {
    Channel,
    Direct,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageReaction {
    pub emoji: String,
    #[serde(default)]
    pub user_ids: Vec<Uuid>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: Uuid,
    pub room_id: Uuid,
    pub author: UserProfile,
    pub body: String,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub reactions: Vec<MessageReaction>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncEntityKind {
    Notes,
    Diagrams,
    VoiceMemos,
    Rooms,
    Messages,
    CalendarConnections,
    CalendarEvents,
    Tasks,
    FileTree,
    ResourceShares,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SyncCursorSet {
    pub generated_at: DateTime<Utc>,
    pub notes: Option<DateTime<Utc>>,
    pub diagrams: Option<DateTime<Utc>>,
    pub voice_memos: Option<DateTime<Utc>>,
    pub rooms: Option<DateTime<Utc>>,
    pub messages: Option<DateTime<Utc>>,
    pub calendar_connections: Option<DateTime<Utc>>,
    pub calendar_events: Option<DateTime<Utc>>,
    pub tasks: Option<DateTime<Utc>>,
    pub file_tree: Option<DateTime<Utc>>,
    pub resource_shares: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncTombstone {
    pub entity: SyncEntityKind,
    pub id: String,
    pub deleted_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncConflict {
    pub entity: SyncEntityKind,
    pub id: String,
    pub reason: String,
    #[serde(default)]
    pub field: String,
    #[serde(default)]
    pub local_value: String,
    #[serde(default)]
    pub remote_value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncEnvelope {
    pub cursors: SyncCursorSet,
    #[serde(default)]
    pub notes: Vec<Note>,
    #[serde(default)]
    pub diagrams: Vec<Diagram>,
    #[serde(default)]
    pub voice_memos: Vec<VoiceMemo>,
    #[serde(default)]
    pub rooms: Vec<Room>,
    #[serde(default)]
    pub messages: Vec<Message>,
    #[serde(default)]
    pub calendar_connections: Vec<CalendarConnection>,
    #[serde(default)]
    pub calendar_events: Vec<CalendarEvent>,
    #[serde(default)]
    pub tasks: Vec<TaskItem>,
    #[serde(default)]
    pub file_tree: Vec<FileNode>,
    #[serde(default)]
    pub resource_shares: Vec<ResourceShare>,
    #[serde(default)]
    pub tombstones: Vec<SyncTombstone>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SyncOperation {
    CreateNote {
        client_generated_id: Uuid,
        title: String,
        folder: Option<String>,
        markdown: Option<String>,
    },
    UpdateNote {
        id: Uuid,
        title: Option<String>,
        folder: Option<String>,
        markdown: Option<String>,
        revision: u64,
    },
    DeleteNote {
        id: Uuid,
    },
    CreateDiagram {
        client_generated_id: Uuid,
        title: String,
        xml: Option<String>,
    },
    UpdateDiagram {
        id: Uuid,
        title: Option<String>,
        xml: String,
        revision: u64,
    },
    CreateTask {
        client_generated_id: Uuid,
        title: String,
        description: String,
        start_at: Option<DateTime<Utc>>,
        end_at: Option<DateTime<Utc>>,
        all_day: bool,
        calendar_connection_id: Option<Uuid>,
    },
    UpdateTask {
        id: Uuid,
        title: String,
        description: String,
        status: TaskStatus,
        start_at: Option<DateTime<Utc>>,
        end_at: Option<DateTime<Utc>>,
        all_day: bool,
        calendar_connection_id: Option<Uuid>,
    },
    DeleteTask {
        id: Uuid,
    },
    CreateLocalCalendar {
        client_generated_id: Uuid,
        title: String,
    },
    RenameCalendar {
        id: Uuid,
        title: String,
    },
    DeleteCalendar {
        id: Uuid,
    },
    CreateCalendarEvent {
        client_generated_id: String,
        connection_id: Uuid,
        title: String,
        description: String,
        location: String,
        start_at: DateTime<Utc>,
        end_at: DateTime<Utc>,
        all_day: bool,
    },
    UpdateCalendarEvent {
        connection_id: Uuid,
        event_id: String,
        title: String,
        description: String,
        location: String,
        start_at: DateTime<Utc>,
        end_at: DateTime<Utc>,
        all_day: bool,
    },
    DeleteCalendarEvent {
        connection_id: Uuid,
        event_id: String,
    },
    CreateMessage {
        client_generated_id: Uuid,
        room_id: Uuid,
        body: String,
    },
    CreateManagedFolder {
        path: String,
    },
    MoveManagedPath {
        source_path: String,
        destination_dir: String,
    },
    RenameManagedPath {
        path: String,
        new_name: String,
    },
    DeleteManagedPath {
        path: String,
    },
    ToggleMessageReaction {
        room_id: Uuid,
        message_id: Uuid,
        emoji: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncBootstrapRequest {
    #[serde(default)]
    pub include_file_tree: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SyncPullRequest {
    #[serde(default)]
    pub cursors: Option<SyncCursorSet>,
    #[serde(default)]
    pub include_file_tree: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncPushRequest {
    #[serde(default)]
    pub operations: Vec<SyncOperation>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncPushResponse {
    pub envelope: SyncEnvelope,
    #[serde(default)]
    pub conflicts: Vec<SyncConflict>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
    pub kind: RoomKind,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub participant_ids: Vec<Uuid>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateRoomRequest {
    pub name: String,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub participant_ids: Option<Vec<Uuid>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub body: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ToggleMessageReactionRequest {
    pub emoji: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateVoiceMemoRequest {
    pub title: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct RtcConfig {
    pub turn_urls: Vec<String>,
    pub username: String,
    pub credential: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RealtimeEvent {
    NotePresence {
        note_id: Uuid,
        user: String,
    },
    NoteCursor {
        note_id: Uuid,
        user: String,
        client_id: String,
        offset: Option<usize>,
    },
    NotePatch {
        note_id: Uuid,
        title: String,
        folder: String,
        markdown: String,
        revision: u64,
    },
    NoteDraft {
        note_id: Uuid,
        title: String,
        folder: String,
        markdown: String,
        revision: u64,
        client_id: String,
        user: String,
    },
    ChatMessage {
        room_id: Uuid,
        body: String,
        author: String,
        author_id: Uuid,
    },
    ChatMessageReactionsUpdated {
        room_id: Uuid,
        message_id: Uuid,
    },
    ChatRoomsUpdated,
    Signal {
        room_id: Uuid,
        from: String,
        payload: serde_json::Value,
    },
}
