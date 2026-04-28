use std::{collections::HashMap, io::BufReader, path::{Path, PathBuf}, sync::Arc};

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use ical::IcalParser;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use reqwest::Client;
use serde_json::Value;
use tokio::{process::Command, sync::{RwLock, broadcast}};
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{
        AdminAuditEntry, AdminDatabaseOverview, AdminDatabaseTable, AdminDeletedItem, AdminSettings, AdminStorageOverview, AdminUserSummary, CalendarConnection, CalendarEvent,
        CalendarProvider, ChangeCurrentUserPasswordRequest, ChangePasswordRequest,
        ConnectGoogleCalendarRequest, CreateCalendarEventRequest, CreateDiagramRequest,
        CreateIcsCalendarConnectionRequest, CreateLocalCalendarConnectionRequest,
        CreateMessageRequest, CreateNoteRequest, CreateRoomRequest, CreateTaskRequest,
        CreateUserRequest, DeletedResourceKind, Diagram, GoogleCalendarConfigResponse, JobStatus, Message,
        MessageReaction, Note, NoteBlock, NoteBlockKind, NoteConflictRecord, NoteDocument,
        NoteDocumentOperationBatch, NoteOperation, NoteOperationRecord, NoteOperationsPullResponse,
        NoteOperationsPushResponse, NoteSession, NoteSessionCloseRequest, NoteSessionOpenRequest,
        NoteSessionOpenResponse, ObjectNamespace, ObjectNamespaceKind, OidcConfigResponse,
        OidcProviderSettings, PendingCredentialChangeRequest, RealtimeEvent, ResourceShare,
        ResourceVisibility, Room, SessionResponse, SetupAdminRequest, StoredUser,
        SyncBootstrapRequest, SyncConflict, SyncCursorSet, SyncEntityKind, SyncEnvelope,
        SyncOperation, SyncPullRequest, SyncPushRequest, SyncPushResponse, SyncTombstone,
        SystemUpdateStatus, TaskItem, TaskStatus, ToggleMessageReactionRequest, TranscriptSegment,
        TranscriptionJob,
        UpdateAccountCredentialsRequest, UpdateCalendarConnectionRequest,
        UpdateCalendarEventRequest, UpdateDiagramRequest, UpdateNoteRequest,
        UpdateResourceShareRequest, UpdateTaskRequest, UpdateUserAccessRequest, UserProfile,
        UserToolScope, VoiceMemo,
    },
    persistence::PersistenceBackend,
    storage::BlobStorage,
};

