import { useRef } from 'react'
import { api } from '../../lib/api'
import { parentDirectoryLabel } from '../../lib/file-display'
import type { FileNode, ResourceVisibility } from '../../lib/types'
import { fileTypeLabel, formatFileSize, formatFileTimestamp } from '../../lib/ui-helpers'

type Props = {
  filePreviewOpen: boolean
  activeFileNode: FileNode | null
  markedFilePaths: string[]
  displayNameForFileNode: (node: FileNode) => string
  onSetActiveFilePath: (path: string) => void
  onOpenFileNode: (node: FileNode | null | undefined) => void
  onDownloadManagedPath: (path: string) => void
  onOpenShareDialog: (target: { resourceKey: string; label: string; visibility?: ResourceVisibility }) => void
  resourceKeyForFilePath: (path: string) => string
  canConvertFilePath: (path: string | null | undefined) => boolean
  onSetConvertingFilePath: (path: string | null) => void
  onBeginRenameCurrentFile: () => void
  canRenameFilePath: (path: string | null | undefined) => boolean
  onRequestDeletePaths: (paths: string[]) => void
  canDeleteFilePath: (path: string | null | undefined) => boolean
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="file-action-icon" aria-hidden="true">
      <path d="M12 4.75v10.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M8.6 11.65 12 15.25l3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 17.25v1c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VisibilityIcon() {
  return (
    <svg viewBox="0 0 24 24" className="file-action-icon" aria-hidden="true">
      <circle cx="8.2" cy="8.8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="15.8" cy="8.8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4.85 17.2c0-2.15 1.82-3.7 4.05-3.7s4.05 1.55 4.05 3.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M11.1 17.2c0-2.15 1.82-3.7 4.05-3.7s4.05 1.55 4.05 3.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="file-action-icon" aria-hidden="true">
      <path d="M9 5h6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M10 5V4c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6 7h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M8 7.5v10c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5v-10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="file-action-icon" aria-hidden="true">
      <path
        d="M4.75 19.25h4.1l9.35-9.35-4.1-4.1-9.35 9.35v4.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="m12.95 6.95 4.1 4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="file-action-icon" aria-hidden="true">
      <path d="M14 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 19 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="file-action-icon" aria-hidden="true">
      <path d="M9 3H3v6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3h6v6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21H3v-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 21h6v-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function isImageFile(path: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(path)
}

function isVideoFile(path: string) {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(path)
}

export function FilesPreviewPane({
  filePreviewOpen,
  activeFileNode,
  markedFilePaths,
  displayNameForFileNode,
  onSetActiveFilePath,
  onOpenFileNode,
  onDownloadManagedPath,
  onOpenShareDialog,
  resourceKeyForFilePath,
  canConvertFilePath,
  onSetConvertingFilePath,
  onBeginRenameCurrentFile,
  canRenameFilePath,
  onRequestDeletePaths,
  canDeleteFilePath,
}: Props) {
  const previewMediaRef = useRef<HTMLDivElement | null>(null)
  const isPreviewableImage = activeFileNode?.kind === 'file' && isImageFile(activeFileNode.path)
  const isPreviewableVideo = activeFileNode?.kind === 'file' && isVideoFile(activeFileNode.path)
  const previewUrl =
    activeFileNode?.kind === 'file' && (isPreviewableImage || isPreviewableVideo)
      ? api.fileDownloadUrl(activeFileNode.path)
      : null

  return (
    <aside className={`file-preview-pane ${filePreviewOpen ? '' : 'hidden'}`}>
      {activeFileNode ? (
        <div className="file-preview-card">
          <div className="file-preview-title">
            <div className="file-preview-title-main">
              {activeFileNode.kind === 'directory' ? <span className="file-type-icon">/</span> : null}
              <strong>
                {activeFileNode.kind === 'directory'
                  ? activeFileNode.path
                  : `${parentDirectoryLabel(activeFileNode.path)}/${displayNameForFileNode(activeFileNode)}`}
              </strong>
            </div>
          </div>
          <div className="button-row preview-actions">
            <button
              className="button-secondary file-open-link file-action-icon-button"
              onClick={() => (activeFileNode.kind === 'file' ? onOpenFileNode(activeFileNode) : onSetActiveFilePath(activeFileNode.path))}
              aria-label="Open"
              title="Open"
            >
              <OpenIcon />
            </button>
            <button
              className="button-secondary file-open-link file-action-icon-button"
              onClick={() => onDownloadManagedPath(activeFileNode.path)}
              aria-label="Download"
              title="Download"
            >
              <DownloadIcon />
            </button>
            <button
              className="button-secondary file-open-link file-action-icon-button"
              onClick={() =>
                onOpenShareDialog({
                  resourceKey: resourceKeyForFilePath(activeFileNode.path),
                  label: activeFileNode.kind === 'directory' ? activeFileNode.path : displayNameForFileNode(activeFileNode),
                })
              }
              aria-label="Visibility"
              title="Visibility"
            >
              <VisibilityIcon />
            </button>
            {activeFileNode.kind === 'file' && canConvertFilePath(activeFileNode.path) ? (
              <button className="button-secondary file-open-link" onClick={() => onSetConvertingFilePath(activeFileNode.path)}>
                convert
              </button>
            ) : null}
            <button
              className="button-secondary file-open-link file-action-icon-button"
              onClick={onBeginRenameCurrentFile}
              disabled={!canRenameFilePath(activeFileNode.path)}
              aria-label="Rename"
              title="Rename"
            >
              <RenameIcon />
            </button>
            <button
              className="button-secondary file-open-link file-action-icon-button"
              onClick={() => onRequestDeletePaths([activeFileNode.path])}
              disabled={!canDeleteFilePath(activeFileNode.path)}
              aria-label="Delete"
              title="Delete"
            >
              <DeleteIcon />
            </button>
          </div>
          <div className="preview-meta">
            <div><span className="muted">Type</span><strong>{activeFileNode.kind === 'directory' ? 'Directory' : fileTypeLabel(activeFileNode.name)}</strong></div>
            <div><span className="muted">Size</span><strong>{activeFileNode.kind === 'directory' ? '—' : formatFileSize(activeFileNode.size_bytes)}</strong></div>
            <div><span className="muted">Modified</span><strong>{formatFileTimestamp(activeFileNode.updated_at)}</strong></div>
            <div><span className="muted">Created</span><strong>{formatFileTimestamp(activeFileNode.created_at)}</strong></div>
            <div><span className="muted">Marked</span><strong>{markedFilePaths.includes(activeFileNode.path) ? 'Yes' : 'No'}</strong></div>
          </div>
          {previewUrl ? (
            <div className="file-preview-media-shell" ref={previewMediaRef}>
              <button
                className="button-secondary file-open-link file-action-icon-button file-preview-media-expand"
                type="button"
                aria-label="Expand preview"
                title="Expand preview"
                onClick={() => {
                  const target = previewMediaRef.current
                  if (!target) return
                  void target.requestFullscreen?.()
                }}
              >
                <ExpandIcon />
              </button>
              {isPreviewableImage ? (
                <img
                  src={previewUrl}
                  alt={displayNameForFileNode(activeFileNode)}
                  className="file-preview-media file-preview-image"
                  loading="lazy"
                />
              ) : null}
              {isPreviewableVideo ? (
                <video
                  src={previewUrl}
                  className="file-preview-media file-preview-video"
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty-state">Select a file or directory.</div>
      )}
    </aside>
  )
}
