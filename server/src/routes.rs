use axum::{
    Json, Router,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
    routing::{get, post, put},
};
use chrono::Utc;
use pulldown_cmark::{Options, Parser, html};
use serde::Deserialize;
use std::{
    io::{Cursor, Write},
    path::Path as StdPath,
};
use uuid::Uuid;
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

use crate::{
    error::{AppError, AppResult},
    models::{
        AdminResetPasswordRequest, AdminSettings, AdminStorageOverview, ChangePasswordRequest,
        CreateDiagramRequest, CreateFolderRequest, CreateMessageRequest, CreateNoteRequest,
        CreateRoomRequest, CreateUserRequest, DeleteFileRequest, HealthResponse, LoginRequest,
        MoveFileRequest, OidcConfigResponse, RealtimeEvent, RenameFileRequest, RtcConfig,
        SetupAdminRequest, UpdateDiagramRequest, UpdateNoteRequest, UpdateResourceShareRequest,
        UpdateUserAccessRequest,
    },
    state::AppState,
    worker, ws,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/auth/setup", get(setup_status).post(setup_admin))
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/change-password", post(change_password))
        .route("/api/v1/auth/oidc/config", get(oidc_config))
        .route("/api/v1/auth/oidc/callback", get(oidc_callback))
        .route(
            "/api/v1/admin/settings",
            get(get_admin_settings).put(update_admin_settings),
        )
        .route(
            "/api/v1/admin/storage-overview",
            get(get_admin_storage_overview),
        )
        .route("/api/v1/admin/users", get(list_users).post(create_user))
        .route("/api/v1/admin/users/{id}/access", put(update_user_access))
        .route(
            "/api/v1/admin/users/{id}/reset-password",
            post(reset_user_password),
        )
        .route("/api/v1/coms/participants", get(list_coms_participants))
        .route(
            "/api/v1/shares",
            get(get_resource_share).put(update_resource_share),
        )
        .route("/api/v1/notes", get(list_notes).post(create_note))
        .route("/api/v1/notes/{id}", put(update_note))
        .route("/api/v1/diagrams", get(list_diagrams).post(create_diagram))
        .route("/api/v1/diagrams/{id}", put(update_diagram))
        .route(
            "/api/v1/voice-memos",
            get(list_voice_memos).post(create_voice_memo),
        )
        .route("/api/v1/voice-memos/{id}/audio", get(get_voice_audio))
        .route("/api/v1/voice-memos/{id}/job", get(get_job))
        .route("/api/v1/voice-memos/{id}/retry", post(retry_job))
        .route("/api/v1/rooms", get(list_rooms).post(create_room))
        .route("/api/v1/rooms/{id}", put(update_room))
        .route(
            "/api/v1/rooms/{id}/messages",
            get(list_messages).post(create_message),
        )
        .route("/api/v1/files/tree", get(list_files))
        .route("/api/v1/files/folders", post(create_folder))
        .route("/api/v1/files/upload", post(upload_file))
        .route("/api/v1/files/move", post(move_file))
        .route("/api/v1/files/rename", post(rename_file))
        .route("/api/v1/files/delete", post(delete_file))
        .route("/api/v1/files/download", get(download_file))
        .route("/api/v1/calls/config", get(call_config))
        .route("/ws/notes/{id}", get(ws::note_socket))
        .route("/ws/realtime", get(ws::realtime_socket))
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        timestamp: Utc::now(),
    })
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> AppResult<Json<crate::models::SessionResponse>> {
    let user = state.login(&payload.identifier, &payload.password).await?;
    let session = state.session_response(user).await?;
    Ok(Json(session))
}

async fn change_password(
    State(state): State<AppState>,
    Json(payload): Json<ChangePasswordRequest>,
) -> AppResult<Json<crate::models::SessionResponse>> {
    let user = state.change_password(payload).await?;
    let session = state.session_response(user).await?;
    Ok(Json(session))
}

async fn setup_status(State(state): State<AppState>) -> Json<crate::models::SetupStatusResponse> {
    Json(state.setup_status().await)
}

async fn setup_admin(
    State(state): State<AppState>,
    Json(payload): Json<SetupAdminRequest>,
) -> AppResult<Json<crate::models::SessionResponse>> {
    let user = state.setup_admin(payload).await?;
    let session = state.session_response(user).await?;
    Ok(Json(session))
}

async fn get_admin_settings(State(state): State<AppState>) -> Json<AdminSettings> {
    Json(state.admin_settings().await)
}