const RECOVERY_RETENTION_DAYS: i64 = 30;
const AUDIT_RETENTION_DAYS: i64 = 30;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub storage: BlobStorage,
    pub realtime: broadcast::Sender<RealtimeEvent>,
    persistence: PersistenceBackend,
    inner: Arc<RwLock<StateData>>,
    system_update: Arc<RwLock<SystemUpdateStatus>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct StateData {
    #[serde(default)]
    pub users: HashMap<Uuid, StoredUser>,
    #[serde(default)]
    pub admin_settings: AdminSettings,
    pub user: UserProfile,
    pub password_hash: String,
    pub notes: HashMap<Uuid, Note>,
    pub diagrams: HashMap<Uuid, Diagram>,
    pub memos: HashMap<Uuid, VoiceMemo>,
    pub jobs: HashMap<Uuid, TranscriptionJob>,
    pub rooms: HashMap<Uuid, Room>,
    pub messages: HashMap<Uuid, Vec<Message>>,
    #[serde(default)]
    pub calendar_connections: HashMap<Uuid, CalendarConnection>,
    #[serde(default)]
    pub calendar_events: HashMap<Uuid, Vec<CalendarEvent>>,
    #[serde(default)]
    pub tasks: HashMap<Uuid, TaskItem>,
    #[serde(default)]
    pub resource_shares: HashMap<String, ResourceShare>,
    #[serde(default)]
    pub sync_tombstones: Vec<SyncTombstone>,
    #[serde(default)]
    pub pending_credential_changes: HashMap<Uuid, PendingCredentialChangeRequest>,
    #[serde(default)]
    pub note_operations: HashMap<Uuid, Vec<NoteOperationRecord>>,
    #[serde(default)]
    pub note_sessions: HashMap<Uuid, Vec<NoteSession>>,
    #[serde(default)]
    pub note_conflicts: HashMap<Uuid, Vec<NoteConflictRecord>>,
    #[serde(default)]
    pub deleted_drive_items: HashMap<String, DeletedDriveItem>,
    #[serde(default)]
    pub audit_log: Vec<AdminAuditEntry>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct DeletedDriveItem {
    pub id: String,
    pub original_path: String,
    pub backup_path: String,
    pub label: String,
    pub is_dir: bool,
    pub deleted_at: DateTime<Utc>,
    pub purge_at: DateTime<Utc>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct JwtClaims {
    sub: String,
    email: String,
    role: String,
    iss: String,
    exp: usize,
}

impl AppState {
    fn decorate_room(state: &StateData, room: &Room) -> Room {
        let participant_labels = room
            .participant_ids
            .iter()
            .filter_map(|id| {
                state
                    .users
                    .get(id)
                    .map(|stored| stored.profile.display_name.clone())
            })
            .collect::<Vec<_>>();
        let mut decorated = room.clone();
        decorated.participant_labels = participant_labels;
        decorated
    }

    fn admin_user_summary(&self, state: &StateData, user: &StoredUser) -> AdminUserSummary {
        AdminUserSummary {
            id: user.profile.id,
            username: user.profile.username.clone(),
            email: user.profile.email.clone(),
            display_name: user.profile.display_name.clone(),
            avatar_path: user.profile.avatar_path.clone(),
            avatar_content_type: user.profile.avatar_content_type.clone(),
            role: user.profile.role.clone(),
            roles: user.profile.roles.clone(),
            must_change_password: user.profile.must_change_password,
            linked_sso: user.linked_oidc_subject.is_some(),
            storage_used_bytes: storage_used_bytes_for_user(state, &self.storage, user.profile.id),
            storage_limit_mb: user.storage_limit_mb,
            tool_scope: user.tool_scope.clone(),
            pending_credential_change: state.pending_credential_changes.get(&user.profile.id).cloned(),
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }

    pub async fn new(config: Config, storage: BlobStorage) -> AppResult<Self> {
        let persistence = PersistenceBackend::initialize(&config).await?;
        let loaded_snapshot = persistence.load_snapshot().await?;
        let seeded_from_scratch = loaded_snapshot.is_none();
        let mut initial_state = if let Some(bytes) = loaded_snapshot {
            serde_json::from_slice::<StateData>(&bytes)
                .map_err(|err| AppError::Internal(err.to_string()))?
        } else {
            seed_state(&config)?
        };

        if initial_state.users.is_empty() {
            let legacy_user = StoredUser {
                profile: initial_state.user.clone(),
                password_hash: initial_state.password_hash.clone(),
                linked_oidc_subject: None,
                storage_limit_mb: 0,
                tool_scope: Default::default(),
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };
            initial_state
                .users
                .insert(legacy_user.profile.id, legacy_user);
        }
        if initial_state.user.username.trim().is_empty() {
            initial_state.user.username = if initial_state.user.email.trim().is_empty() {
                "admin".into()
            } else {
                initial_state
                    .user
                    .email
                    .split('@')
                    .next()
                    .unwrap_or("admin")
                    .to_string()
            };
        }
        initial_state.user.roles =
            normalize_user_roles(initial_state.user.role.clone(), &initial_state.user.roles);
        initial_state.user.role = primary_user_role(&initial_state.user.roles);
        let fallback_owner_id = initial_state
            .users
            .keys()
            .copied()
            .next()
            .unwrap_or(initial_state.user.id);
        for note in initial_state.notes.values_mut() {
            if note.author_id.is_nil() {
                note.author_id = fallback_owner_id;
            }
            if note.last_editor_id.is_nil() {
                note.last_editor_id = note.author_id;
            }
            ensure_note_foundation(note);
        }
        for diagram in initial_state.diagrams.values_mut() {
            if diagram.author_id.is_nil() {
                diagram.author_id = fallback_owner_id;
            }
            if diagram.last_editor_id.is_nil() {
                diagram.last_editor_id = diagram.author_id;
            }
        }
        for memo in initial_state.memos.values_mut() {
            if memo.owner_id.is_nil() {
                memo.owner_id = fallback_owner_id;
            }
            ensure_voice_memo_foundation(memo);
        }
        for stored_user in initial_state.users.values_mut() {
            if stored_user.profile.username.trim().is_empty() {
                stored_user.profile.username = if stored_user.profile.email.trim().is_empty() {
                    stored_user
                        .profile
                        .display_name
                        .to_lowercase()
                        .replace(' ', "-")
                } else {
                    stored_user
                        .profile
                        .email
                        .split('@')
                        .next()
                        .unwrap_or("user")
                        .to_string()
                };
            }
            stored_user.profile.roles =
                normalize_user_roles(stored_user.profile.role.clone(), &stored_user.profile.roles);
            stored_user.profile.role = primary_user_role(&stored_user.profile.roles);
        }
        let mut seeded_default_calendar = false;
        if initial_state.calendar_connections.is_empty() {
            let owner = initial_state
                .users
                .values()
                .next()
                .map(|stored| stored.profile.clone())
                .unwrap_or_else(|| initial_state.user.clone());
            let connection_id = Uuid::new_v4();
            let connection = CalendarConnection {
                id: connection_id,
                owner_id: owner.id,
                owner_display_name: owner.display_name.clone(),
                title: "Home".into(),
                provider: crate::models::CalendarProvider::Sweet,
                external_id: String::new(),
                calendar_id: format!("sweet:{}", connection_id),
                account_label: "Home Suite Home calendar".into(),
                access_token: None,
                refresh_token: None,
                token_expires_at: None,
                ics_url: None,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };
            initial_state
                .calendar_connections
                .insert(connection.id, connection.clone());
            initial_state.calendar_events.entry(connection.id).or_default();
            seeded_default_calendar = true;
        }
        {
            let member_policy = initial_state
                .admin_settings
                .role_policies
                .entry("member".into())
                .or_default();
            member_policy.tool_scope.notes = initial_state.admin_settings.allow_member_notes;
            member_policy.tool_scope.files = initial_state.admin_settings.allow_member_files;
            member_policy.tool_scope.diagrams = initial_state.admin_settings.allow_member_diagrams;
            member_policy.tool_scope.voice = initial_state.admin_settings.allow_member_voice;
            member_policy.tool_scope.coms = initial_state.admin_settings.allow_member_coms;
            member_policy.customize_appearance =
                initial_state.admin_settings.allow_user_custom_appearance;
        }

        let (realtime, _) = broadcast::channel(256);
        let system_update = load_system_update_status(
            update_status_path(&config.storage_root),
            &config.app_version,
            &config.update_target,
            config.update_command.is_some(),
        )
        .await;
        let app = Self {
            config,
            storage,
            realtime,
            persistence,
            inner: Arc::new(RwLock::new(initial_state)),
            system_update: Arc::new(RwLock::new(system_update)),
        };
        if (seeded_from_scratch || seeded_default_calendar) && app.persistence.uses_postgres() {
            let snapshot = app.inner.read().await.clone();
            app.persist_snapshot(snapshot).await?;
        }
        app.sync_note_files().await?;
        app.sync_diagram_files().await?;
        Ok(app)
    }

    pub async fn login(&self, identifier: &str, password: &str) -> AppResult<UserProfile> {
        let state = self.inner.read().await;
        let user = state
            .users
            .values()
            .find(|user| {
                user.profile.email.eq_ignore_ascii_case(identifier)
                    || user.profile.username.eq_ignore_ascii_case(identifier)
            })
            .ok_or(AppError::Unauthorized)?;

        let parsed_hash = PasswordHash::new(&user.password_hash)
            .map_err(|err| AppError::Internal(err.to_string()))?;

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .map_err(|_| AppError::Unauthorized)?;

        Ok(user.profile.clone())
    }

    pub async fn list_users(&self) -> Vec<AdminUserSummary> {
        let state = self.inner.read().await;
        let mut users = state
            .users
            .values()
            .map(|user| self.admin_user_summary(&state, user))
            .collect::<Vec<_>>();
        users.sort_by(|left, right| left.username.cmp(&right.username));
        users
    }

    pub async fn oidc_login(&self, code: &str) -> AppResult<UserProfile> {
        let (provider, require_email) = {
            let state = self.inner.read().await;
            (
                effective_oidc_settings(&self.config, &state.admin_settings),
                state.admin_settings.require_account_email,
            )
        };
        if !provider.enabled
            || provider.client_id.trim().is_empty()
            || provider.client_secret.trim().is_empty()
            || provider.token_url.trim().is_empty()
            || provider.userinfo_url.trim().is_empty()
        {
            return Err(AppError::BadRequest("OIDC provider is not fully configured".into()));
        }

        let redirect_url = format!("{}/auth/oidc/callback", self.config.web_base_url);
        let client = Client::new();
        let token_response = client
            .post(&provider.token_url)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect_url.as_str()),
                ("client_id", provider.client_id.as_str()),
                ("client_secret", provider.client_secret.as_str()),
            ])
            .send()
            .await
            .map_err(|error| AppError::BadRequest(format!("OIDC token exchange failed: {error}")))?;

        if !token_response.status().is_success() {
            let body = token_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "OIDC token exchange failed: {}",
                body.trim()
            )));
        }

        let token_json: Value = token_response
            .json()
            .await
            .map_err(|error| AppError::BadRequest(format!("OIDC token response was invalid: {error}")))?;
        let access_token = token_json
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::BadRequest("OIDC token response missing access_token".into()))?;

        let userinfo_response = client
            .get(&provider.userinfo_url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|error| AppError::BadRequest(format!("OIDC userinfo request failed: {error}")))?;

        if !userinfo_response.status().is_success() {
            let body = userinfo_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "OIDC userinfo request failed: {}",
                body.trim()
            )));
        }

        let userinfo: Value = userinfo_response
            .json()
            .await
            .map_err(|error| AppError::BadRequest(format!("OIDC userinfo response was invalid: {error}")))?;
        let subject = userinfo
            .get("sub")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::BadRequest("OIDC userinfo missing sub".into()))?
            .to_string();
        let email = userinfo
            .get("email")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_lowercase())
            .filter(|value| !value.is_empty());
        if require_email && email.is_none() {
            return Err(AppError::BadRequest(
                "OIDC userinfo missing email but this organization requires account emails".into(),
            ));
        }
        let username = userinfo
            .get("preferred_username")
            .and_then(Value::as_str)
            .or_else(|| userinfo.get("nickname").and_then(Value::as_str))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or_else(|| {
                email.as_ref().and_then(|value| {
                    value
                        .split('@')
                        .next()
                        .map(|part| part.trim().to_string())
                        .filter(|part| !part.is_empty())
                })
            })
            .unwrap_or_else(|| format!("user-{}", Uuid::new_v4().simple()));
        let display_name = userinfo
            .get("name")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| username.clone());
        let resolved_email = email.unwrap_or_else(|| format!("{username}@local.home-suite-home"));

        let mut state = self.inner.write().await;
        if let Some(existing) = state
            .users
            .values_mut()
            .find(|user| user.linked_oidc_subject.as_deref() == Some(subject.as_str()))
        {
            existing.linked_oidc_subject = Some(subject.clone());
            existing.profile.username = username.clone();
            existing.profile.display_name = display_name.clone();
            existing.profile.email = resolved_email.clone();
            existing.updated_at = Utc::now();
            let profile = existing.profile.clone();
            let snapshot = state.clone();
            drop(state);
            self.persist_snapshot(snapshot).await?;
            return Ok(profile);
        }

        if let Some(existing) = state
            .users
            .values_mut()
            .find(|user| user.profile.email.eq_ignore_ascii_case(&resolved_email))
        {
            existing.linked_oidc_subject = Some(subject.clone());
            existing.profile.username = username.clone();
            existing.profile.display_name = display_name.clone();
            existing.profile.email = resolved_email.clone();
            existing.updated_at = Utc::now();
            let profile = existing.profile.clone();
            let snapshot = state.clone();
            drop(state);
            self.persist_snapshot(snapshot).await?;
            return Ok(profile);
        }

        let created_at = Utc::now();
        let profile = UserProfile {
            id: Uuid::new_v4(),
            username,
            email: resolved_email,
            display_name,
            avatar_path: None,
            avatar_content_type: None,
            role: "member".into(),
            roles: vec!["member".into()],
            must_change_password: false,
        };
        let stored_user = StoredUser {
            profile: profile.clone(),
            password_hash: hash_password(&Uuid::new_v4().to_string())?,
            linked_oidc_subject: Some(subject),
            storage_limit_mb: 0,
            tool_scope: UserToolScope::default(),
            created_at,
            updated_at: created_at,
        };
        state.users.insert(profile.id, stored_user);
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(profile)
    }

    pub async fn setup_status(&self) -> crate::models::SetupStatusResponse {
        let state = self.inner.read().await;
        let oidc = effective_oidc_settings(&self.config, &state.admin_settings);
        crate::models::SetupStatusResponse {
            admin_exists: state
                .users
                .values()
                .any(|user| user.profile.roles.iter().any(|role| role == "admin")),
            user_count: state.users.len(),
            sso_configured: oidc.enabled
                && !oidc.issuer.trim().is_empty()
                && !oidc.client_id.trim().is_empty(),
            drawio_public_url: self.config.drawio_public_url.clone(),
        }
    }

    pub async fn oidc_config(&self) -> OidcConfigResponse {
        let state = self.inner.read().await;
        let oidc = effective_oidc_settings(&self.config, &state.admin_settings);
        OidcConfigResponse {
            enabled: oidc.enabled,
            provider: oidc.provider,
            issuer: oidc.issuer.clone(),
            client_id: oidc.client_id,
            authorization_url: oidc.authorization_url,
            token_url: oidc.token_url,
            userinfo_url: oidc.userinfo_url,
            scopes: oidc.scopes,
            redirect_url: format!("{}/auth/oidc/callback", self.config.web_base_url),
        }
    }

    pub async fn google_calendar_config(&self) -> GoogleCalendarConfigResponse {
        let state = self.inner.read().await;
        GoogleCalendarConfigResponse {
            enabled: state.admin_settings.google_calendar_enabled
                && !state.admin_settings.google_calendar_client_id.trim().is_empty()
                && !state.admin_settings.google_calendar_client_secret.trim().is_empty(),
            client_id: state.admin_settings.google_calendar_client_id.clone(),
            redirect_url: format!("{}/calendar", self.config.web_base_url.trim_end_matches('/')),
            scope: "https://www.googleapis.com/auth/calendar.readonly".into(),
        }
    }

    pub async fn sync_bootstrap(
        &self,
        user: UserProfile,
        payload: SyncBootstrapRequest,
    ) -> AppResult<SyncEnvelope> {
        self.build_sync_envelope(&user, None, payload.include_file_tree).await
    }

    pub async fn sync_pull(&self, user: UserProfile, payload: SyncPullRequest) -> AppResult<SyncEnvelope> {
        self.build_sync_envelope(&user, payload.cursors, payload.include_file_tree).await
    }

    pub async fn sync_push(&self, user: UserProfile, payload: SyncPushRequest) -> AppResult<SyncPushResponse> {
        let mut conflicts = Vec::new();
        for operation in payload.operations {
            let entity = match &operation {
                SyncOperation::CreateNote { .. }
                | SyncOperation::UpdateNote { .. }
                | SyncOperation::ApplyNoteOperations { .. }
                | SyncOperation::DeleteNote { .. } => {
                    SyncEntityKind::Notes
                }
                SyncOperation::CreateDiagram { .. } | SyncOperation::UpdateDiagram { .. } => SyncEntityKind::Diagrams,
                SyncOperation::CreateTask { .. } | SyncOperation::UpdateTask { .. } | SyncOperation::DeleteTask { .. } => {
                    SyncEntityKind::Tasks
                }
                SyncOperation::CreateLocalCalendar { .. }
                | SyncOperation::RenameCalendar { .. }
                | SyncOperation::DeleteCalendar { .. } => SyncEntityKind::CalendarConnections,
                SyncOperation::CreateCalendarEvent { .. }
                | SyncOperation::UpdateCalendarEvent { .. }
                | SyncOperation::DeleteCalendarEvent { .. } => SyncEntityKind::CalendarEvents,
                SyncOperation::CreateManagedFolder { .. }
                | SyncOperation::MoveManagedPath { .. }
                | SyncOperation::RenameManagedPath { .. }
                | SyncOperation::DeleteManagedPath { .. } => SyncEntityKind::FileTree,
                SyncOperation::CreateMessage { .. } | SyncOperation::ToggleMessageReaction { .. } => SyncEntityKind::Messages,
            };
            let operation_id = operation_id_string(&operation);
            let result = match operation.clone() {
                SyncOperation::CreateNote { client_generated_id, title, folder, markdown } => {
                    self.create_note_with_id(
                        CreateNoteRequest {
                            title,
                            folder,
                            markdown,
                            document: None,
                            visibility: None,
                        },
                        Some(client_generated_id),
                    )
                        .await
                        .map(|_| ())
                }
                SyncOperation::CreateDiagram { client_generated_id, title, xml } => {
                    self.create_diagram_with_id(CreateDiagramRequest { title, xml }, Some(client_generated_id))
                        .await
                        .map(|_| ())
                }
                SyncOperation::UpdateDiagram { id, title, xml, revision } => {
                    self.update_diagram(id, UpdateDiagramRequest { title, xml, revision }).await.map(|_| ())
                }
                SyncOperation::UpdateNote { id, title, folder, markdown, revision } => {
                    self.update_note(
                        id,
                        UpdateNoteRequest {
                            title,
                            folder,
                            markdown,
                            revision,
                            document: None,
                            visibility: None,
                        },
                    )
                    .await
                    .map(|_| ())
                }
                SyncOperation::ApplyNoteOperations { id, batch } => {
                    self.apply_note_operation_batch(id, batch).await.map(|_| ())
                }
                SyncOperation::DeleteNote { id } => self.delete_note(id).await,
                SyncOperation::CreateTask { client_generated_id, title, description, start_at, end_at, all_day, calendar_connection_id } => {
                    self.create_task_with_id(
                        user.clone(),
                        CreateTaskRequest { title, description, start_at, end_at, all_day, calendar_connection_id },
                        Some(client_generated_id),
                    )
                    .await
                    .map(|_| ())
                }
                SyncOperation::UpdateTask { id, title, description, status, start_at, end_at, all_day, calendar_connection_id } => {
                    self.update_task(user.clone(), id, UpdateTaskRequest { title, description, status, start_at, end_at, all_day, calendar_connection_id }).await.map(|_| ())
                }
                SyncOperation::DeleteTask { id } => self.delete_task(user.clone(), id).await,
                SyncOperation::CreateLocalCalendar { client_generated_id, title } => {
                    self.create_local_calendar_connection_with_id(
                        user.clone(),
                        CreateLocalCalendarConnectionRequest { title },
                        Some(client_generated_id),
                    )
                    .await
                    .map(|_| ())
                }
                SyncOperation::RenameCalendar { id, title } => {
                    self.update_calendar_connection(user.clone(), id, UpdateCalendarConnectionRequest { title }).await.map(|_| ())
                }
                SyncOperation::DeleteCalendar { id } => self.delete_calendar_connection(user.clone(), id).await,
                SyncOperation::CreateCalendarEvent { client_generated_id, connection_id, title, description, location, start_at, end_at, all_day } => {
                    self.create_calendar_event_with_id(
                        user.clone(),
                        connection_id,
                        CreateCalendarEventRequest { title, description, location, start_at, end_at, all_day },
                        Some(client_generated_id),
                    )
                    .await
                    .map(|_| ())
                }
                SyncOperation::UpdateCalendarEvent { connection_id, event_id, title, description, location, start_at, end_at, all_day } => {
                    self.update_calendar_event(user.clone(), connection_id, &event_id, UpdateCalendarEventRequest { title, description, location, start_at, end_at, all_day }).await.map(|_| ())
                }
                SyncOperation::DeleteCalendarEvent { connection_id, event_id } => {
                    self.delete_calendar_event(user.clone(), connection_id, &event_id).await
                }
                SyncOperation::CreateMessage { client_generated_id, room_id, body } => {
                    self.create_message_with_id(room_id, CreateMessageRequest { body }, user.clone(), Some(client_generated_id))
                        .await
                        .map(|_| ())
                }
                SyncOperation::CreateManagedFolder { path } => self.create_managed_folder(path).await.map(|_| ()),
                SyncOperation::MoveManagedPath { source_path, destination_dir } => {
                    self.move_drive_path(source_path, destination_dir).await.map(|_| ())
                }
                SyncOperation::RenameManagedPath { path, new_name } => {
                    self.rename_managed_path(path, new_name).await.map(|_| ())
                }
                SyncOperation::DeleteManagedPath { path } => self.delete_managed_path(path).await,
                SyncOperation::ToggleMessageReaction { room_id, message_id, emoji } => {
                    self.toggle_message_reaction(
                        room_id,
                        message_id,
                        ToggleMessageReactionRequest { emoji },
                        user.clone(),
                    )
                    .await
                    .map(|_| ())
                }
            };

            if let Err(error) = result {
                conflicts.push(self.build_sync_conflict(&operation, entity, operation_id, &error).await);
            }
        }

        let envelope = self.build_sync_envelope(&user, None, true).await?;
        Ok(SyncPushResponse { envelope, conflicts })
    }

    async fn build_sync_conflict(
        &self,
        operation: &SyncOperation,
        entity: SyncEntityKind,
        id: String,
        error: &AppError,
    ) -> SyncConflict {
        let mut conflict = SyncConflict {
            entity,
            id,
            reason: error.to_string(),
            field: String::new(),
            local_value: String::new(),
            remote_value: String::new(),
            forked_note_ids: Vec::new(),
        };

        match operation {
            SyncOperation::CreateNote { title, folder, .. } => {
                conflict.field = if title.trim().is_empty() { "title".into() } else { "folder".into() };
                conflict.local_value = if title.trim().is_empty() {
                    title.clone()
                } else {
                    folder.clone().unwrap_or_else(|| "Inbox".into())
                };
            }
            SyncOperation::UpdateNote { id, revision, title, folder, .. } => {
                conflict.field = "revision".into();
                conflict.local_value = revision.to_string();
                let state = self.inner.read().await;
                if let Some(note) = state.notes.get(id) {
                    conflict.remote_value = note.revision.to_string();
                    if matches!(error, AppError::BadRequest(message) if message == "revision mismatch") {
                        conflict.reason = format!("{} for {}", error, note.title);
                    }
                }
                if conflict.remote_value.is_empty() && (title.is_some() || folder.is_some()) {
                    conflict.field = if title.is_some() { "title".into() } else { "folder".into() };
                    conflict.local_value = title.clone().or_else(|| folder.clone()).unwrap_or_default();
                }
            }
            SyncOperation::ApplyNoteOperations { id, .. } => {
                conflict.field = "document".into();
                let state = self.inner.read().await;
                if let Some(note) = state.notes.get(id) {
                    conflict.remote_value = note.title.clone();
                }
            }
            SyncOperation::DeleteNote { id } => {
                conflict.field = "note_id".into();
                conflict.local_value = id.to_string();
            }
            SyncOperation::CreateTask { title, start_at, end_at, calendar_connection_id, .. }
            | SyncOperation::UpdateTask { title, start_at, end_at, calendar_connection_id, .. } => {
                if title.trim().is_empty() {
                    conflict.field = "title".into();
                    conflict.local_value = title.clone();
                } else if let (Some(start_at), Some(end_at)) = (start_at, end_at) {
                    if end_at <= start_at {
                        conflict.field = "time_range".into();
                        conflict.local_value = format!("{} -> {}", start_at.to_rfc3339(), end_at.to_rfc3339());
                    }
                } else if let Some(calendar_connection_id) = calendar_connection_id {
                    conflict.field = "calendar_connection_id".into();
                    conflict.local_value = calendar_connection_id.to_string();
                }
            }
            SyncOperation::DeleteTask { id } => {
                conflict.field = "task_id".into();
                conflict.local_value = id.to_string();
            }
            SyncOperation::CreateManagedFolder { path } | SyncOperation::DeleteManagedPath { path } => {
                conflict.field = "path".into();
                conflict.local_value = path.clone();
            }
            SyncOperation::MoveManagedPath { source_path, destination_dir } => {
                conflict.field = "path".into();
                conflict.local_value = source_path.clone();
                conflict.remote_value = destination_dir.clone();
            }
            SyncOperation::RenameManagedPath { path, new_name } => {
                conflict.field = "path".into();
                conflict.local_value = path.clone();
                conflict.remote_value = new_name.clone();
            }
            SyncOperation::CreateLocalCalendar { title, .. } | SyncOperation::RenameCalendar { title, .. } => {
                conflict.field = "title".into();
                conflict.local_value = title.clone();
            }
            SyncOperation::DeleteCalendar { id } => {
                conflict.field = "calendar_id".into();
                conflict.local_value = id.to_string();
            }
            SyncOperation::CreateCalendarEvent { title, start_at, end_at, .. }
            | SyncOperation::UpdateCalendarEvent { title, start_at, end_at, .. } => {
                conflict.field = "event".into();
                conflict.local_value = format!("{title} ({} -> {})", start_at.to_rfc3339(), end_at.to_rfc3339());
            }
            SyncOperation::DeleteCalendarEvent { event_id, .. } => {
                conflict.field = "event_id".into();
                conflict.local_value = event_id.clone();
            }
            SyncOperation::CreateMessage { room_id, body, .. } => {
                conflict.field = "message".into();
                conflict.local_value = format!("{room_id}: {}", body.trim());
            }
            SyncOperation::ToggleMessageReaction { emoji, message_id, .. } => {
                conflict.field = "reaction".into();
                conflict.local_value = format!("{emoji} on {message_id}");
            }
            SyncOperation::CreateDiagram { title, .. } => {
                conflict.field = "title".into();
                conflict.local_value = title.clone();
            }
            SyncOperation::UpdateDiagram { id, revision, title, .. } => {
                conflict.field = "revision".into();
                conflict.local_value = revision.to_string();
                let state = self.inner.read().await;
                if let Some(diagram) = state.diagrams.get(id) {
                    conflict.remote_value = diagram.revision.to_string();
                } else if let Some(title) = title {
                    conflict.field = "title".into();
                    conflict.local_value = title.clone();
                }
            }
        }

        if let Some(raw_ids) = conflict
            .reason
            .strip_prefix("bad request: note forked due to conflicting block edits:")
            .map(str::to_string)
        {
            conflict.reason = "note forked due to conflicting block edits".into();
            conflict.forked_note_ids = raw_ids
                .split(',')
                .filter_map(|value| Uuid::parse_str(value.trim()).ok())
                .collect();
        }

        conflict
    }

    async fn build_sync_envelope(
        &self,
        user: &UserProfile,
        cursors: Option<SyncCursorSet>,
        include_file_tree: bool,
    ) -> AppResult<SyncEnvelope> {
        let state = self.inner.read().await;
        let notes_since = cursors.as_ref().and_then(|entry| entry.notes);
        let diagrams_since = cursors.as_ref().and_then(|entry| entry.diagrams);
        let voice_since = cursors.as_ref().and_then(|entry| entry.voice_memos);
        let rooms_since = cursors.as_ref().and_then(|entry| entry.rooms);
        let messages_since = cursors.as_ref().and_then(|entry| entry.messages);
        let calendar_connections_since = cursors.as_ref().and_then(|entry| entry.calendar_connections);
        let calendar_events_since = cursors.as_ref().and_then(|entry| entry.calendar_events);
        let tasks_since = cursors.as_ref().and_then(|entry| entry.tasks);
        let shares_since = cursors.as_ref().and_then(|entry| entry.resource_shares);

        let notes = state
            .notes
            .values()
            .filter(|note| is_note_active(note))
            .filter(|note| newer_than(note.updated_at, notes_since))
            .cloned()
            .collect::<Vec<_>>();
        let diagrams = state
            .diagrams
            .values()
            .filter(|diagram| is_diagram_active(diagram))
            .filter(|diagram| newer_than(diagram.updated_at, diagrams_since))
            .cloned()
            .collect::<Vec<_>>();
        let voice_memos = state
            .memos
            .values()
            .filter(|memo| is_voice_memo_active(memo))
            .filter(|memo| memo.owner_id == user.id && newer_than(memo.updated_at, voice_since))
            .cloned()
            .collect::<Vec<_>>();
        let visible_rooms = state
            .rooms
            .values()
            .filter(|room| room.kind == crate::models::RoomKind::Channel || room.participant_ids.contains(&user.id))
            .cloned()
            .collect::<Vec<_>>();
        let rooms = visible_rooms
            .iter()
            .filter(|room| newer_than(room.created_at, rooms_since))
            .map(|room| Self::decorate_room(&state, room))
            .collect::<Vec<_>>();
        let room_ids = visible_rooms.iter().map(|room| room.id).collect::<Vec<_>>();
        let messages = room_ids
            .iter()
            .flat_map(|room_id| state.messages.get(room_id).cloned().unwrap_or_default())
            .filter(|message| newer_than(message.created_at, messages_since))
            .collect::<Vec<_>>();
        let calendar_connections = state
            .calendar_connections
            .values()
            .filter(|connection| calendar_connection_visible_to_user(&state, connection, user.id))
            .filter(|connection| newer_than(connection.updated_at, calendar_connections_since))
            .cloned()
            .collect::<Vec<_>>();
        let visible_calendar_ids = state
            .calendar_connections
            .values()
            .filter(|connection| calendar_connection_visible_to_user(&state, connection, user.id))
            .map(|connection| connection.id)
            .collect::<Vec<_>>();
        let calendar_events = visible_calendar_ids
            .iter()
            .flat_map(|connection_id| state.calendar_events.get(connection_id).cloned().unwrap_or_default())
            .filter(|event| newer_than(event.updated_at.unwrap_or(event.end_at), calendar_events_since))
            .collect::<Vec<_>>();
        let tasks = state
            .tasks
            .values()
            .filter(|task| task.owner_id == user.id)
            .filter(|task| newer_than(task.updated_at, tasks_since))
            .cloned()
            .collect::<Vec<_>>();
        let resource_shares = state
            .resource_shares
            .values()
            .filter(|share| {
                share.updated_by == user.id
                    || share.visibility == ResourceVisibility::Org
                    || share.user_ids.contains(&user.id)
            })
            .filter(|share| newer_than(share.updated_at, shares_since))
            .cloned()
            .collect::<Vec<_>>();
        let tombstones = state
            .sync_tombstones
            .iter()
            .filter(|tombstone| {
                let cursor = match tombstone.entity {
                    SyncEntityKind::Notes => notes_since,
                    SyncEntityKind::Diagrams => diagrams_since,
                    SyncEntityKind::VoiceMemos => voice_since,
                    SyncEntityKind::Rooms => rooms_since,
                    SyncEntityKind::Messages => messages_since,
                    SyncEntityKind::CalendarConnections => calendar_connections_since,
                    SyncEntityKind::CalendarEvents => calendar_events_since,
                    SyncEntityKind::Tasks => tasks_since,
                    SyncEntityKind::FileTree => cursors.as_ref().and_then(|entry| entry.file_tree),
                    SyncEntityKind::ResourceShares => shares_since,
                };
                newer_than(tombstone.deleted_at, cursor)
            })
            .cloned()
            .collect::<Vec<_>>();

        let generated_at = Utc::now();
        drop(state);
        let file_tree = if include_file_tree { self.list_files().await? } else { Vec::new() };
        Ok(SyncEnvelope {
            cursors: SyncCursorSet {
                generated_at,
                notes: max_optional_datetime(notes.iter().map(|note| note.updated_at)),
                diagrams: max_optional_datetime(diagrams.iter().map(|diagram| diagram.updated_at)),
                voice_memos: max_optional_datetime(voice_memos.iter().map(|memo| memo.updated_at)),
                rooms: max_optional_datetime(visible_rooms.iter().map(|room| room.created_at)),
                messages: max_optional_datetime(messages.iter().map(|message| message.created_at)),
                calendar_connections: max_optional_datetime(calendar_connections.iter().map(|connection| connection.updated_at)),
                calendar_events: max_optional_datetime(calendar_events.iter().map(|event| event.updated_at.unwrap_or(event.end_at))),
                tasks: max_optional_datetime(tasks.iter().map(|task| task.updated_at)),
                file_tree: Some(generated_at),
                resource_shares: max_optional_datetime(resource_shares.iter().map(|share| share.updated_at)),
            },
            notes,
            diagrams,
            voice_memos,
            rooms,
            messages,
            calendar_connections,
            calendar_events,
            tasks,
            file_tree,
            resource_shares,
            tombstones,
        })
    }

    pub async fn list_calendar_connections(&self, user: UserProfile) -> Vec<CalendarConnection> {
        let state = self.inner.read().await;
        let mut connections = state
            .calendar_connections
            .values()
            .filter(|connection| calendar_connection_visible_to_user(&state, connection, user.id))
            .cloned()
            .collect::<Vec<_>>();
        connections.sort_by(|left, right| {
            (left.owner_id != user.id, left.title.to_lowercase(), left.created_at).cmp(&(
                right.owner_id != user.id,
                right.title.to_lowercase(),
                right.created_at,
            ))
        });
        connections
    }

    pub async fn connect_google_calendar(
        &self,
        user: UserProfile,
        payload: ConnectGoogleCalendarRequest,
    ) -> AppResult<CalendarConnection> {
        let settings = {
            let state = self.inner.read().await;
            state.admin_settings.clone()
        };

        if !settings.google_calendar_enabled
            || settings.google_calendar_client_id.trim().is_empty()
            || settings.google_calendar_client_secret.trim().is_empty()
        {
            return Err(AppError::BadRequest(
                "Google Calendar is not configured by an admin".into(),
            ));
        }

        let redirect_url = payload.redirect_url.trim();
        if redirect_url.is_empty() {
            return Err(AppError::BadRequest("missing redirect url".into()));
        }

        let client = Client::new();
        let token_response = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", payload.code.as_str()),
                ("redirect_uri", redirect_url),
                ("client_id", settings.google_calendar_client_id.as_str()),
                ("client_secret", settings.google_calendar_client_secret.as_str()),
            ])
            .send()
            .await
            .map_err(|error| AppError::BadRequest(format!("Google token exchange failed: {error}")))?;

        if !token_response.status().is_success() {
            let body = token_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Google token exchange failed: {}",
                body.trim()
            )));
        }

        let token_json: Value = token_response
            .json()
            .await
            .map_err(|error| AppError::BadRequest(format!("Google token response was invalid: {error}")))?;
        let access_token = token_json
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::BadRequest("Google token response missing access_token".into()))?
            .to_string();
        let refresh_token = token_json
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(str::to_string);
        let expires_in = token_json
            .get("expires_in")
            .and_then(Value::as_i64)
            .unwrap_or(3600)
            .max(60);
        let token_expires_at = Some(Utc::now() + Duration::seconds(expires_in));

        let calendar_list_response = client
            .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|error| AppError::BadRequest(format!("Google calendar lookup failed: {error}")))?;

        if !calendar_list_response.status().is_success() {
            let body = calendar_list_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Google calendar lookup failed: {}",
                body.trim()
            )));
        }

        let calendar_list: Value = calendar_list_response
            .json()
            .await
            .map_err(|error| AppError::BadRequest(format!("Google calendar list was invalid: {error}")))?;
        let selected_calendar = calendar_list
            .get("items")
            .and_then(Value::as_array)
            .and_then(|items| {
                items.iter()
                    .find(|item| item.get("primary").and_then(Value::as_bool).unwrap_or(false))
                    .or_else(|| items.first())
            })
            .ok_or_else(|| AppError::BadRequest("No Google calendars were returned".into()))?;
        let calendar_id = selected_calendar
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("primary")
            .to_string();
        let account_label = selected_calendar
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("Google Calendar")
            .to_string();

        let mut state = self.inner.write().await;
        let owner_display_name = state
            .users
            .get(&user.id)
            .map(|stored| stored.profile.display_name.clone())
            .unwrap_or_else(|| user.display_name.clone());
        let existing_id = state
            .calendar_connections
            .values()
            .find(|connection| {
                connection.owner_id == user.id
                    && connection.provider == CalendarProvider::Google
                    && connection.calendar_id == calendar_id
            })
            .map(|connection| connection.id);

        let connection = CalendarConnection {
            id: existing_id.unwrap_or_else(Uuid::new_v4),
            owner_id: user.id,
            owner_display_name,
            title: account_label.clone(),
            provider: CalendarProvider::Google,
            external_id: calendar_id.clone(),
            calendar_id,
            account_label,
            access_token: Some(access_token),
            refresh_token,
            token_expires_at,
            ics_url: None,
            created_at: existing_id
                .and_then(|id| state.calendar_connections.get(&id).map(|entry| entry.created_at))
                .unwrap_or_else(Utc::now),
            updated_at: Utc::now(),
        };
        state.calendar_connections.insert(connection.id, connection.clone());
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(connection)
    }

    pub async fn create_ics_calendar_connection(
        &self,
        user: UserProfile,
        payload: CreateIcsCalendarConnectionRequest,
    ) -> AppResult<CalendarConnection> {
        let title = payload.title.trim();
        let raw_url = payload.url.trim();
        if title.is_empty() || raw_url.is_empty() {
            return Err(AppError::BadRequest("title and url are required".into()));
        }

        let normalized_url = normalize_calendar_feed_url(raw_url)?;
        let preview_events = fetch_ics_calendar_events_from_url(&normalized_url, Utc::now(), Utc::now() + Duration::days(30)).await?;
        if preview_events.is_empty() {
            return Err(AppError::BadRequest(
                "That feed did not return any upcoming calendar events".into(),
            ));
        }

        let mut state = self.inner.write().await;
        let owner_display_name = state
            .users
            .get(&user.id)
            .map(|stored| stored.profile.display_name.clone())
            .unwrap_or_else(|| user.display_name.clone());
        let existing_id = state
            .calendar_connections
            .values()
            .find(|connection| {
                connection.owner_id == user.id
                    && connection.provider == CalendarProvider::Ics
                    && connection.ics_url.as_deref() == Some(normalized_url.as_str())
            })
            .map(|connection| connection.id);
        let connection = CalendarConnection {
            id: existing_id.unwrap_or_else(Uuid::new_v4),
            owner_id: user.id,
            owner_display_name,
            title: title.to_string(),
            provider: CalendarProvider::Ics,
            external_id: normalized_url.clone(),
            calendar_id: normalized_url.clone(),
            account_label: "Apple/iCloud feed".into(),
            access_token: None,
            refresh_token: None,
            token_expires_at: None,
            ics_url: Some(normalized_url),
            created_at: existing_id
                .and_then(|id| state.calendar_connections.get(&id).map(|entry| entry.created_at))
                .unwrap_or_else(Utc::now),
            updated_at: Utc::now(),
        };
        state.calendar_connections.insert(connection.id, connection.clone());
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(connection)
    }

    pub async fn create_local_calendar_connection(
        &self,
        user: UserProfile,
        payload: CreateLocalCalendarConnectionRequest,
    ) -> AppResult<CalendarConnection> {
        self.create_local_calendar_connection_with_id(user, payload, None).await
    }

    async fn create_local_calendar_connection_with_id(
        &self,
        user: UserProfile,
        payload: CreateLocalCalendarConnectionRequest,
        forced_id: Option<Uuid>,
    ) -> AppResult<CalendarConnection> {
        let title = payload.title.trim();
        if title.is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }

        let mut state = self.inner.write().await;
        let owner_display_name = state
            .users
            .get(&user.id)
            .map(|stored| stored.profile.display_name.clone())
            .unwrap_or_else(|| user.display_name.clone());
        let connection_id = forced_id.unwrap_or_else(Uuid::new_v4);
        let connection = CalendarConnection {
            id: connection_id,
            owner_id: user.id,
            owner_display_name,
            title: title.to_string(),
            provider: CalendarProvider::Sweet,
            external_id: String::new(),
            calendar_id: format!("sweet:{}", connection_id),
            account_label: "Home Suite Home calendar".into(),
            access_token: None,
            refresh_token: None,
            token_expires_at: None,
            ics_url: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        state.calendar_connections.insert(connection.id, connection.clone());
        state.calendar_events.entry(connection.id).or_default();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(connection)
    }

    pub async fn update_calendar_connection(
        &self,
        user: UserProfile,
        connection_id: Uuid,
        payload: UpdateCalendarConnectionRequest,
    ) -> AppResult<CalendarConnection> {
        let title = payload.title.trim();
        if title.is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }

        let mut state = self.inner.write().await;
        let connection = state
            .calendar_connections
            .get_mut(&connection_id)
            .ok_or(AppError::NotFound)?;
        if connection.owner_id != user.id {
            return Err(AppError::Unauthorized);
        }
        connection.title = title.to_string();
        connection.updated_at = Utc::now();
        let updated = connection.clone();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(updated)
    }

    pub async fn delete_calendar_connection(
        &self,
        user: UserProfile,
        connection_id: Uuid,
    ) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let connection = state
            .calendar_connections
            .get(&connection_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        if connection.owner_id != user.id {
            return Err(AppError::Unauthorized);
        }
        state.calendar_connections.remove(&connection_id);
        state.calendar_events.remove(&connection_id);
        state.sync_tombstones.push(SyncTombstone {
            entity: SyncEntityKind::CalendarConnections,
            id: connection_id.to_string(),
            deleted_at: Utc::now(),
        });
        for task in state.tasks.values_mut() {
            if task.calendar_connection_id == Some(connection_id) {
                task.calendar_connection_id = None;
                task.updated_at = Utc::now();
            }
        }
        state
            .resource_shares
            .remove(&calendar_resource_key(connection_id));
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(())
    }

    pub async fn create_calendar_event(
        &self,
        user: UserProfile,
        connection_id: Uuid,
        payload: CreateCalendarEventRequest,
    ) -> AppResult<CalendarEvent> {
        self.create_calendar_event_with_id(user, connection_id, payload, None).await
    }

    async fn create_calendar_event_with_id(
        &self,
        user: UserProfile,
        connection_id: Uuid,
        payload: CreateCalendarEventRequest,
        forced_id: Option<String>,
    ) -> AppResult<CalendarEvent> {
        if payload.title.trim().is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }
        if payload.end_at <= payload.start_at {
            return Err(AppError::BadRequest("end time must be after start time".into()));
        }

        let mut state = self.inner.write().await;
        let connection = state
            .calendar_connections
            .get(&connection_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        if connection.owner_id != user.id || connection.provider != CalendarProvider::Sweet {
            return Err(AppError::Unauthorized);
        }

        let event = CalendarEvent {
            id: forced_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            connection_id,
            title: payload.title.trim().to_string(),
            description: payload.description.trim().to_string(),
            location: payload.location.trim().to_string(),
            start_at: payload.start_at,
            end_at: payload.end_at,
            all_day: payload.all_day,
            source_url: String::new(),
            organizer: user.display_name.clone(),
            updated_at: Some(Utc::now()),
        };
        state
            .calendar_events
            .entry(connection_id)
            .or_default()
            .push(event.clone());
        if let Some(stored) = state.calendar_connections.get_mut(&connection_id) {
            stored.updated_at = Utc::now();
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(event)
    }

    pub async fn update_calendar_event(
        &self,
        user: UserProfile,
        connection_id: Uuid,
        event_id: &str,
        payload: UpdateCalendarEventRequest,
    ) -> AppResult<CalendarEvent> {
        if payload.title.trim().is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }
        if payload.end_at <= payload.start_at {
            return Err(AppError::BadRequest("end time must be after start time".into()));
        }

        let mut state = self.inner.write().await;
        let connection = state
            .calendar_connections
            .get(&connection_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        if connection.owner_id != user.id || connection.provider != CalendarProvider::Sweet {
            return Err(AppError::Unauthorized);
        }

        let event = state
            .calendar_events
            .get_mut(&connection_id)
            .and_then(|events| events.iter_mut().find(|event| event.id == event_id))
            .ok_or(AppError::NotFound)?;
        event.title = payload.title.trim().to_string();
        event.description = payload.description.trim().to_string();
        event.location = payload.location.trim().to_string();
        event.start_at = payload.start_at;
        event.end_at = payload.end_at;
        event.all_day = payload.all_day;
        event.updated_at = Some(Utc::now());
        let updated = event.clone();
        if let Some(stored) = state.calendar_connections.get_mut(&connection_id) {
            stored.updated_at = Utc::now();
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(updated)
    }

    pub async fn delete_calendar_event(
        &self,
        user: UserProfile,
        connection_id: Uuid,
        event_id: &str,
    ) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let connection = state
            .calendar_connections
            .get(&connection_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        if connection.owner_id != user.id || connection.provider != CalendarProvider::Sweet {
            return Err(AppError::Unauthorized);
        }

        let events = state
            .calendar_events
            .get_mut(&connection_id)
            .ok_or(AppError::NotFound)?;
        let before = events.len();
        events.retain(|event| event.id != event_id);
        if events.len() == before {
            return Err(AppError::NotFound);
        }
        state.sync_tombstones.push(SyncTombstone {
            entity: SyncEntityKind::CalendarEvents,
            id: event_id.to_string(),
            deleted_at: Utc::now(),
        });
        if let Some(stored) = state.calendar_connections.get_mut(&connection_id) {
            stored.updated_at = Utc::now();
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(())
    }

    pub async fn list_tasks(&self, user: UserProfile) -> Vec<TaskItem> {
        let state = self.inner.read().await;
        let mut tasks = state
            .tasks
            .values()
            .filter(|task| task.owner_id == user.id)
            .cloned()
            .collect::<Vec<_>>();
        tasks.sort_by(|left, right| {
            (
                left.status == TaskStatus::Completed,
                left.start_at.unwrap_or(left.created_at),
                left.title.to_lowercase(),
            )
                .cmp(&(
                    right.status == TaskStatus::Completed,
                    right.start_at.unwrap_or(right.created_at),
                    right.title.to_lowercase(),
                ))
        });
        tasks
    }

    pub async fn create_task(&self, user: UserProfile, payload: CreateTaskRequest) -> AppResult<TaskItem> {
        self.create_task_with_id(user, payload, None).await
    }

    async fn create_task_with_id(
        &self,
        user: UserProfile,
        payload: CreateTaskRequest,
        forced_id: Option<Uuid>,
    ) -> AppResult<TaskItem> {
        let title = payload.title.trim();
        if title.is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }
        if let (Some(start_at), Some(end_at)) = (payload.start_at, payload.end_at) {
            if end_at <= start_at {
                return Err(AppError::BadRequest("end time must be after start time".into()));
            }
        }

        let mut state = self.inner.write().await;
        if let Some(calendar_connection_id) = payload.calendar_connection_id {
            let connection = state
                .calendar_connections
                .get(&calendar_connection_id)
                .ok_or(AppError::NotFound)?;
            if connection.owner_id != user.id || connection.provider != CalendarProvider::Sweet {
                return Err(AppError::Unauthorized);
            }
        }
        let owner_display_name = state
            .users
            .get(&user.id)
            .map(|stored| stored.profile.display_name.clone())
            .unwrap_or_else(|| user.display_name.clone());
        let task = TaskItem {
            id: forced_id.unwrap_or_else(Uuid::new_v4),
            owner_id: user.id,
            owner_display_name,
            title: title.to_string(),
            description: payload.description.trim().to_string(),
            status: TaskStatus::Open,
            start_at: payload.start_at,
            end_at: payload.end_at,
            all_day: payload.all_day,
            calendar_connection_id: payload.calendar_connection_id,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
        };
        state.tasks.insert(task.id, task.clone());
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(task)
    }

    pub async fn update_task(
        &self,
        user: UserProfile,
        task_id: Uuid,
        payload: UpdateTaskRequest,
    ) -> AppResult<TaskItem> {
        let title = payload.title.trim();
        if title.is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }
        if let (Some(start_at), Some(end_at)) = (payload.start_at, payload.end_at) {
            if end_at <= start_at {
                return Err(AppError::BadRequest("end time must be after start time".into()));
            }
        }

        let mut state = self.inner.write().await;
        if let Some(calendar_connection_id) = payload.calendar_connection_id {
            let connection = state
                .calendar_connections
                .get(&calendar_connection_id)
                .ok_or(AppError::NotFound)?;
            if connection.owner_id != user.id || connection.provider != CalendarProvider::Sweet {
                return Err(AppError::Unauthorized);
            }
        }
        let task = state.tasks.get_mut(&task_id).ok_or(AppError::NotFound)?;
        if task.owner_id != user.id {
            return Err(AppError::Unauthorized);
        }
        task.title = title.to_string();
        task.description = payload.description.trim().to_string();
        task.status = payload.status;
        task.start_at = payload.start_at;
        task.end_at = payload.end_at;
        task.all_day = payload.all_day;
        task.calendar_connection_id = payload.calendar_connection_id;
        task.updated_at = Utc::now();
        task.completed_at = if task.status == TaskStatus::Completed {
            Some(task.completed_at.unwrap_or_else(Utc::now))
        } else {
            None
        };
        let updated = task.clone();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(updated)
    }

    pub async fn delete_task(&self, user: UserProfile, task_id: Uuid) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let task = state.tasks.get(&task_id).cloned().ok_or(AppError::NotFound)?;
        if task.owner_id != user.id {
            return Err(AppError::Unauthorized);
        }
        state.tasks.remove(&task_id);
        state.sync_tombstones.push(SyncTombstone {
            entity: SyncEntityKind::Tasks,
            id: task_id.to_string(),
            deleted_at: Utc::now(),
        });
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(())
    }

    pub async fn list_calendar_events(
        &self,
        user: UserProfile,
        connection_id: Uuid,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> AppResult<Vec<CalendarEvent>> {
        let (settings, mut connection) = {
            let state = self.inner.read().await;
            let connection = state
                .calendar_connections
                .get(&connection_id)
                .cloned()
                .ok_or(AppError::NotFound)?;
            if !calendar_connection_visible_to_user(&state, &connection, user.id) {
                return Err(AppError::Unauthorized);
            }
            (state.admin_settings.clone(), connection)
        };

        let events = match connection.provider {
            CalendarProvider::Google => {
                let access_token = ensure_google_calendar_access_token(&settings, &mut connection).await?;
                let events = fetch_google_calendar_events(&connection, &access_token, start, end).await?;
                let mut state = self.inner.write().await;
                if let Some(stored) = state.calendar_connections.get_mut(&connection_id) {
                    stored.access_token = connection.access_token.clone();
                    stored.refresh_token = connection.refresh_token.clone();
                    stored.token_expires_at = connection.token_expires_at;
                    stored.updated_at = Utc::now();
                }
                let snapshot = state.clone();
                drop(state);
                self.persist_snapshot(snapshot).await?;
                events
            }
            CalendarProvider::Ics => {
                let url = connection
                    .ics_url
                    .clone()
                    .ok_or_else(|| AppError::BadRequest("calendar feed url missing".into()))?;
                fetch_ics_calendar_events_from_url(&url, start, end).await?
                    .into_iter()
                    .map(|mut event| {
                        event.connection_id = connection.id;
                        event
                    })
                    .collect()
            }
            CalendarProvider::Sweet => {
                let state = self.inner.read().await;
                let mut events = state
                    .calendar_events
                    .get(&connection_id)
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|event| event.end_at >= start && event.start_at <= end)
                    .collect::<Vec<_>>();
                events.extend(state.tasks.values().filter(|task| task.calendar_connection_id == Some(connection_id)).filter_map(|task| {
                    let start_at = task.start_at?;
                    let end_at = task.end_at.unwrap_or(start_at + Duration::hours(1));
                    if end_at < start || start_at > end {
                        return None;
                    }
                    Some(CalendarEvent {
                        id: format!("task:{}", task.id),
                        connection_id,
                        title: task.title.clone(),
                        description: task.description.clone(),
                        location: String::new(),
                        start_at,
                        end_at,
                        all_day: task.all_day,
                        source_url: String::new(),
                        organizer: task.owner_display_name.clone(),
                        updated_at: Some(task.updated_at),
                    })
                }));
                events.sort_by(|left, right| {
                    (left.start_at, left.title.to_lowercase())
                        .cmp(&(right.start_at, right.title.to_lowercase()))
                });
                events
            }
        };

        Ok(events)
    }

    pub async fn setup_admin(&self, payload: SetupAdminRequest) -> AppResult<UserProfile> {
        if payload.password != payload.password_confirm {
            return Err(AppError::BadRequest("passwords do not match".into()));
        }
        if payload.password.trim().len() < 8 {
            return Err(AppError::BadRequest(
                "password must be at least 8 characters".into(),
            ));
        }
        let username = payload.username.trim().to_string();
        let email = payload.email.trim().to_lowercase();
        let display_name = if payload.display_name.trim().is_empty() {
            username.clone()
        } else {
            payload.display_name.trim().to_string()
        };
        if username.is_empty() || email.is_empty() {
            return Err(AppError::BadRequest(
                "username and email are required".into(),
            ));
        }

        let mut state = self.inner.write().await;
        if state
            .users
            .values()
            .any(|user| user.profile.roles.iter().any(|role| role == "admin"))
        {
            return Err(AppError::BadRequest("admin account already exists".into()));
        }

        let password_hash = hash_password(&payload.password)?;

        let profile = UserProfile {
            id: Uuid::new_v4(),
            username,
            email,
            display_name,
            avatar_path: None,
            avatar_content_type: None,
            role: "admin".into(),
            roles: vec!["admin".into()],
            must_change_password: false,
        };
        let stored_user = StoredUser {
            profile: profile.clone(),
            password_hash: password_hash.clone(),
            linked_oidc_subject: None,
            storage_limit_mb: 0,
            tool_scope: Default::default(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        state.user = profile.clone();
        state.password_hash = password_hash;
        state.users.insert(profile.id, stored_user);
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(profile)
    }

    pub async fn create_user(&self, payload: CreateUserRequest) -> AppResult<AdminUserSummary> {
        validate_password(&payload.password)?;
        let username = payload.username.trim().to_string();
        let requested_email = payload.email.trim().to_lowercase();
        let display_name = if payload.display_name.trim().is_empty() {
            username.clone()
        } else {
            payload.display_name.trim().to_string()
        };
        if username.is_empty() {
            return Err(AppError::BadRequest("username is required".into()));
        }

        let mut state = self.inner.write().await;
        if state.admin_settings.require_account_email && requested_email.is_empty() {
            return Err(AppError::BadRequest("email is required".into()));
        }
        let email = if requested_email.is_empty() {
            format!("{}@local.home-suite-home", username.to_lowercase())
        } else {
            requested_email
        };
        if state
            .users
            .values()
            .any(|user| user.profile.username.eq_ignore_ascii_case(&username))
        {
            return Err(AppError::BadRequest("username already exists".into()));
        }
        if state
            .users
            .values()
            .any(|user| user.profile.email.eq_ignore_ascii_case(&email))
        {
            return Err(AppError::BadRequest("email already exists".into()));
        }

        let password_hash = hash_password(&payload.password)?;
        let now = Utc::now();
        let roles = normalize_user_roles(payload.role.clone(), &payload.roles);
        let profile = UserProfile {
            id: Uuid::new_v4(),
            username,
            email,
            display_name,
            avatar_path: None,
            avatar_content_type: None,
            role: primary_user_role(&roles),
            roles,
            must_change_password: true,
        };
        let stored = StoredUser {
            profile: profile.clone(),
            password_hash,
            linked_oidc_subject: None,
            storage_limit_mb: payload.storage_limit_mb,
            tool_scope: Default::default(),
            created_at: now,
            updated_at: now,
        };
        state.users.insert(profile.id, stored.clone());
        let snapshot = state.clone();
        let summary = self.admin_user_summary(&snapshot, &stored);
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(summary)
    }

    pub async fn admin_reset_password(
        &self,
        user_id: Uuid,
        password: String,
    ) -> AppResult<AdminUserSummary> {
        validate_password(&password)?;
        let mut state = self.inner.write().await;
        {
            let user = state.users.get_mut(&user_id).ok_or(AppError::NotFound)?;
            user.password_hash = hash_password(&password)?;
            user.profile.must_change_password = true;
            user.updated_at = Utc::now();
        }
        let user = state
            .users
            .get(&user_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        let summary = self.admin_user_summary(&state, &user);
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(summary)
    }

    pub async fn update_user_access(
        &self,
        user_id: Uuid,
        payload: UpdateUserAccessRequest,
    ) -> AppResult<AdminUserSummary> {
        let mut state = self.inner.write().await;
        {
            let user = state.users.get_mut(&user_id).ok_or(AppError::NotFound)?;
            user.profile.roles = normalize_user_roles(payload.role.clone(), &payload.roles);
            user.profile.role = primary_user_role(&user.profile.roles);
            user.storage_limit_mb = payload.storage_limit_mb;
            user.tool_scope = payload.tool_scope.clone();
            user.updated_at = Utc::now();
        }
        let user = state
            .users
            .get(&user_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        let summary = self.admin_user_summary(&state, &user);
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(summary)
    }

    pub async fn update_current_user_credentials(
        &self,
        user_id: Uuid,
        payload: UpdateAccountCredentialsRequest,
    ) -> AppResult<UserProfile> {
        let requested_username = payload.username.trim().to_string();
        let requested_email = payload.email.trim().to_lowercase();
        if requested_username.is_empty() {
            return Err(AppError::BadRequest("username is required".into()));
        }

        let mut state = self.inner.write().await;
        if state.admin_settings.require_account_email && requested_email.is_empty() {
            return Err(AppError::BadRequest("email is required".into()));
        }
        let normalized_email = if requested_email.is_empty() {
            format!("{}@local.home-suite-home", requested_username.to_lowercase())
        } else {
            requested_email
        };
        let current_user = state.users.get(&user_id).ok_or(AppError::Unauthorized)?;
        if state.users.values().any(|user| {
            user.profile.id != user_id
                && user
                    .profile
                    .username
                    .eq_ignore_ascii_case(&requested_username)
        }) {
            return Err(AppError::BadRequest("username already exists".into()));
        }
        if state.users.values().any(|user| {
            user.profile.id != user_id && user.profile.email.eq_ignore_ascii_case(&normalized_email)
        }) {
            return Err(AppError::BadRequest("email already exists".into()));
        }
        if current_user.profile.username == requested_username
            && current_user.profile.email.eq_ignore_ascii_case(&normalized_email)
        {
            return Ok(current_user.profile.clone());
        }

        if state.admin_settings.allow_user_credential_changes {
            state.pending_credential_changes.remove(&user_id);
            let profile = {
                let user = state.users.get_mut(&user_id).ok_or(AppError::Unauthorized)?;
                user.profile.username = requested_username;
                user.profile.email = normalized_email;
                user.updated_at = Utc::now();
                user.profile.clone()
            };
            let snapshot = state.clone();
            drop(state);
            self.persist_snapshot(snapshot).await?;
            return Ok(profile);
        }

        let request = PendingCredentialChangeRequest {
            id: Uuid::new_v4(),
            user_id,
            requested_username,
            requested_email: normalized_email,
            created_at: Utc::now(),
        };
        state.pending_credential_changes.insert(user_id, request);
        let profile = state
            .users
            .get(&user_id)
            .map(|user| user.profile.clone())
            .ok_or(AppError::Unauthorized)?;
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(profile)
    }

    pub async fn change_current_user_password(
        &self,
        user_id: Uuid,
        payload: ChangeCurrentUserPasswordRequest,
    ) -> AppResult<UserProfile> {
        if payload.new_password != payload.new_password_confirm {
            return Err(AppError::BadRequest("passwords do not match".into()));
        }
        validate_password(&payload.new_password)?;
        let mut state = self.inner.write().await;
        let current_state_user_id = state.user.id;
        let (profile, next_password_hash) = {
            let user = state.users.get_mut(&user_id).ok_or(AppError::Unauthorized)?;
            let parsed_hash = PasswordHash::new(&user.password_hash)
                .map_err(|err| AppError::Internal(err.to_string()))?;
            Argon2::default()
                .verify_password(payload.current_password.as_bytes(), &parsed_hash)
                .map_err(|_| AppError::Unauthorized)?;
            user.password_hash = hash_password(&payload.new_password)?;
            user.profile.must_change_password = false;
            user.updated_at = Utc::now();
            (user.profile.clone(), user.password_hash.clone())
        };
        if current_state_user_id == profile.id {
            state.user = profile.clone();
            state.password_hash = next_password_hash;
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(profile)
    }

    pub async fn approve_pending_credential_change(
        &self,
        user_id: Uuid,
        approve: bool,
    ) -> AppResult<AdminUserSummary> {
        let mut state = self.inner.write().await;
        let pending = state
            .pending_credential_changes
            .get(&user_id)
            .cloned()
            .ok_or(AppError::NotFound)?;
        if approve {
            if state.users.values().any(|user| {
                user.profile.id != user_id
                    && user
                        .profile
                        .username
                        .eq_ignore_ascii_case(&pending.requested_username)
            }) {
                return Err(AppError::BadRequest("username already exists".into()));
            }
            if state.users.values().any(|user| {
                user.profile.id != user_id
                    && user.profile.email.eq_ignore_ascii_case(&pending.requested_email)
            }) {
                return Err(AppError::BadRequest("email already exists".into()));
            }
            let profile = {
                let user = state.users.get_mut(&user_id).ok_or(AppError::NotFound)?;
                user.profile.username = pending.requested_username.clone();
                user.profile.email = pending.requested_email.clone();
                user.updated_at = Utc::now();
                user.profile.clone()
            };
            if state.user.id == profile.id {
                state.user = profile;
            }
        }
        state.pending_credential_changes.remove(&user_id);
        let user = state.users.get(&user_id).cloned().ok_or(AppError::NotFound)?;
        let summary = self.admin_user_summary(&state, &user);
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(summary)
    }

    pub async fn storage_overview(&self) -> AdminStorageOverview {
        let public_storage_mb = self.inner.read().await.admin_settings.public_storage_mb;
        let (detected_total_mb, detected_available_mb) = self.storage.detect_capacity_mb();
        AdminStorageOverview {
            public_storage_mb,
            detected_total_mb,
            detected_available_mb,
        }
    }

    pub async fn admin_database_overview(&self) -> AdminDatabaseOverview {
        let state = self.inner.read().await;
        let backend = if self.persistence.uses_postgres() {
            "postgres"
        } else {
            "file"
        }
        .to_string();

        fn table_from_records<T: serde::Serialize>(key: &str, label: &str, records: Vec<T>) -> AdminDatabaseTable {
            let rows = records
                .into_iter()
                .filter_map(|record| serde_json::to_value(record).ok())
                .collect::<Vec<_>>();
            let columns = rows
                .first()
                .and_then(|row| row.as_object())
                .map(|object| object.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default();
            AdminDatabaseTable {
                key: key.to_string(),
                label: label.to_string(),
                row_count: rows.len(),
                columns,
                rows,
            }
        }

        let tables = vec![
            table_from_records(
                "users",
                "Users",
                state.users.values().cloned().map(|stored| stored.profile).collect::<Vec<_>>(),
            ),
            table_from_records("notes", "Notes", state.notes.values().cloned().collect::<Vec<_>>()),
            table_from_records(
                "note_operations",
                "Note Operations",
                state
                    .note_operations
                    .values()
                    .flat_map(|records| records.clone())
                    .collect::<Vec<_>>(),
            ),
            table_from_records(
                "note_sessions",
                "Note Sessions",
                state
                    .note_sessions
                    .values()
                    .flat_map(|records| records.clone())
                    .collect::<Vec<_>>(),
            ),
            table_from_records(
                "note_conflicts",
                "Note Conflicts",
                state
                    .note_conflicts
                    .values()
                    .flat_map(|records| records.clone())
                    .collect::<Vec<_>>(),
            ),
            table_from_records("diagrams", "Diagrams", state.diagrams.values().cloned().collect::<Vec<_>>()),
            table_from_records("voice_memos", "Voice Memos", state.memos.values().cloned().collect::<Vec<_>>()),
            table_from_records(
                "deleted_drive_items",
                "Deleted Drive Items",
                state.deleted_drive_items.values().cloned().collect::<Vec<_>>(),
            ),
            table_from_records("audit_log", "Audit Log", state.audit_log.clone()),
            table_from_records(
                "transcription_jobs",
                "Transcription Jobs",
                state.jobs.values().cloned().collect::<Vec<_>>(),
            ),
            table_from_records("rooms", "Rooms", state.rooms.values().cloned().collect::<Vec<_>>()),
            table_from_records("messages", "Messages", state.messages.values().cloned().collect::<Vec<_>>()),
            table_from_records(
                "calendar_connections",
                "Calendar Connections",
                state.calendar_connections.values().cloned().collect::<Vec<_>>(),
            ),
            table_from_records(
                "calendar_events",
                "Calendar Events",
                state.calendar_events.values().cloned().collect::<Vec<_>>(),
            ),
            table_from_records("tasks", "Tasks", state.tasks.values().cloned().collect::<Vec<_>>()),
            table_from_records(
                "resource_shares",
                "Resource Shares",
                state.resource_shares.values().cloned().collect::<Vec<_>>(),
            ),
            table_from_records("sync_tombstones", "Sync Tombstones", state.sync_tombstones.clone()),
            table_from_records(
                "pending_credential_changes",
                "Pending Credential Changes",
                state.pending_credential_changes.values().cloned().collect::<Vec<_>>(),
            ),
        ];

        AdminDatabaseOverview {
            backend,
            generated_at: Utc::now(),
            tables,
        }
    }

    pub async fn list_deleted_items(&self) -> Vec<AdminDeletedItem> {
        let state = self.inner.read().await;
        let mut items = Vec::new();
        items.extend(state.notes.values().filter_map(|note| {
            Some(AdminDeletedItem {
                id: format!("note:{}", note.id),
                kind: DeletedResourceKind::Note,
                label: note.title.clone(),
                original_path: note_relative_path_for_move(note),
                deleted_at: note.deleted_at?,
                purge_at: note.purge_at?,
            })
        }));
        items.extend(state.diagrams.values().filter_map(|diagram| {
            Some(AdminDeletedItem {
                id: format!("diagram:{}", diagram.id),
                kind: DeletedResourceKind::Diagram,
                label: diagram_display_name(&diagram.title),
                original_path: diagram_relative_path_for_move(diagram),
                deleted_at: diagram.deleted_at?,
                purge_at: diagram.purge_at?,
            })
        }));
        items.extend(state.memos.values().filter_map(|memo| {
            Some(AdminDeletedItem {
                id: format!("voice:{}", memo.id),
                kind: DeletedResourceKind::VoiceMemo,
                label: memo.title.clone(),
                original_path: memo.audio_path.clone(),
                deleted_at: memo.deleted_at?,
                purge_at: memo.purge_at?,
            })
        }));
        items.extend(state.deleted_drive_items.values().cloned().map(|entry| AdminDeletedItem {
            id: format!("drive:{}", entry.id),
            kind: DeletedResourceKind::DrivePath,
            label: entry.label,
            original_path: entry.original_path,
            deleted_at: entry.deleted_at,
            purge_at: entry.purge_at,
        }));
        items.sort_by(|left, right| right.deleted_at.cmp(&left.deleted_at));
        items
    }

    pub async fn list_audit_entries(&self) -> Vec<AdminAuditEntry> {
        self.inner.read().await.audit_log.clone()
    }

    pub async fn restore_deleted_item(&self, item_id: &str) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let uses_postgres = self.persistence.uses_postgres();
        if let Some(id) = item_id.strip_prefix("note:") {
            let note_id = Uuid::parse_str(id).map_err(|_| AppError::BadRequest("invalid deleted note id".into()))?;
            let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
            if note.deleted_at.is_none() {
                return Ok(());
            }
            let previous_revision = note.revision;
            note.deleted_at = None;
            note.purge_at = None;
            note.updated_at = Utc::now();
            note.revision += 1;
            let restored = note.clone();
            state.sync_tombstones.retain(|entry| {
                !(entry.entity == SyncEntityKind::Notes && entry.id == restored.id.to_string())
            });
            if uses_postgres {
                self.persistence.update_note(&restored, previous_revision).await?;
            }
            self.storage
                .sync_note_markdown(None, restored.id, &restored.title, &restored.folder, &restored.markdown)
                .await?;
            append_audit_entry(
                &mut state,
                "api.admin",
                "restore_note",
                "note",
                restored.id.to_string(),
                restored.title.clone(),
                serde_json::json!({ "path": note_relative_path_for_move(&restored) }),
            );
        } else if let Some(id) = item_id.strip_prefix("diagram:") {
            let diagram_id = Uuid::parse_str(id)
                .map_err(|_| AppError::BadRequest("invalid deleted diagram id".into()))?;
            let diagram = state.diagrams.get_mut(&diagram_id).ok_or(AppError::NotFound)?;
            if diagram.deleted_at.is_none() {
                return Ok(());
            }
            let previous_revision = diagram.revision;
            diagram.deleted_at = None;
            diagram.purge_at = None;
            diagram.updated_at = Utc::now();
            diagram.revision += 1;
            let restored = diagram.clone();
            state.sync_tombstones.retain(|entry| {
                !(entry.entity == SyncEntityKind::Diagrams && entry.id == restored.id.to_string())
            });
            if uses_postgres {
                self.persistence.update_diagram(&restored, previous_revision).await?;
            }
            self.storage
                .sync_diagram_xml(None, &restored.title, restored.id, &restored.xml)
                .await?;
            append_audit_entry(
                &mut state,
                "api.admin",
                "restore_diagram",
                "diagram",
                restored.id.to_string(),
                diagram_display_name(&restored.title),
                serde_json::json!({ "path": diagram_relative_path_for_move(&restored) }),
            );
        } else if let Some(id) = item_id.strip_prefix("voice:") {
            let memo_id = Uuid::parse_str(id).map_err(|_| AppError::BadRequest("invalid deleted memo id".into()))?;
            let memo_key = {
                let memo = state.memos.get_mut(&memo_id).ok_or(AppError::NotFound)?;
                if memo.deleted_at.is_none() {
                    return Ok(());
                }
                let memo_key = memo.id.to_string();
                memo.deleted_at = None;
                memo.purge_at = None;
                memo.updated_at = Utc::now();
                memo_key
            };
            state.sync_tombstones.retain(|entry| {
                !(entry.entity == SyncEntityKind::VoiceMemos && entry.id == memo_key)
            });
            if let Some((audit_id, audit_title, audit_path)) = state
                .memos
                .get(&memo_id)
                .map(|memo| (memo.id.to_string(), memo.title.clone(), memo.audio_path.clone()))
            {
                append_audit_entry(
                    &mut state,
                    "api.admin",
                    "restore_voice_memo",
                    "voice_memo",
                    audit_id,
                    audit_title,
                    serde_json::json!({ "path": audit_path }),
                );
            }
        } else if let Some(id) = item_id.strip_prefix("drive:") {
            let deleted = state.deleted_drive_items.get(id).cloned().ok_or(AppError::NotFound)?;
            self.storage
                .restore_drive_path_from_trash(&deleted.backup_path, &deleted.original_path)
                .await?;
            state.deleted_drive_items.remove(id);
            append_audit_entry(
                &mut state,
                "api.admin",
                "restore_drive_path",
                "drive_path",
                id.to_string(),
                deleted.label,
                serde_json::json!({ "path": deleted.original_path, "backup_path": deleted.backup_path }),
            );
        } else {
            return Err(AppError::BadRequest("invalid deleted item id".into()));
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await
    }

    pub async fn change_password(&self, payload: ChangePasswordRequest) -> AppResult<UserProfile> {
        if payload.new_password != payload.new_password_confirm {
            return Err(AppError::BadRequest("passwords do not match".into()));
        }
        validate_password(&payload.new_password)?;
        let mut state = self.inner.write().await;
        let current_state_user_id = state.user.id;
        let (profile, next_password_hash) = {
            let user = state
                .users
                .values_mut()
                .find(|user| {
                    user.profile.email.eq_ignore_ascii_case(&payload.identifier)
                        || user
                            .profile
                            .username
                            .eq_ignore_ascii_case(&payload.identifier)
                })
                .ok_or(AppError::Unauthorized)?;

            let parsed_hash = PasswordHash::new(&user.password_hash)
                .map_err(|err| AppError::Internal(err.to_string()))?;
            Argon2::default()
                .verify_password(payload.current_password.as_bytes(), &parsed_hash)
                .map_err(|_| AppError::Unauthorized)?;

            user.password_hash = hash_password(&payload.new_password)?;
            user.profile.must_change_password = false;
            user.updated_at = Utc::now();
            (user.profile.clone(), user.password_hash.clone())
        };
        let is_current_user = current_state_user_id == profile.id;
        if is_current_user {
            state.user = profile.clone();
            state.password_hash = next_password_hash;
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(profile)
    }

    pub async fn admin_settings(&self) -> AdminSettings {
        self.inner.read().await.admin_settings.clone()
    }

    pub async fn update_admin_settings(&self, settings: AdminSettings) -> AppResult<AdminSettings> {
        let mut state = self.inner.write().await;
        let mut next_settings = settings.clone();
        let member_policy = next_settings
            .role_policies
            .entry("member".into())
            .or_default()
            .clone();
        next_settings.allow_member_notes = member_policy.tool_scope.notes;
        next_settings.allow_member_files = member_policy.tool_scope.files;
        next_settings.allow_member_diagrams = member_policy.tool_scope.diagrams;
        next_settings.allow_member_voice = member_policy.tool_scope.voice;
        next_settings.allow_member_coms = member_policy.tool_scope.coms;
        next_settings.allow_user_custom_appearance = member_policy.customize_appearance;
        state.admin_settings = next_settings.clone();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(next_settings)
    }

    pub async fn ensure_manage_org_settings(&self, user_id: Uuid) -> AppResult<()> {
        let state = self.inner.read().await;
        let user = state.users.get(&user_id).ok_or(AppError::Unauthorized)?;
        let roles = normalize_user_roles(user.profile.role.clone(), &user.profile.roles);
        let allowed = roles
            .iter()
            .any(|role| state.admin_settings.role_policies.get(role).map(|policy| policy.manage_org_settings).unwrap_or(false));
        if allowed {
            Ok(())
        } else {
            Err(AppError::Unauthorized)
        }
    }

    pub async fn system_update_status(&self) -> SystemUpdateStatus {
        let mut status = self.system_update.read().await.clone();
        status.current_version = self.config.app_version.clone();
        status.update_target = self.config.update_target.clone();
        status.update_enabled = self.config.update_command.is_some();
        status
    }

    pub async fn trigger_system_update(&self) -> AppResult<SystemUpdateStatus> {
        let command = self
            .config
            .update_command
            .clone()
            .ok_or_else(|| AppError::BadRequest("update command is not configured".into()))?;

        {
            let mut status = self.system_update.write().await;
            if status.update_in_progress {
                return Err(AppError::BadRequest("an update is already in progress".into()));
            }
            status.current_version = self.config.app_version.clone();
            status.update_target = self.config.update_target.clone();
            status.update_enabled = true;
            status.update_in_progress = true;
            status.last_started_at = Some(Utc::now());
            status.last_finished_at = None;
            status.last_exit_code = None;
            status.last_error = None;
            status.last_message = "Update command started.".into();
        }
        self.persist_system_update_status().await;

        let update_status = self.system_update.clone();
        let version = self.config.app_version.clone();
        let target = self.config.update_target.clone();
        let enabled = self.config.update_command.is_some();
        let status_path = update_status_path(&self.config.storage_root);

        tokio::spawn(async move {
            let outcome = Command::new("sh").arg("-lc").arg(&command).output().await;
            let mut status = update_status.write().await;
            status.current_version = version;
            status.update_target = target;
            status.update_enabled = enabled;
            status.update_in_progress = false;
            status.last_finished_at = Some(Utc::now());
            match outcome {
                Ok(output) => {
                    status.last_exit_code = output.status.code();
                    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    let combined = if !stderr.is_empty() { stderr } else { stdout };
                    if output.status.success() {
                        status.last_error = None;
                        status.last_message = truncate_status_message(
                            if combined.is_empty() {
                                "Update command completed.".to_string()
                            } else {
                                combined
                            },
                        );
                    } else {
                        status.last_error = Some(truncate_status_message(if combined.is_empty() {
                            "Update command failed.".to_string()
                        } else {
                            combined.clone()
                        }));
                        status.last_message = "Update command failed.".into();
                    }
                }
                Err(error) => {
                    status.last_exit_code = None;
                    status.last_error = Some(truncate_status_message(error.to_string()));
                    status.last_message = "Could not launch update command.".into();
                }
            }
            let snapshot = status.clone();
            drop(status);
            persist_system_update_status_file(status_path, &snapshot).await;
        });

        Ok(self.system_update_status().await)
    }

    pub async fn session_response(&self, user: UserProfile) -> AppResult<SessionResponse> {
        let claims = JwtClaims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            role: primary_user_role(&user.roles),
            iss: self.config.base_url.clone(),
            exp: (Utc::now().timestamp() + 60 * 60 * 24) as usize,
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.config.jwt_secret.as_bytes()),
        )
        .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(SessionResponse { user, token })
    }

    pub async fn update_current_user_avatar(
        &self,
        user_id: Uuid,
        filename: Option<String>,
        content_type: Option<String>,
        bytes: Vec<u8>,
    ) -> AppResult<UserProfile> {
        if bytes.is_empty() {
            return Err(AppError::BadRequest("missing avatar image".into()));
        }
        if bytes.len() > 5 * 1024 * 1024 {
            return Err(AppError::BadRequest(
                "avatar image must be 5 MB or smaller".into(),
            ));
        }

        let normalized_content_type = normalize_avatar_content_type(content_type.as_deref())
            .ok_or_else(|| AppError::BadRequest("unsupported avatar image type".into()))?;
        let extension = avatar_extension_from_content_type(normalized_content_type)
            .map(str::to_string)
            .or_else(|| filename.as_deref().and_then(avatar_extension_from_filename))
            .unwrap_or_else(|| "png".to_string());
        let avatar_path = self.storage.save_avatar_blob(&bytes, &extension).await?;

        let mut state = self.inner.write().await;
        let previous_avatar_path = {
            let user = state.users.get_mut(&user_id).ok_or(AppError::Unauthorized)?;
            let previous = user.profile.avatar_path.clone();
            user.profile.avatar_path = Some(avatar_path.clone());
            user.profile.avatar_content_type = Some(normalized_content_type.to_string());
            user.updated_at = Utc::now();
            previous
        };
        let profile = state
            .users
            .get(&user_id)
            .map(|stored| stored.profile.clone())
            .ok_or(AppError::Unauthorized)?;
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;

        if let Some(previous_avatar_path) = previous_avatar_path {
            if previous_avatar_path != avatar_path {
                let _ = tokio::fs::remove_file(self.storage.resolve(&previous_avatar_path)).await;
            }
        }

        Ok(profile)
    }

    pub async fn get_user_avatar(&self, user_id: Uuid) -> AppResult<Option<(String, String)>> {
        let state = self.inner.read().await;
        let Some(user) = state.users.get(&user_id) else {
            return Ok(None);
        };
        let Some(path) = user.profile.avatar_path.clone() else {
            return Ok(None);
        };
        let content_type = user
            .profile
            .avatar_content_type
            .clone()
            .unwrap_or_else(|| "image/png".into());
        Ok(Some((path, content_type)))
    }

    pub async fn authenticated_user_from_header(
        &self,
        authorization: Option<&str>,
    ) -> AppResult<UserProfile> {
        let header = authorization.ok_or(AppError::Unauthorized)?;
        let token = header
            .strip_prefix("Bearer ")
            .or_else(|| header.strip_prefix("bearer "))
            .ok_or(AppError::Unauthorized)?;
        let claims = decode::<JwtClaims>(
            token,
            &DecodingKey::from_secret(self.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?
        .claims;
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
        let state = self.inner.read().await;
        state
            .users
            .get(&user_id)
            .map(|stored| stored.profile.clone())
            .ok_or(AppError::Unauthorized)
    }

    async fn persist_system_update_status(&self) {
        let snapshot = self.system_update.read().await.clone();
        persist_system_update_status_file(update_status_path(&self.config.storage_root), &snapshot).await;
    }

    pub async fn list_notes(&self) -> Vec<Note> {
        if let Ok(Some(notes)) = self.persistence.list_notes().await {
            let mut state = self.inner.write().await;
            let normalized = notes
                .into_iter()
                .map(|mut note| {
                    ensure_note_foundation(&mut note);
                    note
                })
                .collect::<Vec<_>>();
            state.notes = normalized.iter().cloned().map(|note| (note.id, note)).collect();
            return normalized
                .into_iter()
                .filter(|note| is_note_active(note))
                .collect();
        }
        self.inner
            .read()
            .await
            .notes
            .values()
            .filter(|note| is_note_active(note))
            .cloned()
            .map(|mut note| {
                ensure_note_foundation(&mut note);
                note
            })
            .collect()
    }

    pub async fn get_resource_share(&self, resource_key: &str) -> ResourceShare {
        self.inner
            .read()
            .await
            .resource_shares
            .get(resource_key)
            .cloned()
            .unwrap_or_else(|| ResourceShare {
                resource_key: resource_key.to_string(),
                visibility: ResourceVisibility::Private,
                user_ids: Vec::new(),
                updated_at: Utc::now(),
                updated_by: Uuid::nil(),
            })
    }

    fn resource_share_for_note(state: &StateData, note: &Note) -> ResourceShare {
        state
            .resource_shares
            .get(&format!("note:{}", note.id))
            .cloned()
            .unwrap_or_else(|| ResourceShare {
                resource_key: format!("note:{}", note.id),
                visibility: note.visibility.clone(),
                user_ids: note.shared_user_ids.clone(),
                updated_at: note.updated_at,
                updated_by: note.last_editor_id,
            })
    }

    pub async fn update_resource_share(
        &self,
        payload: UpdateResourceShareRequest,
        user: UserProfile,
    ) -> AppResult<ResourceShare> {
        let resource_key = payload.resource_key.trim();
        if resource_key.is_empty() {
            return Err(AppError::BadRequest("missing resource key".into()));
        }
        if !resource_key.starts_with("file:")
            && !resource_key.starts_with("note:")
            && !resource_key.starts_with("calendar:")
        {
            return Err(AppError::BadRequest("invalid resource key".into()));
        }

        let mut user_ids = payload.user_ids;
        user_ids.sort();
        user_ids.dedup();

        let mut state = self.inner.write().await;
        if let Some(connection_id) = resource_key.strip_prefix("calendar:") {
            let parsed_connection_id = Uuid::parse_str(connection_id)
                .map_err(|_| AppError::BadRequest("invalid calendar resource key".into()))?;
            let connection = state
                .calendar_connections
                .get(&parsed_connection_id)
                .ok_or(AppError::NotFound)?;
            if connection.owner_id != user.id {
                return Err(AppError::Unauthorized);
            }
        }
        user_ids.retain(|id| state.users.contains_key(id));
        let share = ResourceShare {
            resource_key: resource_key.to_string(),
            visibility: payload.visibility,
            user_ids,
            updated_at: Utc::now(),
            updated_by: user.id,
        };
        if let Some(note_id) = resource_key.strip_prefix("note:") {
            let parsed_note_id = Uuid::parse_str(note_id)
                .map_err(|_| AppError::BadRequest("invalid note resource key".into()))?;
            let note = state.notes.get_mut(&parsed_note_id).ok_or(AppError::NotFound)?;
            note.visibility = share.visibility.clone();
            note.shared_user_ids = share.user_ids.clone();
        }
        if let Some(memo_id) = resource_key.strip_prefix("audio:") {
            let parsed_memo_id = Uuid::parse_str(memo_id)
                .map_err(|_| AppError::BadRequest("invalid audio resource key".into()))?;
            let memo = state.memos.get_mut(&parsed_memo_id).ok_or(AppError::NotFound)?;
            memo.visibility = share.visibility.clone();
            memo.shared_user_ids = share.user_ids.clone();
        }
        state
            .resource_shares
            .insert(share.resource_key.clone(), share.clone());
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(share)
    }

    pub async fn create_note(&self, payload: CreateNoteRequest) -> AppResult<Note> {
        self.create_note_with_id(payload, None).await
    }

    pub async fn open_note_session(
        &self,
        note_id: Uuid,
        user: UserProfile,
        payload: NoteSessionOpenRequest,
    ) -> AppResult<NoteSessionOpenResponse> {
        let mut state = self.inner.write().await;
        let note = state.notes.get(&note_id).cloned().ok_or(AppError::NotFound)?;
        if note.deleted_at.is_some() {
            return Err(AppError::BadRequest("note has been deleted and can be restored from admin".into()));
        }
        let sessions = state.note_sessions.entry(note_id).or_default();
        sessions.retain(|entry| (Utc::now() - entry.last_seen_at) < Duration::seconds(45));
        let client_id = if payload.client_id.trim().is_empty() {
            format!("mobile-{}", Uuid::new_v4())
        } else {
            payload.client_id
        };
        let existing_index = sessions
            .iter()
            .position(|entry| entry.user_id == user.id && entry.client_id == client_id);
        let session = NoteSession {
            session_id: existing_index
                .and_then(|index| sessions.get(index).map(|entry| entry.session_id.clone()))
                .unwrap_or_else(|| format!("session-{}", Uuid::new_v4())),
            note_id,
            user_id: user.id,
            user_label: user.display_name.clone(),
            user_avatar_path: user.avatar_path.clone(),
            client_id: client_id.clone(),
            opened_at: existing_index
                .and_then(|index| sessions.get(index).map(|entry| entry.opened_at))
                .unwrap_or_else(Utc::now),
            last_seen_at: Utc::now(),
        };
        if let Some(index) = existing_index {
            sessions[index] = session.clone();
        } else {
            sessions.push(session.clone());
        }
        let visible_sessions = sessions.clone();
        let share = Self::resource_share_for_note(&state, &note);
        let conflicts = state.note_conflicts.get(&note_id).cloned().unwrap_or_default();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        let _ = self.realtime.send(RealtimeEvent::NotePresence {
            note_id,
            user: session.user_label.clone(),
            user_id: Some(session.user_id),
            avatar_path: session.user_avatar_path.clone(),
            session_id: Some(session.session_id.clone()),
            last_seen_at: Some(session.last_seen_at),
        });
        Ok(NoteSessionOpenResponse {
            note,
            share,
            sessions: visible_sessions,
            conflicts,
        })
    }

    pub async fn close_note_session(
        &self,
        note_id: Uuid,
        user: UserProfile,
        payload: NoteSessionCloseRequest,
    ) -> AppResult<()> {
        let mut state = self.inner.write().await;
        if let Some(sessions) = state.note_sessions.get_mut(&note_id) {
            sessions.retain(|entry| !(entry.session_id == payload.session_id && entry.user_id == user.id));
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(())
    }

    pub async fn pull_note_operations(
        &self,
        note_id: Uuid,
        _user: UserProfile,
        since_revision: u64,
    ) -> AppResult<NoteOperationsPullResponse> {
        let state = self.inner.read().await;
        let note = state.notes.get(&note_id).cloned().ok_or(AppError::NotFound)?;
        if note.deleted_at.is_some() {
            return Err(AppError::BadRequest("note has been deleted and can be restored from admin".into()));
        }
        let share = Self::resource_share_for_note(&state, &note);
        let operations = state
            .note_operations
            .get(&note_id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|entry| entry.resulting_revision > since_revision)
            .collect::<Vec<_>>();
        let conflicts = state.note_conflicts.get(&note_id).cloned().unwrap_or_default();
        Ok(NoteOperationsPullResponse {
            note,
            operations,
            conflicts,
            share,
        })
    }

    pub async fn push_note_operations(
        &self,
        note_id: Uuid,
        user: UserProfile,
        mut batch: NoteDocumentOperationBatch,
    ) -> AppResult<NoteOperationsPushResponse> {
        let mut state = self.inner.write().await;
        let existing_note = state.notes.get(&note_id).cloned().ok_or(AppError::NotFound)?;
        if existing_note.deleted_at.is_some() {
            return Err(AppError::BadRequest("note has been deleted and can be restored from admin".into()));
        }
        if batch.actor_id.trim().is_empty() {
            batch.actor_id = user.id.to_string();
        }
        if batch.client_id.trim().is_empty() {
            batch.client_id = format!("mobile-{}", Uuid::new_v4());
        }
        if batch.operation_id.trim().is_empty() {
            batch.operation_id = format!("op-{}", Uuid::new_v4());
        }

        if should_fork_note_document(&existing_note.document, &batch, &batch.actor_id) {
            let local_document = apply_operations_to_document(&existing_note.document, &batch, &batch.actor_id)?;
            let forked_ids = create_note_conflict_forks(&mut state, &existing_note, &local_document, &batch.actor_id);
            let conflict = NoteConflictRecord {
                id: format!("conflict-{}", Uuid::new_v4()),
                note_id,
                operation_id: batch.operation_id.clone(),
                reason: "overlapping_block_edits".into(),
                forked_note_ids: forked_ids.clone(),
                created_at: Utc::now(),
            };
            state.note_conflicts.entry(note_id).or_default().push(conflict.clone());
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                for fork_id in &forked_ids {
                    if let Some(note) = state.notes.get(fork_id) {
                        self.persistence.create_note(note).await?;
                    }
                }
            }
            let note = existing_note.clone();
            let conflicts = state.note_conflicts.get(&note_id).cloned().unwrap_or_default();
            let snapshot = state.clone();
            drop(state);
            self.persist_snapshot(snapshot).await?;
            return Ok(NoteOperationsPushResponse {
                note,
                applied: false,
                operation: None,
                conflicts,
            });
        }

        let mut next_document = apply_operations_to_document(&existing_note.document, &batch, &batch.actor_id)?;
        if next_document.last_operation_id.trim().is_empty() {
            next_document.last_operation_id = batch.operation_id.clone();
        }
        let next_markdown = markdown_from_note_document(&next_document);
        let current_used = storage_used_bytes_for_user(&state, &self.storage, user.id);
        let projected_used = current_used
            .saturating_sub(existing_note.markdown.len() as u64)
            .saturating_add(next_markdown.len() as u64);
        enforce_storage_limit(&state, user.id, current_used, projected_used, false)?;

        let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
        let previous_title = note.title.clone();
        let previous_folder = note.folder.clone();
        for operation in &batch.operations {
            match operation {
                NoteOperation::SetTitle { title } => note.title = title.clone(),
                NoteOperation::SetFolder { folder } => note.folder = folder.clone(),
                _ => {}
            }
        }
        note.document = next_document;
        note.markdown = next_markdown;
        note.revision += 1;
        note.updated_at = Utc::now();
        note.last_editor_id = user.id;
        let note_snapshot = note.clone();
        let expected_revision = existing_note.revision;
        let operation_record = NoteOperationRecord {
            note_id,
            operation_id: batch.operation_id.clone(),
            actor_id: batch.actor_id.clone(),
            client_id: batch.client_id.clone(),
            created_at: Utc::now(),
            resulting_revision: note_snapshot.revision,
            batch: batch.clone(),
        };
        state.note_operations.entry(note_id).or_default().push(operation_record.clone());
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.update_note(&note_snapshot, expected_revision).await?;
        }
        self.storage
            .sync_note_markdown(
                Some((&previous_folder, &previous_title)),
                note_snapshot.id,
                &note_snapshot.title,
                &note_snapshot.folder,
                &note_snapshot.markdown,
            )
            .await?;
        let share = Self::resource_share_for_note(&state, &note_snapshot);
        let conflicts = state.note_conflicts.get(&note_id).cloned().unwrap_or_default();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        let _ = self.realtime.send(RealtimeEvent::NoteOperations {
            note_id,
            title: note_snapshot.title.clone(),
            folder: note_snapshot.folder.clone(),
            markdown: note_snapshot.markdown.clone(),
            revision: note_snapshot.revision,
            client_id: batch.client_id.clone(),
            user: user.display_name.clone(),
            batch: batch.clone(),
            document: Some(note_snapshot.document.clone()),
        });
        let _ = self.realtime.send(RealtimeEvent::NotePatch {
            note_id,
            title: note_snapshot.title.clone(),
            folder: note_snapshot.folder.clone(),
            markdown: note_snapshot.markdown.clone(),
            revision: note_snapshot.revision,
            document: Some(note_snapshot.document.clone()),
        });
        let _ = share;
        Ok(NoteOperationsPushResponse {
            note: note_snapshot,
            applied: true,
            operation: Some(operation_record),
            conflicts,
        })
    }

    async fn create_note_with_id(&self, payload: CreateNoteRequest, forced_id: Option<Uuid>) -> AppResult<Note> {
        let mut state = self.inner.write().await;
        let now = Utc::now();
        let markdown = payload
            .markdown
            .unwrap_or_else(|| "# New note\n\nStart writing.".into());
        let author_id = state.user.id;
        let current_used = storage_used_bytes_for_user(&state, &self.storage, author_id);
        let projected_used = current_used.saturating_add(markdown.len() as u64);
        enforce_storage_limit(&state, author_id, current_used, projected_used, true)?;
        let note_id = forced_id.unwrap_or_else(Uuid::new_v4);
        let note = Note {
            id: note_id,
            object_id: default_note_object_id(note_id),
            namespace: default_user_namespace(author_id),
            visibility: payload.visibility.unwrap_or(ResourceVisibility::Private),
            shared_user_ids: Vec::new(),
            title: payload.title,
            folder: payload.folder.unwrap_or_else(|| "Inbox".into()),
            markdown: String::new(),
            rendered_html: String::new(),
            document: payload
                .document
                .unwrap_or_else(|| note_document_from_markdown(&markdown, &author_id.to_string())),
            revision: 1,
            created_at: now,
            updated_at: now,
            author_id,
            last_editor_id: author_id,
            forked_from_note_id: None,
            conflict_tag: None,
            deleted_at: None,
            purge_at: None,
        };
        let mut note = note;
        note.markdown = markdown_from_note_document(&note.document);
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.create_note(&note).await?;
        }
        state.notes.insert(note.id, note.clone());
        self.storage
            .sync_note_markdown(None, note.id, &note.title, &note.folder, &note.markdown)
            .await?;
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(note)
    }

    pub async fn update_note(&self, id: Uuid, payload: UpdateNoteRequest) -> AppResult<Note> {
        let mut state = self.inner.write().await;
        let user_id = state.user.id;
        let current_used = storage_used_bytes_for_user(&state, &self.storage, user_id);
        let existing_note = state.notes.get(&id).cloned().ok_or(AppError::NotFound)?;
        if existing_note.deleted_at.is_some() {
            return Err(AppError::BadRequest("note has been deleted and can be restored from admin".into()));
        }
        if payload.revision != existing_note.revision {
            return Err(AppError::BadRequest("revision mismatch".into()));
        }
        let previous_title = existing_note.title.clone();
        let previous_folder = existing_note.folder.clone();
        let old_size = existing_note.markdown.len() as u64;
        let next_title = payload.title.unwrap_or(existing_note.title.clone());
        let next_folder = payload.folder.unwrap_or(existing_note.folder.clone());
        let next_document = payload
            .document
            .clone()
            .or_else(|| payload.markdown.as_ref().map(|markdown| note_document_from_markdown(markdown, &user_id.to_string())))
            .unwrap_or_else(|| existing_note.document.clone());
        let next_markdown = markdown_from_note_document(&next_document);
        let projected_used = current_used
            .saturating_sub(old_size)
            .saturating_add(next_markdown.len() as u64);
        enforce_storage_limit(&state, user_id, current_used, projected_used, false)?;
        let note = state.notes.get_mut(&id).ok_or(AppError::NotFound)?;
        note.title = next_title;
        note.folder = next_folder;
        note.markdown = next_markdown;
        note.document = next_document;
        if let Some(visibility) = payload.visibility {
            note.visibility = visibility;
        }
        note.revision += 1;
        note.updated_at = Utc::now();
        note.last_editor_id = user_id;
        let note_snapshot = note.clone();
        let expected_revision = payload.revision;
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence
                .update_note(&note_snapshot, expected_revision)
                .await?;
        }
        self.storage
            .sync_note_markdown(
                Some((&previous_folder, &previous_title)),
                note_snapshot.id,
                &note_snapshot.title,
                &note_snapshot.folder,
                &note_snapshot.markdown,
            )
            .await?;
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(note_snapshot)
    }

    pub async fn apply_note_operation_batch(
        &self,
        id: Uuid,
        batch: NoteDocumentOperationBatch,
    ) -> AppResult<Note> {
        let mut state = self.inner.write().await;
        let user_id = state.user.id;
        let existing_note = state.notes.get(&id).cloned().ok_or(AppError::NotFound)?;
        if existing_note.deleted_at.is_some() {
            return Err(AppError::BadRequest("note has been deleted and can be restored from admin".into()));
        }
        let actor_id = if batch.actor_id.trim().is_empty() {
            user_id.to_string()
        } else {
            batch.actor_id.clone()
        };

        if should_fork_note_document(&existing_note.document, &batch, &actor_id) {
            let local_document = apply_operations_to_document(
                &existing_note.document,
                &batch,
                &actor_id,
            )?;
            let forked_ids = create_note_conflict_forks(&mut state, &existing_note, &local_document, &actor_id);
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                for fork_id in &forked_ids {
                    if let Some(note) = state.notes.get(fork_id) {
                        self.persistence.create_note(note).await?;
                    }
                }
            }
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Err(AppError::BadRequest(format!(
                "note forked due to conflicting block edits:{}",
                forked_ids
                    .iter()
                    .map(Uuid::to_string)
                    .collect::<Vec<_>>()
                    .join(",")
            )));
        }

        let mut next_document = apply_operations_to_document(&existing_note.document, &batch, &actor_id)?;
        if next_document.last_operation_id.trim().is_empty() {
            next_document.last_operation_id = batch.operation_id.clone();
        }
        let next_markdown = markdown_from_note_document(&next_document);
        let current_used = storage_used_bytes_for_user(&state, &self.storage, user_id);
        let projected_used = current_used
            .saturating_sub(existing_note.markdown.len() as u64)
            .saturating_add(next_markdown.len() as u64);
        enforce_storage_limit(&state, user_id, current_used, projected_used, false)?;

        let note = state.notes.get_mut(&id).ok_or(AppError::NotFound)?;
        let previous_title = note.title.clone();
        let previous_folder = note.folder.clone();
        for operation in &batch.operations {
            match operation {
                NoteOperation::SetTitle { title } => note.title = title.clone(),
                NoteOperation::SetFolder { folder } => note.folder = folder.clone(),
                _ => {}
            }
        }
        note.document = next_document;
        note.markdown = next_markdown;
        note.revision += 1;
        note.updated_at = Utc::now();
        note.last_editor_id = user_id;
        let note_snapshot = note.clone();
        let expected_revision = existing_note.revision;
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.update_note(&note_snapshot, expected_revision).await?;
        }
        self.storage
            .sync_note_markdown(
                Some((&previous_folder, &previous_title)),
                note_snapshot.id,
                &note_snapshot.title,
                &note_snapshot.folder,
                &note_snapshot.markdown,
            )
            .await?;
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(note_snapshot)
    }

    pub async fn delete_note(&self, id: Uuid) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let note = state.notes.get_mut(&id).ok_or(AppError::NotFound)?;
        if note.deleted_at.is_some() {
            return Ok(());
        }
        let (deleted_at, purge_at) = deletion_window();
        note.deleted_at = Some(deleted_at);
        note.purge_at = Some(purge_at);
        note.updated_at = deleted_at;
        note.revision += 1;
        let note_snapshot = note.clone();
        state.sync_tombstones.push(SyncTombstone {
            entity: SyncEntityKind::Notes,
            id: note_snapshot.id.to_string(),
            deleted_at,
        });
        append_audit_entry(
            &mut state,
            "api.notes",
            "delete_note",
            "note",
            note_snapshot.id.to_string(),
            note_snapshot.title.clone(),
            serde_json::json!({ "path": note_relative_path_for_move(&note_snapshot), "purge_at": purge_at }),
        );
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.update_note(&note_snapshot, note_snapshot.revision - 1).await?;
        }
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(())
    }

    pub async fn list_diagrams(&self) -> Vec<Diagram> {
        if let Ok(Some(diagrams)) = self.persistence.list_diagrams().await {
            let mut state = self.inner.write().await;
            state.diagrams = diagrams
                .iter()
                .cloned()
                .map(|diagram| (diagram.id, diagram))
                .collect();
            return diagrams
                .into_iter()
                .filter(|diagram| is_diagram_active(diagram))
                .collect();
        }
        self.inner
            .read()
            .await
            .diagrams
            .values()
            .filter(|diagram| is_diagram_active(diagram))
            .cloned()
            .collect()
    }

    pub async fn create_diagram(&self, payload: CreateDiagramRequest) -> AppResult<Diagram> {
        self.create_diagram_with_id(payload, None).await
    }

    async fn create_diagram_with_id(
        &self,
        payload: CreateDiagramRequest,
        forced_id: Option<Uuid>,
    ) -> AppResult<Diagram> {
        let mut state = self.inner.write().await;
        let now = Utc::now();
        let xml = payload
            .xml
            .unwrap_or_else(|| "<mxfile><diagram name=\"Page-1\"></diagram></mxfile>".into());
        let author_id = state.user.id;
        let current_used = storage_used_bytes_for_user(&state, &self.storage, author_id);
        let projected_used = current_used.saturating_add(xml.len() as u64);
        enforce_storage_limit(&state, author_id, current_used, projected_used, true)?;
        let diagram = Diagram {
            id: forced_id.unwrap_or_else(Uuid::new_v4),
            title: payload.title,
            xml,
            revision: 1,
            created_at: now,
            updated_at: now,
            author_id,
            last_editor_id: author_id,
            deleted_at: None,
            purge_at: None,
        };
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.create_diagram(&diagram).await?;
        }
        state.diagrams.insert(diagram.id, diagram.clone());
        self.storage
            .sync_diagram_xml(None, &diagram.title, diagram.id, &diagram.xml)
            .await?;
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(diagram)
    }

    pub async fn update_diagram(
        &self,
        id: Uuid,
        payload: UpdateDiagramRequest,
    ) -> AppResult<Diagram> {
        let mut state = self.inner.write().await;
        let user_id = state.user.id;
        let current_used = storage_used_bytes_for_user(&state, &self.storage, user_id);
        let existing_diagram = state.diagrams.get(&id).cloned().ok_or(AppError::NotFound)?;
        if existing_diagram.deleted_at.is_some() {
            return Err(AppError::BadRequest("diagram has been deleted and can be restored from admin".into()));
        }
        if payload.revision != existing_diagram.revision {
            return Err(AppError::BadRequest("revision mismatch".into()));
        }
        let previous_title = existing_diagram.title.clone();
        let old_size = existing_diagram.xml.len() as u64;
        let next_title = payload.title.unwrap_or(existing_diagram.title.clone());
        let next_xml = payload.xml;
        let projected_used = current_used
            .saturating_sub(old_size)
            .saturating_add(next_xml.len() as u64);
        enforce_storage_limit(&state, user_id, current_used, projected_used, false)?;
        let diagram = state.diagrams.get_mut(&id).ok_or(AppError::NotFound)?;
        diagram.title = next_title;
        diagram.xml = next_xml;
        diagram.revision += 1;
        diagram.updated_at = Utc::now();
        diagram.last_editor_id = user_id;
        let diagram_snapshot = diagram.clone();
        let expected_revision = payload.revision;
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence
                .update_diagram(&diagram_snapshot, expected_revision)
                .await?;
        }
        self.storage
            .sync_diagram_xml(
                Some(&previous_title),
                &diagram_snapshot.title,
                diagram_snapshot.id,
                &diagram_snapshot.xml,
            )
            .await?;
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(diagram_snapshot)
    }

    pub async fn list_memos(&self) -> Vec<VoiceMemo> {
        self.inner
            .read()
            .await
            .memos
            .values()
            .filter(|memo| is_voice_memo_active(memo))
            .cloned()
            .map(|mut memo| {
                ensure_voice_memo_foundation(&mut memo);
                memo
            })
            .collect()
    }

    pub async fn get_memo(&self, memo_id: Uuid) -> AppResult<VoiceMemo> {
        self.inner
            .read()
            .await
            .memos
            .get(&memo_id)
            .cloned()
            .filter(|memo| memo.deleted_at.is_none())
            .ok_or(AppError::NotFound)
    }

    pub async fn create_voice_memo(
        &self,
        title: String,
        bytes: Vec<u8>,
        browser_transcript: Option<String>,
    ) -> AppResult<VoiceMemo> {
        let owner_id = self.inner.read().await.user.id;
        {
            let state = self.inner.read().await;
            let transcript_bytes = browser_transcript
                .as_ref()
                .map(|value| value.trim().len() as u64)
                .unwrap_or(0);
            let projected_used = storage_used_bytes_for_user(&state, &self.storage, owner_id)
                .saturating_add(bytes.len() as u64)
                .saturating_add(transcript_bytes);
            let current_used = storage_used_bytes_for_user(&state, &self.storage, owner_id);
            enforce_storage_limit(&state, owner_id, current_used, projected_used, true)?;
        }
        let path = self.storage.save_voice_blob(&bytes).await?;
        let now = Utc::now();
        let transcript = browser_transcript
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let completed = transcript.is_some();
        let memo = VoiceMemo {
            id: Uuid::new_v4(),
            object_id: String::new(),
            namespace: default_user_namespace(owner_id),
            visibility: ResourceVisibility::Private,
            shared_user_ids: Vec::new(),
            title,
            audio_path: path,
            transcript: transcript.clone(),
            transcript_segments: transcript
                .clone()
                .map(|text| {
                    vec![TranscriptSegment {
                        start_ms: 0,
                        end_ms: 0,
                        text,
                    }]
                })
                .unwrap_or_default(),
            transcript_tags: derive_transcript_tags(transcript.as_deref().unwrap_or_default()),
            topic_summary: transcript.as_ref().map(|text| summarize_transcript_topic(text)),
            source_channels: vec!["microphone".into()],
            status: if completed {
                JobStatus::Completed
            } else {
                JobStatus::Pending
            },
            model: if completed {
                "browser-speech".into()
            } else {
                self.config.transcription_model.clone()
            },
            device: if completed {
                "browser".into()
            } else {
                resolved_device(&self.config)
            },
            created_at: now,
            updated_at: now,
            failure_reason: None,
            owner_id,
            deleted_at: None,
            purge_at: None,
        };
        let mut memo = memo;
        ensure_voice_memo_foundation(&mut memo);
        let job = TranscriptionJob {
            id: Uuid::new_v4(),
            memo_id: memo.id,
            status: if completed {
                JobStatus::Completed
            } else {
                JobStatus::Pending
            },
            failure_reason: None,
        };
        let mut state = self.inner.write().await;
        state.jobs.insert(job.id, job);
        state.memos.insert(memo.id, memo.clone());
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(memo)
    }

    pub async fn update_voice_memo(
        &self,
        memo_id: Uuid,
        payload: crate::models::UpdateVoiceMemoRequest,
    ) -> AppResult<VoiceMemo> {
        let mut state = self.inner.write().await;
        let memo = state.memos.get_mut(&memo_id).ok_or(AppError::NotFound)?;
        if memo.deleted_at.is_some() {
            return Err(AppError::BadRequest("voice memo has been deleted and can be restored from admin".into()));
        }
        memo.title = payload.title.trim().to_string();
        if memo.title.is_empty() {
            return Err(AppError::BadRequest("title cannot be empty".into()));
        }
        memo.updated_at = Utc::now();
        let memo_snapshot = memo.clone();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(memo_snapshot)
    }

    pub async fn memo_job(&self, memo_id: Uuid) -> AppResult<TranscriptionJob> {
        let state = self.inner.read().await;
        state
            .jobs
            .values()
            .find(|job| job.memo_id == memo_id)
            .cloned()
            .ok_or(AppError::NotFound)
    }

    pub async fn retry_job(&self, memo_id: Uuid) -> AppResult<TranscriptionJob> {
        let mut state = self.inner.write().await;
        if state.memos.get(&memo_id).and_then(|memo| memo.deleted_at).is_some() {
            return Err(AppError::BadRequest("voice memo has been deleted and can be restored from admin".into()));
        }
        let updated_job = state
            .jobs
            .values_mut()
            .find(|job| job.memo_id == memo_id)
            .ok_or(AppError::NotFound)?;
        updated_job.status = JobStatus::Pending;
        updated_job.failure_reason = None;
        let job_snapshot = updated_job.clone();
        if let Some(memo) = state.memos.get_mut(&memo_id) {
            memo.status = JobStatus::Pending;
            memo.failure_reason = None;
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(job_snapshot)
    }

    pub async fn delete_voice_memo(&self, memo_id: Uuid) -> AppResult<()> {
        let memo = self.get_memo(memo_id).await?;
        self.delete_voice_path(&memo.audio_path).await
    }

    pub async fn mark_transcription_running(&self, memo_id: Uuid) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let memo = state.memos.get_mut(&memo_id).ok_or(AppError::NotFound)?;
        if memo.deleted_at.is_some() {
            return Err(AppError::BadRequest("voice memo has been deleted and can be restored from admin".into()));
        }
        memo.status = JobStatus::Running;
        memo.updated_at = Utc::now();
        if let Some(job) = state.jobs.values_mut().find(|job| job.memo_id == memo_id) {
            job.status = JobStatus::Running;
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await
    }

    pub async fn finish_transcription(
        &self,
        memo_id: Uuid,
        transcript: Option<String>,
    ) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let memo = state.memos.get_mut(&memo_id).ok_or(AppError::NotFound)?;
        if memo.deleted_at.is_some() {
            return Err(AppError::BadRequest("voice memo has been deleted and can be restored from admin".into()));
        }
        memo.status = JobStatus::Completed;
        memo.updated_at = Utc::now();
        let transcript_text = transcript.unwrap_or_else(|| {
            format!(
                "Transcribed {} using model {} on {}.",
                memo.title, memo.model, memo.device
            )
        });
        memo.transcript = Some(transcript_text.clone());
        memo.transcript_segments = vec![TranscriptSegment {
            start_ms: 0,
            end_ms: 3500,
            text: transcript_text,
        }];
        if let Some(job) = state.jobs.values_mut().find(|job| job.memo_id == memo_id) {
            job.status = JobStatus::Completed;
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await
    }

    pub async fn fail_transcription(&self, memo_id: Uuid, reason: String) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let memo = state.memos.get_mut(&memo_id).ok_or(AppError::NotFound)?;
        if memo.deleted_at.is_some() {
            return Err(AppError::BadRequest("voice memo has been deleted and can be restored from admin".into()));
        }
        memo.status = JobStatus::Failed;
        memo.updated_at = Utc::now();
        memo.failure_reason = Some(reason.clone());
        if let Some(job) = state.jobs.values_mut().find(|job| job.memo_id == memo_id) {
            job.status = JobStatus::Failed;
            job.failure_reason = Some(reason);
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await
    }

    pub async fn list_rooms(&self, user: &UserProfile) -> Vec<Room> {
        if let Ok(Some(rooms)) = self.persistence.list_rooms().await {
            let mut state = self.inner.write().await;
            state.rooms = rooms.iter().cloned().map(|room| (room.id, room)).collect();
            return state
                .rooms
                .values()
                .filter(|room| {
                    room.kind == crate::models::RoomKind::Channel
                        || room.participant_ids.contains(&user.id)
                })
                .map(|room| Self::decorate_room(&state, room))
                .collect();
        }
        let state = self.inner.read().await;
        state
            .rooms
            .values()
            .filter(|room| {
                room.kind == crate::models::RoomKind::Channel
                    || room.participant_ids.contains(&user.id)
            })
            .map(|room| Self::decorate_room(&state, room))
            .collect()
    }

    pub async fn list_coms_participants(&self, user: &UserProfile) -> Vec<UserProfile> {
        let state = self.inner.read().await;
        state
            .users
            .values()
            .filter(|stored| stored.profile.id != user.id)
            .map(|stored| stored.profile.clone())
            .collect()
    }

    pub async fn create_room(
        &self,
        payload: CreateRoomRequest,
        creator: &UserProfile,
    ) -> AppResult<Room> {
        let mut state = self.inner.write().await;
        let mut participant_ids = payload.participant_ids;
        if payload.kind == crate::models::RoomKind::Direct {
            participant_ids.push(creator.id);
            participant_ids.sort();
            participant_ids.dedup();
            if participant_ids.len() < 2 {
                return Err(AppError::BadRequest(
                    "direct threads require at least one other participant".into(),
                ));
            }
        } else {
            participant_ids.clear();
        }
        let room = Room {
            id: Uuid::new_v4(),
            name: payload.name,
            folder: payload.folder.unwrap_or_default(),
            kind: payload.kind,
            created_at: Utc::now(),
            participant_ids,
            participant_labels: Vec::new(),
        };
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.create_room(&room).await?;
        }
        state.rooms.insert(room.id, room.clone());
        let snapshot = state.clone();
        let decorated = Self::decorate_room(&snapshot, &room);
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(decorated)
    }

    pub async fn update_room(
        &self,
        room_id: Uuid,
        payload: crate::models::UpdateRoomRequest,
        actor: &UserProfile,
    ) -> AppResult<Room> {
        let mut state = self.inner.write().await;
        let room = state.rooms.get_mut(&room_id).ok_or(AppError::NotFound)?;
        if room.kind == crate::models::RoomKind::Direct && !room.participant_ids.contains(&actor.id)
        {
            return Err(AppError::Unauthorized);
        }
        room.name = payload.name;
        if let Some(folder) = payload.folder {
            room.folder = folder;
        }
        if room.kind == crate::models::RoomKind::Direct {
            if let Some(mut participant_ids) = payload.participant_ids {
                participant_ids.push(actor.id);
                participant_ids.sort();
                participant_ids.dedup();
                if participant_ids.len() < 2 {
                    return Err(AppError::BadRequest(
                        "direct threads require at least one other participant".into(),
                    ));
                }
                room.participant_ids = participant_ids;
            }
        }
        let room = room.clone();
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.update_room(&room).await?;
        }
        let snapshot = state.clone();
        let decorated = Self::decorate_room(&snapshot, &room);
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(decorated)
    }

    pub async fn delete_room(&self, room_id: Uuid, actor: &UserProfile) -> AppResult<()> {
        let mut state = self.inner.write().await;
        let room = state.rooms.get(&room_id).ok_or(AppError::NotFound)?.clone();
        if room.kind == crate::models::RoomKind::Direct && !room.participant_ids.contains(&actor.id)
        {
            return Err(AppError::Unauthorized);
        }
        state.rooms.remove(&room_id);
        state.messages.remove(&room_id);
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.delete_room(room_id).await?;
        }
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(())
    }

    pub async fn list_messages(
        &self,
        room_id: Uuid,
        user: &UserProfile,
    ) -> AppResult<Vec<Message>> {
        {
            let state = self.inner.read().await;
            let room = state.rooms.get(&room_id).ok_or(AppError::NotFound)?;
            if room.kind == crate::models::RoomKind::Direct
                && !room.participant_ids.contains(&user.id)
            {
                return Err(AppError::Unauthorized);
            }
        }
        let users = self.inner.read().await.users.clone();
        if let Ok(Some(messages)) = self.persistence.list_messages(room_id, &users).await {
            let mut state = self.inner.write().await;
            state.messages.insert(room_id, messages.clone());
            return Ok(messages);
        }
        Ok(self
            .inner
            .read()
            .await
            .messages
            .get(&room_id)
            .cloned()
            .unwrap_or_default())
    }

    pub async fn create_message(
        &self,
        room_id: Uuid,
        payload: CreateMessageRequest,
        author: UserProfile,
    ) -> AppResult<Message> {
        self.create_message_with_id(room_id, payload, author, None).await
    }

    async fn create_message_with_id(
        &self,
        room_id: Uuid,
        payload: CreateMessageRequest,
        author: UserProfile,
        forced_id: Option<Uuid>,
    ) -> AppResult<Message> {
        let mut state = self.inner.write().await;
        let Some(room) = state.rooms.get(&room_id) else {
            return Err(AppError::NotFound);
        };
        if room.kind == crate::models::RoomKind::Direct
            && !room.participant_ids.contains(&author.id)
        {
            return Err(AppError::Unauthorized);
        }
        let message = Message {
            id: forced_id.unwrap_or_else(Uuid::new_v4),
            room_id,
            author,
            body: payload.body,
            created_at: Utc::now(),
            reactions: Vec::new(),
        };
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence.create_message(&message).await?;
        }
        state
            .messages
            .entry(room_id)
            .or_default()
            .push(message.clone());
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(message)
    }

    pub async fn toggle_message_reaction(
        &self,
        room_id: Uuid,
        message_id: Uuid,
        payload: ToggleMessageReactionRequest,
        user: UserProfile,
    ) -> AppResult<Message> {
        let emoji = payload.emoji.trim();
        if emoji.is_empty() || emoji.chars().count() > 8 {
            return Err(AppError::BadRequest("invalid emoji".into()));
        }

        let mut state = self.inner.write().await;
        let Some(room) = state.rooms.get(&room_id) else {
            return Err(AppError::NotFound);
        };
        if room.kind == crate::models::RoomKind::Direct
            && !room.participant_ids.contains(&user.id)
        {
            return Err(AppError::Unauthorized);
        }
        let Some(room_messages) = state.messages.get_mut(&room_id) else {
            return Err(AppError::NotFound);
        };
        let Some(message) = room_messages.iter_mut().find(|message| message.id == message_id) else {
            return Err(AppError::NotFound);
        };

        if let Some(reaction) = message
            .reactions
            .iter_mut()
            .find(|reaction| reaction.emoji == emoji)
        {
            if let Some(index) = reaction.user_ids.iter().position(|id| *id == user.id) {
                reaction.user_ids.remove(index);
            } else {
                reaction.user_ids.push(user.id);
            }
        } else {
            message.reactions.push(MessageReaction {
                emoji: emoji.to_string(),
                user_ids: vec![user.id],
            });
        }

        message.reactions.retain(|reaction| !reaction.user_ids.is_empty());
        message
            .reactions
            .sort_by(|left, right| left.emoji.cmp(&right.emoji));

        let updated = message.clone();
        let uses_postgres = self.persistence.uses_postgres();
        if uses_postgres {
            self.persistence
                .update_message_reactions(message_id, &updated.reactions)
                .await?;
        }
        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(updated)
    }

    pub async fn list_files(&self) -> AppResult<Vec<crate::models::FileNode>> {
        let drive = self.storage.list_drive_tree().await?;
        let state = self.inner.read().await;
        let mut notes = state
            .notes
            .values()
            .filter(|note| is_note_active(note))
            .cloned()
            .collect::<Vec<_>>();
        for note in &mut notes {
            ensure_note_foundation(note);
        }
        let mut memos = state
            .memos
            .values()
            .filter(|memo| is_voice_memo_active(memo))
            .cloned()
            .collect::<Vec<_>>();
        for memo in &mut memos {
            ensure_voice_memo_foundation(memo);
        }
        let diagrams = state
            .diagrams
            .values()
            .filter(|diagram| is_diagram_active(diagram))
            .cloned()
            .collect::<Vec<_>>();
        Ok(vec![
            build_notes_projection(&notes),
            build_diagrams_projection(&diagrams),
            build_voice_projection(&memos),
            drive,
        ])
    }

    pub async fn create_managed_folder(&self, path: String) -> AppResult<crate::models::FileNode> {
        let node = self.storage.create_managed_folder(&path).await?;
        Ok(node)
    }

    pub async fn upload_drive_file(
        &self,
        path: String,
        filename: String,
        bytes: Vec<u8>,
    ) -> AppResult<crate::models::FileNode> {
        self.storage.save_drive_file(&path, &filename, &bytes).await
    }

    pub async fn move_drive_path(
        &self,
        source_path: String,
        destination_dir: String,
    ) -> AppResult<crate::models::FileNode> {
        if source_path == "drive" || source_path.starts_with("drive/") {
            return self
                .storage
                .move_drive_path(&source_path, &destination_dir)
                .await;
        }
        if source_path == "notes" || source_path.starts_with("notes/") {
            return self.move_note_path(&source_path, &destination_dir).await;
        }
        if source_path == "diagrams" || source_path.starts_with("diagrams/") {
            return self.move_diagram_path(&source_path, &destination_dir).await;
        }
        if source_path == "voice" || source_path.starts_with("voice/") {
            return self.move_voice_path(&source_path, &destination_dir).await;
        }
        Err(AppError::BadRequest(
            "managed moves must be under drive/, notes/, diagrams/, or voice/".into(),
        ))
    }

    pub async fn delete_managed_path(&self, path: String) -> AppResult<()> {
        if path == "drive" || path.starts_with("drive/") {
            return self.delete_drive_path(&path).await;
        }
        if path == "notes" || path.starts_with("notes/") {
            return self.delete_note_path(&path).await;
        }
        if path == "diagrams" || path.starts_with("diagrams/") {
            return self.delete_diagram_path(&path).await;
        }
        if path == "voice" || path.starts_with("voice/") {
            return self.delete_voice_path(&path).await;
        }
        Err(AppError::BadRequest(
            "managed deletes must be under drive/, notes/, diagrams/, or voice/".into(),
        ))
    }

    pub async fn rename_managed_path(
        &self,
        path: String,
        new_name: String,
    ) -> AppResult<crate::models::FileNode> {
        if path == "drive" || path.starts_with("drive/") {
            return self.storage.rename_drive_path(&path, &new_name).await;
        }
        if path == "notes" || path.starts_with("notes/") {
            return self.rename_note_path(&path, &new_name).await;
        }
        if path == "diagrams" || path.starts_with("diagrams/") {
            return self.rename_diagram_path(&path, &new_name).await;
        }
        if path == "voice" || path.starts_with("voice/") {
            return self.rename_voice_managed_path(&path, &new_name).await;
        }
        Err(AppError::BadRequest(
            "managed renames must be under drive/, notes/, diagrams/, or voice/".into(),
        ))
    }

    async fn persist_snapshot(&self, snapshot: StateData) -> AppResult<()> {
        let bytes = serde_json::to_vec_pretty(&snapshot)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        self.persistence.save_snapshot(&bytes).await
    }

    async fn sync_note_files(&self) -> AppResult<()> {
        self.storage.reset_managed_root("notes").await?;
        let notes = self
            .inner
            .read()
            .await
            .notes
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for note in notes {
            self.storage
                .sync_note_markdown(None, note.id, &note.title, &note.folder, &note.markdown)
                .await?;
        }
        Ok(())
    }

    async fn sync_diagram_files(&self) -> AppResult<()> {
        self.storage.reset_managed_root("diagrams").await?;
        let diagrams = self
            .inner
            .read()
            .await
            .diagrams
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for diagram in diagrams {
            self.storage
                .sync_diagram_xml(None, &diagram.title, diagram.id, &diagram.xml)
                .await?;
        }
        Ok(())
    }

    async fn move_note_path(
        &self,
        source_path: &str,
        destination_dir: &str,
    ) -> AppResult<crate::models::FileNode> {
        if !(destination_dir == "notes" || destination_dir.starts_with("notes/")) {
            return Err(AppError::BadRequest(
                "note moves must stay within notes/".into(),
            ));
        }
        if source_path == "notes" {
            return Err(AppError::BadRequest("cannot move notes root".into()));
        }
        if destination_dir == source_path || destination_dir.starts_with(&format!("{source_path}/"))
        {
            return Err(AppError::BadRequest(
                "cannot move an item into itself".into(),
            ));
        }

        if source_path.ends_with(".md") {
            let note_id = extract_note_id(source_path)?;
            let mut state = self.inner.write().await;
            let user_id = state.user.id;
            let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
            let previous_folder = note.folder.clone();
            let previous_title = note.title.clone();
            note.folder = notes_folder_from_destination(destination_dir, None);
            note.revision += 1;
            note.updated_at = Utc::now();
            note.last_editor_id = user_id;
            let moved = note.clone();
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence
                    .update_note(&moved, moved.revision - 1)
                    .await?;
            }
            self.storage
                .sync_note_markdown(
                    Some((&previous_folder, &previous_title)),
                    moved.id,
                    &moved.title,
                    &moved.folder,
                    &moved.markdown,
                )
                .await?;
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Ok(crate::models::FileNode {
                name: format!("{}-{}.md", slug_for_note_title(&moved.title), moved.id),
                path: note_relative_path_for_move(&moved),
                kind: crate::models::FileNodeKind::File,
                object_id: Some(moved.object_id.clone()),
                object_kind: Some(crate::models::WorkspaceObjectKind::NoteDocument),
                namespace: Some(moved.namespace.clone()),
                visibility: Some(moved.visibility),
                resource_key: Some(format!("note:{}", moved.id)),
                size_bytes: Some(moved.markdown.len() as u64),
                created_at: Some(moved.created_at.to_rfc3339()),
                updated_at: Some(moved.updated_at.to_rfc3339()),
                children: Vec::new(),
            });
        }

        let source_folder = notes_folder_from_source(source_path)?;
        let moved_folder_name = source_folder
            .split('/')
            .filter(|part| !part.is_empty())
            .next_back()
            .ok_or_else(|| AppError::BadRequest("invalid note folder".into()))?
            .to_string();
        let destination_folder =
            notes_folder_from_destination(destination_dir, Some(&moved_folder_name));

        let mut state = self.inner.write().await;
        let uses_postgres = self.persistence.uses_postgres();
        let user_id = state.user.id;
        let matching_ids = state
            .notes
            .values()
            .filter(|note| {
                note.folder == source_folder
                    || note.folder.starts_with(&format!("{source_folder}/"))
            })
            .map(|note| note.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        for note_id in matching_ids {
            let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
            let previous_folder = note.folder.clone();
            let previous_title = note.title.clone();
            note.folder = note.folder.replacen(&source_folder, &destination_folder, 1);
            note.revision += 1;
            note.updated_at = Utc::now();
            note.last_editor_id = user_id;
            let moved = note.clone();
            if uses_postgres {
                self.persistence
                    .update_note(&moved, moved.revision - 1)
                    .await?;
            }
            self.storage
                .sync_note_markdown(
                    Some((&previous_folder, &previous_title)),
                    moved.id,
                    &moved.title,
                    &moved.folder,
                    &moved.markdown,
                )
                .await?;
        }

        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }

        Ok(crate::models::FileNode {
            name: moved_folder_name,
            path: format!("notes/{}", destination_folder.replace('\\', "/")),
            kind: crate::models::FileNodeKind::Directory,
            object_id: None,
            object_kind: Some(crate::models::WorkspaceObjectKind::Folder),
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: None,
            created_at: None,
            updated_at: None,
            children: Vec::new(),
        })
    }

    async fn delete_note_path(&self, source_path: &str) -> AppResult<()> {
        if source_path == "notes" {
            return Err(AppError::BadRequest("cannot delete notes root".into()));
        }

        if source_path.ends_with(".md") {
            let note_id = extract_note_id(source_path)?;
            return self.delete_note(note_id).await;
        }

        let source_folder = notes_folder_from_source(source_path)?;
        let mut state = self.inner.write().await;
        let matching_ids = state
            .notes
            .values()
            .filter(|note| {
                note.folder == source_folder
                    || note.folder.starts_with(&format!("{source_folder}/"))
            })
            .map(|note| note.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        let uses_postgres = self.persistence.uses_postgres();
        for note_id in matching_ids {
            let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
            if note.deleted_at.is_some() {
                continue;
            }
            let (deleted_at, purge_at) = deletion_window();
            note.deleted_at = Some(deleted_at);
            note.purge_at = Some(purge_at);
            note.updated_at = deleted_at;
            note.revision += 1;
            let note_snapshot = note.clone();
            state.sync_tombstones.push(SyncTombstone {
                entity: SyncEntityKind::Notes,
                id: note_snapshot.id.to_string(),
                deleted_at,
            });
            if uses_postgres {
                self.persistence
                    .update_note(&note_snapshot, note_snapshot.revision - 1)
                    .await?;
            }
        }

        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(())
    }

    async fn rename_note_path(
        &self,
        source_path: &str,
        new_name: &str,
    ) -> AppResult<crate::models::FileNode> {
        if source_path == "notes" {
            return Err(AppError::BadRequest("cannot rename notes root".into()));
        }

        if source_path.ends_with(".md") {
            let note_id = extract_note_id(source_path)?;
            let mut state = self.inner.write().await;
            let user_id = state.user.id;
            let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
            let previous_folder = note.folder.clone();
            let previous_title = note.title.clone();
            note.title = new_name.trim().to_string();
            note.revision += 1;
            note.updated_at = Utc::now();
            note.last_editor_id = user_id;
            let renamed = note.clone();
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence
                    .update_note(&renamed, renamed.revision - 1)
                    .await?;
            }
            self.storage
                .sync_note_markdown(
                    Some((&previous_folder, &previous_title)),
                    renamed.id,
                    &renamed.title,
                    &renamed.folder,
                    &renamed.markdown,
                )
                .await?;
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Ok(crate::models::FileNode {
                name: format!("{}-{}.md", slug_for_note_title(&renamed.title), renamed.id),
                path: note_relative_path_for_move(&renamed),
                kind: crate::models::FileNodeKind::File,
                object_id: Some(renamed.object_id.clone()),
                object_kind: Some(crate::models::WorkspaceObjectKind::NoteDocument),
                namespace: Some(renamed.namespace.clone()),
                visibility: Some(renamed.visibility),
                resource_key: Some(format!("note:{}", renamed.id)),
                size_bytes: Some(renamed.markdown.len() as u64),
                created_at: Some(renamed.created_at.to_rfc3339()),
                updated_at: Some(renamed.updated_at.to_rfc3339()),
                children: Vec::new(),
            });
        }

        let source_folder = notes_folder_from_source(source_path)?;
        let destination_folder = notes_folder_with_replaced_leaf(&source_folder, new_name);
        let moved_folder_name = destination_folder
            .split('/')
            .filter(|part| !part.is_empty())
            .next_back()
            .ok_or_else(|| AppError::BadRequest("invalid note folder".into()))?
            .to_string();

        let mut state = self.inner.write().await;
        let uses_postgres = self.persistence.uses_postgres();
        let user_id = state.user.id;
        let matching_ids = state
            .notes
            .values()
            .filter(|note| {
                note.folder == source_folder
                    || note.folder.starts_with(&format!("{source_folder}/"))
            })
            .map(|note| note.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        for note_id in matching_ids {
            let note = state.notes.get_mut(&note_id).ok_or(AppError::NotFound)?;
            let previous_folder = note.folder.clone();
            let previous_title = note.title.clone();
            note.folder = note.folder.replacen(&source_folder, &destination_folder, 1);
            note.revision += 1;
            note.updated_at = Utc::now();
            note.last_editor_id = user_id;
            let renamed = note.clone();
            if uses_postgres {
                self.persistence
                    .update_note(&renamed, renamed.revision - 1)
                    .await?;
            }
            self.storage
                .sync_note_markdown(
                    Some((&previous_folder, &previous_title)),
                    renamed.id,
                    &renamed.title,
                    &renamed.folder,
                    &renamed.markdown,
                )
                .await?;
        }

        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }

        Ok(crate::models::FileNode {
            name: moved_folder_name,
            path: format!("notes/{}", destination_folder.replace('\\', "/")),
            kind: crate::models::FileNodeKind::Directory,
            object_id: None,
            object_kind: Some(crate::models::WorkspaceObjectKind::Folder),
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: None,
            created_at: None,
            updated_at: None,
            children: Vec::new(),
        })
    }

    async fn move_diagram_path(
        &self,
        source_path: &str,
        destination_dir: &str,
    ) -> AppResult<crate::models::FileNode> {
        if !(destination_dir == "diagrams" || destination_dir.starts_with("diagrams/")) {
            return Err(AppError::BadRequest(
                "diagram moves must stay within diagrams/".into(),
            ));
        }
        if source_path == "diagrams" {
            return Err(AppError::BadRequest("cannot move diagrams root".into()));
        }
        if destination_dir == source_path || destination_dir.starts_with(&format!("{source_path}/"))
        {
            return Err(AppError::BadRequest(
                "cannot move an item into itself".into(),
            ));
        }

        if source_path.ends_with(".drawio") {
            let diagram_id = extract_diagram_id(source_path)?;
            let mut state = self.inner.write().await;
            let diagram = state
                .diagrams
                .get_mut(&diagram_id)
                .ok_or(AppError::NotFound)?;
            let previous_title = diagram.title.clone();
            diagram.title = diagram_title_from_destination(
                destination_dir,
                diagram_display_name(&diagram.title),
            );
            diagram.revision += 1;
            diagram.updated_at = Utc::now();
            let moved = diagram.clone();
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence
                    .update_diagram(&moved, moved.revision - 1)
                    .await?;
            }
            self.storage
                .sync_diagram_xml(Some(&previous_title), &moved.title, moved.id, &moved.xml)
                .await?;
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Ok(crate::models::FileNode {
                name: format!(
                    "{}-{}.drawio",
                    slug_for_diagram_title(&moved.title),
                    moved.id
                ),
                path: diagram_relative_path_for_move(&moved),
                kind: crate::models::FileNodeKind::File,
                object_id: Some(format!("diagram:{}", moved.id)),
                object_kind: Some(crate::models::WorkspaceObjectKind::Diagram),
                namespace: Some(default_user_namespace(moved.author_id)),
                visibility: Some(crate::models::ResourceVisibility::Private),
                resource_key: Some(format!("diagram:{}", moved.id)),
                size_bytes: Some(moved.xml.len() as u64),
                created_at: Some(moved.created_at.to_rfc3339()),
                updated_at: Some(moved.updated_at.to_rfc3339()),
                children: Vec::new(),
            });
        }

        let source_folder = diagrams_folder_from_source(source_path)?;
        let moved_folder_name = source_folder
            .split('/')
            .filter(|part| !part.is_empty())
            .next_back()
            .ok_or_else(|| AppError::BadRequest("invalid diagram folder".into()))?
            .to_string();
        let destination_folder =
            diagrams_folder_from_destination(destination_dir, Some(&moved_folder_name));

        let mut state = self.inner.write().await;
        let uses_postgres = self.persistence.uses_postgres();
        let matching_ids = state
            .diagrams
            .values()
            .filter(|diagram| {
                let folder = normalize_diagram_folder_path(&diagram.title);
                folder == source_folder || folder.starts_with(&format!("{source_folder}/"))
            })
            .map(|diagram| diagram.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        for diagram_id in matching_ids {
            let diagram = state
                .diagrams
                .get_mut(&diagram_id)
                .ok_or(AppError::NotFound)?;
            let previous_title = diagram.title.clone();
            diagram.title = diagram
                .title
                .replacen(&source_folder, &destination_folder, 1);
            diagram.revision += 1;
            diagram.updated_at = Utc::now();
            let moved = diagram.clone();
            if uses_postgres {
                self.persistence
                    .update_diagram(&moved, moved.revision - 1)
                    .await?;
            }
            self.storage
                .sync_diagram_xml(Some(&previous_title), &moved.title, moved.id, &moved.xml)
                .await?;
        }

        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }

        Ok(crate::models::FileNode {
            name: moved_folder_name,
            path: format!("diagrams/{}", destination_folder.replace('\\', "/")),
            kind: crate::models::FileNodeKind::Directory,
            object_id: None,
            object_kind: Some(crate::models::WorkspaceObjectKind::Folder),
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: None,
            created_at: None,
            updated_at: None,
            children: Vec::new(),
        })
    }

    async fn delete_diagram_path(&self, source_path: &str) -> AppResult<()> {
        if source_path == "diagrams" {
            return Err(AppError::BadRequest("cannot delete diagrams root".into()));
        }

        if source_path.ends_with(".drawio") {
            let diagram_id = extract_diagram_id(source_path)?;
            let mut state = self.inner.write().await;
            let diagram = state
                .diagrams
                .get_mut(&diagram_id)
                .ok_or(AppError::NotFound)?;
            if diagram.deleted_at.is_some() {
                return Ok(());
            }
            let (deleted_at, purge_at) = deletion_window();
            diagram.deleted_at = Some(deleted_at);
            diagram.purge_at = Some(purge_at);
            diagram.updated_at = deleted_at;
            diagram.revision += 1;
            let diagram_snapshot = diagram.clone();
            state.sync_tombstones.push(SyncTombstone {
                entity: SyncEntityKind::Diagrams,
                id: diagram_snapshot.id.to_string(),
                deleted_at,
            });
            append_audit_entry(
                &mut state,
                "api.files",
                "delete_diagram",
                "diagram",
                diagram_snapshot.id.to_string(),
                diagram_display_name(&diagram_snapshot.title),
                serde_json::json!({ "path": source_path, "purge_at": purge_at }),
            );
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence
                    .update_diagram(&diagram_snapshot, diagram_snapshot.revision - 1)
                    .await?;
            }
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Ok(());
        }

        let source_folder = diagrams_folder_from_source(source_path)?;
        let mut state = self.inner.write().await;
        let matching_ids = state
            .diagrams
            .values()
            .filter(|diagram| {
                let folder = normalize_diagram_folder_path(&diagram.title);
                folder == source_folder || folder.starts_with(&format!("{source_folder}/"))
            })
            .map(|diagram| diagram.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        let uses_postgres = self.persistence.uses_postgres();
        for diagram_id in matching_ids {
            let diagram = state
                .diagrams
                .get_mut(&diagram_id)
                .ok_or(AppError::NotFound)?;
            if diagram.deleted_at.is_some() {
                continue;
            }
            let (deleted_at, purge_at) = deletion_window();
            diagram.deleted_at = Some(deleted_at);
            diagram.purge_at = Some(purge_at);
            diagram.updated_at = deleted_at;
            diagram.revision += 1;
            let diagram_snapshot = diagram.clone();
            state.sync_tombstones.push(SyncTombstone {
                entity: SyncEntityKind::Diagrams,
                id: diagram_snapshot.id.to_string(),
                deleted_at,
            });
            append_audit_entry(
                &mut state,
                "api.files",
                "delete_diagram",
                "diagram",
                diagram_snapshot.id.to_string(),
                diagram_display_name(&diagram_snapshot.title),
                serde_json::json!({ "path": diagram_relative_path_for_move(&diagram_snapshot), "purge_at": purge_at }),
            );
            if uses_postgres {
                self.persistence
                    .update_diagram(&diagram_snapshot, diagram_snapshot.revision - 1)
                    .await?;
            }
        }

        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }
        Ok(())
    }

    async fn rename_diagram_path(
        &self,
        source_path: &str,
        new_name: &str,
    ) -> AppResult<crate::models::FileNode> {
        if source_path == "diagrams" {
            return Err(AppError::BadRequest("cannot rename diagrams root".into()));
        }

        if source_path.ends_with(".drawio") {
            let diagram_id = extract_diagram_id(source_path)?;
            let mut state = self.inner.write().await;
            let diagram = state
                .diagrams
                .get_mut(&diagram_id)
                .ok_or(AppError::NotFound)?;
            let previous_title = diagram.title.clone();
            diagram.title = rename_diagram_leaf(&diagram.title, new_name);
            diagram.revision += 1;
            diagram.updated_at = Utc::now();
            let renamed = diagram.clone();
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence
                    .update_diagram(&renamed, renamed.revision - 1)
                    .await?;
            }
            self.storage
                .sync_diagram_xml(
                    Some(&previous_title),
                    &renamed.title,
                    renamed.id,
                    &renamed.xml,
                )
                .await?;
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Ok(crate::models::FileNode {
                name: format!(
                    "{}-{}.drawio",
                    slug_for_diagram_title(&renamed.title),
                    renamed.id
                ),
                path: diagram_relative_path_for_move(&renamed),
                kind: crate::models::FileNodeKind::File,
                object_id: Some(format!("diagram:{}", renamed.id)),
                object_kind: Some(crate::models::WorkspaceObjectKind::Diagram),
                namespace: Some(default_user_namespace(renamed.author_id)),
                visibility: Some(crate::models::ResourceVisibility::Private),
                resource_key: Some(format!("diagram:{}", renamed.id)),
                size_bytes: Some(renamed.xml.len() as u64),
                created_at: Some(renamed.created_at.to_rfc3339()),
                updated_at: Some(renamed.updated_at.to_rfc3339()),
                children: Vec::new(),
            });
        }

        let source_folder = diagrams_folder_from_source(source_path)?;
        let destination_folder = diagrams_folder_with_replaced_leaf(&source_folder, new_name);
        let moved_folder_name = destination_folder
            .split('/')
            .filter(|part| !part.is_empty())
            .next_back()
            .ok_or_else(|| AppError::BadRequest("invalid diagram folder".into()))?
            .to_string();

        let mut state = self.inner.write().await;
        let uses_postgres = self.persistence.uses_postgres();
        let matching_ids = state
            .diagrams
            .values()
            .filter(|diagram| {
                let folder = normalize_diagram_folder_path(&diagram.title);
                folder == source_folder || folder.starts_with(&format!("{source_folder}/"))
            })
            .map(|diagram| diagram.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        for diagram_id in matching_ids {
            let diagram = state
                .diagrams
                .get_mut(&diagram_id)
                .ok_or(AppError::NotFound)?;
            let previous_title = diagram.title.clone();
            diagram.title = diagram
                .title
                .replacen(&source_folder, &destination_folder, 1);
            diagram.revision += 1;
            diagram.updated_at = Utc::now();
            let renamed = diagram.clone();
            if uses_postgres {
                self.persistence
                    .update_diagram(&renamed, renamed.revision - 1)
                    .await?;
            }
            self.storage
                .sync_diagram_xml(
                    Some(&previous_title),
                    &renamed.title,
                    renamed.id,
                    &renamed.xml,
                )
                .await?;
        }

        let snapshot = state.clone();
        drop(state);
        if !uses_postgres {
            self.persist_snapshot(snapshot).await?;
        }

        Ok(crate::models::FileNode {
            name: moved_folder_name,
            path: format!("diagrams/{}", destination_folder.replace('\\', "/")),
            kind: crate::models::FileNodeKind::Directory,
            object_id: None,
            object_kind: Some(crate::models::WorkspaceObjectKind::Folder),
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: None,
            created_at: None,
            updated_at: None,
            children: Vec::new(),
        })
    }

    async fn move_voice_path(
        &self,
        source_path: &str,
        destination_dir: &str,
    ) -> AppResult<crate::models::FileNode> {
        if !(destination_dir == "voice" || destination_dir.starts_with("voice/")) {
            return Err(AppError::BadRequest(
                "voice moves must stay within voice/".into(),
            ));
        }
        let moved = self
            .storage
            .move_voice_path(source_path, destination_dir)
            .await?;
        let mut state = self.inner.write().await;
        let affected = state
            .memos
            .values_mut()
            .find(|memo| memo.audio_path == source_path)
            .ok_or(AppError::NotFound)?;
        affected.audio_path = moved.path.clone();
        affected.updated_at = Utc::now();
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(moved)
    }

    async fn rename_voice_managed_path(
        &self,
        source_path: &str,
        new_name: &str,
    ) -> AppResult<crate::models::FileNode> {
        let renamed = self
            .storage
            .rename_voice_path(source_path, new_name)
            .await?;
        let mut state = self.inner.write().await;
        let mut found = false;
        for memo in state.memos.values_mut() {
            if memo.audio_path == source_path
                || memo.audio_path.starts_with(&format!("{source_path}/"))
            {
                memo.audio_path = memo.audio_path.replacen(source_path, &renamed.path, 1);
                memo.updated_at = Utc::now();
                found = true;
            }
        }
        if !found {
            return Err(AppError::NotFound);
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(renamed)
    }

    async fn delete_voice_path(&self, source_path: &str) -> AppResult<()> {
        if source_path == "voice" {
            return Err(AppError::BadRequest("cannot delete voice root".into()));
        }

        let mut state = self.inner.write().await;
        let matching_ids = state
            .memos
            .values()
            .filter(|memo| {
                memo.audio_path == source_path
                    || memo.audio_path.starts_with(&format!("{source_path}/"))
            })
            .map(|memo| memo.id)
            .collect::<Vec<_>>();
        if matching_ids.is_empty() {
            return Err(AppError::NotFound);
        }

        for memo_id in matching_ids {
            let (memo_key, deleted_at, purge_at, audit_title, audit_path) = {
                let memo = state.memos.get_mut(&memo_id).ok_or(AppError::NotFound)?;
                if memo.deleted_at.is_some() {
                    continue;
                }
                let (deleted_at, purge_at) = deletion_window();
                let memo_key = memo.id.to_string();
                let audit_title = memo.title.clone();
                let audit_path = memo.audio_path.clone();
                memo.deleted_at = Some(deleted_at);
                memo.purge_at = Some(purge_at);
                memo.updated_at = deleted_at;
                (memo_key, deleted_at, purge_at, audit_title, audit_path)
            };
            state.sync_tombstones.push(SyncTombstone {
                entity: SyncEntityKind::VoiceMemos,
                id: memo_key.clone(),
                deleted_at,
            });
            append_audit_entry(
                &mut state,
                "api.files",
                "delete_voice_memo",
                "voice_memo",
                memo_key,
                audit_title,
                serde_json::json!({ "path": audit_path, "purge_at": purge_at }),
            );
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(())
    }

    async fn delete_drive_path(&self, source_path: &str) -> AppResult<()> {
        if source_path == "drive" {
            return Err(AppError::BadRequest("cannot delete drive root".into()));
        }
        let mut state = self.inner.write().await;
        let deleted_id = Uuid::new_v4().to_string();
        let (backup_path, is_dir) = self
            .storage
            .move_drive_path_to_trash(source_path, &deleted_id)
            .await?;
        let (deleted_at, purge_at) = deletion_window();
        let label = source_path
            .split('/')
            .filter(|part| !part.is_empty())
            .next_back()
            .unwrap_or("drive item")
            .to_string();
        state.deleted_drive_items.insert(
            deleted_id.clone(),
            DeletedDriveItem {
                id: deleted_id.clone(),
                original_path: source_path.to_string(),
                backup_path: backup_path.clone(),
                label: label.clone(),
                is_dir,
                deleted_at,
                purge_at,
            },
        );
        append_audit_entry(
            &mut state,
            "api.files",
            "delete_drive_path",
            "drive_path",
            deleted_id,
            label,
            serde_json::json!({ "path": source_path, "backup_path": backup_path, "purge_at": purge_at, "is_dir": is_dir }),
        );
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await
    }
}

fn extract_note_id(path: &str) -> AppResult<Uuid> {
    let filename = path
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .ok_or_else(|| AppError::BadRequest("invalid note path".into()))?;
    let stem = filename
        .strip_suffix(".md")
        .ok_or_else(|| AppError::BadRequest("invalid note file".into()))?;
    let id = stem
        .rsplit('-')
        .take(5)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("-");
    Uuid::parse_str(&id).map_err(|_| AppError::BadRequest("invalid note file id".into()))
}

fn extract_diagram_id(path: &str) -> AppResult<Uuid> {
    let filename = path
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .ok_or_else(|| AppError::BadRequest("invalid diagram path".into()))?;
    let stem = filename
        .strip_suffix(".drawio")
        .ok_or_else(|| AppError::BadRequest("invalid diagram file".into()))?;
    let id = stem
        .rsplit('-')
        .take(5)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("-");
    Uuid::parse_str(&id).map_err(|_| AppError::BadRequest("invalid diagram file id".into()))
}

fn notes_folder_from_source(source_path: &str) -> AppResult<String> {
    let parts = source_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.first().copied() != Some("notes") || parts.len() < 2 {
        return Err(AppError::BadRequest("invalid note folder path".into()));
    }
    Ok(parts[1..].join("/"))
}

fn diagrams_folder_from_source(source_path: &str) -> AppResult<String> {
    let parts = source_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.first().copied() != Some("diagrams") || parts.len() < 2 {
        return Err(AppError::BadRequest("invalid diagram folder path".into()));
    }
    Ok(parts[1..].join("/"))
}

fn notes_folder_from_destination(destination_dir: &str, append: Option<&str>) -> String {
    let mut parts = destination_dir
        .split('/')
        .filter(|part| !part.is_empty())
        .skip(1)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if let Some(segment) = append {
        parts.push(segment.to_string());
    }
    if parts.is_empty() {
        "Inbox".into()
    } else {
        parts.join("/")
    }
}

fn diagrams_folder_from_destination(destination_dir: &str, append: Option<&str>) -> String {
    let mut parts = destination_dir
        .split('/')
        .filter(|part| !part.is_empty())
        .skip(1)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if let Some(segment) = append {
        parts.push(sanitize_diagram_segment(segment));
    }
    parts.join("/")
}

fn notes_folder_with_replaced_leaf(folder: &str, new_name: &str) -> String {
    let sanitized = sanitize_note_folder_segment(new_name);
    let mut parts = folder
        .split('/')
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return sanitized;
    }
    parts.pop();
    parts.push(sanitized);
    parts.join("/")
}

