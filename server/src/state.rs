use std::{collections::HashMap, path::Path, sync::Arc};

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{
        AdminSettings, AdminStorageOverview, AdminUserSummary, ChangeCurrentUserPasswordRequest,
        ChangePasswordRequest, CreateDiagramRequest, CreateMessageRequest, CreateNoteRequest,
        CreateRoomRequest, CreateUserRequest, Diagram, JobStatus, Message, Note,
        PendingCredentialChangeRequest, RealtimeEvent, ResourceShare, ResourceVisibility, Room,
        SessionResponse, SetupAdminRequest, StoredUser, TranscriptSegment, TranscriptionJob,
        UpdateAccountCredentialsRequest, UpdateDiagramRequest, UpdateNoteRequest,
        UpdateResourceShareRequest, UpdateUserAccessRequest, UserProfile, VoiceMemo,
    },
    persistence::PersistenceBackend,
    storage::BlobStorage,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub storage: BlobStorage,
    pub realtime: broadcast::Sender<RealtimeEvent>,
    persistence: PersistenceBackend,
    inner: Arc<RwLock<StateData>>,
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
    pub resource_shares: HashMap<String, ResourceShare>,
    #[serde(default)]
    pub pending_credential_changes: HashMap<Uuid, PendingCredentialChangeRequest>,
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
        let mut initial_state = if let Some(bytes) = persistence.load_snapshot().await? {
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
        let app = Self {
            config,
            storage,
            realtime,
            persistence,
            inner: Arc::new(RwLock::new(initial_state)),
        };
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

    pub async fn oidc_login(&self, _code: &str) -> AppResult<UserProfile> {
        let state = self.inner.read().await;
        Ok(state.user.clone())
    }

    pub async fn setup_status(&self) -> crate::models::SetupStatusResponse {
        let state = self.inner.read().await;
        crate::models::SetupStatusResponse {
            admin_exists: state
                .users
                .values()
                .any(|user| user.profile.roles.iter().any(|role| role == "admin")),
            user_count: state.users.len(),
            sso_configured: !self.config.authentik_issuer.trim().is_empty()
                && !self.config.authentik_client_id.trim().is_empty(),
        }
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
            format!("{}@local.sweet", username.to_lowercase())
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
            format!("{}@local.sweet", requested_username.to_lowercase())
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

    pub async fn list_notes(&self) -> Vec<Note> {
        if let Ok(Some(notes)) = self.persistence.list_notes().await {
            let mut state = self.inner.write().await;
            state.notes = notes.iter().cloned().map(|note| (note.id, note)).collect();
            return notes;
        }
        self.inner.read().await.notes.values().cloned().collect()
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

    pub async fn update_resource_share(
        &self,
        payload: UpdateResourceShareRequest,
        user: UserProfile,
    ) -> AppResult<ResourceShare> {
        let resource_key = payload.resource_key.trim();
        if resource_key.is_empty() {
            return Err(AppError::BadRequest("missing resource key".into()));
        }
        if !resource_key.starts_with("file:") && !resource_key.starts_with("note:") {
            return Err(AppError::BadRequest("invalid resource key".into()));
        }

        let mut user_ids = payload.user_ids;
        user_ids.sort();
        user_ids.dedup();

        let mut state = self.inner.write().await;
        user_ids.retain(|id| state.users.contains_key(id));
        let share = ResourceShare {
            resource_key: resource_key.to_string(),
            visibility: payload.visibility,
            user_ids,
            updated_at: Utc::now(),
            updated_by: user.id,
        };
        state
            .resource_shares
            .insert(share.resource_key.clone(), share.clone());
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(share)
    }

    pub async fn create_note(&self, payload: CreateNoteRequest) -> AppResult<Note> {
        let mut state = self.inner.write().await;
        let now = Utc::now();
        let markdown = payload
            .markdown
            .unwrap_or_else(|| "# New note\n\nStart writing.".into());
        let author_id = state.user.id;
        let current_used = storage_used_bytes_for_user(&state, &self.storage, author_id);
        let projected_used = current_used.saturating_add(markdown.len() as u64);
        enforce_storage_limit(&state, author_id, current_used, projected_used, true)?;
        let note = Note {
            id: Uuid::new_v4(),
            title: payload.title,
            folder: payload.folder.unwrap_or_else(|| "Inbox".into()),
            markdown,
            rendered_html: String::new(),
            revision: 1,
            created_at: now,
            updated_at: now,
            author_id,
            last_editor_id: author_id,
        };
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
        if payload.revision != existing_note.revision {
            return Err(AppError::BadRequest("revision mismatch".into()));
        }
        let previous_title = existing_note.title.clone();
        let previous_folder = existing_note.folder.clone();
        let old_size = existing_note.markdown.len() as u64;
        let next_title = payload.title.unwrap_or(existing_note.title.clone());
        let next_folder = payload.folder.unwrap_or(existing_note.folder.clone());
        let next_markdown = payload.markdown.unwrap_or(existing_note.markdown.clone());
        let projected_used = current_used
            .saturating_sub(old_size)
            .saturating_add(next_markdown.len() as u64);
        enforce_storage_limit(&state, user_id, current_used, projected_used, false)?;
        let note = state.notes.get_mut(&id).ok_or(AppError::NotFound)?;
        note.title = next_title;
        note.folder = next_folder;
        note.markdown = next_markdown;
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

    pub async fn list_diagrams(&self) -> Vec<Diagram> {
        if let Ok(Some(diagrams)) = self.persistence.list_diagrams().await {
            let mut state = self.inner.write().await;
            state.diagrams = diagrams
                .iter()
                .cloned()
                .map(|diagram| (diagram.id, diagram))
                .collect();
            return diagrams;
        }
        self.inner.read().await.diagrams.values().cloned().collect()
    }

    pub async fn create_diagram(&self, payload: CreateDiagramRequest) -> AppResult<Diagram> {
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
            id: Uuid::new_v4(),
            title: payload.title,
            xml,
            revision: 1,
            created_at: now,
            updated_at: now,
            author_id,
            last_editor_id: author_id,
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
        self.inner.read().await.memos.values().cloned().collect()
    }

    pub async fn get_memo(&self, memo_id: Uuid) -> AppResult<VoiceMemo> {
        self.inner
            .read()
            .await
            .memos
            .get(&memo_id)
            .cloned()
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
        };
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
            id: Uuid::new_v4(),
            room_id,
            author,
            body: payload.body,
            created_at: Utc::now(),
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

    pub async fn list_files(&self) -> AppResult<Vec<crate::models::FileNode>> {
        self.storage.list_tree().await
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
            return self.storage.delete_drive_path(&path).await;
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
            let mut state = self.inner.write().await;
            let note = state.notes.remove(&note_id).ok_or(AppError::NotFound)?;
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence.delete_note(note.id).await?;
            }
            self.storage
                .delete_note_markdown(&note.folder, &note.title, note.id)
                .await?;
            let snapshot = state.clone();
            drop(state);
            if !uses_postgres {
                self.persist_snapshot(snapshot).await?;
            }
            return Ok(());
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
            let note = state.notes.remove(&note_id).ok_or(AppError::NotFound)?;
            if uses_postgres {
                self.persistence.delete_note(note.id).await?;
            }
            self.storage
                .delete_note_markdown(&note.folder, &note.title, note.id)
                .await?;
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
                .remove(&diagram_id)
                .ok_or(AppError::NotFound)?;
            let uses_postgres = self.persistence.uses_postgres();
            if uses_postgres {
                self.persistence.delete_diagram(diagram.id).await?;
            }
            self.storage
                .delete_diagram_xml(&diagram.title, diagram.id)
                .await?;
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
                .remove(&diagram_id)
                .ok_or(AppError::NotFound)?;
            if uses_postgres {
                self.persistence.delete_diagram(diagram.id).await?;
            }
            self.storage
                .delete_diagram_xml(&diagram.title, diagram.id)
                .await?;
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

        self.storage.delete_voice_path(source_path).await?;
        for memo_id in matching_ids {
            state.memos.remove(&memo_id);
            if let Some(job_id) = state
                .jobs
                .values()
                .find(|job| job.memo_id == memo_id)
                .map(|job| job.id)
            {
                state.jobs.remove(&job_id);
            }
        }
        let snapshot = state.clone();
        drop(state);
        self.persist_snapshot(snapshot).await?;
        Ok(())
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
        kind: crate::models::RoomKind::Channel,
        created_at: Utc::now(),
        participant_ids: Vec::new(),
        participant_labels: Vec::new(),
    };

    let welcome_note = Note {
        id: Uuid::new_v4(),
        title: "Welcome to Sweet".into(),
        folder: "Getting Started".into(),
        markdown: "# Welcome to Sweet\n\nThis homelab workspace is seeded with:\n\n- live Markdown notes\n- draw.io-compatible diagram storage\n- voice memo ingestion and transcript jobs\n- chat rooms and call signaling\n- durable JSON state snapshots across restarts\n\nEdit this note and save it from the browser.".into(),
        rendered_html: String::new(),
        revision: 1,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        author_id: user.id,
        last_editor_id: user.id,
    };

    let starter_diagram = Diagram {
        id: Uuid::new_v4(),
        title: "Homelab Flow".into(),
        xml: "<mxfile><diagram name=\"Page-1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Sweet\" style=\"rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"240\" y=\"90\" width=\"120\" height=\"60\" as=\"geometry\"/></mxCell><mxCell id=\"3\" value=\"Authentik\" style=\"rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"60\" y=\"90\" width=\"120\" height=\"60\" as=\"geometry\"/></mxCell><mxCell id=\"4\" value=\"Snapshots\" style=\"shape=cylinder;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#fff2cc;strokeColor=#d6b656;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"420\" y=\"90\" width=\"90\" height=\"80\" as=\"geometry\"/></mxCell><mxCell id=\"5\" value=\"OIDC\" edge=\"1\" parent=\"1\" source=\"2\" target=\"3\"><mxGeometry relative=\"1\" as=\"geometry\"/></mxCell><mxCell id=\"6\" value=\"state\" edge=\"1\" parent=\"1\" source=\"2\" target=\"4\"><mxGeometry relative=\"1\" as=\"geometry\"/></mxCell></root></mxGraphModel></diagram></mxfile>".into(),
        revision: 1,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        author_id: user.id,
        last_editor_id: user.id,
    };

    let welcome_message = Message {
        id: Uuid::new_v4(),
        room_id: general_room.id,
        author: user.clone(),
        body: "Sweet is up. Use this room for internal chat and signaling tests.".into(),
        created_at: Utc::now(),
    };

    Ok(StateData {
        users: HashMap::from([(stored_user.profile.id, stored_user)]),
        admin_settings: AdminSettings::default(),
        user,
        password_hash,
        notes: HashMap::from([(welcome_note.id, welcome_note)]),
        diagrams: HashMap::from([(starter_diagram.id, starter_diagram)]),
        memos: HashMap::new(),
        jobs: HashMap::new(),
        rooms: HashMap::from([(general_room.id, general_room)]),
        messages: HashMap::from([(welcome_message.room_id, vec![welcome_message])]),
        resource_shares: HashMap::new(),
        pending_credential_changes: HashMap::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Config, models::CreateNoteRequest};
    use tokio::fs;

    async fn test_state() -> AppState {
        let mut config = Config::from_env();
        config.storage_root = std::env::temp_dir().join(format!("sweet-test-{}", Uuid::new_v4()));
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
