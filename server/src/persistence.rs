use std::{collections::HashMap, path::PathBuf, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::{fs, spawn};
use tokio_postgres::NoTls;
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{
        AdminSettings, Diagram, JobStatus, Message, Note, ResourceShare, ResourceVisibility, Room,
        RoomKind, StoredUser, TranscriptSegment, TranscriptionJob, UserProfile, UserToolScope,
        VoiceMemo,
    },
    state::StateData,
};

#[derive(Clone)]
pub enum PersistenceBackend {
    File {
        path: PathBuf,
    },
    Postgres {
        client: Arc<tokio_postgres::Client>,
        backup_path: PathBuf,
    },
}

impl PersistenceBackend {
    pub async fn initialize(config: &Config) -> AppResult<Self> {
        let backup_path = config.storage_root.join("state.json");
        if !config.database_url.trim().is_empty() {
            match tokio_postgres::connect(&config.database_url, NoTls).await {
                Ok((client, connection)) => {
                    spawn(async move {
                        if let Err(err) = connection.await {
                            tracing::error!("postgres connection error: {err}");
                        }
                    });

                    client
                        .batch_execute(
                            "create table if not exists app_state_snapshots (
                                key text primary key,
                                payload text not null,
                                updated_at timestamptz not null default now()
                            );
                            create table if not exists users (
                                id text primary key,
                                username text not null default '',
                                email text not null,
                                display_name text not null,
                                avatar_path text not null default '',
                                avatar_content_type text not null default '',
                                role text not null,
                                roles_json text not null default '[]',
                                must_change_password boolean not null default false,
                                storage_limit_mb bigint not null default 0,
                                tool_scope_json text not null default '{}',
                                password_hash text not null
                            );
                            alter table users add column if not exists username text not null default ''; 
                            alter table users add column if not exists avatar_path text not null default '';
                            alter table users add column if not exists avatar_content_type text not null default '';
                            alter table users add column if not exists roles_json text not null default '[]';
                            alter table users add column if not exists must_change_password boolean not null default false;
                            alter table users add column if not exists storage_limit_mb bigint not null default 0;
                            alter table users add column if not exists tool_scope_json text not null default '{}';
                            create table if not exists notes (
                                id text primary key,
                                title text not null,
                                folder text not null,
                                markdown text not null,
                                rendered_html text not null,
                                revision bigint not null,
                                created_at text not null,
                                updated_at text not null,
                                author_id text not null,
                                last_editor_id text not null
                            );
                            create table if not exists diagrams (
                                id text primary key,
                                title text not null,
                                xml text not null,
                                revision bigint not null,
                                created_at text not null,
                                updated_at text not null,
                                author_id text not null default '',
                                last_editor_id text not null default ''
                            );
                            alter table diagrams add column if not exists author_id text not null default '';
                            alter table diagrams add column if not exists last_editor_id text not null default '';
                            create table if not exists voice_memos (
                                id text primary key,
                                title text not null,
                                audio_path text not null,
                                transcript text,
                                transcript_segments_json text not null,
                                status text not null,
                                model text not null,
                                device text not null,
                                created_at text not null,
                                updated_at text not null,
                                failure_reason text,
                                owner_id text not null default ''
                            );
                            alter table voice_memos add column if not exists owner_id text not null default '';
                            create table if not exists transcription_jobs (
                                id text primary key,
                                memo_id text not null,
                                status text not null,
                                failure_reason text
                            );
                            create table if not exists rooms (
                                id text primary key,
                                name text not null,
                                kind text not null,
                                created_at text not null,
                                participant_ids_json text not null default '[]'
                            );
                            alter table rooms add column if not exists participant_ids_json text not null default '[]';
                            create table if not exists messages (
                                id text primary key,
                                room_id text not null,
                                author_id text not null,
                                body text not null,
                                created_at text not null
                            );
                            create table if not exists resource_shares (
                                resource_key text primary key,
                                visibility text not null,
                                user_ids_json text not null default '[]',
                                updated_at text not null,
                                updated_by text not null
                            );",
                        )
                        .await
                        .map_err(|err| AppError::Internal(err.to_string()))?;

                    if let Some(row) = client
                        .query_opt("select id from users order by id asc limit 1", &[])
                        .await
                        .map_err(|err| AppError::Internal(err.to_string()))?
                    {
                        let first_user_id: String = row.get(0);
                        for statement in [
                            "update diagrams set author_id = $1 where author_id = '' or author_id is null",
                            "update diagrams set last_editor_id = $1 where last_editor_id = '' or last_editor_id is null",
                            "update voice_memos set owner_id = $1 where owner_id = '' or owner_id is null",
                        ] {
                            client
                                .execute(statement, &[&first_user_id])
                                .await
                                .map_err(|err| AppError::Internal(err.to_string()))?;
                        }
                    }

                    tracing::info!("using postgres persistence backend");
                    return Ok(Self::Postgres {
                        client: Arc::new(client),
                        backup_path,
                    });
                }
                Err(err) => {
                    tracing::warn!("postgres unavailable, falling back to file snapshots: {err}");
                }
            }
        }