fn diagrams_folder_with_replaced_leaf(folder: &str, new_name: &str) -> String {
    let sanitized = sanitize_diagram_segment(new_name);
    let mut parts = folder
        .split('/')
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return sanitized;
    }
    parts.pop();
    parts.push(sanitized);
    parts.join("/")
}

fn sanitize_note_folder_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || matches!(char, '-' | '_' | ' ') {
                char
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() {
        "Inbox".into()
    } else {
        sanitized
    }
}

fn sanitize_diagram_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || matches!(char, '-' | '_' | ' ') {
                char
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() {
        "Untitled".into()
    } else {
        sanitized
    }
}

fn slug_for_note_title(title: &str) -> String {
    let slug = title
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() {
                char.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() { "note".into() } else { slug }
}

fn slug_for_diagram_title(title: &str) -> String {
    let display = diagram_display_name(title);
    let slug = display
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() {
                char.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        "diagram".into()
    } else {
        slug
    }
}

fn validate_password(password: &str) -> AppResult<()> {
    if password.trim().len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }
    Ok(())
}

fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes())
        .map_err(|err| AppError::Internal(err.to_string()))?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| AppError::Internal(err.to_string()))
        .map(|hash| hash.to_string())
}

fn normalize_user_roles(primary: String, roles: &[String]) -> Vec<String> {
    let mut normalized = roles.to_vec();
    if normalized.is_empty() {
        normalized.push(primary);
    }
    if !normalized.iter().any(|role| role == "member")
        && !normalized.iter().any(|role| role == "admin")
    {
        normalized.push("member".into());
    }
    let mut ordered = Vec::new();
    if normalized.iter().any(|role| role == "member") {
        ordered.push("member".into());
    }
    if normalized.iter().any(|role| role == "admin") {
        ordered.push("admin".into());
    }
    for role in normalized {
        if !ordered.contains(&role) {
            ordered.push(role);
        }
    }
    if ordered.is_empty() {
        ordered.push("member".into());
    }
    ordered
}