async fn update_admin_settings(
    State(state): State<AppState>,
    Json(payload): Json<AdminSettings>,
) -> AppResult<Json<AdminSettings>> {
    Ok(Json(state.update_admin_settings(payload).await?))
}

async fn get_admin_storage_overview(State(state): State<AppState>) -> Json<AdminStorageOverview> {
    Json(state.storage_overview().await)
}

async fn list_users(State(state): State<AppState>) -> Json<Vec<crate::models::AdminUserSummary>> {
    Json(state.list_users().await)
}

async fn create_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> AppResult<Json<crate::models::AdminUserSummary>> {
    Ok(Json(state.create_user(payload).await?))
}

async fn update_user_access(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateUserAccessRequest>,
) -> AppResult<Json<crate::models::AdminUserSummary>> {
    Ok(Json(state.update_user_access(id, payload).await?))
}

async fn reset_user_password(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<AdminResetPasswordRequest>,
) -> AppResult<Json<crate::models::AdminUserSummary>> {
    Ok(Json(
        state.admin_reset_password(id, payload.password).await?,
    ))
}

async fn oidc_config(State(state): State<AppState>) -> Json<OidcConfigResponse> {
    let issuer = state
        .config
        .authentik_issuer
        .trim_end_matches('/')
        .to_string();
    Json(OidcConfigResponse {
        issuer: issuer.clone(),
        client_id: state.config.authentik_client_id.clone(),
        authorization_url: if issuer.is_empty() {
            String::new()
        } else {
            format!("{issuer}/authorize")
        },
        redirect_url: format!("{}/auth/oidc/callback", state.config.web_base_url),
    })
}

#[derive(Deserialize)]
struct OidcCallbackQuery {
    code: Option<String>,
    state: Option<String>,
}

async fn oidc_callback(
    State(state): State<AppState>,
    Query(query): Query<OidcCallbackQuery>,
) -> AppResult<Json<crate::models::SessionResponse>> {
    let code = query
        .code
        .ok_or_else(|| AppError::BadRequest("missing OIDC code".into()))?;
    let _client_state = query.state.unwrap_or_default();
    let user = state.oidc_login(&code).await?;
    let session = state.session_response(user).await?;
    Ok(Json(session))
}

async fn list_notes(State(state): State<AppState>) -> Json<Vec<crate::models::Note>> {
    let mut notes = state.list_notes().await;
    for note in &mut notes {
        note.rendered_html = markdown_to_html(&note.markdown);
    }
    Json(notes)
}

async fn create_note(
    State(state): State<AppState>,
    Json(payload): Json<CreateNoteRequest>,
) -> AppResult<Json<crate::models::Note>> {
    let mut note = state.create_note(payload).await?;
    note.rendered_html = markdown_to_html(&note.markdown);
    Ok(Json(note))
}

async fn update_note(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateNoteRequest>,
) -> AppResult<Json<crate::models::Note>> {
    let mut note = state.update_note(id, payload).await?;
    note.rendered_html = markdown_to_html(&note.markdown);
    let _ = state.realtime.send(RealtimeEvent::NotePatch {
        note_id: note.id,
        title: note.title.clone(),
        folder: note.folder.clone(),
        markdown: note.markdown.clone(),
        revision: note.revision,
    });
    Ok(Json(note))
}

async fn list_diagrams(State(state): State<AppState>) -> Json<Vec<crate::models::Diagram>> {
    Json(state.list_diagrams().await)
}

async fn create_diagram(
    State(state): State<AppState>,
    Json(payload): Json<CreateDiagramRequest>,
) -> AppResult<Json<crate::models::Diagram>> {
    Ok(Json(state.create_diagram(payload).await?))
}

async fn update_diagram(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateDiagramRequest>,
) -> AppResult<Json<crate::models::Diagram>> {
    Ok(Json(state.update_diagram(id, payload).await?))
}

async fn list_voice_memos(State(state): State<AppState>) -> Json<Vec<crate::models::VoiceMemo>> {
    Json(state.list_memos().await)
}