        Ok(Self::File { path: backup_path })
    }

    pub async fn load_snapshot(&self) -> AppResult<Option<Vec<u8>>> {
        match self {
            Self::File { path } => {
                if !fs::try_exists(path)
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    return Ok(None);
                }
                let bytes = fs::read(path)
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(Some(bytes))
            }
            Self::Postgres {
                client,
                backup_path,
            } => {
                if let Some(state) = load_relational_state(client).await? {
                    let bytes = serde_json::to_vec_pretty(&state)
                        .map_err(|err| AppError::Internal(err.to_string()))?;
                    return Ok(Some(bytes));
                }

                let row = client
                    .query_opt(
                        "select payload from app_state_snapshots where key = $1",
                        &[&"primary"],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                if let Some(row) = row {
                    let payload: String = row.get(0);
                    return Ok(Some(payload.into_bytes()));
                }
                if fs::try_exists(backup_path)
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let bytes = fs::read(backup_path)
                        .await
                        .map_err(|err| AppError::Internal(err.to_string()))?;
                    return Ok(Some(bytes));
                }
                Ok(None)
            }
        }
    }

    pub async fn save_snapshot(&self, bytes: &[u8]) -> AppResult<()> {
        match self {
            Self::File { path } => fs::write(path, bytes)
                .await
                .map_err(|err| AppError::Internal(err.to_string())),
            Self::Postgres {
                client,
                backup_path,
            } => {
                let payload = String::from_utf8(bytes.to_vec())
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                let snapshot: StateData = serde_json::from_slice(bytes)
                    .map_err(|err| AppError::Internal(err.to_string()))?;

                client
                    .execute(
                        "insert into app_state_snapshots (key, payload, updated_at)
                         values ($1, $2, now())
                         on conflict (key)
                         do update set payload = excluded.payload, updated_at = now()",
                        &[&"primary", &payload],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;

                sync_relational_state(client, &snapshot).await?;

                fs::write(backup_path, payload.into_bytes())
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))
            }
        }
    }

    pub fn uses_postgres(&self) -> bool {
        matches!(self, Self::Postgres { .. })
    }

    pub async fn list_notes(&self) -> AppResult<Option<Vec<Note>>> {
        match self {
            Self::File { .. } => Ok(None),
            Self::Postgres { client, .. } => {
                let mut notes = HashMap::new();
                for row in client
                    .query(
                        "select id, title, folder, markdown, rendered_html, revision, created_at, updated_at, author_id, last_editor_id from notes",
                        &[],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let note = Note {
                        id: parse_uuid(row.get::<_, String>(0).as_str())?,
                        title: row.get(1),
                        folder: row.get(2),
                        markdown: row.get(3),
                        rendered_html: row.get(4),
                        revision: row.get::<_, i64>(5) as u64,
                        created_at: parse_datetime(row.get::<_, String>(6).as_str())?,
                        updated_at: parse_datetime(row.get::<_, String>(7).as_str())?,
                        author_id: parse_uuid(row.get::<_, String>(8).as_str())?,
                        last_editor_id: parse_uuid(row.get::<_, String>(9).as_str())?,
                    };
                    notes.insert(note.id, note);
                }
                Ok(Some(notes.into_values().collect()))
            }
        }
    }

    pub async fn create_note(&self, note: &Note) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                client
                    .execute(
                        "insert into notes
                         (id, title, folder, markdown, rendered_html, revision, created_at, updated_at, author_id, last_editor_id)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                        &[
                            &note.id.to_string(),
                            &note.title,
                            &note.folder,
                            &note.markdown,
                            &note.rendered_html,
                            &(note.revision as i64),
                            &note.created_at.to_rfc3339(),
                            &note.updated_at.to_rfc3339(),
                            &note.author_id.to_string(),
                            &note.last_editor_id.to_string(),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn update_note(&self, note: &Note, expected_revision: u64) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let updated = client
                    .execute(
                        "update notes
                         set title=$2, folder=$3, markdown=$4, rendered_html=$5, revision=$6, updated_at=$7, last_editor_id=$8
                         where id=$1 and revision=$9",
                        &[
                            &note.id.to_string(),
                            &note.title,
                            &note.folder,
                            &note.markdown,
                            &note.rendered_html,
                            &(note.revision as i64),
                            &note.updated_at.to_rfc3339(),
                            &note.last_editor_id.to_string(),
                            &(expected_revision as i64),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                if updated == 0 {
                    return Err(AppError::BadRequest("revision mismatch".into()));
                }
                Ok(true)
            }
        }
    }

    pub async fn delete_note(&self, id: Uuid) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                client
                    .execute("delete from notes where id=$1", &[&id.to_string()])
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn list_diagrams(&self) -> AppResult<Option<Vec<Diagram>>> {
        match self {
            Self::File { .. } => Ok(None),
            Self::Postgres { client, .. } => {
                let mut diagrams = HashMap::new();
                for row in client
                    .query(
                        "select id, title, xml, revision, created_at, updated_at, author_id, last_editor_id from diagrams",
                        &[],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let diagram = Diagram {
                        id: parse_uuid(row.get::<_, String>(0).as_str())?,
                        title: row.get(1),
                        xml: row.get(2),
                        revision: row.get::<_, i64>(3) as u64,
                        created_at: parse_datetime(row.get::<_, String>(4).as_str())?,
                        updated_at: parse_datetime(row.get::<_, String>(5).as_str())?,
                        author_id: parse_uuid(row.get::<_, String>(6).as_str())?,
                        last_editor_id: parse_uuid(row.get::<_, String>(7).as_str())?,
                    };
                    diagrams.insert(diagram.id, diagram);
                }
                Ok(Some(diagrams.into_values().collect()))
            }
        }
    }

    pub async fn create_diagram(&self, diagram: &Diagram) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                client
                    .execute(
                        "insert into diagrams (id, title, xml, revision, created_at, updated_at, author_id, last_editor_id)
                         values ($1,$2,$3,$4,$5,$6,$7,$8)",
                        &[
                            &diagram.id.to_string(),
                            &diagram.title,
                            &diagram.xml,
                            &(diagram.revision as i64),
                            &diagram.created_at.to_rfc3339(),
                            &diagram.updated_at.to_rfc3339(),
                            &diagram.author_id.to_string(),
                            &diagram.last_editor_id.to_string(),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn update_diagram(
        &self,
        diagram: &Diagram,
        expected_revision: u64,
    ) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let updated = client
                    .execute(
                        "update diagrams
                         set title=$2, xml=$3, revision=$4, updated_at=$5, last_editor_id=$6
                         where id=$1 and revision=$7",
                        &[
                            &diagram.id.to_string(),
                            &diagram.title,
                            &diagram.xml,
                            &(diagram.revision as i64),
                            &diagram.updated_at.to_rfc3339(),
                            &diagram.last_editor_id.to_string(),
                            &(expected_revision as i64),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                if updated == 0 {
                    return Err(AppError::BadRequest("revision mismatch".into()));
                }
                Ok(true)
            }
        }
    }

    pub async fn delete_diagram(&self, diagram_id: Uuid) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                client
                    .execute(
                        "delete from diagrams where id=$1",
                        &[&diagram_id.to_string()],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn list_rooms(&self) -> AppResult<Option<Vec<Room>>> {
        match self {
            Self::File { .. } => Ok(None),
            Self::Postgres { client, .. } => {
                let mut rooms = HashMap::new();
                for row in client
                    .query(
                        "select id, name, kind, created_at, participant_ids_json from rooms",
                        &[],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let participant_ids =
                        serde_json::from_str::<Vec<String>>(&row.get::<_, String>(4))
                            .map_err(|err| AppError::Internal(err.to_string()))?
                            .into_iter()
                            .map(|value| parse_uuid(value.as_str()))
                            .collect::<AppResult<Vec<_>>>()?;
                    let room = Room {
                        id: parse_uuid(row.get::<_, String>(0).as_str())?,
                        name: row.get(1),
                        kind: parse_room_kind(row.get::<_, String>(2).as_str())?,
                        created_at: parse_datetime(row.get::<_, String>(3).as_str())?,
                        participant_ids,
                        participant_labels: Vec::new(),
                    };
                    rooms.insert(room.id, room);
                }
                Ok(Some(rooms.into_values().collect()))
            }
        }
    }

    pub async fn create_room(&self, room: &Room) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let participant_ids_json = serde_json::to_string(
                    &room
                        .participant_ids
                        .iter()
                        .map(Uuid::to_string)
                        .collect::<Vec<_>>(),
                )
                .map_err(|err| AppError::Internal(err.to_string()))?;
                client
                    .execute(
                        "insert into rooms (id, name, kind, created_at, participant_ids_json) values ($1,$2,$3,$4,$5)",
                        &[
                            &room.id.to_string(),
                            &room.name,
                            &room_kind_to_str(&room.kind),
                            &room.created_at.to_rfc3339(),
                            &participant_ids_json,
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn update_room(&self, room: &Room) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let participant_ids_json = serde_json::to_string(
                    &room
                        .participant_ids
                        .iter()
                        .map(Uuid::to_string)
                        .collect::<Vec<_>>(),
                )
                .map_err(|err| AppError::Internal(err.to_string()))?;
                client
                    .execute(
                        "update rooms set name = $2, participant_ids_json = $3 where id = $1",
                        &[&room.id.to_string(), &room.name, &participant_ids_json],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn delete_room(&self, room_id: Uuid) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                client
                    .execute("delete from messages where room_id = $1", &[&room_id.to_string()])
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                client
                    .execute("delete from rooms where id = $1", &[&room_id.to_string()])
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn list_messages(
        &self,
        room_id: Uuid,
        users: &HashMap<Uuid, StoredUser>,
    ) -> AppResult<Option<Vec<Message>>> {
        match self {
            Self::File { .. } => Ok(None),
            Self::Postgres { client, .. } => {
                let mut messages = Vec::new();
                for row in client
                    .query(
                        "select id, room_id, author_id, body, created_at from messages where room_id = $1 order by created_at asc",
                        &[&room_id.to_string()],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let author_id = parse_uuid(row.get::<_, String>(2).as_str())?;
                    let author_profile = users
                        .get(&author_id)
                        .map(|stored| stored.profile.clone())
                        .unwrap_or_else(|| UserProfile {
                            id: author_id,
                            username: format!("user-{}", &author_id.to_string()[..8]),
                            email: String::new(),
                            display_name: format!("User {}", &author_id.to_string()[..8]),
                            avatar_path: None,
                            avatar_content_type: None,
                            role: "member".into(),
                            roles: vec!["member".into()],
                            must_change_password: false,
                        });
                    messages.push(Message {
                        id: parse_uuid(row.get::<_, String>(0).as_str())?,
                        room_id: parse_uuid(row.get::<_, String>(1).as_str())?,
                        author: author_profile,
                        body: row.get(3),
                        created_at: parse_datetime(row.get::<_, String>(4).as_str())?,
                    });
                }
                Ok(Some(messages))
            }
        }
    }

    pub async fn create_message(&self, message: &Message) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let room_exists = client
                    .query_opt(
                        "select id from rooms where id = $1",
                        &[&message.room_id.to_string()],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                if room_exists.is_none() {
                    return Err(AppError::NotFound);
                }
                client
                    .execute(
                        "insert into messages (id, room_id, author_id, body, created_at)
                         values ($1,$2,$3,$4,$5)",
                        &[
                            &message.id.to_string(),
                            &message.room_id.to_string(),
                            &message.author.id.to_string(),
                            &message.body,
                            &message.created_at.to_rfc3339(),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }
}

async fn sync_relational_state(
    client: &tokio_postgres::Client,
    snapshot: &StateData,
) -> AppResult<()> {
    for statement in [
        "delete from messages",
        "delete from rooms",
        "delete from resource_shares",
        "delete from transcription_jobs",
        "delete from voice_memos",
        "delete from diagrams",
        "delete from notes",
        "delete from users",
    ] {
        client
            .execute(statement, &[])
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for stored_user in snapshot.users.values() {
        let tool_scope_json = serde_json::to_string(&stored_user.tool_scope)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        client
            .execute(
                "insert into users (id, username, email, display_name, avatar_path, avatar_content_type, role, roles_json, must_change_password, storage_limit_mb, tool_scope_json, password_hash) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
                &[
                    &stored_user.profile.id.to_string(),
                    &stored_user.profile.username,
                    &stored_user.profile.email,
                    &stored_user.profile.display_name,
                    &stored_user.profile.avatar_path.clone().unwrap_or_default(),
                    &stored_user
                        .profile
                        .avatar_content_type
                        .clone()
                        .unwrap_or_default(),
                    &stored_user.profile.role,
                    &serde_json::to_string(&stored_user.profile.roles)
                        .map_err(|err| AppError::Internal(err.to_string()))?,
                    &stored_user.profile.must_change_password,
                    &(stored_user.storage_limit_mb as i64),
                    &tool_scope_json,
                    &stored_user.password_hash,
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for note in snapshot.notes.values() {
        client
            .execute(
                "insert into notes
                 (id, title, folder, markdown, rendered_html, revision, created_at, updated_at, author_id, last_editor_id)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                &[
                    &note.id.to_string(),
                    &note.title,
                    &note.folder,
                    &note.markdown,
                    &note.rendered_html,
                    &(note.revision as i64),
                    &note.created_at.to_rfc3339(),
                    &note.updated_at.to_rfc3339(),
                    &note.author_id.to_string(),
                    &note.last_editor_id.to_string(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for diagram in snapshot.diagrams.values() {
        client
            .execute(
                "insert into diagrams (id, title, xml, revision, created_at, updated_at, author_id, last_editor_id)
                 values ($1,$2,$3,$4,$5,$6,$7,$8)",
                &[
                    &diagram.id.to_string(),
                    &diagram.title,
                    &diagram.xml,
                    &(diagram.revision as i64),
                    &diagram.created_at.to_rfc3339(),
                    &diagram.updated_at.to_rfc3339(),
                    &diagram.author_id.to_string(),
                    &diagram.last_editor_id.to_string(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for memo in snapshot.memos.values() {
        let segments_json = serde_json::to_string(&memo.transcript_segments)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        client
            .execute(
                "insert into voice_memos
                 (id, title, audio_path, transcript, transcript_segments_json, status, model, device, created_at, updated_at, failure_reason, owner_id)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                &[
                    &memo.id.to_string(),
                    &memo.title,
                    &memo.audio_path,
                    &memo.transcript,
                    &segments_json,
                    &job_status_to_str(&memo.status),
                    &memo.model,
                    &memo.device,
                    &memo.created_at.to_rfc3339(),
                    &memo.updated_at.to_rfc3339(),
                    &memo.failure_reason,
                    &memo.owner_id.to_string(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for job in snapshot.jobs.values() {
        client
            .execute(
                "insert into transcription_jobs (id, memo_id, status, failure_reason)
                 values ($1,$2,$3,$4)",
                &[
                    &job.id.to_string(),
                    &job.memo_id.to_string(),
                    &job_status_to_str(&job.status),
                    &job.failure_reason,
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for room in snapshot.rooms.values() {
        let participant_ids_json = serde_json::to_string(
            &room
                .participant_ids
                .iter()
                .map(Uuid::to_string)
                .collect::<Vec<_>>(),
        )
        .map_err(|err| AppError::Internal(err.to_string()))?;
        client
            .execute(
                "insert into rooms (id, name, kind, created_at, participant_ids_json) values ($1,$2,$3,$4,$5)",
                &[
                    &room.id.to_string(),
                    &room.name,
                    &room_kind_to_str(&room.kind),
                    &room.created_at.to_rfc3339(),
                    &participant_ids_json,
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for room_messages in snapshot.messages.values() {
        for message in room_messages {
            client
                .execute(
                    "insert into messages (id, room_id, author_id, body, created_at)
                     values ($1,$2,$3,$4,$5)",
                    &[
                        &message.id.to_string(),
                        &message.room_id.to_string(),
                        &message.author.id.to_string(),
                        &message.body,
                        &message.created_at.to_rfc3339(),
                    ],
                )
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
    }

    for share in snapshot.resource_shares.values() {
        let user_ids_json = serde_json::to_string(
            &share
                .user_ids
                .iter()
                .map(Uuid::to_string)
                .collect::<Vec<_>>(),
        )
        .map_err(|err| AppError::Internal(err.to_string()))?;
        client
            .execute(
                "insert into resource_shares (resource_key, visibility, user_ids_json, updated_at, updated_by)
                 values ($1,$2,$3,$4,$5)",
                &[
                    &share.resource_key,
                    &resource_visibility_to_str(&share.visibility),
                    &user_ids_json,
                    &share.updated_at.to_rfc3339(),
                    &share.updated_by.to_string(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    Ok(())
}

async fn load_relational_state(client: &tokio_postgres::Client) -> AppResult<Option<StateData>> {
    let user_rows = client
        .query(
            "select id, username, email, display_name, avatar_path, avatar_content_type, role, roles_json, must_change_password, storage_limit_mb, tool_scope_json, password_hash from users",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?;

    let Some(user_row) = user_rows.first().cloned() else {
        return Ok(None);
    };

    let mut users = HashMap::new();
    for user_row in &user_rows {
        let user = UserProfile {
            id: parse_uuid(user_row.get::<_, String>(0).as_str())?,
            username: user_row.get(1),
            email: user_row.get(2),
            display_name: user_row.get(3),
            avatar_path: string_column_to_option(user_row.get(4)),
            avatar_content_type: string_column_to_option(user_row.get(5)),
            role: user_row.get(6),
            roles: parse_user_roles(
                user_row.get::<_, String>(7).as_str(),
                user_row.get::<_, String>(6).as_str(),
            ),
            must_change_password: user_row.get(8),
        };
        let storage_limit_mb = user_row.get::<_, i64>(9).max(0) as u64;
        let tool_scope: UserToolScope =
            serde_json::from_str(user_row.get::<_, String>(10).as_str()).unwrap_or_default();
        let password_hash: String = user_row.get(11);
        users.insert(
            user.id,
            StoredUser {
                profile: user,
                password_hash,
                linked_oidc_subject: None,
                storage_limit_mb,
                tool_scope,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            },
        );
    }

    let user = UserProfile {
        id: parse_uuid(user_row.get::<_, String>(0).as_str())?,
        username: user_row.get(1),
        email: user_row.get(2),
        display_name: user_row.get(3),
        avatar_path: string_column_to_option(user_row.get(4)),
        avatar_content_type: string_column_to_option(user_row.get(5)),
        role: user_row.get(6),
        roles: parse_user_roles(
            user_row.get::<_, String>(7).as_str(),
            user_row.get::<_, String>(6).as_str(),
        ),
        must_change_password: user_row.get(8),
    };
    let password_hash: String = user_row.get(11);

    let mut notes = HashMap::new();
    for row in client
        .query(
            "select id, title, folder, markdown, rendered_html, revision, created_at, updated_at, author_id, last_editor_id from notes",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let note = Note {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            title: row.get(1),
            folder: row.get(2),
            markdown: row.get(3),
            rendered_html: row.get(4),
            revision: row.get::<_, i64>(5) as u64,
            created_at: parse_datetime(row.get::<_, String>(6).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(7).as_str())?,
            author_id: parse_uuid(row.get::<_, String>(8).as_str())?,
            last_editor_id: parse_uuid(row.get::<_, String>(9).as_str())?,
        };
        notes.insert(note.id, note);
    }

    let mut diagrams = HashMap::new();
    for row in client
        .query(
            "select id, title, xml, revision, created_at, updated_at, author_id, last_editor_id from diagrams",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let diagram = Diagram {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            title: row.get(1),
            xml: row.get(2),
            revision: row.get::<_, i64>(3) as u64,
            created_at: parse_datetime(row.get::<_, String>(4).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(5).as_str())?,
            author_id: parse_uuid(row.get::<_, String>(6).as_str())?,
            last_editor_id: parse_uuid(row.get::<_, String>(7).as_str())?,
        };
        diagrams.insert(diagram.id, diagram);
    }

    let mut memos = HashMap::new();
    for row in client
        .query(
            "select id, title, audio_path, transcript, transcript_segments_json, status, model, device, created_at, updated_at, failure_reason, owner_id from voice_memos",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let segments: Vec<TranscriptSegment> =
            serde_json::from_str(row.get::<_, String>(4).as_str())
                .map_err(|err| AppError::Internal(err.to_string()))?;
        let memo = VoiceMemo {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            title: row.get(1),
            audio_path: row.get(2),
            transcript: row.get(3),
            transcript_segments: segments,
            status: parse_job_status(row.get::<_, String>(5).as_str())?,
            model: row.get(6),
            device: row.get(7),
            created_at: parse_datetime(row.get::<_, String>(8).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(9).as_str())?,
            failure_reason: row.get(10),
            owner_id: parse_uuid(row.get::<_, String>(11).as_str())?,
        };
        memos.insert(memo.id, memo);
    }

    let mut jobs = HashMap::new();
    for row in client
        .query(
            "select id, memo_id, status, failure_reason from transcription_jobs",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let job = TranscriptionJob {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            memo_id: parse_uuid(row.get::<_, String>(1).as_str())?,
            status: parse_job_status(row.get::<_, String>(2).as_str())?,
            failure_reason: row.get(3),
        };
        jobs.insert(job.id, job);
    }

    let mut rooms = HashMap::new();
    for row in client
        .query(
            "select id, name, kind, created_at, participant_ids_json from rooms",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let participant_ids = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(4))
            .map_err(|err| AppError::Internal(err.to_string()))?
            .into_iter()
            .map(|value| parse_uuid(value.as_str()))
            .collect::<AppResult<Vec<_>>>()?;
        let room = Room {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            name: row.get(1),
            kind: parse_room_kind(row.get::<_, String>(2).as_str())?,
            created_at: parse_datetime(row.get::<_, String>(3).as_str())?,
            participant_ids,
            participant_labels: Vec::new(),
        };
        rooms.insert(room.id, room);
    }

    let mut messages: HashMap<Uuid, Vec<Message>> = HashMap::new();
    for row in client
        .query(
            "select id, room_id, author_id, body, created_at from messages order by created_at asc",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let author_id = parse_uuid(row.get::<_, String>(2).as_str())?;
        let author_profile = users
            .get(&author_id)
            .map(|stored| stored.profile.clone())
            .unwrap_or_else(|| UserProfile {
                id: author_id,
                username: user.username.clone(),
                email: user.email.clone(),
                display_name: user.display_name.clone(),
                avatar_path: user.avatar_path.clone(),
                avatar_content_type: user.avatar_content_type.clone(),
                role: user.role.clone(),
                roles: user.roles.clone(),
                must_change_password: false,
            });
        let message = Message {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            room_id: parse_uuid(row.get::<_, String>(1).as_str())?,
            author: author_profile,
            body: row.get(3),
            created_at: parse_datetime(row.get::<_, String>(4).as_str())?,
        };
        messages.entry(message.room_id).or_default().push(message);
    }

    let mut resource_shares = HashMap::new();
    for row in client
        .query(
            "select resource_key, visibility, user_ids_json, updated_at, updated_by from resource_shares",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let user_ids = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(2))
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| Uuid::parse_str(value.as_str()).ok())
            .collect::<Vec<_>>();
        let share = ResourceShare {
            resource_key: row.get(0),
            visibility: parse_resource_visibility(row.get::<_, String>(1).as_str())?,
            user_ids,
            updated_at: parse_datetime(row.get::<_, String>(3).as_str())?,
            updated_by: parse_uuid(row.get::<_, String>(4).as_str())?,
        };
        resource_shares.insert(share.resource_key.clone(), share);
    }

    Ok(Some(StateData {
        users,
        admin_settings: AdminSettings::default(),
        user,
        password_hash,
        notes,
        diagrams,
        memos,
        jobs,
        rooms,
        messages,
        resource_shares,
        pending_credential_changes: HashMap::new(),
    }))
}

fn parse_uuid(value: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value).map_err(|err| AppError::Internal(err.to_string()))
}

fn parse_datetime(value: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|datetime| datetime.with_timezone(&Utc))
        .map_err(|err| AppError::Internal(err.to_string()))
}

fn parse_user_roles(value: &str, fallback_role: &str) -> Vec<String> {
    let parsed = serde_json::from_str::<Vec<String>>(value).unwrap_or_default();
    if parsed.is_empty() {
        vec![if fallback_role.trim().is_empty() {
            "member".into()
        } else {
            fallback_role.to_string()
        }]
    } else {
        parsed
    }
}

fn string_column_to_option(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_room_kind(value: &str) -> AppResult<RoomKind> {
    match value {
        "channel" => Ok(RoomKind::Channel),
        "direct" => Ok(RoomKind::Direct),
        _ => Err(AppError::Internal(format!("invalid room kind: {value}"))),
    }
}

fn parse_job_status(value: &str) -> AppResult<JobStatus> {
    match value {
        "pending" => Ok(JobStatus::Pending),
        "running" => Ok(JobStatus::Running),
        "completed" => Ok(JobStatus::Completed),
        "failed" => Ok(JobStatus::Failed),
        _ => Err(AppError::Internal(format!("invalid job status: {value}"))),
    }
}

fn room_kind_to_str(kind: &RoomKind) -> &'static str {
    match kind {
        RoomKind::Channel => "channel",
        RoomKind::Direct => "direct",
    }
}

fn job_status_to_str(status: &JobStatus) -> &'static str {
    match status {
        JobStatus::Pending => "pending",
        JobStatus::Running => "running",
        JobStatus::Completed => "completed",
        JobStatus::Failed => "failed",
    }
}

fn parse_resource_visibility(value: &str) -> AppResult<ResourceVisibility> {
    match value {
        "private" => Ok(ResourceVisibility::Private),
        "org" => Ok(ResourceVisibility::Org),
        "users" => Ok(ResourceVisibility::Users),
        _ => Err(AppError::Internal(format!(
            "invalid resource visibility: {value}"
        ))),
    }
}

fn resource_visibility_to_str(visibility: &ResourceVisibility) -> &'static str {
    match visibility {
        ResourceVisibility::Private => "private",
        ResourceVisibility::Org => "org",
        ResourceVisibility::Users => "users",
    }
}