fn primary_user_role(roles: &[String]) -> String {
    if roles.iter().any(|role| role == "admin") {
        "admin".into()
    } else {
        roles.first().cloned().unwrap_or_else(|| "member".into())
    }
}

fn storage_used_bytes_for_user(state: &StateData, storage: &BlobStorage, user_id: Uuid) -> u64 {
    let avatar_bytes = state
        .users
        .get(&user_id)
        .and_then(|user| user.profile.avatar_path.as_ref())
        .map(|avatar_path| {
            std::fs::metadata(storage.resolve(avatar_path))
                .map(|metadata| metadata.len())
                .unwrap_or(0)
        })
        .unwrap_or(0);
    let notes_bytes = state
        .notes
        .values()
        .filter(|note| note.author_id == user_id)
        .map(|note| note.markdown.len() as u64)
        .sum::<u64>();
    let diagrams_bytes = state
        .diagrams
        .values()
        .filter(|diagram| diagram.author_id == user_id)
        .map(|diagram| diagram.xml.len() as u64)
        .sum::<u64>();
    let voice_bytes = state
        .memos
        .values()
        .filter(|memo| memo.owner_id == user_id)
        .map(|memo| {
            std::fs::metadata(storage.resolve(&memo.audio_path))
                .map(|metadata| metadata.len())
                .unwrap_or(0)
                .saturating_add(
                    memo.transcript
                        .as_ref()
                        .map(|value| value.len() as u64)
                        .unwrap_or(0),
                )
        })
        .sum::<u64>();
    avatar_bytes
        .saturating_add(notes_bytes)
        .saturating_add(diagrams_bytes)
        .saturating_add(voice_bytes)
}