async fn create_voice_memo(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> AppResult<Json<crate::models::VoiceMemo>> {
    let mut title = String::from("Untitled memo");
    let mut bytes = Vec::new();
    let mut browser_transcript: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| AppError::BadRequest(err.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "title" {
            title = field
                .text()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?;
        } else if name == "browser_transcript" {
            browser_transcript = Some(
                field
                    .text()
                    .await
                    .map_err(|err| AppError::BadRequest(err.to_string()))?,
            );
        } else if name == "file" {
            bytes = field
                .bytes()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?
                .to_vec();
        }
    }

    if bytes.is_empty() {
        return Err(AppError::BadRequest("missing audio file".into()));
    }

    let memo = state
        .create_voice_memo(title, bytes, browser_transcript)
        .await?;
    if memo.status != crate::models::JobStatus::Completed {
        worker::spawn_transcription(state.clone(), memo.id);
    }
    Ok(Json(memo))
}

async fn get_job(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> AppResult<Json<crate::models::TranscriptionJob>> {
    Ok(Json(state.memo_job(id).await?))
}

async fn get_voice_audio(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> AppResult<Response<Body>> {
    let memo = state.get_memo(id).await?;

    let path = state.storage.resolve(&memo.audio_path);
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?;

    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = StatusCode::OK;
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static("audio/webm"));
    Ok(response)
}

async fn retry_job(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> AppResult<Json<crate::models::TranscriptionJob>> {
    let job = state.retry_job(id).await?;
    worker::spawn_transcription(state.clone(), id);
    Ok(Json(job))
}

async fn list_coms_participants(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<crate::models::UserProfile>>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    Ok(Json(state.list_coms_participants(&user).await))
}

#[derive(Deserialize)]
struct ShareQuery {
    resource_key: String,
}

async fn get_resource_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ShareQuery>,
) -> AppResult<Json<crate::models::ResourceShare>> {
    state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    Ok(Json(state.get_resource_share(&query.resource_key).await))
}

async fn update_resource_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateResourceShareRequest>,
) -> AppResult<Json<crate::models::ResourceShare>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    Ok(Json(state.update_resource_share(payload, user).await?))
}

async fn list_rooms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<crate::models::Room>>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    Ok(Json(state.list_rooms(&user).await))
}

async fn create_room(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateRoomRequest>,
) -> AppResult<Json<crate::models::Room>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    let room = state.create_room(payload, &user).await?;
    let _ = state.realtime.send(RealtimeEvent::ChatRoomsUpdated);
    Ok(Json(room))
}

async fn update_room(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<crate::models::UpdateRoomRequest>,
) -> AppResult<Json<crate::models::Room>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    let room = state.update_room(id, payload, &user).await?;
    let _ = state.realtime.send(RealtimeEvent::ChatRoomsUpdated);
    Ok(Json(room))
}

async fn list_messages(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<crate::models::Message>>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    Ok(Json(state.list_messages(id, &user).await?))
}

async fn create_message(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateMessageRequest>,
) -> AppResult<Json<crate::models::Message>> {
    let user = state
        .authenticated_user_from_header(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
        )
        .await?;
    let message = state.create_message(id, payload, user).await?;
    let _ = state.realtime.send(RealtimeEvent::ChatMessage {
        room_id: id,
        body: message.body.clone(),
        author: message.author.display_name.clone(),
        author_id: message.author.id,
    });
    Ok(Json(message))
}

async fn list_files(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<crate::models::FileNode>>> {
    Ok(Json(state.list_files().await?))
}

async fn create_folder(
    State(state): State<AppState>,
    Json(payload): Json<CreateFolderRequest>,
) -> AppResult<Json<crate::models::FileNode>> {
    Ok(Json(state.create_managed_folder(payload.path).await?))
}

async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> AppResult<Json<crate::models::FileNode>> {
    let mut path = String::from("drive");
    let mut filename = String::from("upload.bin");
    let mut bytes = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| AppError::BadRequest(err.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "path" {
            path = field
                .text()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?;
        } else if name == "file" {
            if let Some(next_filename) = field.file_name() {
                filename = next_filename.to_string();
            }
            bytes = field
                .bytes()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?
                .to_vec();
        }
    }

    if bytes.is_empty() {
        return Err(AppError::BadRequest("missing upload file".into()));
    }

    Ok(Json(state.upload_drive_file(path, filename, bytes).await?))
}

async fn move_file(
    State(state): State<AppState>,
    Json(payload): Json<MoveFileRequest>,
) -> AppResult<Json<crate::models::FileNode>> {
    Ok(Json(
        state
            .move_drive_path(payload.source_path, payload.destination_dir)
            .await?,
    ))
}

async fn delete_file(
    State(state): State<AppState>,
    Json(payload): Json<DeleteFileRequest>,
) -> AppResult<StatusCode> {
    state.delete_managed_path(payload.path).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn rename_file(
    State(state): State<AppState>,
    Json(payload): Json<RenameFileRequest>,
) -> AppResult<Json<crate::models::FileNode>> {
    Ok(Json(
        state
            .rename_managed_path(payload.path, payload.new_name)
            .await?,
    ))
}

#[derive(Deserialize)]
struct DownloadQuery {
    path: String,
}

async fn download_file(
    State(state): State<AppState>,
    Query(query): Query<DownloadQuery>,
) -> AppResult<Response<Body>> {
    let path = state.storage.resolve_managed_path(&query.path)?;
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("download.bin");
    let download_filename = if query.path.starts_with("notes/") && query.path.ends_with(".md") {
        note_download_filename(&state, &query.path)
            .await
            .unwrap_or_else(|| sanitize_attachment_name(filename))
    } else if query.path.starts_with("diagrams/") && query.path.ends_with(".drawio") {
        diagram_download_filename(&state, &query.path)
            .await
            .unwrap_or_else(|| sanitize_attachment_name(filename))
    } else {
        sanitize_attachment_name(filename)
    };
    let (bytes, content_type, disposition_filename) = if metadata.is_dir() {
        let path_for_zip = path.clone();
        let zip_bytes = tokio::task::spawn_blocking(move || zip_directory(&path_for_zip))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))??;
        (
            zip_bytes,
            "application/zip",
            format!("{}.zip", sanitize_attachment_name(filename)),
        )
    } else {
        (
            tokio::fs::read(&path)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?,
            "application/octet-stream",
            download_filename,
        )
    };

    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = StatusCode::OK;
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{disposition_filename}\""))
            .map_err(|err| AppError::Internal(err.to_string()))?,
    );
    Ok(response)
}

