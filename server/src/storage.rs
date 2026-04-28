use std::{
    fs as stdfs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use sysinfo::Disks;
use tokio::fs;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{FileNode, FileNodeKind};

#[derive(Clone, Debug)]
pub struct BlobStorage {
    root: PathBuf,
}

impl BlobStorage {
    pub async fn new(root: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(root.join("voice"))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        fs::create_dir_all(root.join("notes"))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        fs::create_dir_all(root.join("diagrams"))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        fs::create_dir_all(root.join("drive"))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        fs::create_dir_all(root.join("avatars"))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        fs::create_dir_all(root.join("_trash").join("drive"))
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(Self { root })
    }

    pub async fn save_voice_blob(&self, bytes: &[u8]) -> AppResult<String> {
        let name = format!("{}.webm", Uuid::new_v4());
        let path = self.root.join("voice").join(name);
        fs::write(&path, bytes)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(relative_display(&self.root, &path))
    }

    pub async fn save_avatar_blob(&self, bytes: &[u8], extension: &str) -> AppResult<String> {
        let ext = extension.trim().trim_start_matches('.').to_ascii_lowercase();
        let name = format!("{}.{}", Uuid::new_v4(), if ext.is_empty() { "png" } else { &ext });
        let path = self.root.join("avatars").join(name);
        fs::write(&path, bytes)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(relative_display(&self.root, &path))
    }

    pub fn resolve(&self, relative_path: &str) -> PathBuf {
        self.root.join(relative_path)
    }

    pub fn detect_capacity_mb(&self) -> (u64, u64) {
        let canonical_root = stdfs::canonicalize(&self.root).unwrap_or_else(|_| self.root.clone());
        let disks = Disks::new_with_refreshed_list();
        let mut best_match = None;
        let mut best_len = 0usize;
        for disk in disks.list() {
            let mount = disk.mount_point();
            if canonical_root.starts_with(mount) {
                let len = mount.as_os_str().len();
                if len >= best_len {
                    best_len = len;
                    best_match = Some((disk.total_space(), disk.available_space()));
                }
            }
        }
        if let Some((total, available)) = best_match {
            return (bytes_to_mb(total), bytes_to_mb(available));
        }
        (0, 0)
    }

    pub async fn sync_note_markdown(
        &self,
        previous: Option<(&str, &str)>,
        note_id: Uuid,
        title: &str,
        folder: &str,
        markdown: &str,
    ) -> AppResult<String> {
        let next_relative = note_relative_path(folder, title, note_id);
        let next_full = self.resolve(&next_relative);
        if let Some(parent) = next_full.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
        fs::write(&next_full, markdown)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;

        if let Some((previous_folder, previous_title)) = previous {
            let previous_relative = note_relative_path(previous_folder, previous_title, note_id);
            if previous_relative != next_relative {
                let previous_full = self.resolve(&previous_relative);
                let _ = fs::remove_file(&previous_full).await;
            }
        }

        Ok(next_relative)
    }

    pub async fn sync_diagram_xml(
        &self,
        previous: Option<&str>,
        title: &str,
        diagram_id: Uuid,
        xml: &str,
    ) -> AppResult<String> {
        let next_relative = diagram_relative_path(title, diagram_id);
        let next_full = self.resolve(&next_relative);
        if let Some(parent) = next_full.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
        fs::write(&next_full, xml)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;

        if let Some(previous_title) = previous {
            let previous_relative = diagram_relative_path(previous_title, diagram_id);
            if previous_relative != next_relative {
                let previous_full = self.resolve(&previous_relative);
                let _ = fs::remove_file(&previous_full).await;
            }
        }

        Ok(next_relative)
    }

    pub async fn create_managed_folder(&self, relative_path: &str) -> AppResult<FileNode> {
        let relative = sanitize_managed_path(relative_path)?;
        let full = self.resolve(&relative);
        fs::create_dir_all(&full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(FileNode {
            name: file_name_or_root(&relative),
            path: relative,
            kind: FileNodeKind::Directory,
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: None,
            created_at: None,
            updated_at: None,
            children: Vec::new(),
        })
    }

    pub async fn save_drive_file(
        &self,
        relative_path: &str,
        filename: &str,
        bytes: &[u8],
    ) -> AppResult<FileNode> {
        let base = sanitize_relative_path("drive", relative_path)?;
        let name = sanitize_file_name(filename);
        let relative = if base.is_empty() {
            format!("drive/{name}")
        } else {
            format!("{base}/{name}")
        };
        let full = self.resolve(&relative);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
        fs::write(&full, bytes)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(FileNode {
            name,
            path: relative,
            kind: FileNodeKind::File,
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: Some(bytes.len() as u64),
            created_at: None,
            updated_at: None,
            children: Vec::new(),
        })
    }

    pub async fn list_drive_tree(&self) -> AppResult<FileNode> {
        build_node_from_fs(&self.root.join("drive"), "drive")
    }

    pub async fn reset_managed_root(&self, root_name: &str) -> AppResult<()> {
        let root = self.root.join(root_name);
        if fs::try_exists(&root)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?
        {
            fs::remove_dir_all(&root)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
        fs::create_dir_all(&root)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(())
    }

    pub fn resolve_managed_path(&self, relative_path: &str) -> AppResult<PathBuf> {
        let relative = sanitize_managed_path(relative_path)?;
        Ok(self.resolve(&relative))
    }

    pub async fn move_drive_path(
        &self,
        source_path: &str,
        destination_dir: &str,
    ) -> AppResult<FileNode> {
        let source_relative = sanitize_drive_managed_path(source_path)?;
        let destination_relative = sanitize_drive_managed_path(destination_dir)?;

        if source_relative == "drive" || destination_relative.is_empty() {
            return Err(AppError::BadRequest("cannot move drive root".into()));
        }

        if source_relative == destination_relative
            || destination_relative.starts_with(&format!("{source_relative}/"))
        {
            return Err(AppError::BadRequest(
                "cannot move an item into itself".into(),
            ));
        }

        let source_full = self.resolve(&source_relative);
        let destination_full = self.resolve(&destination_relative);

        let source_metadata = fs::metadata(&source_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let destination_metadata = fs::metadata(&destination_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;

        if !destination_metadata.is_dir() {
            return Err(AppError::BadRequest(
                "destination must be a directory".into(),
            ));
        }

        let name = source_full
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::BadRequest("invalid source path".into()))?
            .to_string();
        let next_relative = format!("{destination_relative}/{name}");
        let next_full = self.resolve(&next_relative);

        if fs::try_exists(&next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?
        {
            return Err(AppError::BadRequest(
                "destination already contains that name".into(),
            ));
        }

        fs::rename(&source_full, &next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;

        let size_bytes = if source_metadata.is_file() {
            Some(source_metadata.len())
        } else {
            None
        };

        Ok(FileNode {
            name,
            path: next_relative,
            kind: if source_metadata.is_dir() {
                FileNodeKind::Directory
            } else {
                FileNodeKind::File
            },
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes,
            created_at: metadata_timestamp_rfc3339(&source_metadata, true),
            updated_at: metadata_timestamp_rfc3339(&source_metadata, false),
            children: Vec::new(),
        })
    }

    pub async fn move_drive_path_to_trash(
        &self,
        relative_path: &str,
        trash_id: &str,
    ) -> AppResult<(String, bool)> {
        let relative = sanitize_drive_managed_path(relative_path)?;
        if relative == "drive" {
            return Err(AppError::BadRequest("cannot delete drive root".into()));
        }
        let full = self.resolve(&relative);
        let metadata = fs::metadata(&full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let original_name = full
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::BadRequest("invalid drive path".into()))?;
        let backup_relative = format!("_trash/drive/{}-{}", trash_id.trim(), sanitize_file_name(original_name));
        let backup_full = self.resolve(&backup_relative);
        if let Some(parent) = backup_full.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
        fs::rename(&full, &backup_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        cleanup_empty_managed_parents(&self.root.join("drive"), full.parent()).await?;
        Ok((backup_relative, metadata.is_dir()))
    }

    pub async fn restore_drive_path_from_trash(
        &self,
        backup_relative_path: &str,
        original_relative_path: &str,
    ) -> AppResult<()> {
        let backup_full = self.resolve(backup_relative_path);
        let original_relative = sanitize_drive_managed_path(original_relative_path)?;
        if original_relative == "drive" {
            return Err(AppError::BadRequest("cannot restore drive root".into()));
        }
        let original_full = self.resolve(&original_relative);
        if fs::try_exists(&original_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?
        {
            return Err(AppError::BadRequest(
                "cannot restore because the original path already exists".into(),
            ));
        }
        if let Some(parent) = original_full.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|err| AppError::Internal(err.to_string()))?;
        }
        fs::rename(&backup_full, &original_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(())
    }

    pub async fn rename_drive_path(
        &self,
        relative_path: &str,
        new_name: &str,
    ) -> AppResult<FileNode> {
        let relative = sanitize_drive_managed_path(relative_path)?;
        if relative == "drive" {
            return Err(AppError::BadRequest("cannot rename drive root".into()));
        }
        let sanitized_name = sanitize_file_name(new_name);
        let source_full = self.resolve(&relative);
        let metadata = fs::metadata(&source_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let parent_relative = relative
            .rsplit_once('/')
            .map(|(parent, _)| parent.to_string())
            .ok_or_else(|| AppError::BadRequest("invalid drive path".into()))?;
        let next_relative = format!("{parent_relative}/{sanitized_name}");
        let next_full = self.resolve(&next_relative);
        if fs::try_exists(&next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?
        {
            return Err(AppError::BadRequest(
                "destination already contains that name".into(),
            ));
        }
        fs::rename(&source_full, &next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(FileNode {
            name: sanitized_name,
            path: next_relative,
            kind: if metadata.is_dir() {
                FileNodeKind::Directory
            } else {
                FileNodeKind::File
            },
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            created_at: metadata_timestamp_rfc3339(&metadata, true),
            updated_at: metadata_timestamp_rfc3339(&metadata, false),
            children: Vec::new(),
        })
    }

    pub async fn move_voice_path(
        &self,
        source_path: &str,
        destination_dir: &str,
    ) -> AppResult<FileNode> {
        let source_relative = sanitize_voice_managed_path(source_path)?;
        let destination_relative = sanitize_voice_managed_path(destination_dir)?;

        if source_relative == "voice" || destination_relative.is_empty() {
            return Err(AppError::BadRequest("cannot move voice root".into()));
        }

        if source_relative == destination_relative
            || destination_relative.starts_with(&format!("{source_relative}/"))
        {
            return Err(AppError::BadRequest(
                "cannot move an item into itself".into(),
            ));
        }

        let source_full = self.resolve(&source_relative);
        let destination_full = self.resolve(&destination_relative);

        let source_metadata = fs::metadata(&source_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let destination_metadata = fs::metadata(&destination_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;

        if !destination_metadata.is_dir() {
            return Err(AppError::BadRequest(
                "destination must be a directory".into(),
            ));
        }

        let name = source_full
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::BadRequest("invalid source path".into()))?
            .to_string();
        let next_relative = format!("{destination_relative}/{name}");
        let next_full = self.resolve(&next_relative);

        if fs::try_exists(&next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?
        {
            return Err(AppError::BadRequest(
                "destination already contains that name".into(),
            ));
        }

        fs::rename(&source_full, &next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;

        let size_bytes = if source_metadata.is_file() {
            Some(source_metadata.len())
        } else {
            None
        };

        Ok(FileNode {
            name,
            path: next_relative,
            kind: if source_metadata.is_dir() {
                FileNodeKind::Directory
            } else {
                FileNodeKind::File
            },
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes,
            created_at: metadata_timestamp_rfc3339(&source_metadata, true),
            updated_at: metadata_timestamp_rfc3339(&source_metadata, false),
            children: Vec::new(),
        })
    }

    pub async fn rename_voice_path(
        &self,
        relative_path: &str,
        new_name: &str,
    ) -> AppResult<FileNode> {
        let relative = sanitize_voice_managed_path(relative_path)?;
        if relative == "voice" {
            return Err(AppError::BadRequest("cannot rename voice root".into()));
        }
        let sanitized_name = sanitize_file_name(new_name);
        let source_full = self.resolve(&relative);
        let metadata = fs::metadata(&source_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        let parent_relative = relative
            .rsplit_once('/')
            .map(|(parent, _)| parent.to_string())
            .ok_or_else(|| AppError::BadRequest("invalid voice path".into()))?;
        let next_relative = format!("{parent_relative}/{sanitized_name}");
        let next_full = self.resolve(&next_relative);
        if fs::try_exists(&next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?
        {
            return Err(AppError::BadRequest(
                "destination already contains that name".into(),
            ));
        }
        fs::rename(&source_full, &next_full)
            .await
            .map_err(|err| AppError::Internal(err.to_string()))?;
        Ok(FileNode {
            name: sanitized_name,
            path: next_relative,
            kind: if metadata.is_dir() {
                FileNodeKind::Directory
            } else {
                FileNodeKind::File
            },
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            created_at: metadata_timestamp_rfc3339(&metadata, true),
            updated_at: metadata_timestamp_rfc3339(&metadata, false),
            children: Vec::new(),
        })
    }

}

fn bytes_to_mb(value: u64) -> u64 {
    value / (1024 * 1024)
}

async fn cleanup_empty_managed_parents(root: &Path, mut current: Option<&Path>) -> AppResult<()> {
    while let Some(path) = current {
        if path == root {
            break;
        }
        match fs::remove_dir(path).await {
            Ok(()) => current = path.parent(),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => current = path.parent(),
            Err(err) if err.kind() == std::io::ErrorKind::DirectoryNotEmpty => break,
            Err(err) => return Err(AppError::Internal(err.to_string())),
        }
    }
    Ok(())
}

fn relative_display(root: &Path, full_path: &Path) -> String {
    full_path
        .strip_prefix(root)
        .unwrap_or(full_path)
        .to_string_lossy()
        .to_string()
}

fn build_node_from_fs(full_path: &Path, relative_path: &str) -> AppResult<FileNode> {
    let metadata = stdfs::metadata(full_path).map_err(|err| AppError::Internal(err.to_string()))?;
    if metadata.is_dir() {
        let mut children = Vec::new();
        for entry in
            stdfs::read_dir(full_path).map_err(|err| AppError::Internal(err.to_string()))?
        {
            let entry = entry.map_err(|err| AppError::Internal(err.to_string()))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let child_relative = if relative_path.is_empty() {
                name.clone()
            } else {
                format!("{relative_path}/{name}")
            };
            children.push(build_node_from_fs(&entry.path(), &child_relative)?);
        }
        children.sort_by(|a, b| match (&a.kind, &b.kind) {
            (FileNodeKind::Directory, FileNodeKind::File) => std::cmp::Ordering::Less,
            (FileNodeKind::File, FileNodeKind::Directory) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        });
        return Ok(FileNode {
            name: file_name_or_root(relative_path),
            path: relative_path.to_string(),
            kind: FileNodeKind::Directory,
            object_id: None,
            object_kind: None,
            namespace: None,
            visibility: None,
            resource_key: None,
            size_bytes: None,
            created_at: metadata_timestamp_rfc3339(&metadata, true),
            updated_at: metadata_timestamp_rfc3339(&metadata, false),
            children,
        });
    }

    Ok(FileNode {
        name: file_name_or_root(relative_path),
        path: relative_path.to_string(),
        kind: FileNodeKind::File,
        object_id: None,
        object_kind: None,
        namespace: None,
        visibility: None,
        resource_key: None,
        size_bytes: Some(metadata.len()),
        created_at: metadata_timestamp_rfc3339(&metadata, true),
        updated_at: metadata_timestamp_rfc3339(&metadata, false),
        children: Vec::new(),
    })
}

fn metadata_timestamp_rfc3339(metadata: &stdfs::Metadata, created: bool) -> Option<String> {
    let system_time = if created {
        metadata.created().ok()
    } else {
        metadata.modified().ok()
    }?;
    Some(DateTime::<Utc>::from(system_time).to_rfc3339())
}

fn sanitize_relative_path(root: &str, relative_path: &str) -> AppResult<String> {
    let normalized = relative_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    let stripped = normalized
        .strip_prefix(&format!("{root}/"))
        .or_else(|| normalized.strip_prefix(root))
        .unwrap_or(&normalized);
    let sanitized_parts = stripped
        .split('/')
        .filter(|part| !part.is_empty())
        .map(sanitize_file_name)
        .filter(|part| !part.is_empty() && part != "." && part != "..")
        .collect::<Vec<_>>();

    if sanitized_parts.is_empty() {
        return Ok(root.to_string());
    }

    Ok(format!("{root}/{}", sanitized_parts.join("/")))
}

fn sanitize_managed_path(relative_path: &str) -> AppResult<String> {
    let normalized = relative_path.replace('\\', "/");
    if normalized != "drive"
        && normalized != "notes"
        && normalized != "diagrams"
        && normalized != "voice"
        && !normalized.starts_with("drive/")
        && !normalized.starts_with("notes/")
        && !normalized.starts_with("diagrams/")
        && !normalized.starts_with("voice/")
    {
        return Err(AppError::BadRequest(
            "managed files must be under drive/, notes/, diagrams/, or voice/".into(),
        ));
    }
    let parts = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .map(sanitize_file_name)
        .collect::<Vec<_>>();
    if parts.iter().any(|part| part == "." || part == "..") {
        return Err(AppError::BadRequest("invalid file path".into()));
    }
    Ok(parts.join("/"))
}

fn sanitize_drive_managed_path(relative_path: &str) -> AppResult<String> {
    let normalized = sanitize_managed_path(relative_path)?;
    if normalized == "drive" || normalized.starts_with("drive/") {
        Ok(normalized)
    } else {
        Err(AppError::BadRequest(
            "drag-and-drop moves are currently supported only in drive/".into(),
        ))
    }
}

fn sanitize_voice_managed_path(relative_path: &str) -> AppResult<String> {
    let normalized = sanitize_managed_path(relative_path)?;
    if normalized == "voice" || normalized.starts_with("voice/") {
        Ok(normalized)
    } else {
        Err(AppError::BadRequest(
            "voice actions are supported only in voice/".into(),
        ))
    }
}

fn note_relative_path(folder: &str, title: &str, note_id: Uuid) -> String {
    let folder_relative =
        sanitize_relative_path("notes", folder).unwrap_or_else(|_| "notes".into());
    let slug = slugify(title);
    format!("{folder_relative}/{slug}-{note_id}.md")
}

fn diagram_relative_path(title: &str, diagram_id: Uuid) -> String {
    let normalized_title = title.replace('\\', "/");
    let normalized = normalized_title
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let (folder_parts, name) = if normalized.is_empty() {
        (Vec::new(), "Untitled")
    } else {
        let name = normalized.last().copied().unwrap_or("Untitled");
        (
            normalized[..normalized.len().saturating_sub(1)].to_vec(),
            name,
        )
    };
    let folder_relative = if folder_parts.is_empty() {
        "diagrams".to_string()
    } else {
        sanitize_relative_path("diagrams", &folder_parts.join("/"))
            .unwrap_or_else(|_| "diagrams".into())
    };
    let slug = slugify(name);
    format!("{folder_relative}/{slug}-{diagram_id}.drawio")
}

fn slugify(value: &str) -> String {
    let slug = value
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

fn sanitize_file_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || matches!(char, '.' | '_' | '-') {
                char
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() {
        "untitled".into()
    } else {
        sanitized
    }
}

fn file_name_or_root(relative_path: &str) -> String {
    relative_path
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or("root")
        .to_string()
}