fn normalize_avatar_content_type(content_type: Option<&str>) -> Option<&'static str> {
    match content_type?.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("image/png"),
        "image/jpeg" | "image/jpg" => Some("image/jpeg"),
        "image/webp" => Some("image/webp"),
        "image/gif" => Some("image/gif"),
        _ => None,
    }
}

fn avatar_extension_from_content_type(content_type: &str) -> Option<&'static str> {
    match content_type {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        _ => None,
    }
}

fn avatar_extension_from_filename(filename: &str) -> Option<String> {
    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())?
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "gif" => Some(extension),
        _ => None,
    }
}

fn effective_storage_limit_mb(state: &StateData, user_id: Uuid) -> u64 {
    state
        .users
        .get(&user_id)
        .map(|user| {
            if user.storage_limit_mb == 0 {
                state.admin_settings.per_user_storage_mb
            } else {
                user.storage_limit_mb
            }
        })
        .unwrap_or(state.admin_settings.per_user_storage_mb)
}

fn calendar_resource_key(connection_id: Uuid) -> String {
    format!("calendar:{connection_id}")
}

fn calendar_connection_visible_to_user(
    state: &StateData,
    connection: &CalendarConnection,
    user_id: Uuid,
) -> bool {
    if connection.owner_id == user_id {
        return true;
    }
    match state
        .resource_shares
        .get(&calendar_resource_key(connection.id))
        .map(|share| &share.visibility)
    {
        Some(ResourceVisibility::Org) => true,
        Some(ResourceVisibility::Users) => state
            .resource_shares
            .get(&calendar_resource_key(connection.id))
            .map(|share| share.user_ids.contains(&user_id))
            .unwrap_or(false),
        _ => false,
    }
}