async fn note_download_filename(state: &AppState, path: &str) -> Option<String> {
    let note_id = extract_note_id_from_path(path).ok()?;
    let note = state
        .list_notes()
        .await
        .into_iter()
        .find(|note| note.id == note_id)?;
    Some(format!("{}.md", sanitize_attachment_name(&note.title)))
}

async fn diagram_download_filename(state: &AppState, path: &str) -> Option<String> {
    let diagram_id = extract_diagram_id_from_path(path).ok()?;
    let diagram = state
        .list_diagrams()
        .await
        .into_iter()
        .find(|diagram| diagram.id == diagram_id)?;
    Some(format!(
        "{}.drawio",
        sanitize_attachment_name(&diagram_display_name_for_download(&diagram.title))
    ))
}

fn extract_note_id_from_path(path: &str) -> AppResult<Uuid> {
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

fn extract_diagram_id_from_path(path: &str) -> AppResult<Uuid> {
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

fn diagram_display_name_for_download(title: &str) -> String {
    title
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or("diagram")
        .to_string()
}

async fn call_config(State(state): State<AppState>) -> Json<RtcConfig> {
    Json(RtcConfig {
        turn_urls: state.config.turn_urls.clone(),
        username: state.config.turn_username.clone(),
        credential: state.config.turn_credential.clone(),
    })
}

fn markdown_to_html(markdown: &str) -> String {
    let parser = Parser::new_ext(markdown, Options::all());
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

fn sanitize_attachment_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "download".into();
    }
    trimmed
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | '"' | '\n' | '\r' | '\t' => '_',
            _ => ch,
        })
        .collect()
}

fn zip_directory(directory: &StdPath) -> AppResult<Vec<u8>> {
    let cursor = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    add_directory_to_zip(&mut zip, directory, directory, options)?;
    let cursor = zip
        .finish()
        .map_err(|err| AppError::Internal(err.to_string()))?;
    Ok(cursor.into_inner())
}

fn add_directory_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    root: &StdPath,
    current: &StdPath,
    options: SimpleFileOptions,
) -> AppResult<()> {
    let entries = std::fs::read_dir(current).map_err(|err| AppError::Internal(err.to_string()))?;
    for entry in entries {
        let entry = entry.map_err(|err| AppError::Internal(err.to_string()))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let relative_name = relative.to_string_lossy().replace('\\', "/");
        let metadata = entry
            .metadata()
            .map_err(|err| AppError::Internal(err.to_string()))?;
        if metadata.is_dir() {
            zip.add_directory(format!("{relative_name}/"), options)
                .map_err(|err| AppError::Internal(err.to_string()))?;
            add_directory_to_zip(zip, root, &path, options)?;
        } else if metadata.is_file() {
            let bytes = std::fs::read(&path).map_err(|err| AppError::Internal(err.to_string()))?;
            zip.start_file(relative_name, options)
                .map_err(|err| AppError::Internal(err.to_string()))?;
            zip.write_all(&bytes)
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
    }
    Ok(())
}
