import { insertFileTreeNode } from './file-tree-state'
import type {
  FileNode,
  ObjectNamespace,
  PendingVoiceUploadRecord,
  VoiceMemo,
} from './types'

const offlineVoiceNamespace: ObjectNamespace = {
  root: 'local/offline/voice',
  owner_id: 'local',
  kind: 'private',
  label: 'Local voice',
}

export function pendingVoiceUploadPath(id: string) {
  return `voice/offline-upload-${id}.webm`
}

export function pendingVoiceUploadToMemo(record: PendingVoiceUploadRecord): VoiceMemo {
  const transcript = record.browser_transcript?.trim() || null
  return {
    id: record.id,
    object_id: `audio:${record.id}`,
    namespace: offlineVoiceNamespace,
    visibility: 'private',
    shared_user_ids: [],
    title: record.title,
    audio_path: pendingVoiceUploadPath(record.id),
    transcript,
    transcript_tags: [],
    topic_summary: null,
    transcript_segments: transcript
      ? [
          {
            start_ms: 0,
            end_ms: 0,
            text: transcript,
          },
        ]
      : [],
    status: transcript ? 'completed' : 'pending',
    model: transcript ? 'browser-speech' : 'pending-upload',
    device: 'Offline upload',
    created_at: record.created_at,
    updated_at: record.created_at,
    failure_reason: null,
    owner_id: 'local',
    source_channels: ['microphone'],
    sync_state: 'pending_create',
    local_only: true,
    pending_upload_id: record.id,
  }
}

export function pendingVoiceUploadToFileNode(record: PendingVoiceUploadRecord): FileNode {
  return {
    name: record.filename || record.title || 'memo.webm',
    path: pendingVoiceUploadPath(record.id),
    kind: 'file',
    object_id: `audio:${record.id}`,
    object_kind: 'audio_memo',
    namespace: offlineVoiceNamespace,
    visibility: 'private',
    resource_key: `audio:${record.id}`,
    size_bytes: record.size_bytes,
    created_at: record.created_at,
    updated_at: record.created_at,
    children: [],
  }
}

export function mergePendingVoiceMemos(memos: VoiceMemo[], uploads: PendingVoiceUploadRecord[]): VoiceMemo[] {
  const existingIds = new Set(memos.map((memo) => memo.id))
  const placeholders = uploads
    .filter((record) => !existingIds.has(record.id))
    .map(pendingVoiceUploadToMemo)
  return placeholders.length > 0 ? [...memos, ...placeholders] : memos
}

export function mergePendingVoiceFileTree(fileTree: FileNode[], uploads: PendingVoiceUploadRecord[]): FileNode[] {
  const existingPaths = new Set<string>()
  const stack = [...fileTree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    existingPaths.add(node.path)
    if (node.children.length > 0) {
      stack.push(...node.children)
    }
  }

  return uploads.reduce((current, record) => {
    const node = pendingVoiceUploadToFileNode(record)
    if (existingPaths.has(node.path)) {
      return current
    }
    existingPaths.add(node.path)
    return insertFileTreeNode(current, node)
  }, fileTree)
}