fn normalize_calendar_feed_url(raw_url: &str) -> AppResult<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("missing calendar feed url".into()));
    }
    let normalized = if let Some(rest) = trimmed.strip_prefix("webcal://") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    };
    let parsed = reqwest::Url::parse(&normalized)
        .map_err(|_| AppError::BadRequest("calendar feed url is invalid".into()))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        _ => Err(AppError::BadRequest(
            "calendar feed url must use http, https, or webcal".into(),
        )),
    }
}

async fn ensure_google_calendar_access_token(
    settings: &AdminSettings,
    connection: &mut CalendarConnection,
) -> AppResult<String> {
    let token_is_fresh = connection
        .token_expires_at
        .map(|expires_at| expires_at > Utc::now() + Duration::minutes(1))
        .unwrap_or(false);
    if token_is_fresh {
        if let Some(access_token) = connection.access_token.clone() {
            return Ok(access_token);
        }
    }

    let refresh_token = connection
        .refresh_token
        .clone()
        .ok_or_else(|| AppError::BadRequest("Google calendar connection is missing a refresh token".into()))?;

    let token_response = Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("client_id", settings.google_calendar_client_id.as_str()),
            ("client_secret", settings.google_calendar_client_secret.as_str()),
        ])
        .send()
        .await
        .map_err(|error| AppError::BadRequest(format!("Google token refresh failed: {error}")))?;

    if !token_response.status().is_success() {
        let body = token_response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Google token refresh failed: {}",
            body.trim()
        )));
    }

    let token_json: Value = token_response
        .json()
        .await
        .map_err(|error| AppError::BadRequest(format!("Google token refresh response was invalid: {error}")))?;
    let access_token = token_json
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Google token refresh missing access_token".into()))?
        .to_string();
    let expires_in = token_json
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(3600)
        .max(60);
    connection.access_token = Some(access_token.clone());
    connection.token_expires_at = Some(Utc::now() + Duration::seconds(expires_in));
    if let Some(next_refresh_token) = token_json.get("refresh_token").and_then(Value::as_str) {
        connection.refresh_token = Some(next_refresh_token.to_string());
    }
    Ok(access_token)
}

