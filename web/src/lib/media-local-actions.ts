import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { api } from './api'
import { createOptimisticDirectoryNode, insertFileTreeNode, removeFileTreeNode } from './file-tree-state'
import { offlineDb } from './offline-db'
import { pendingManagedUploadToFileNode } from './pending-managed-uploads'
import { getConnectivityState } from './platform'
import { pendingVoiceUploadToFileNode, pendingVoiceUploadToMemo } from './pending-voice'
import { queueSyncOperation } from './sync-engine'
import type { FileNode, VoiceMemo } from './types'

type CreateMediaLocalActionsContext = {
  createEntityId: () => string
  memosRef: MutableRefObject<VoiceMemo[]>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setFilesTree: Dispatch<SetStateAction<FileNode[]>>
  setSelectedVoiceMemoId: Dispatch<SetStateAction<string | null>>
  refreshFilesTree: () => Promise<void>
  showActionNotice: (message: string) => void
  upsertVoiceMemo: (records: VoiceMemo[], nextRecord: VoiceMemo) => VoiceMemo[]
}

export function createMediaLocalActions(context: CreateMediaLocalActionsContext) {
  async function uploadVoiceMemoLocalFirst(title: string, file: Blob, browserTranscript?: string) {
    if (getConnectivityState()) {
      const memo = await api.uploadVoiceMemo(title, file, browserTranscript)
      const nextMemos = await api.listVoiceMemos()
      context.setMemos(nextMemos)
      await context.refreshFilesTree()
      context.showActionNotice(`Uploaded audio: ${title}`)
      return memo
    }

    const pendingUpload = {
      id: context.createEntityId(),
      title,
      filename: file instanceof File ? file.name : 'memo.webm',
      mime_type: file.type || 'audio/webm',
      size_bytes: file.size,
      browser_transcript: browserTranscript?.trim() || null,
      created_at: new Date().toISOString(),
      blob: file,
    }
    await offlineDb.savePendingVoiceUpload(pendingUpload)
    const memo = pendingVoiceUploadToMemo(pendingUpload)
    context.setMemos((current) => context.upsertVoiceMemo(current, memo))
    context.setFilesTree((current) => insertFileTreeNode(current, pendingVoiceUploadToFileNode(pendingUpload)))
    context.showActionNotice(`Queued audio upload: ${title}`)
    return memo
  }

  async function renamePendingVoiceUploadLocalFirst(memoId: string, title: string) {
    const pendingUpload = (await offlineDb.listPendingVoiceUploads()).find((entry) => entry.id === memoId)
    if (!pendingUpload) {
      throw new Error('Pending upload could not be found.')
    }
    await offlineDb.savePendingVoiceUpload({ ...pendingUpload, title })
    const updated = pendingVoiceUploadToMemo({ ...pendingUpload, title })
    context.setMemos((current) => current.map((entry) => (entry.id === memoId ? updated : entry)))
    context.showActionNotice(`Renamed memo to ${title}`)
    return updated
  }

  async function deletePendingVoiceUploadLocalFirst(memoId: string) {
    await offlineDb.removePendingVoiceUpload(memoId)
    const memo = context.memosRef.current.find((entry) => entry.id === memoId)
    context.setMemos((current) => current.filter((entry) => entry.id !== memoId))
    context.setFilesTree((current) => removeFileTreeNode(current, memo?.audio_path ?? '').nodes)
    context.setSelectedVoiceMemoId((current) => (current === memoId ? (context.memosRef.current.find((entry) => entry.id !== memoId)?.id ?? null) : current))
    context.showActionNotice(`Deleted memo: ${memo?.title || 'Untitled memo'}`)
  }

  async function uploadManagedFileLocalFirst(path: string, file: Blob, filename: string) {
    if (getConnectivityState()) {
      const node = await api.uploadFile(path, file, filename)
      await context.refreshFilesTree()
      context.showActionNotice(`Uploaded file: ${filename}`)
      return node
    }

    const pendingUpload = {
      id: context.createEntityId(),
      path,
      filename,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      created_at: new Date().toISOString(),
      blob: file,
    }
    await offlineDb.savePendingManagedUpload(pendingUpload)
    const node = pendingManagedUploadToFileNode(pendingUpload)
    context.setFilesTree((current) => insertFileTreeNode(current, node))
    context.showActionNotice(`Queued file upload: ${filename}`)
    return node
  }

  async function flushPendingVoiceUploads() {
    if (!getConnectivityState()) {
      return
    }
    const pendingUploads = await offlineDb.listPendingVoiceUploads()
    if (pendingUploads.length === 0) {
      return
    }
    for (const pendingUpload of pendingUploads) {
      await api.uploadVoiceMemo(
        pendingUpload.title,
        pendingUpload.blob,
        pendingUpload.browser_transcript?.trim() || undefined,
      )
      await offlineDb.removePendingVoiceUpload(pendingUpload.id)
    }
  }

  async function flushPendingManagedUploads() {
    if (!getConnectivityState()) {
      return
    }
    const pendingUploads = await offlineDb.listPendingManagedUploads()
    if (pendingUploads.length === 0) {
      return
    }
    for (const pendingUpload of pendingUploads) {
      await api.uploadFile(pendingUpload.path, pendingUpload.blob, pendingUpload.filename)
      await offlineDb.removePendingManagedUpload(pendingUpload.id)
    }
  }

  async function createManagedFolderLocalFirst(path: string) {
    if (getConnectivityState()) {
      return api.createDriveFolder(path)
    }

    const node = createOptimisticDirectoryNode(path)
    context.setFilesTree((current) => insertFileTreeNode(current, node))
    await queueSyncOperation({ kind: 'create_managed_folder', path })
    return node
  }

  return {
    uploadVoiceMemoLocalFirst,
    renamePendingVoiceUploadLocalFirst,
    deletePendingVoiceUploadLocalFirst,
    uploadManagedFileLocalFirst,
    flushPendingVoiceUploads,
    flushPendingManagedUploads,
    createManagedFolderLocalFirst,
  }
}

