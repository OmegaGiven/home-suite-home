use std::{collections::HashMap, path::PathBuf, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::{fs, spawn};
use tokio_postgres::NoTls;
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{
        AdminSettings, CalendarConnection, CalendarEvent, CalendarProvider, Diagram, JobStatus,
        Message, MessageReaction, Note, NoteConflictRecord, NoteDocument,
        NoteSession, ObjectNamespace, ResourceShare, ResourceVisibility, Room, RoomKind, StoredUser, SyncEntityKind,
        SyncTombstone, TaskItem, TaskStatus, TranscriptSegment, TranscriptionJob, UserProfile,
        UserToolScope, VoiceMemo,
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
                                object_id text not null default '',
                                namespace_json text not null default '{}',
                                visibility text not null default 'private',
                                shared_user_ids_json text not null default '[]',
                                title text not null,
                                folder text not null,
                                markdown text not null,
                                rendered_html text not null,
                                editor_format text not null default 'legacy_markdown',
                                loro_snapshot_b64 text not null default '',
                                loro_updates_b64_json text not null default '[]',
                                loro_version bigint not null default 0,
                                loro_needs_migration boolean not null default true,
                                document_json text not null default '{}',
                                revision bigint not null,
                                created_at text not null,
                                updated_at text not null,
                                author_id text not null,
                                last_editor_id text not null,
                                forked_from_note_id text,
                                conflict_tag text,
                                deleted_at text,
                                purge_at text
                            );
                            alter table notes add column if not exists object_id text not null default '';
                            alter table notes add column if not exists namespace_json text not null default '{}';
                            alter table notes add column if not exists visibility text not null default 'private';
                            alter table notes add column if not exists shared_user_ids_json text not null default '[]';
                            alter table notes add column if not exists editor_format text not null default 'legacy_markdown';
                            alter table notes add column if not exists loro_snapshot_b64 text not null default '';
                            alter table notes add column if not exists loro_updates_b64_json text not null default '[]';
                            alter table notes add column if not exists loro_version bigint not null default 0;
                            alter table notes add column if not exists loro_needs_migration boolean not null default true;
                            alter table notes add column if not exists document_json text not null default '{}';
                            alter table notes add column if not exists forked_from_note_id text;
                            alter table notes add column if not exists conflict_tag text;
                            alter table notes add column if not exists deleted_at text;
                            alter table notes add column if not exists purge_at text;
                            create table if not exists note_document_updates (
                                note_id text not null,
                                sequence bigint generated always as identity primary key,
                                update_b64 text not null
                            );
                            create index if not exists note_document_updates_note_id_idx
                                on note_document_updates (note_id, sequence);
                            create table if not exists diagrams (
                                id text primary key,
                                title text not null,
                                xml text not null,
                                revision bigint not null,
                                created_at text not null,
                                updated_at text not null,
                                author_id text not null default '',
                                last_editor_id text not null default '',
                                deleted_at text,
                                purge_at text
                            );
                            alter table diagrams add column if not exists author_id text not null default '';
                            alter table diagrams add column if not exists last_editor_id text not null default '';
                            alter table diagrams add column if not exists deleted_at text;
                            alter table diagrams add column if not exists purge_at text;
                            create table if not exists voice_memos (
                                id text primary key,
                                object_id text not null default '',
                                namespace_json text not null default '{}',
                                visibility text not null default 'private',
                                shared_user_ids_json text not null default '[]',
                                title text not null,
                                audio_path text not null,
                                transcript text,
                                transcript_segments_json text not null,
                                transcript_tags_json text not null default '[]',
                                topic_summary text,
                                source_channels_json text not null default '[]',
                                status text not null,
                                model text not null,
                                device text not null,
                                created_at text not null,
                                updated_at text not null,
                                failure_reason text,
                                owner_id text not null default '',
                                deleted_at text,
                                purge_at text
                            );
                            alter table voice_memos add column if not exists object_id text not null default '';
                            alter table voice_memos add column if not exists namespace_json text not null default '{}';
                            alter table voice_memos add column if not exists visibility text not null default 'private';
                            alter table voice_memos add column if not exists shared_user_ids_json text not null default '[]';
                            alter table voice_memos add column if not exists transcript_tags_json text not null default '[]';
                            alter table voice_memos add column if not exists topic_summary text;
                            alter table voice_memos add column if not exists source_channels_json text not null default '[]';
                            alter table voice_memos add column if not exists owner_id text not null default '';
                            alter table voice_memos add column if not exists deleted_at text;
                            alter table voice_memos add column if not exists purge_at text;
                            create table if not exists deleted_drive_items (
                                id text primary key,
                                original_path text not null,
                                backup_path text not null,
                                label text not null,
                                is_dir boolean not null default false,
                                deleted_at text not null,
                                purge_at text not null
                            );
                            create table if not exists audit_log (
                                id text primary key,
                                occurred_at text not null,
                                actor_id text not null,
                                actor_label text not null,
                                source text not null,
                                action text not null,
                                target_kind text not null,
                                target_id text not null,
                                target_label text not null,
                                details_json text not null default '{}'
                            );
                            create table if not exists transcription_jobs (
                                id text primary key,
                                memo_id text not null,
                                status text not null,
                                failure_reason text
                            );
                            create table if not exists rooms (
                                id text primary key,
                                name text not null,
                                folder text not null default '',
                                kind text not null,
                                created_at text not null,
                                participant_ids_json text not null default '[]'
                            );
                            alter table rooms add column if not exists folder text not null default '';
                            alter table rooms add column if not exists participant_ids_json text not null default '[]';
                            create table if not exists messages (
                                id text primary key,
                                room_id text not null,
                                author_id text not null,
                                body text not null,
                                created_at text not null,
                                reactions_json text not null default '[]'
                            );
                            alter table messages add column if not exists reactions_json text not null default '[]';
                            create table if not exists resource_shares (
                                resource_key text primary key,
                                visibility text not null,
                                user_ids_json text not null default '[]',
                                updated_at text not null,
                                updated_by text not null
                            );
                            create table if not exists calendar_connections (
                                id text primary key,
                                owner_id text not null,
                                owner_display_name text not null default '',
                                title text not null,
                                provider text not null,
                                external_id text not null,
                                calendar_id text not null,
                                account_label text not null default '',
                                access_token text,
                                refresh_token text,
                                token_expires_at text,
                                ics_url text,
                                created_at text not null,
                                updated_at text not null
                            );
                            create table if not exists calendar_events (
                                id text primary key,
                                connection_id text not null,
                                title text not null,
                                description text not null default '',
                                location text not null default '',
                                start_at text not null,
                                end_at text not null,
                                all_day boolean not null default false,
                                source_url text not null default '',
                                organizer text not null default '',
                                updated_at text
                            );
                            create table if not exists tasks (
                                id text primary key,
                                owner_id text not null,
                                owner_display_name text not null default '',
                                title text not null,
                                description text not null default '',
                                status text not null,
                                start_at text,
                                end_at text,
                                all_day boolean not null default false,
                                calendar_connection_id text,
                                created_at text not null,
                                updated_at text not null,
                                completed_at text
                            );
                            drop table if exists note_operations;
                            create table if not exists sync_tombstones (
                                entity text not null,
                                id text not null,
                                deleted_at text not null,
                                primary key (entity, id)
                            );
                            create table if not exists note_sessions (
                                note_id text not null,
                                session_id text not null,
                                user_id text not null,
                                user_label text not null,
                                user_avatar_path text,
                                client_id text not null,
                                opened_at text not null,
                                last_seen_at text not null,
                                primary key (note_id, session_id)
                            );
                            create table if not exists note_conflicts (
                                id text primary key,
                                note_id text not null,
                                operation_id text not null,
                                reason text not null,
                                forked_note_ids_json text not null default '[]',
                                created_at text not null
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
                let note_updates = load_note_document_updates(client.as_ref()).await?;
                let mut notes = HashMap::new();
                for row in client
                    .query(
                        "select id, object_id, namespace_json, visibility, shared_user_ids_json, title, folder, markdown, rendered_html, editor_format, loro_snapshot_b64, loro_updates_b64_json, loro_version, loro_needs_migration, document_json, revision, created_at, updated_at, author_id, last_editor_id, forked_from_note_id, conflict_tag, deleted_at, purge_at from notes",
                        &[],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let note_id = parse_uuid(row.get::<_, String>(0).as_str())?;
                    let note = Note {
                        id: note_id,
                        object_id: row.get(1),
                        namespace: serde_json::from_str::<ObjectNamespace>(row.get::<_, String>(2).as_str())
                            .unwrap_or_default(),
                        visibility: parse_resource_visibility(row.get::<_, String>(3).as_str())?,
                        shared_user_ids: serde_json::from_str::<Vec<String>>(row.get::<_, String>(4).as_str())
                            .unwrap_or_default()
                            .into_iter()
                            .map(|value| parse_uuid(value.as_str()))
                            .collect::<AppResult<Vec<_>>>()?,
                        title: row.get(5),
                        folder: row.get(6),
                        markdown: row.get(7),
                        rendered_html: row.get(8),
                        editor_format: row.get(9),
                        loro_snapshot_b64: row.get(10),
                        loro_updates_b64: note_updates
                            .get(&note_id)
                            .cloned()
                            .unwrap_or_else(|| {
                                serde_json::from_str::<Vec<String>>(row.get::<_, String>(11).as_str())
                                    .unwrap_or_default()
                            }),
                        loro_version: row.get::<_, i64>(12) as u64,
                        loro_needs_migration: row.get(13),
                        document: serde_json::from_str::<Option<NoteDocument>>(row.get::<_, String>(14).as_str())
                            .ok()
                            .flatten()
                            .or_else(|| {
                                serde_json::from_str::<NoteDocument>(row.get::<_, String>(14).as_str())
                                    .ok()
                            }),
                        revision: row.get::<_, i64>(15) as u64,
                        created_at: parse_datetime(row.get::<_, String>(16).as_str())?,
                        updated_at: parse_datetime(row.get::<_, String>(17).as_str())?,
                        author_id: parse_uuid(row.get::<_, String>(18).as_str())?,
                        last_editor_id: parse_uuid(row.get::<_, String>(19).as_str())?,
                        forked_from_note_id: optional_uuid_from_string(row.get(20))?,
                        conflict_tag: string_column_to_option(row.get::<_, Option<String>>(21)),
                        deleted_at: optional_datetime_from_string(row.get(22))?,
                        purge_at: optional_datetime_from_string(row.get(23))?,
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
                let namespace_json = serde_json::to_string(&note.namespace)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                let shared_user_ids_json = serde_json::to_string(
                    &note.shared_user_ids.iter().map(Uuid::to_string).collect::<Vec<_>>(),
                )
                .map_err(|err| AppError::Internal(err.to_string()))?;
                let loro_updates_b64_json = serde_json::to_string(&note.loro_updates_b64)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                let document_json = serde_json::to_string(&note.document)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                client
                    .execute(
                        "insert into notes
                         (id, object_id, namespace_json, visibility, shared_user_ids_json, title, folder, markdown, rendered_html, editor_format, loro_snapshot_b64, loro_updates_b64_json, loro_version, loro_needs_migration, document_json, revision, created_at, updated_at, author_id, last_editor_id, forked_from_note_id, conflict_tag, deleted_at, purge_at)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)",
                        &[
                            &note.id.to_string(),
                            &note.object_id,
                            &namespace_json,
                            &resource_visibility_to_str(&note.visibility),
                            &shared_user_ids_json,
                            &note.title,
                            &note.folder,
                            &note.markdown,
                            &note.rendered_html,
                            &note.editor_format,
                            &note.loro_snapshot_b64,
                            &loro_updates_b64_json,
                            &(note.loro_version as i64),
                            &note.loro_needs_migration,
                            &document_json,
                            &(note.revision as i64),
                            &note.created_at.to_rfc3339(),
                            &note.updated_at.to_rfc3339(),
                            &note.author_id.to_string(),
                            &note.last_editor_id.to_string(),
                            &note.forked_from_note_id.map(|value| value.to_string()),
                            &note.conflict_tag,
                            &note.deleted_at.map(|value| value.to_rfc3339()),
                            &note.purge_at.map(|value| value.to_rfc3339()),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                sync_note_document_updates(client.as_ref(), note).await?;
                Ok(true)
            }
        }
    }

    pub async fn update_note(&self, note: &Note, expected_revision: u64) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let namespace_json = serde_json::to_string(&note.namespace)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                let shared_user_ids_json = serde_json::to_string(
                    &note.shared_user_ids.iter().map(Uuid::to_string).collect::<Vec<_>>(),
                )
                .map_err(|err| AppError::Internal(err.to_string()))?;
                let loro_updates_b64_json = serde_json::to_string(&note.loro_updates_b64)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                let document_json = serde_json::to_string(&note.document)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                let updated = client
                    .execute(
                        "update notes
                         set object_id=$2, namespace_json=$3, visibility=$4, shared_user_ids_json=$5, title=$6, folder=$7, markdown=$8, rendered_html=$9, editor_format=$10, loro_snapshot_b64=$11, loro_updates_b64_json=$12, loro_version=$13, loro_needs_migration=$14, document_json=$15, revision=$16, updated_at=$17, last_editor_id=$18, forked_from_note_id=$19, conflict_tag=$20, deleted_at=$21, purge_at=$22
                         where id=$1 and revision=$23",
                        &[
                            &note.id.to_string(),
                            &note.object_id,
                            &namespace_json,
                            &resource_visibility_to_str(&note.visibility),
                            &shared_user_ids_json,
                            &note.title,
                            &note.folder,
                            &note.markdown,
                            &note.rendered_html,
                            &note.editor_format,
                            &note.loro_snapshot_b64,
                            &loro_updates_b64_json,
                            &(note.loro_version as i64),
                            &note.loro_needs_migration,
                            &document_json,
                            &(note.revision as i64),
                            &note.updated_at.to_rfc3339(),
                            &note.last_editor_id.to_string(),
                            &note.forked_from_note_id.map(|value| value.to_string()),
                            &note.conflict_tag,
                            &note.deleted_at.map(|value| value.to_rfc3339()),
                            &note.purge_at.map(|value| value.to_rfc3339()),
                            &(expected_revision as i64),
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                if updated == 0 {
                    return Err(AppError::BadRequest("revision mismatch".into()));
                }
                sync_note_document_updates(client.as_ref(), note).await?;
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
                        "select id, title, xml, revision, created_at, updated_at, author_id, last_editor_id, deleted_at, purge_at from diagrams",
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
                        deleted_at: optional_datetime_from_string(row.get(8))?,
                        purge_at: optional_datetime_from_string(row.get(9))?,
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
                        "insert into diagrams (id, title, xml, revision, created_at, updated_at, author_id, last_editor_id, deleted_at, purge_at)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                        &[
                            &diagram.id.to_string(),
                            &diagram.title,
                            &diagram.xml,
                            &(diagram.revision as i64),
                            &diagram.created_at.to_rfc3339(),
                            &diagram.updated_at.to_rfc3339(),
                            &diagram.author_id.to_string(),
                            &diagram.last_editor_id.to_string(),
                            &diagram.deleted_at.map(|value| value.to_rfc3339()),
                            &diagram.purge_at.map(|value| value.to_rfc3339()),
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
                         set title=$2, xml=$3, revision=$4, updated_at=$5, last_editor_id=$6, deleted_at=$7, purge_at=$8
                         where id=$1 and revision=$9",
                        &[
                            &diagram.id.to_string(),
                            &diagram.title,
                            &diagram.xml,
                            &(diagram.revision as i64),
                            &diagram.updated_at.to_rfc3339(),
                            &diagram.last_editor_id.to_string(),
                            &diagram.deleted_at.map(|value| value.to_rfc3339()),
                            &diagram.purge_at.map(|value| value.to_rfc3339()),
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

    pub async fn list_rooms(&self) -> AppResult<Option<Vec<Room>>> {
        match self {
            Self::File { .. } => Ok(None),
            Self::Postgres { client, .. } => {
                let mut rooms = HashMap::new();
                for row in client
                    .query(
                        "select id, name, folder, kind, created_at, participant_ids_json from rooms",
                        &[],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?
                {
                    let participant_ids =
                        serde_json::from_str::<Vec<String>>(&row.get::<_, String>(5))
                            .map_err(|err| AppError::Internal(err.to_string()))?
                            .into_iter()
                            .map(|value| parse_uuid(value.as_str()))
                            .collect::<AppResult<Vec<_>>>()?;
                    let room = Room {
                        id: parse_uuid(row.get::<_, String>(0).as_str())?,
                        name: row.get(1),
                        folder: row.get(2),
                        kind: parse_room_kind(row.get::<_, String>(3).as_str())?,
                        created_at: parse_datetime(row.get::<_, String>(4).as_str())?,
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
                        "insert into rooms (id, name, folder, kind, created_at, participant_ids_json) values ($1,$2,$3,$4,$5,$6)",
                        &[
                            &room.id.to_string(),
                            &room.name,
                            &room.folder,
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
                        "update rooms set name = $2, folder = $3, participant_ids_json = $4 where id = $1",
                        &[&room.id.to_string(), &room.name, &room.folder, &participant_ids_json],
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
                        "select id, room_id, author_id, body, created_at, reactions_json from messages where room_id = $1 order by created_at asc",
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
                        reactions: serde_json::from_str::<Vec<MessageReaction>>(
                            row.get::<_, String>(5).as_str(),
                        )
                        .unwrap_or_default(),
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
                let reactions_json = serde_json::to_string(&message.reactions)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                client
                    .execute(
                        "insert into messages (id, room_id, author_id, body, created_at, reactions_json)
                         values ($1,$2,$3,$4,$5,$6)",
                        &[
                            &message.id.to_string(),
                            &message.room_id.to_string(),
                            &message.author.id.to_string(),
                            &message.body,
                            &message.created_at.to_rfc3339(),
                            &reactions_json,
                        ],
                    )
                    .await
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                Ok(true)
            }
        }
    }

    pub async fn update_message_reactions(
        &self,
        message_id: Uuid,
        reactions: &[MessageReaction],
    ) -> AppResult<bool> {
        match self {
            Self::File { .. } => Ok(false),
            Self::Postgres { client, .. } => {
                let reactions_json = serde_json::to_string(reactions)
                    .map_err(|err| AppError::Internal(err.to_string()))?;
                client
                    .execute(
                        "update messages set reactions_json = $2 where id = $1",
                        &[&message_id.to_string(), &reactions_json],
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
        "delete from sync_tombstones",
        "delete from audit_log",
        "delete from deleted_drive_items",
        "delete from note_conflicts",
        "delete from note_sessions",
        "delete from tasks",
        "delete from calendar_events",
        "delete from messages",
        "delete from rooms",
        "delete from calendar_connections",
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
        let namespace_json = serde_json::to_string(&note.namespace)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let shared_user_ids_json = serde_json::to_string(
            &note.shared_user_ids.iter().map(Uuid::to_string).collect::<Vec<_>>(),
        )
        .map_err(|err| AppError::Internal(err.to_string()))?;
        let loro_updates_b64_json = serde_json::to_string(&note.loro_updates_b64)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let document_json = serde_json::to_string(&note.document)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        client
            .execute(
                "insert into notes
                 (id, object_id, namespace_json, visibility, shared_user_ids_json, title, folder, markdown, rendered_html, editor_format, loro_snapshot_b64, loro_updates_b64_json, loro_version, loro_needs_migration, document_json, revision, created_at, updated_at, author_id, last_editor_id, forked_from_note_id, conflict_tag, deleted_at, purge_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)",
                &[
                    &note.id.to_string(),
                    &note.object_id,
                    &namespace_json,
                    &resource_visibility_to_str(&note.visibility),
                    &shared_user_ids_json,
                    &note.title,
                    &note.folder,
                    &note.markdown,
                    &note.rendered_html,
                    &note.editor_format,
                    &note.loro_snapshot_b64,
                    &loro_updates_b64_json,
                    &(note.loro_version as i64),
                    &note.loro_needs_migration,
                    &document_json,
                    &(note.revision as i64),
                    &note.created_at.to_rfc3339(),
                    &note.updated_at.to_rfc3339(),
                    &note.author_id.to_string(),
                    &note.last_editor_id.to_string(),
                    &note.forked_from_note_id.map(|value| value.to_string()),
                    &note.conflict_tag,
                    &note.deleted_at.map(|value| value.to_rfc3339()),
                    &note.purge_at.map(|value| value.to_rfc3339()),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        sync_note_document_updates(client, note).await?;
    }

    for diagram in snapshot.diagrams.values() {
        client
            .execute(
                "insert into diagrams (id, title, xml, revision, created_at, updated_at, author_id, last_editor_id, deleted_at, purge_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                &[
                    &diagram.id.to_string(),
                    &diagram.title,
                    &diagram.xml,
                    &(diagram.revision as i64),
                    &diagram.created_at.to_rfc3339(),
                    &diagram.updated_at.to_rfc3339(),
                    &diagram.author_id.to_string(),
                    &diagram.last_editor_id.to_string(),
                    &diagram.deleted_at.map(|value| value.to_rfc3339()),
                    &diagram.purge_at.map(|value| value.to_rfc3339()),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for deleted in snapshot.deleted_drive_items.values() {
        client
            .execute(
                "insert into deleted_drive_items (id, original_path, backup_path, label, is_dir, deleted_at, purge_at)
                 values ($1,$2,$3,$4,$5,$6,$7)",
                &[
                    &deleted.id,
                    &deleted.original_path,
                    &deleted.backup_path,
                    &deleted.label,
                    &deleted.is_dir,
                    &deleted.deleted_at.to_rfc3339(),
                    &deleted.purge_at.to_rfc3339(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for entry in &snapshot.audit_log {
        client
            .execute(
                "insert into audit_log (id, occurred_at, actor_id, actor_label, source, action, target_kind, target_id, target_label, details_json)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                &[
                    &entry.id,
                    &entry.occurred_at.to_rfc3339(),
                    &entry.actor_id,
                    &entry.actor_label,
                    &entry.source,
                    &entry.action,
                    &entry.target_kind,
                    &entry.target_id,
                    &entry.target_label,
                    &serde_json::to_string(&entry.details).map_err(|err| AppError::Internal(err.to_string()))?,
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for memo in snapshot.memos.values() {
        let segments_json = serde_json::to_string(&memo.transcript_segments)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let namespace_json = serde_json::to_string(&memo.namespace)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let shared_user_ids_json = serde_json::to_string(
            &memo.shared_user_ids.iter().map(Uuid::to_string).collect::<Vec<_>>(),
        )
        .map_err(|err| AppError::Internal(err.to_string()))?;
        let transcript_tags_json = serde_json::to_string(&memo.transcript_tags)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let source_channels_json = serde_json::to_string(&memo.source_channels)
            .map_err(|err| AppError::Internal(err.to_string()))?;
        client
            .execute(
                "insert into voice_memos
                 (id, object_id, namespace_json, visibility, shared_user_ids_json, title, audio_path, transcript, transcript_segments_json, transcript_tags_json, topic_summary, source_channels_json, status, model, device, created_at, updated_at, failure_reason, owner_id, deleted_at, purge_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)",
                &[
                    &memo.id.to_string(),
                    &memo.object_id,
                    &namespace_json,
                    &resource_visibility_to_str(&memo.visibility),
                    &shared_user_ids_json,
                    &memo.title,
                    &memo.audio_path,
                    &memo.transcript,
                    &segments_json,
                    &transcript_tags_json,
                    &memo.topic_summary,
                    &source_channels_json,
                    &job_status_to_str(&memo.status),
                    &memo.model,
                    &memo.device,
                    &memo.created_at.to_rfc3339(),
                    &memo.updated_at.to_rfc3339(),
                    &memo.failure_reason,
                    &memo.owner_id.to_string(),
                    &memo.deleted_at.map(|value| value.to_rfc3339()),
                    &memo.purge_at.map(|value| value.to_rfc3339()),
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
                "insert into rooms (id, name, folder, kind, created_at, participant_ids_json) values ($1,$2,$3,$4,$5,$6)",
                &[
                    &room.id.to_string(),
                    &room.name,
                    &room.folder,
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
            let reactions_json = serde_json::to_string(&message.reactions)
                .map_err(|err| AppError::Internal(err.to_string()))?;
            client
                .execute(
                    "insert into messages (id, room_id, author_id, body, created_at, reactions_json)
                     values ($1,$2,$3,$4,$5,$6)",
                    &[
                        &message.id.to_string(),
                        &message.room_id.to_string(),
                        &message.author.id.to_string(),
                        &message.body,
                        &message.created_at.to_rfc3339(),
                        &reactions_json,
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

    for connection in snapshot.calendar_connections.values() {
        client
            .execute(
                "insert into calendar_connections
                 (id, owner_id, owner_display_name, title, provider, external_id, calendar_id, account_label, access_token, refresh_token, token_expires_at, ics_url, created_at, updated_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
                &[
                    &connection.id.to_string(),
                    &connection.owner_id.to_string(),
                    &connection.owner_display_name,
                    &connection.title,
                    &calendar_provider_to_str(&connection.provider),
                    &connection.external_id,
                    &connection.calendar_id,
                    &connection.account_label,
                    &connection.access_token,
                    &connection.refresh_token,
                    &connection.token_expires_at.map(|value| value.to_rfc3339()),
                    &connection.ics_url,
                    &connection.created_at.to_rfc3339(),
                    &connection.updated_at.to_rfc3339(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for events in snapshot.calendar_events.values() {
        for event in events {
            client
                .execute(
                    "insert into calendar_events
                     (id, connection_id, title, description, location, start_at, end_at, all_day, source_url, organizer, updated_at)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                    &[
                        &event.id,
                        &event.connection_id.to_string(),
                        &event.title,
                        &event.description,
                        &event.location,
                        &event.start_at.to_rfc3339(),
                        &event.end_at.to_rfc3339(),
                        &event.all_day,
                        &event.source_url,
                        &event.organizer,
                        &event.updated_at.map(|value| value.to_rfc3339()),
                    ],
                )
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
    }

    for task in snapshot.tasks.values() {
        client
            .execute(
                "insert into tasks
                 (id, owner_id, owner_display_name, title, description, status, start_at, end_at, all_day, calendar_connection_id, created_at, updated_at, completed_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
                &[
                    &task.id.to_string(),
                    &task.owner_id.to_string(),
                    &task.owner_display_name,
                    &task.title,
                    &task.description,
                    &task_status_to_str(&task.status),
                    &task.start_at.map(|value| value.to_rfc3339()),
                    &task.end_at.map(|value| value.to_rfc3339()),
                    &task.all_day,
                    &task.calendar_connection_id.map(|value| value.to_string()),
                    &task.created_at.to_rfc3339(),
                    &task.updated_at.to_rfc3339(),
                    &task.completed_at.map(|value| value.to_rfc3339()),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for tombstone in &snapshot.sync_tombstones {
        client
            .execute(
                "insert into sync_tombstones (entity, id, deleted_at) values ($1,$2,$3)",
                &[
                    &sync_entity_kind_to_str(&tombstone.entity),
                    &tombstone.id,
                    &tombstone.deleted_at.to_rfc3339(),
                ],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }

    for sessions in snapshot.note_sessions.values() {
        for session in sessions {
            client
                .execute(
                    "insert into note_sessions (note_id, session_id, user_id, user_label, user_avatar_path, client_id, opened_at, last_seen_at)
                     values ($1,$2,$3,$4,$5,$6,$7,$8)",
                    &[
                        &session.note_id.to_string(),
                        &session.session_id,
                        &session.user_id.to_string(),
                        &session.user_label,
                        &session.user_avatar_path,
                        &session.client_id,
                        &session.opened_at.to_rfc3339(),
                        &session.last_seen_at.to_rfc3339(),
                    ],
                )
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
    }

    for conflicts in snapshot.note_conflicts.values() {
        for conflict in conflicts {
            client
                .execute(
                    "insert into note_conflicts (id, note_id, operation_id, reason, forked_note_ids_json, created_at)
                     values ($1,$2,$3,$4,$5,$6)",
                    &[
                        &conflict.id,
                        &conflict.note_id.to_string(),
                        &conflict.operation_id,
                        &conflict.reason,
                        &serde_json::to_string(
                            &conflict
                                .forked_note_ids
                                .iter()
                                .map(Uuid::to_string)
                                .collect::<Vec<_>>(),
                        )
                        .map_err(|err| AppError::Internal(err.to_string()))?,
                        &conflict.created_at.to_rfc3339(),
                    ],
                )
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
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
            avatar_path: string_column_to_option(Some(user_row.get(4))),
            avatar_content_type: string_column_to_option(Some(user_row.get(5))),
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
        avatar_path: string_column_to_option(Some(user_row.get(4))),
        avatar_content_type: string_column_to_option(Some(user_row.get(5))),
        role: user_row.get(6),
        roles: parse_user_roles(
            user_row.get::<_, String>(7).as_str(),
            user_row.get::<_, String>(6).as_str(),
        ),
        must_change_password: user_row.get(8),
    };
    let password_hash: String = user_row.get(11);

    let note_updates = load_note_document_updates(client).await?;
    let mut notes = HashMap::new();
    for row in client
        .query(
            "select id, object_id, namespace_json, visibility, shared_user_ids_json, title, folder, markdown, rendered_html, editor_format, loro_snapshot_b64, loro_updates_b64_json, loro_version, loro_needs_migration, document_json, revision, created_at, updated_at, author_id, last_editor_id, forked_from_note_id, conflict_tag, deleted_at, purge_at from notes",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let note_id = parse_uuid(row.get::<_, String>(0).as_str())?;
        let note = Note {
            id: note_id,
            object_id: row.get(1),
            namespace: serde_json::from_str::<ObjectNamespace>(row.get::<_, String>(2).as_str()).unwrap_or_default(),
            visibility: parse_resource_visibility(row.get::<_, String>(3).as_str())?,
            shared_user_ids: serde_json::from_str::<Vec<String>>(row.get::<_, String>(4).as_str())
                .unwrap_or_default()
                .into_iter()
                .map(|value| parse_uuid(value.as_str()))
                .collect::<AppResult<Vec<_>>>()?,
            title: row.get(5),
            folder: row.get(6),
            markdown: row.get(7),
            rendered_html: row.get(8),
            editor_format: row.get(9),
            loro_snapshot_b64: row.get(10),
            loro_updates_b64: note_updates
                .get(&note_id)
                .cloned()
                .unwrap_or_else(|| serde_json::from_str::<Vec<String>>(row.get::<_, String>(11).as_str()).unwrap_or_default()),
            loro_version: row.get::<_, i64>(12) as u64,
            loro_needs_migration: row.get(13),
            document: serde_json::from_str::<Option<NoteDocument>>(row.get::<_, String>(14).as_str())
                .ok()
                .flatten()
                .or_else(|| {
                    serde_json::from_str::<NoteDocument>(row.get::<_, String>(14).as_str())
                        .ok()
                }),
            revision: row.get::<_, i64>(15) as u64,
            created_at: parse_datetime(row.get::<_, String>(16).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(17).as_str())?,
            author_id: parse_uuid(row.get::<_, String>(18).as_str())?,
            last_editor_id: parse_uuid(row.get::<_, String>(19).as_str())?,
            forked_from_note_id: optional_uuid_from_string(row.get(20))?,
            conflict_tag: string_column_to_option(row.get::<_, Option<String>>(21)),
            deleted_at: optional_datetime_from_string(row.get(22))?,
            purge_at: optional_datetime_from_string(row.get(23))?,
        };
        notes.insert(note.id, note);
    }

    let mut diagrams = HashMap::new();
    for row in client
        .query(
            "select id, title, xml, revision, created_at, updated_at, author_id, last_editor_id, deleted_at, purge_at from diagrams",
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
            deleted_at: optional_datetime_from_string(row.get(8))?,
            purge_at: optional_datetime_from_string(row.get(9))?,
        };
        diagrams.insert(diagram.id, diagram);
    }

    let mut deleted_drive_items = HashMap::new();
    for row in client
        .query(
            "select id, original_path, backup_path, label, is_dir, deleted_at, purge_at from deleted_drive_items",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        deleted_drive_items.insert(
            row.get::<_, String>(0).clone(),
            crate::state::DeletedDriveItem {
                id: row.get(0),
                original_path: row.get(1),
                backup_path: row.get(2),
                label: row.get(3),
                is_dir: row.get(4),
                deleted_at: parse_datetime(row.get::<_, String>(5).as_str())?,
                purge_at: parse_datetime(row.get::<_, String>(6).as_str())?,
            },
        );
    }

    let mut audit_log = Vec::new();
    for row in client
        .query(
            "select id, occurred_at, actor_id, actor_label, source, action, target_kind, target_id, target_label, details_json from audit_log order by occurred_at desc",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        audit_log.push(crate::models::AdminAuditEntry {
            id: row.get(0),
            occurred_at: parse_datetime(row.get::<_, String>(1).as_str())?,
            actor_id: row.get(2),
            actor_label: row.get(3),
            source: row.get(4),
            action: row.get(5),
            target_kind: row.get(6),
            target_id: row.get(7),
            target_label: row.get(8),
            details: serde_json::from_str::<serde_json::Value>(row.get::<_, String>(9).as_str())
                .unwrap_or(serde_json::Value::Null),
        });
    }

    let mut memos = HashMap::new();
    for row in client
        .query(
            "select id, object_id, namespace_json, visibility, shared_user_ids_json, title, audio_path, transcript, transcript_segments_json, transcript_tags_json, topic_summary, source_channels_json, status, model, device, created_at, updated_at, failure_reason, owner_id, deleted_at, purge_at from voice_memos",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let segments: Vec<TranscriptSegment> =
            serde_json::from_str(row.get::<_, String>(8).as_str())
                .map_err(|err| AppError::Internal(err.to_string()))?;
        let memo = VoiceMemo {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            object_id: row.get(1),
            namespace: serde_json::from_str::<ObjectNamespace>(row.get::<_, String>(2).as_str()).unwrap_or_default(),
            visibility: parse_resource_visibility(row.get::<_, String>(3).as_str())?,
            shared_user_ids: serde_json::from_str::<Vec<String>>(row.get::<_, String>(4).as_str())
                .unwrap_or_default()
                .into_iter()
                .map(|value| parse_uuid(value.as_str()))
                .collect::<AppResult<Vec<_>>>()?,
            title: row.get(5),
            audio_path: row.get(6),
            transcript: row.get(7),
            transcript_segments: segments,
            transcript_tags: serde_json::from_str::<Vec<String>>(row.get::<_, String>(9).as_str()).unwrap_or_default(),
            topic_summary: string_column_to_option(row.get::<_, Option<String>>(10)),
            source_channels: serde_json::from_str::<Vec<String>>(row.get::<_, String>(11).as_str()).unwrap_or_default(),
            status: parse_job_status(row.get::<_, String>(12).as_str())?,
            model: row.get(13),
            device: row.get(14),
            created_at: parse_datetime(row.get::<_, String>(15).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(16).as_str())?,
            failure_reason: row.get(17),
            owner_id: parse_uuid(row.get::<_, String>(18).as_str())?,
            deleted_at: optional_datetime_from_string(row.get(19))?,
            purge_at: optional_datetime_from_string(row.get(20))?,
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
            "select id, name, folder, kind, created_at, participant_ids_json from rooms",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let participant_ids = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(5))
            .map_err(|err| AppError::Internal(err.to_string()))?
            .into_iter()
            .map(|value| parse_uuid(value.as_str()))
            .collect::<AppResult<Vec<_>>>()?;
        let room = Room {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            name: row.get(1),
            folder: row.get(2),
            kind: parse_room_kind(row.get::<_, String>(3).as_str())?,
            created_at: parse_datetime(row.get::<_, String>(4).as_str())?,
            participant_ids,
            participant_labels: Vec::new(),
        };
        rooms.insert(room.id, room);
    }

    let mut messages: HashMap<Uuid, Vec<Message>> = HashMap::new();
    for row in client
        .query(
            "select id, room_id, author_id, body, created_at, reactions_json from messages order by created_at asc",
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
            reactions: serde_json::from_str::<Vec<MessageReaction>>(
                row.get::<_, String>(5).as_str(),
            )
            .unwrap_or_default(),
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

    let mut calendar_connections = HashMap::new();
    for row in client
        .query(
            "select id, owner_id, owner_display_name, title, provider, external_id, calendar_id, account_label, access_token, refresh_token, token_expires_at, ics_url, created_at, updated_at from calendar_connections",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let connection = CalendarConnection {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            owner_id: parse_uuid(row.get::<_, String>(1).as_str())?,
            owner_display_name: row.get(2),
            title: row.get(3),
            provider: parse_calendar_provider(row.get::<_, String>(4).as_str())?,
            external_id: row.get(5),
            calendar_id: row.get(6),
            account_label: row.get(7),
            access_token: row.get(8),
            refresh_token: row.get(9),
            token_expires_at: row
                .get::<_, Option<String>>(10)
                .map(|value| parse_datetime(value.as_str()))
                .transpose()?,
            ics_url: row.get(11),
            created_at: parse_datetime(row.get::<_, String>(12).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(13).as_str())?,
        };
        calendar_connections.insert(connection.id, connection);
    }

    let mut calendar_events: HashMap<Uuid, Vec<CalendarEvent>> = HashMap::new();
    for row in client
        .query(
            "select id, connection_id, title, description, location, start_at, end_at, all_day, source_url, organizer, updated_at from calendar_events order by start_at asc",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let event = CalendarEvent {
            id: row.get(0),
            connection_id: parse_uuid(row.get::<_, String>(1).as_str())?,
            title: row.get(2),
            description: row.get(3),
            location: row.get(4),
            start_at: parse_datetime(row.get::<_, String>(5).as_str())?,
            end_at: parse_datetime(row.get::<_, String>(6).as_str())?,
            all_day: row.get(7),
            source_url: row.get(8),
            organizer: row.get(9),
            updated_at: row
                .get::<_, Option<String>>(10)
                .map(|value| parse_datetime(value.as_str()))
                .transpose()?,
        };
        calendar_events.entry(event.connection_id).or_default().push(event);
    }

    let mut tasks = HashMap::new();
    for row in client
        .query(
            "select id, owner_id, owner_display_name, title, description, status, start_at, end_at, all_day, calendar_connection_id, created_at, updated_at, completed_at from tasks",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let task = TaskItem {
            id: parse_uuid(row.get::<_, String>(0).as_str())?,
            owner_id: parse_uuid(row.get::<_, String>(1).as_str())?,
            owner_display_name: row.get(2),
            title: row.get(3),
            description: row.get(4),
            status: parse_task_status(row.get::<_, String>(5).as_str())?,
            start_at: row
                .get::<_, Option<String>>(6)
                .map(|value| parse_datetime(value.as_str()))
                .transpose()?,
            end_at: row
                .get::<_, Option<String>>(7)
                .map(|value| parse_datetime(value.as_str()))
                .transpose()?,
            all_day: row.get(8),
            calendar_connection_id: row
                .get::<_, Option<String>>(9)
                .map(|value| parse_uuid(value.as_str()))
                .transpose()?,
            created_at: parse_datetime(row.get::<_, String>(10).as_str())?,
            updated_at: parse_datetime(row.get::<_, String>(11).as_str())?,
            completed_at: row
                .get::<_, Option<String>>(12)
                .map(|value| parse_datetime(value.as_str()))
                .transpose()?,
        };
        tasks.insert(task.id, task);
    }

    let mut sync_tombstones = Vec::new();
    for row in client
        .query(
            "select entity, id, deleted_at from sync_tombstones",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        sync_tombstones.push(SyncTombstone {
            entity: parse_sync_entity_kind(row.get::<_, String>(0).as_str())?,
            id: row.get(1),
            deleted_at: parse_datetime(row.get::<_, String>(2).as_str())?,
        });
    }

    let mut note_sessions: HashMap<Uuid, Vec<NoteSession>> = HashMap::new();
    for row in client
        .query(
            "select note_id, session_id, user_id, user_label, user_avatar_path, client_id, opened_at, last_seen_at from note_sessions",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let session = NoteSession {
            note_id: parse_uuid(row.get::<_, String>(0).as_str())?,
            session_id: row.get(1),
            user_id: parse_uuid(row.get::<_, String>(2).as_str())?,
            user_label: row.get(3),
            user_avatar_path: row.get::<_, Option<String>>(4).filter(|value| !value.trim().is_empty()),
            client_id: row.get(5),
            opened_at: parse_datetime(row.get::<_, String>(6).as_str())?,
            last_seen_at: parse_datetime(row.get::<_, String>(7).as_str())?,
        };
        note_sessions.entry(session.note_id).or_default().push(session);
    }

    let mut note_conflicts: HashMap<Uuid, Vec<NoteConflictRecord>> = HashMap::new();
    for row in client
        .query(
            "select id, note_id, operation_id, reason, forked_note_ids_json, created_at from note_conflicts",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let forked_note_ids = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(4))
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| Uuid::parse_str(value.as_str()).ok())
            .collect::<Vec<_>>();
        let conflict = NoteConflictRecord {
            id: row.get(0),
            note_id: parse_uuid(row.get::<_, String>(1).as_str())?,
            operation_id: row.get(2),
            reason: row.get(3),
            forked_note_ids,
            created_at: parse_datetime(row.get::<_, String>(5).as_str())?,
        };
        note_conflicts.entry(conflict.note_id).or_default().push(conflict);
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
        calendar_connections,
        calendar_events,
        tasks,
        resource_shares,
        sync_tombstones,
        note_sessions,
        note_conflicts,
        pending_credential_changes: HashMap::new(),
        deleted_drive_items,
        audit_log,
    }))
}

async fn load_note_document_updates(
    client: &tokio_postgres::Client,
) -> AppResult<HashMap<Uuid, Vec<String>>> {
    let mut grouped = HashMap::<Uuid, Vec<String>>::new();
    for row in client
        .query(
            "select note_id, update_b64 from note_document_updates order by note_id asc, sequence asc",
            &[],
        )
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?
    {
        let note_id = parse_uuid(row.get::<_, String>(0).as_str())?;
        let update_b64: String = row.get(1);
        grouped.entry(note_id).or_default().push(update_b64);
    }
    Ok(grouped)
}

async fn sync_note_document_updates(
    client: &tokio_postgres::Client,
    note: &Note,
) -> AppResult<()> {
    client
        .execute("delete from note_document_updates where note_id = $1", &[&note.id.to_string()])
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?;
    for update_b64 in &note.loro_updates_b64 {
        client
            .execute(
                "insert into note_document_updates (note_id, update_b64) values ($1, $2)",
                &[&note.id.to_string(), update_b64],
            )
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
    }
    Ok(())
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

fn string_column_to_option(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn optional_uuid_from_string(value: Option<String>) -> AppResult<Option<Uuid>> {
    match value {
        Some(raw) if !raw.trim().is_empty() => Ok(Some(parse_uuid(raw.as_str())?)),
        _ => Ok(None),
    }
}

fn optional_datetime_from_string(value: Option<String>) -> AppResult<Option<DateTime<Utc>>> {
    match value {
        Some(raw) if !raw.trim().is_empty() => Ok(Some(parse_datetime(raw.as_str())?)),
        _ => Ok(None),
    }
}

fn parse_room_kind(value: &str) -> AppResult<RoomKind> {
    match value {
        "channel" => Ok(RoomKind::Channel),
        "direct" => Ok(RoomKind::Direct),
        _ => Err(AppError::Internal(format!("invalid room kind: {value}"))),
    }
}

fn parse_calendar_provider(value: &str) -> AppResult<CalendarProvider> {
    match value {
        "google" => Ok(CalendarProvider::Google),
        "ics" => Ok(CalendarProvider::Ics),
        "sweet" => Ok(CalendarProvider::Sweet),
        _ => Err(AppError::Internal(format!("invalid calendar provider: {value}"))),
    }
}

fn parse_task_status(value: &str) -> AppResult<TaskStatus> {
    match value {
        "open" => Ok(TaskStatus::Open),
        "completed" => Ok(TaskStatus::Completed),
        _ => Err(AppError::Internal(format!("invalid task status: {value}"))),
    }
}

fn parse_sync_entity_kind(value: &str) -> AppResult<SyncEntityKind> {
    match value {
        "notes" => Ok(SyncEntityKind::Notes),
        "diagrams" => Ok(SyncEntityKind::Diagrams),
        "voice_memos" => Ok(SyncEntityKind::VoiceMemos),
        "rooms" => Ok(SyncEntityKind::Rooms),
        "messages" => Ok(SyncEntityKind::Messages),
        "calendar_connections" => Ok(SyncEntityKind::CalendarConnections),
        "calendar_events" => Ok(SyncEntityKind::CalendarEvents),
        "tasks" => Ok(SyncEntityKind::Tasks),
        "file_tree" => Ok(SyncEntityKind::FileTree),
        "resource_shares" => Ok(SyncEntityKind::ResourceShares),
        _ => Err(AppError::Internal(format!("invalid sync entity kind: {value}"))),
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

fn calendar_provider_to_str(provider: &CalendarProvider) -> &'static str {
    match provider {
        CalendarProvider::Google => "google",
        CalendarProvider::Ics => "ics",
        CalendarProvider::Sweet => "sweet",
    }
}

fn task_status_to_str(status: &TaskStatus) -> &'static str {
    match status {
        TaskStatus::Open => "open",
        TaskStatus::Completed => "completed",
    }
}

fn sync_entity_kind_to_str(kind: &SyncEntityKind) -> &'static str {
    match kind {
        SyncEntityKind::Notes => "notes",
        SyncEntityKind::Diagrams => "diagrams",
        SyncEntityKind::VoiceMemos => "voice_memos",
        SyncEntityKind::Rooms => "rooms",
        SyncEntityKind::Messages => "messages",
        SyncEntityKind::CalendarConnections => "calendar_connections",
        SyncEntityKind::CalendarEvents => "calendar_events",
        SyncEntityKind::Tasks => "tasks",
        SyncEntityKind::FileTree => "file_tree",
        SyncEntityKind::ResourceShares => "resource_shares",
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