async fn fetch_google_calendar_events(
    connection: &CalendarConnection,
    access_token: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> AppResult<Vec<CalendarEvent>> {
    let url = reqwest::Url::parse_with_params(
        &format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            urlencoding::encode(&connection.calendar_id)
        ),
        &[
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
            ("timeMin", &start.to_rfc3339()),
            ("timeMax", &end.to_rfc3339()),
        ],
    )
    .map_err(|err| AppError::Internal(err.to_string()))?;

    let response = Client::new()
        .get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| AppError::BadRequest(format!("Google calendar fetch failed: {error}")))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Google calendar fetch failed: {}",
            body.trim()
        )));
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|error| AppError::BadRequest(format!("Google calendar response was invalid: {error}")))?;

    let mut events = payload
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id").and_then(Value::as_str)?.to_string();
            let title = item
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("Untitled event")
                .to_string();
            let description = item
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let location = item
                .get("location")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let source_url = item.get("htmlLink").and_then(Value::as_str).unwrap_or_default().to_string();
            let organizer = item
                .get("organizer")
                .and_then(|value| value.get("email"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let updated_at = item
                .get("updated")
                .and_then(Value::as_str)
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&Utc));
            let (start_at, all_day) = parse_google_event_time(item.get("start")?)?;
            let (end_at, _) = parse_google_event_time(item.get("end")?)?;
            Some(CalendarEvent {
                id,
                connection_id: connection.id,
                title,
                description,
                location,
                start_at,
                end_at,
                all_day,
                source_url,
                organizer,
                updated_at,
            })
        })
        .collect::<Vec<_>>();
    events.sort_by(|left, right| (left.start_at, left.title.to_lowercase()).cmp(&(right.start_at, right.title.to_lowercase())));
    Ok(events)
}

fn parse_google_event_time(value: &Value) -> Option<(DateTime<Utc>, bool)> {
    if let Some(date_time) = value.get("dateTime").and_then(Value::as_str) {
        return DateTime::parse_from_rfc3339(date_time)
            .ok()
            .map(|value| (value.with_timezone(&Utc), false));
    }
    let date = value.get("date").and_then(Value::as_str)?;
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    Some((Utc.from_utc_datetime(&parsed.and_hms_opt(0, 0, 0)?), true))
}

async fn fetch_ics_calendar_events_from_url(
    url: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> AppResult<Vec<CalendarEvent>> {
    let body = Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| AppError::BadRequest(format!("Calendar feed fetch failed: {error}")))?
        .text()
        .await
        .map_err(|error| AppError::BadRequest(format!("Calendar feed body could not be read: {error}")))?;

    parse_ics_calendar_events(body.as_bytes(), start, end)
}

fn parse_ics_calendar_events(
    bytes: &[u8],
    range_start: DateTime<Utc>,
    range_end: DateTime<Utc>,
) -> AppResult<Vec<CalendarEvent>> {
    let reader = BufReader::new(bytes);
    let parser = IcalParser::new(reader);
    let mut events = Vec::new();

    for calendar in parser {
        let calendar = calendar.map_err(|error| AppError::BadRequest(format!("Calendar feed parse failed: {error}")))?;
        for event in calendar.events {
            let mut id = String::new();
            let mut title = "Untitled event".to_string();
            let mut description = String::new();
            let mut location = String::new();
            let mut source_url = String::new();
            let mut organizer = String::new();
            let mut updated_at = None;
            let mut start_at = None;
            let mut end_at = None;
            let mut all_day = false;

            for property in event.properties {
                let name = property.name.to_uppercase();
                let value = property.value.unwrap_or_default();
                match name.as_str() {
                    "UID" => id = value,
                    "SUMMARY" => title = value,
                    "DESCRIPTION" => description = value,
                    "LOCATION" => location = value,
                    "URL" => source_url = value,
                    "ORGANIZER" => organizer = value.replace("mailto:", ""),
                    "LAST-MODIFIED" => {
                        updated_at = parse_ics_datetime(&value)
                            .ok()
                            .map(|(timestamp, _)| timestamp)
                    }
                    "DTSTART" => {
                        if let Ok((timestamp, date_only)) = parse_ics_datetime(&value) {
                            start_at = Some(timestamp);
                            all_day = date_only;
                        }
                    }
                    "DTEND" => {
                        if let Ok((timestamp, _)) = parse_ics_datetime(&value) {
                            end_at = Some(timestamp);
                        }
                    }
                    _ => {}
                }
            }

            let Some(start_at) = start_at else {
                continue;
            };
            let end_at = end_at.unwrap_or_else(|| {
                if all_day {
                    start_at + Duration::days(1)
                } else {
                    start_at + Duration::hours(1)
                }
            });
            if end_at < range_start || start_at > range_end {
                continue;
            }
            events.push(CalendarEvent {
                id: if id.is_empty() { format!("ics-{}", events.len() + 1) } else { id },
                connection_id: Uuid::nil(),
                title,
                description,
                location,
                start_at,
                end_at,
                all_day,
                source_url,
                organizer,
                updated_at,
            });
        }
    }

    events.sort_by(|left, right| (left.start_at, left.title.to_lowercase()).cmp(&(right.start_at, right.title.to_lowercase())));
    Ok(events)
}

fn parse_ics_datetime(value: &str) -> AppResult<(DateTime<Utc>, bool)> {
    let trimmed = value.trim();
    if trimmed.len() == 8 {
        let parsed = NaiveDate::parse_from_str(trimmed, "%Y%m%d")
            .map_err(|error| AppError::BadRequest(format!("Unsupported calendar date: {error}")))?;
        let datetime = parsed
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| AppError::BadRequest("Invalid calendar date".into()))?;
        return Ok((Utc.from_utc_datetime(&datetime), true));
    }
    if let Ok(parsed) = DateTime::parse_from_str(trimmed, "%Y%m%dT%H%M%S%z") {
        return Ok((parsed.with_timezone(&Utc), false));
    }
    if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y%m%dT%H%M%S") {
        return Ok((Utc.from_utc_datetime(&parsed), false));
    }
    Err(AppError::BadRequest("Unsupported calendar timestamp".into()))
}

fn enforce_storage_limit(
    state: &StateData,
    user_id: Uuid,
    current_used: u64,
    projected_used: u64,
    creating: bool,
) -> AppResult<()> {
    let limit_mb = effective_storage_limit_mb(state, user_id);
    if limit_mb == 0 {
        return Ok(());
    }
    let limit_bytes = limit_mb.saturating_mul(1024 * 1024);
    if creating {
        if projected_used > limit_bytes {
            return Err(AppError::BadRequest("storage limit exceeded".into()));
        }
        return Ok(());
    }
    if current_used > limit_bytes && projected_used > current_used {
        return Err(AppError::BadRequest(
            "storage limit exceeded; reduce usage before expanding content".into(),
        ));
    }
    if current_used <= limit_bytes && projected_used > limit_bytes {
        return Err(AppError::BadRequest("storage limit exceeded".into()));
    }
    Ok(())
}

fn note_relative_path_for_move(note: &Note) -> String {
    let folder = if note.folder.trim().is_empty() {
        "Inbox"
    } else {
        note.folder.as_str()
    };
    format!(
        "notes/{folder}/{}-{}.md",
        slug_for_note_title(&note.title),
        note.id
    )
}

fn normalize_diagram_title_path(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn normalize_diagram_folder_path(title: &str) -> String {
    let normalized = normalize_diagram_title_path(title);
    let parts = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.len() <= 1 {
        String::new()
    } else {
        parts[..parts.len() - 1].join("/")
    }
}

fn diagram_display_name(title: &str) -> String {
    let normalized = normalize_diagram_title_path(title);
    normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or("Untitled")
        .to_string()
}

fn diagram_title_from_destination(destination_dir: &str, display_name: String) -> String {
    let folder = diagrams_folder_from_destination(destination_dir, None);
    let leaf = sanitize_diagram_segment(&display_name);
    if folder.is_empty() {
        leaf
    } else {
        format!("{folder}/{leaf}")
    }
}

fn rename_diagram_leaf(title: &str, new_name: &str) -> String {
    let sanitized = sanitize_diagram_segment(new_name);
    let folder = normalize_diagram_folder_path(title);
    if folder.is_empty() {
        sanitized
    } else {
        format!("{folder}/{sanitized}")
    }
}

fn diagram_relative_path_for_move(diagram: &Diagram) -> String {
    let normalized = normalize_diagram_title_path(&diagram.title);
    let parts = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let (folder, leaf) = if parts.is_empty() {
        (String::new(), "Untitled".to_string())
    } else {
        (
            if parts.len() > 1 {
                parts[..parts.len() - 1].join("/")
            } else {
                String::new()
            },
            parts[parts.len() - 1].to_string(),
        )
    };
    if folder.is_empty() {
        format!(
            "diagrams/{}-{}.drawio",
            slug_for_diagram_title(&leaf),
            diagram.id
        )
    } else {
        format!(
            "diagrams/{folder}/{}-{}.drawio",
            slug_for_diagram_title(&leaf),
            diagram.id
        )
    }
}

fn resolved_device(config: &Config) -> String {
    if config.transcription_device != "auto" {
        return config.transcription_device.clone();
    }

    if std::env::var("CUDA_VISIBLE_DEVICES")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        return "cuda".into();
    }

    if cfg!(target_os = "macos") {
        return "metal".into();
    }

    "cpu".into()
}

