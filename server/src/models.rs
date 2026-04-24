use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub timestamp: DateTime<Utc>,
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
    pub role_policies: RolePolicies,
    pub org_font_family: String,
    pub org_accent: String,
    pub org_page_gutter: u16,
    pub org_radius: u16,
    pub per_user_storage_mb: u64,
    pub public_storage_mb: u64,
    pub voice_upload_limit_mb: u64,
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
            role_policies,
            org_font_family: "\"IBM Plex Sans\", \"Segoe UI\", sans-serif".into(),
            org_accent: "#41b883".into(),
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
    pub issuer: String,
    pub client_id: String,
    pub authorization_url: String,
    pub redirect_url: String,
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
pub struct Message {
    pub id: Uuid,
    pub room_id: Uuid,
    pub author: UserProfile,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
    pub kind: RoomKind,
    #[serde(default)]
    pub participant_ids: Vec<Uuid>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateRoomRequest {
    pub name: String,
    #[serde(default)]
    pub participant_ids: Option<Vec<Uuid>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub body: String,
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
    ChatRoomsUpdated,
    Signal {
        room_id: Uuid,
        from: String,
        payload: serde_json::Value,
    },
}