fn seed_state(config: &Config) -> AppResult<StateData> {
    let password_hash = hash_password(&config.bootstrap_password)?;

    let user = UserProfile {
        id: Uuid::new_v4(),
        username: "admin".into(),
        email: config.bootstrap_email.clone(),
        display_name: "Homelab Admin".into(),
        avatar_path: None,
        avatar_content_type: None,
        role: "admin".into(),
        roles: vec!["admin".into()],
        must_change_password: false,
    };
    let stored_user = StoredUser {
        profile: user.clone(),
        password_hash: password_hash.clone(),
        linked_oidc_subject: None,
        storage_limit_mb: 0,
        tool_scope: Default::default(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let general_room = Room {
        id: Uuid::new_v4(),
        name: "general".into(),
        folder: String::new(),
        kind: crate::models::RoomKind::Channel,
        created_at: Utc::now(),
        participant_ids: Vec::new(),
        participant_labels: Vec::new(),
    };

    let welcome_note_id = Uuid::new_v4();
    let welcome_note_markdown = "# Welcome to Home Suite Home\n\nThis homelab workspace is seeded with:\n\n- live Markdown notes\n- draw.io-compatible diagram storage\n- voice memo ingestion and transcript jobs\n- chat rooms and call signaling\n- durable JSON state snapshots across restarts\n\nEdit this note and save it from the browser.".to_string();
    let welcome_note = Note {
        id: welcome_note_id,
        object_id: default_note_object_id(welcome_note_id),
        namespace: default_user_namespace(user.id),
        visibility: ResourceVisibility::Private,
        shared_user_ids: Vec::new(),
        title: "Welcome to Home Suite Home".into(),
        folder: "Getting Started".into(),
        markdown: welcome_note_markdown.clone(),
        rendered_html: String::new(),
        document: note_document_from_markdown(&welcome_note_markdown, &user.id.to_string()),
        forked_from_note_id: None,
        conflict_tag: None,
        revision: 1,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        author_id: user.id,
        last_editor_id: user.id,
        deleted_at: None,
        purge_at: None,
    };

    let starter_diagram = Diagram {
        id: Uuid::new_v4(),
        title: "Homelab Flow".into(),
        xml: "<mxfile><diagram name=\"Page-1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Home Suite Home\" style=\"rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"220\" y=\"90\" width=\"160\" height=\"60\" as=\"geometry\"/></mxCell><mxCell id=\"3\" value=\"Authentik\" style=\"rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"40\" y=\"90\" width=\"120\" height=\"60\" as=\"geometry\"/></mxCell><mxCell id=\"4\" value=\"Snapshots\" style=\"shape=cylinder;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#fff2cc;strokeColor=#d6b656;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"430\" y=\"90\" width=\"90\" height=\"80\" as=\"geometry\"/></mxCell><mxCell id=\"5\" value=\"OIDC\" edge=\"1\" parent=\"1\" source=\"2\" target=\"3\"><mxGeometry relative=\"1\" as=\"geometry\"/></mxCell><mxCell id=\"6\" value=\"state\" edge=\"1\" parent=\"1\" source=\"2\" target=\"4\"><mxGeometry relative=\"1\" as=\"geometry\"/></mxCell></root></mxGraphModel></diagram></mxfile>".into(),
        revision: 1,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        author_id: user.id,
        last_editor_id: user.id,
        deleted_at: None,
        purge_at: None,
    };

    let welcome_message = Message {
        id: Uuid::new_v4(),
        room_id: general_room.id,
        author: user.clone(),
        body: "Home Suite Home is up. Use this room for internal chat and signaling tests.".into(),
        created_at: Utc::now(),
        reactions: Vec::new(),
    };

    let default_calendar_id = Uuid::new_v4();
    let default_calendar = CalendarConnection {
        id: default_calendar_id,
        owner_id: user.id,
        owner_display_name: user.display_name.clone(),
        title: "Home".into(),
        provider: crate::models::CalendarProvider::Sweet,
        external_id: String::new(),
        calendar_id: format!("sweet:{}", default_calendar_id),
        account_label: "Home Suite Home calendar".into(),
        access_token: None,
        refresh_token: None,
        token_expires_at: None,
        ics_url: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    Ok(StateData {
        users: HashMap::from([(stored_user.profile.id, stored_user)]),
        admin_settings: AdminSettings {
            oidc_providers: if !config.authentik_issuer.trim().is_empty()
                && !config.authentik_client_id.trim().is_empty()
            {
                vec![OidcProviderSettings {
                    id: "authentik".into(),
                    title: "Authentik".into(),
                    enabled: true,
                    provider: "authentik".into(),
                    issuer: config.authentik_issuer.trim().trim_end_matches('/').to_string(),
                    client_id: config.authentik_client_id.clone(),
                    client_secret: config.authentik_client_secret.clone(),
                    authorization_url: String::new(),
                    token_url: String::new(),
                    userinfo_url: String::new(),
                    scopes: "openid profile email".into(),
                }]
            } else {
                Vec::new()
            },
            active_oidc_provider_id: if !config.authentik_issuer.trim().is_empty()
                && !config.authentik_client_id.trim().is_empty()
            {
                "authentik".into()
            } else {
                String::new()
            },
            oidc: OidcProviderSettings {
                id: "authentik".into(),
                title: "Authentik".into(),
                enabled: !config.authentik_issuer.trim().is_empty()
                    && !config.authentik_client_id.trim().is_empty(),
                provider: "authentik".into(),
                issuer: config.authentik_issuer.trim().trim_end_matches('/').to_string(),
                client_id: config.authentik_client_id.clone(),
                client_secret: config.authentik_client_secret.clone(),
                authorization_url: String::new(),
                token_url: String::new(),
                userinfo_url: String::new(),
                scopes: "openid profile email".into(),
            },
            ..AdminSettings::default()
        },
        user,
        password_hash,
        notes: HashMap::from([(welcome_note.id, welcome_note)]),
        diagrams: HashMap::from([(starter_diagram.id, starter_diagram)]),
        memos: HashMap::new(),
        jobs: HashMap::new(),
        rooms: HashMap::from([(general_room.id, general_room)]),
        messages: HashMap::from([(welcome_message.room_id, vec![welcome_message])]),
        calendar_connections: HashMap::from([(default_calendar.id, default_calendar.clone())]),
        calendar_events: HashMap::from([(default_calendar.id, Vec::new())]),
        tasks: HashMap::new(),
        resource_shares: HashMap::new(),
        sync_tombstones: Vec::new(),
        pending_credential_changes: HashMap::new(),
        note_operations: HashMap::new(),
        note_sessions: HashMap::new(),
        note_conflicts: HashMap::new(),
        deleted_drive_items: HashMap::new(),
        audit_log: Vec::new(),
    })
}

fn effective_oidc_settings(config: &Config, settings: &AdminSettings) -> OidcProviderSettings {
    let mut oidc = settings
        .oidc_providers
        .iter()
        .find(|provider| {
            provider.id == settings.active_oidc_provider_id && !provider.id.trim().is_empty()
        })
        .cloned()
        .or_else(|| settings.oidc_providers.iter().find(|provider| provider.enabled).cloned())
        .or_else(|| settings.oidc_providers.first().cloned())
        .unwrap_or_else(|| settings.oidc.clone());

    if oidc.id.trim().is_empty() {
        oidc.id = oidc.provider.clone();
    }
    if oidc.title.trim().is_empty() {
        oidc.title = match oidc.provider.trim() {
            "authentik" => "Authentik".into(),
            "generic" => "Generic OIDC".into(),
            _ => "Authentication".into(),
        };
    }
    if oidc.issuer.trim().is_empty()
        && !config.authentik_issuer.trim().is_empty()
        && !config.authentik_client_id.trim().is_empty()
    {
        oidc.enabled = true;
        if oidc.id.trim().is_empty() {
            oidc.id = "authentik".into();
        }
        if oidc.title.trim().is_empty() {
            oidc.title = "Authentik".into();
        }
        oidc.provider = "authentik".into();
        oidc.issuer = config.authentik_issuer.trim().trim_end_matches('/').to_string();
        oidc.client_id = config.authentik_client_id.clone();
        oidc.client_secret = config.authentik_client_secret.clone();
    }
    oidc.issuer = oidc.issuer.trim().trim_end_matches('/').to_string();
    if oidc.authorization_url.trim().is_empty() && !oidc.issuer.is_empty() {
        oidc.authorization_url = format!("{}/authorize", oidc.issuer);
    }
    if oidc.token_url.trim().is_empty() && !oidc.issuer.is_empty() {
        oidc.token_url = format!("{}/token", oidc.issuer);
    }
    if oidc.userinfo_url.trim().is_empty() && !oidc.issuer.is_empty() {
        oidc.userinfo_url = format!("{}/userinfo", oidc.issuer);
    }
    if oidc.scopes.trim().is_empty() {
        oidc.scopes = "openid profile email".into();
    }
    oidc
}

fn newer_than(value: DateTime<Utc>, cursor: Option<DateTime<Utc>>) -> bool {
    match cursor {
        Some(cursor) => value > cursor,
        None => true,
    }
}

fn deletion_window() -> (DateTime<Utc>, DateTime<Utc>) {
    let deleted_at = Utc::now();
    let purge_at = deleted_at + Duration::days(RECOVERY_RETENTION_DAYS);
    (deleted_at, purge_at)
}

fn append_audit_entry(
    state: &mut StateData,
    source: &str,
    action: &str,
    target_kind: &str,
    target_id: String,
    target_label: String,
    details: serde_json::Value,
) {
    let occurred_at = Utc::now();
    let cutoff = occurred_at - Duration::days(AUDIT_RETENTION_DAYS);
    state.audit_log.retain(|entry| entry.occurred_at >= cutoff);
    state.audit_log.push(AdminAuditEntry {
        id: format!("audit-{}", Uuid::new_v4()),
        occurred_at,
        actor_id: state.user.id.to_string(),
        actor_label: state.user.display_name.clone(),
        source: source.to_string(),
        action: action.to_string(),
        target_kind: target_kind.to_string(),
        target_id,
        target_label,
        details,
    });
    state.audit_log.sort_by(|left, right| right.occurred_at.cmp(&left.occurred_at));
}

fn is_note_active(note: &Note) -> bool {
    note.deleted_at.is_none()
}

fn is_diagram_active(diagram: &Diagram) -> bool {
    diagram.deleted_at.is_none()
}

fn is_voice_memo_active(memo: &VoiceMemo) -> bool {
    memo.deleted_at.is_none()
}

fn max_optional_datetime<I>(iter: I) -> Option<DateTime<Utc>>
where
    I: IntoIterator<Item = DateTime<Utc>>,
{
    iter.into_iter().max()
}

fn operation_id_string(operation: &SyncOperation) -> String {
    match operation {
        SyncOperation::CreateNote { title, .. } => format!("create-note:{title}"),
        SyncOperation::UpdateNote { id, .. }
        | SyncOperation::ApplyNoteOperations { id, .. }
        | SyncOperation::DeleteNote { id } => id.to_string(),
        SyncOperation::CreateDiagram { title, .. } => format!("create-diagram:{title}"),
        SyncOperation::UpdateDiagram { id, .. } => id.to_string(),
        SyncOperation::CreateTask { title, .. } => format!("create-task:{title}"),
        SyncOperation::UpdateTask { id, .. } | SyncOperation::DeleteTask { id } => id.to_string(),
        SyncOperation::CreateLocalCalendar { title, .. } => format!("create-calendar:{title}"),
        SyncOperation::RenameCalendar { id, .. } | SyncOperation::DeleteCalendar { id } => id.to_string(),
        SyncOperation::CreateCalendarEvent { connection_id, title, .. } => format!("{connection_id}:{title}"),
        SyncOperation::UpdateCalendarEvent { event_id, .. } | SyncOperation::DeleteCalendarEvent { event_id, .. } => event_id.clone(),
        SyncOperation::CreateMessage { room_id, body, .. } => format!("{room_id}:{body}"),
        SyncOperation::CreateManagedFolder { path } => format!("create-folder:{path}"),
        SyncOperation::MoveManagedPath { source_path, destination_dir } => {
            format!("move-path:{source_path}:{destination_dir}")
        }
        SyncOperation::RenameManagedPath { path, new_name } => {
            format!("rename-path:{path}:{new_name}")
        }
        SyncOperation::DeleteManagedPath { path } => format!("delete-path:{path}"),
        SyncOperation::ToggleMessageReaction { room_id, message_id, emoji } => {
            format!("{room_id}:{message_id}:{emoji}")
        }
    }
}

fn update_status_path(storage_root: &Path) -> PathBuf {
    storage_root.join("system-update-status.json")
}

async fn load_system_update_status(
    path: PathBuf,
    current_version: &str,
    update_target: &str,
    update_enabled: bool,
) -> SystemUpdateStatus {
    let mut status = tokio::fs::read(&path)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<SystemUpdateStatus>(&bytes).ok())
        .unwrap_or_default();
    status.current_version = current_version.to_string();
    status.update_target = update_target.to_string();
    status.update_enabled = update_enabled;
    status.update_in_progress = false;
    if status.last_message.trim().is_empty() {
        status.last_message = if update_enabled {
            "Update system ready.".into()
        } else {
            "Update command is not configured.".into()
        };
    }
    status
}

async fn persist_system_update_status_file(path: PathBuf, status: &SystemUpdateStatus) {
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Ok(bytes) = serde_json::to_vec_pretty(status) {
        let _ = tokio::fs::write(path, bytes).await;
    }
}

fn truncate_status_message(message: String) -> String {
    const MAX_LEN: usize = 700;
    let trimmed = message.trim();
    if trimmed.len() <= MAX_LEN {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..MAX_LEN])
}

fn default_note_object_id(note_id: Uuid) -> String {
    format!("note:{note_id}")
}

fn default_audio_object_id(memo_id: Uuid) -> String {
    format!("audio:{memo_id}")
}

fn default_user_namespace(owner_id: Uuid) -> ObjectNamespace {
    ObjectNamespace {
        root: format!("users/{owner_id}/synced"),
        owner_id,
        kind: ObjectNamespaceKind::Synced,
        label: "Synced".into(),
    }
}

fn next_block_counter(clock: &HashMap<String, u64>, actor: &str) -> u64 {
    clock.get(actor).copied().unwrap_or(0) + 1
}

fn note_document_from_markdown(markdown: &str, actor: &str) -> NoteDocument {
    let mut blocks = Vec::new();
    let mut clock = HashMap::new();
    let mut counter = 0u64;
    for (index, raw_block) in markdown.split("\n\n").enumerate() {
        let text = raw_block.trim_end_matches('\n').to_string();
        counter += 1;
        let kind = if text.starts_with("```") {
            NoteBlockKind::Code
        } else if text.starts_with(">") {
            NoteBlockKind::Quote
        } else if text.starts_with("- [") {
            NoteBlockKind::Checklist
        } else if text.starts_with("- ") || text.starts_with("* ") {
            NoteBlockKind::BulletList
        } else if text
            .chars()
            .next()
            .map(|character| character == '#')
            .unwrap_or(false)
        {
            NoteBlockKind::Heading
        } else {
            NoteBlockKind::Paragraph
        };
        blocks.push(NoteBlock {
            id: format!("block-{}-{}", index, counter),
            kind,
            text,
            attrs: HashMap::new(),
            order: index as f64,
            deleted: false,
            last_modified_by: actor.to_string(),
            last_modified_counter: counter,
        });
    }
    if blocks.is_empty() {
        blocks.push(NoteBlock {
            id: "block-0-1".into(),
            kind: NoteBlockKind::Paragraph,
            text: String::new(),
            attrs: HashMap::new(),
            order: 0.0,
            deleted: false,
            last_modified_by: actor.to_string(),
            last_modified_counter: 1,
        });
        counter = 1;
    }
    clock.insert(actor.to_string(), counter);
    NoteDocument {
        blocks,
        clock,
        last_operation_id: format!("seed:{actor}:{counter}"),
    }
}

fn markdown_from_note_document(document: &NoteDocument) -> String {
    let mut blocks = document
        .blocks
        .iter()
        .filter(|block| !block.deleted)
        .cloned()
        .collect::<Vec<_>>();
    blocks.sort_by(|left, right| left.order.total_cmp(&right.order));
    blocks
        .into_iter()
        .map(|block| block.text)
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn ensure_note_foundation(note: &mut Note) {
    if note.object_id.trim().is_empty() {
        note.object_id = default_note_object_id(note.id);
    }
    if note.namespace.root.trim().is_empty() || note.namespace.owner_id.is_nil() {
        note.namespace = default_user_namespace(note.author_id);
    }
    if note.document.blocks.is_empty() {
        note.document = note_document_from_markdown(&note.markdown, &note.author_id.to_string());
    }
    let materialized = markdown_from_note_document(&note.document);
    if note.markdown != materialized {
        note.markdown = materialized;
    }
}

fn ensure_voice_memo_foundation(memo: &mut VoiceMemo) {
    if memo.object_id.trim().is_empty() {
        memo.object_id = default_audio_object_id(memo.id);
    }
    if memo.namespace.root.trim().is_empty() || memo.namespace.owner_id.is_nil() {
        memo.namespace = default_user_namespace(memo.owner_id);
    }
    if memo.transcript_tags.is_empty() {
        memo.transcript_tags = derive_transcript_tags(
            memo.transcript
                .as_deref()
                .unwrap_or_default(),
        );
    }
    if memo.topic_summary.is_none() {
        memo.topic_summary = memo
            .transcript
            .as_ref()
            .map(|text| summarize_transcript_topic(text));
    }
}

fn derive_transcript_tags(transcript: &str) -> Vec<String> {
    let mut counts = HashMap::<String, usize>::new();
    for token in transcript
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| token.len() >= 4)
    {
        let key = token.to_ascii_lowercase();
        *counts.entry(key).or_insert(0) += 1;
    }
    let mut entries = counts.into_iter().collect::<Vec<_>>();
    entries.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    entries.into_iter().take(8).map(|(token, _)| token).collect()
}

fn summarize_transcript_topic(transcript: &str) -> String {
    transcript
        .split_terminator(&['.', '!', '?'][..])
        .map(str::trim)
        .find(|sentence| !sentence.is_empty())
        .unwrap_or("Audio memo")
        .chars()
        .take(160)
        .collect()
}

fn should_fork_note_document(
    document: &NoteDocument,
    batch: &NoteDocumentOperationBatch,
    actor_id: &str,
) -> bool {
    if batch.operations.is_empty() {
        return false;
    }
    for operation in &batch.operations {
        match operation {
            NoteOperation::SetTitle { .. } | NoteOperation::SetFolder { .. } => {}
            NoteOperation::ReplaceDocument { .. } => {
                for (actor, counter) in &document.clock {
                    if actor != actor_id
                        && batch.base_clock.get(actor).copied().unwrap_or(0) < *counter
                    {
                        return true;
                    }
                }
            }
            NoteOperation::UpdateBlockText { block_id, .. }
            | NoteOperation::UpdateBlockAttrs { block_id, .. }
            | NoteOperation::DeleteBlock { block_id }
            | NoteOperation::MoveBlock { block_id, .. } => {
                if let Some(block) = document.blocks.iter().find(|candidate| candidate.id == *block_id) {
                    if block.last_modified_by == actor_id {
                        continue;
                    }
                    let seen_counter = batch
                        .base_clock
                        .get(&block.last_modified_by)
                        .copied()
                        .unwrap_or(0);
                    if seen_counter < block.last_modified_counter {
                        return true;
                    }
                }
            }
            NoteOperation::InsertBlock { after_block_id, .. } => {
                if let Some(anchor_id) = after_block_id {
                    if let Some(block) = document.blocks.iter().find(|candidate| candidate.id == *anchor_id) {
                        if block.last_modified_by == actor_id {
                            continue;
                        }
                        let seen_counter = batch
                            .base_clock
                            .get(&block.last_modified_by)
                            .copied()
                            .unwrap_or(0);
                        if seen_counter < block.last_modified_counter {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

fn apply_operations_to_document(
    document: &NoteDocument,
    batch: &NoteDocumentOperationBatch,
    actor_id: &str,
) -> AppResult<NoteDocument> {
    let mut next = document.clone();
    let mut counter = next_block_counter(&next.clock, actor_id);
    for operation in &batch.operations {
        match operation {
            NoteOperation::SetTitle { .. } | NoteOperation::SetFolder { .. } => {}
            NoteOperation::ReplaceDocument { blocks } => {
                next.blocks = blocks
                    .iter()
                    .enumerate()
                    .map(|(index, block)| NoteBlock {
                        id: if block.id.trim().is_empty() {
                            format!("block-{}-{}", index, counter)
                        } else {
                            block.id.clone()
                        },
                        kind: block.kind.clone(),
                        text: block.text.clone(),
                        attrs: block.attrs.clone(),
                        order: index as f64,
                        deleted: block.deleted,
                        last_modified_by: actor_id.to_string(),
                        last_modified_counter: counter,
                    })
                    .collect();
                counter += 1;
            }
            NoteOperation::InsertBlock { block, after_block_id } => {
                let insertion_order = after_block_id
                    .as_ref()
                    .and_then(|anchor_id| next.blocks.iter().find(|candidate| candidate.id == *anchor_id))
                    .map(|anchor| anchor.order + 0.5)
                    .unwrap_or_else(|| next.blocks.iter().map(|candidate| candidate.order).fold(-1.0, f64::max) + 1.0);
                next.blocks.push(NoteBlock {
                    id: if block.id.trim().is_empty() {
                        format!("block-insert-{}", counter)
                    } else {
                        block.id.clone()
                    },
                    kind: block.kind.clone(),
                    text: block.text.clone(),
                    attrs: block.attrs.clone(),
                    order: insertion_order,
                    deleted: false,
                    last_modified_by: actor_id.to_string(),
                    last_modified_counter: counter,
                });
                counter += 1;
            }
            NoteOperation::UpdateBlockText { block_id, text } => {
                let block = next
                    .blocks
                    .iter_mut()
                    .find(|candidate| candidate.id == *block_id)
                    .ok_or_else(|| AppError::BadRequest(format!("unknown note block: {block_id}")))?;
                block.text = text.clone();
                block.last_modified_by = actor_id.to_string();
                block.last_modified_counter = counter;
                counter += 1;
            }
            NoteOperation::UpdateBlockAttrs { block_id, attrs } => {
                let block = next
                    .blocks
                    .iter_mut()
                    .find(|candidate| candidate.id == *block_id)
                    .ok_or_else(|| AppError::BadRequest(format!("unknown note block: {block_id}")))?;
                block.attrs = attrs.clone();
                block.last_modified_by = actor_id.to_string();
                block.last_modified_counter = counter;
                counter += 1;
            }
            NoteOperation::DeleteBlock { block_id } => {
                let block = next
                    .blocks
                    .iter_mut()
                    .find(|candidate| candidate.id == *block_id)
                    .ok_or_else(|| AppError::BadRequest(format!("unknown note block: {block_id}")))?;
                block.deleted = true;
                block.last_modified_by = actor_id.to_string();
                block.last_modified_counter = counter;
                counter += 1;
            }
            NoteOperation::MoveBlock { block_id, after_block_id } => {
                let max_order = next.blocks.iter().map(|candidate| candidate.order).fold(0.0, f64::max);
                let new_order = after_block_id
                    .as_ref()
                    .and_then(|anchor_id| next.blocks.iter().find(|candidate| candidate.id == *anchor_id))
                    .map(|anchor| anchor.order + 0.5)
                    .unwrap_or(max_order + 1.0);
                let block = next
                    .blocks
                    .iter_mut()
                    .find(|candidate| candidate.id == *block_id)
                    .ok_or_else(|| AppError::BadRequest(format!("unknown note block: {block_id}")))?;
                block.order = new_order;
                block.last_modified_by = actor_id.to_string();
                block.last_modified_counter = counter;
                counter += 1;
            }
        }
    }
    next.clock.insert(actor_id.to_string(), counter.saturating_sub(1));
    next.last_operation_id = batch.operation_id.clone();
    next.blocks.sort_by(|left, right| left.order.total_cmp(&right.order));
    Ok(next)
}

fn create_note_conflict_forks(
    state: &mut StateData,
    original: &Note,
    incoming_document: &NoteDocument,
    actor_id: &str,
) -> Vec<Uuid> {
    let now = Utc::now();
    let remote_fork_id = Uuid::new_v4();
    let local_fork_id = Uuid::new_v4();
    let mut remote_fork = original.clone();
    remote_fork.id = remote_fork_id;
    remote_fork.object_id = default_note_object_id(remote_fork_id);
    remote_fork.title = format!("{} (remote conflict)", original.title);
    remote_fork.forked_from_note_id = Some(original.id);
    remote_fork.conflict_tag = Some("remote_conflict".into());
    remote_fork.created_at = now;
    remote_fork.updated_at = now;
    remote_fork.revision = 1;

    let mut local_fork = original.clone();
    local_fork.id = local_fork_id;
    local_fork.object_id = default_note_object_id(local_fork_id);
    local_fork.title = format!("{} (local conflict)", original.title);
    local_fork.document = incoming_document.clone();
    local_fork.markdown = markdown_from_note_document(incoming_document);
    local_fork.forked_from_note_id = Some(original.id);
    local_fork.conflict_tag = Some(format!("local_conflict:{actor_id}"));
    local_fork.created_at = now;
    local_fork.updated_at = now;
    local_fork.revision = 1;

    state.notes.insert(remote_fork.id, remote_fork);
    state.notes.insert(local_fork.id, local_fork);
    vec![remote_fork_id, local_fork_id]
}

fn file_node_directory(
    name: String,
    path: String,
    namespace: Option<ObjectNamespace>,
    visibility: Option<ResourceVisibility>,
) -> crate::models::FileNode {
    crate::models::FileNode {
        name,
        path,
        kind: crate::models::FileNodeKind::Directory,
        object_id: None,
        object_kind: None,
        namespace,
        visibility,
        resource_key: None,
        size_bytes: None,
        created_at: None,
        updated_at: None,
        children: Vec::new(),
    }
}

fn insert_projected_node(root: &mut crate::models::FileNode, parts: &[String], leaf: crate::models::FileNode) {
    if parts.is_empty() {
        root.children.push(leaf);
        return;
    }
    let mut current_path = root.path.clone();
    let mut current = root;
    for part in parts {
        if current_path.is_empty() {
            current_path = part.clone();
        } else {
            current_path = format!("{current_path}/{part}");
        }
        let existing_index = current
            .children
            .iter()
            .position(|child| child.kind == crate::models::FileNodeKind::Directory && child.name == *part);
        let index = if let Some(index) = existing_index {
            index
        } else {
            current.children.push(file_node_directory(part.clone(), current_path.clone(), None, None));
            current.children.len() - 1
        };
        current = current.children.get_mut(index).expect("folder inserted");
    }
    current.children.push(leaf);
}

fn sort_file_tree(node: &mut crate::models::FileNode) {
    for child in &mut node.children {
        sort_file_tree(child);
    }
    node.children.sort_by(|left, right| {
        match (&left.kind, &right.kind) {
            (crate::models::FileNodeKind::Directory, crate::models::FileNodeKind::File) => std::cmp::Ordering::Less,
            (crate::models::FileNodeKind::File, crate::models::FileNodeKind::Directory) => std::cmp::Ordering::Greater,
            _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
        }
    });
}

fn build_notes_projection(notes: &[Note]) -> crate::models::FileNode {
    let mut root = file_node_directory("notes".into(), "notes".into(), None, None);
    for note in notes {
        let folders = note
            .folder
            .split('/')
            .filter(|part| !part.is_empty() && *part != "Inbox")
            .map(str::to_string)
            .collect::<Vec<_>>();
        let leaf = crate::models::FileNode {
            name: format!("{}-{}.md", slug_for_note_title(&note.title), note.id),
            path: note_relative_path_for_move(note),
            kind: crate::models::FileNodeKind::File,
            object_id: Some(note.object_id.clone()),
            object_kind: Some(crate::models::WorkspaceObjectKind::NoteDocument),
            namespace: Some(note.namespace.clone()),
            visibility: Some(note.visibility.clone()),
            resource_key: Some(format!("note:{}", note.id)),
            size_bytes: Some(note.markdown.len() as u64),
            created_at: Some(note.created_at.to_rfc3339()),
            updated_at: Some(note.updated_at.to_rfc3339()),
            children: Vec::new(),
        };
        insert_projected_node(&mut root, &folders, leaf);
    }
    sort_file_tree(&mut root);
    root
}

fn build_diagrams_projection(diagrams: &[Diagram]) -> crate::models::FileNode {
    let mut root = file_node_directory("diagrams".into(), "diagrams".into(), None, None);
    for diagram in diagrams {
        let folder = normalize_diagram_folder_path(&diagram.title);
        let folders = folder
            .split('/')
            .filter(|part| !part.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();
        let leaf = crate::models::FileNode {
            name: format!("{}-{}.drawio", slug_for_diagram_title(&diagram.title), diagram.id),
            path: diagram_relative_path_for_move(diagram),
            kind: crate::models::FileNodeKind::File,
            object_id: Some(format!("diagram:{}", diagram.id)),
            object_kind: Some(crate::models::WorkspaceObjectKind::Diagram),
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: Some(diagram.xml.len() as u64),
            created_at: Some(diagram.created_at.to_rfc3339()),
            updated_at: Some(diagram.updated_at.to_rfc3339()),
            children: Vec::new(),
        };
        insert_projected_node(&mut root, &folders, leaf);
    }
    sort_file_tree(&mut root);
    root
}

fn build_voice_projection(memos: &[VoiceMemo]) -> crate::models::FileNode {
    let mut root = file_node_directory("voice".into(), "voice".into(), None, None);
    for memo in memos {
        let relative = memo.audio_path.strip_prefix("voice/").unwrap_or(&memo.audio_path);
        let mut parts = relative
            .split('/')
            .filter(|part| !part.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();
        let name = parts.pop().unwrap_or_else(|| format!("{}.webm", memo.id));
        let leaf = crate::models::FileNode {
            name,
            path: memo.audio_path.clone(),
            kind: crate::models::FileNodeKind::File,
            object_id: Some(memo.object_id.clone()),
            object_kind: Some(crate::models::WorkspaceObjectKind::AudioMemo),
            namespace: Some(memo.namespace.clone()),
            visibility: Some(memo.visibility.clone()),
            resource_key: Some(format!("audio:{}", memo.id)),
            size_bytes: None,
            created_at: Some(memo.created_at.to_rfc3339()),
            updated_at: Some(memo.updated_at.to_rfc3339()),
            children: Vec::new(),
        };
        insert_projected_node(&mut root, &parts, leaf);
    }
    sort_file_tree(&mut root);
    root
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Config, models::CreateNoteRequest};
    use tokio::fs;

    async fn test_state() -> AppState {
        let mut config = Config::from_env();
        config.storage_root = std::env::temp_dir().join(format!("home-suite-home-test-{}", Uuid::new_v4()));
        let storage = BlobStorage::new(config.storage_root.clone())
            .await
            .expect("create blob storage");
        AppState::new(config, storage)
            .await
            .expect("create app state")
    }

    #[tokio::test]
    async fn login_accepts_bootstrap_credentials() {
        let state = test_state().await;
        let profile = state
            .login("admin@example.com", "changeme123")
            .await
            .expect("bootstrap login succeeds");
        assert_eq!(profile.email, "admin@example.com");
    }

    #[tokio::test]
    async fn update_note_rejects_stale_revision() {
        let state = test_state().await;
        let note = state
            .create_note(CreateNoteRequest {
                title: "Test".into(),
                folder: None,
                markdown: None,
            })
            .await
            .expect("create note");

        let error = state
            .update_note(
                note.id,
                UpdateNoteRequest {
                    title: None,
                    folder: None,
                    markdown: Some("updated".into()),
                    revision: 999,
                },
            )
            .await
            .expect_err("stale revision should fail");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[tokio::test]
    async fn writes_state_snapshot_after_mutation() {
        let state = test_state().await;
        let creator = state.inner.read().await.user.clone();
        state
            .create_room(
                CreateRoomRequest {
                    name: "persisted".into(),
                    kind: crate::models::RoomKind::Channel,
                    participant_ids: Vec::new(),
                },
                &creator,
            )
            .await
            .expect("create room");

        let state_file = state.config.storage_root.join("state.json");
        assert!(fs::try_exists(state_file).await.expect("state file check"));
    }
}
