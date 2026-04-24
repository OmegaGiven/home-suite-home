import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from '../components/ConfirmModal'
import { FileTreeNode } from '../components/FileTreeNode'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { LibraryShell } from '../components/LibraryShell'
import { api } from '../lib/api'
import type { FileNode, VoiceMemo } from '../lib/types'
import { formatDurationSeconds, formatFileSize, voiceMemoDisplayTitle } from '../lib/ui-helpers'

function NewFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true">
      <path
        d="M3.75 7.25A2.25 2.25 0 0 1 6 5h4.15l1.55 1.7H18A2.25 2.25 0 0 1 20.25 9v7.75A2.25 2.25 0 0 1 18 19H6a2.25 2.25 0 0 1-2.25-2.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15.75 10.25v5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13 13h5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true">
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

type Props = {
  voiceTree: FileNode | null
  voiceDrawerOpen: boolean
  voicePaneSize: { width: number; height: number }
  activeVoiceSplitter: boolean
  memos: VoiceMemo[]
  selectedVoiceMemo: VoiceMemo | null
  selectedVoiceMemoSizeBytes: number | null
  currentVoiceFolderPath: string
  recording: boolean
  draggingPath: string | null
  dropTargetPath: string | null
  onSelectVoicePath: (path: string) => void
  onCreateFolder: (name: string, parentPath: string) => void
  onRenameFolder: (name: string, path: string) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onStartVoiceResize: () => void
  onToggleVoiceDrawer: () => void
  onOpenRecorder: () => void
  onUploadAudioFile: (file: File) => void
  onPollTranscript: (memo: VoiceMemo) => void
  onDeleteVoiceMemo: (memoId: string) => Promise<void>
  confirmVoiceDelete: boolean
}

export function VoicePage({
  voiceTree,
  voiceDrawerOpen,
  voicePaneSize,
  activeVoiceSplitter,
  memos,
  selectedVoiceMemo,
  selectedVoiceMemoSizeBytes,
  currentVoiceFolderPath,
  recording,
  draggingPath,
  dropTargetPath,
  onSelectVoicePath,
  onCreateFolder,
  onRenameFolder,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  onStartVoiceResize,
  onToggleVoiceDrawer,
  onOpenRecorder,
  onUploadAudioFile,
  onPollTranscript,
  onDeleteVoiceMemo,
  confirmVoiceDelete,
}: Props) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [deleteMemoOpen, setDeleteMemoOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renameFolderName, setRenameFolderName] = useState(currentVoiceFolderPath.split('/').pop() ?? '')
  const [selectedMemoDurationSeconds, setSelectedMemoDurationSeconds] = useState<number | null>(null)
  const memoLabelByPath = useMemo(
    () =>
      new Map(
        memos.map((memo) => [
          memo.audio_path,
          voiceMemoDisplayTitle(memo.created_at, memo.title || 'Memo'),
        ]),
      ),
    [memos],
  )

  useEffect(() => {
    setSelectedMemoDurationSeconds(null)
  }, [selectedVoiceMemo?.id])

  return (
    <section className="panel">
      <FolderPromptModal
        open={createFolderOpen}
        title="Create folder"
        value={newFolderName}
        confirmLabel="Confirm"
        onChange={setNewFolderName}
        onConfirm={() => {
          const trimmed = newFolderName.trim()
          if (!trimmed) return
          onCreateFolder(trimmed, currentVoiceFolderPath)
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
        onClose={() => {
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
      />
      <FolderPromptModal
        open={renameFolderOpen}
        title="Rename folder"
        value={renameFolderName}
        confirmLabel="Rename"
        onChange={setRenameFolderName}
        onConfirm={() => {
          const trimmed = renameFolderName.trim()
          if (!trimmed) return
          onRenameFolder(trimmed, currentVoiceFolderPath)
          setRenameFolderOpen(false)
        }}
        onClose={() => {
          setRenameFolderOpen(false)
          setRenameFolderName(currentVoiceFolderPath.split('/').pop() ?? '')
        }}
      />
      <LibraryShell
        managerClassName={`notes-manager voice-manager ${voiceDrawerOpen ? '' : 'library-hidden'} ${activeVoiceSplitter ? 'resizing' : ''}`}
        drawerOpen={voiceDrawerOpen}
        activeSplitter={activeVoiceSplitter}
        paneSize={voicePaneSize}
        sidebarClassName="notes-sidebar voice-sidebar"
        onStartResize={onStartVoiceResize}
        onToggleDrawer={onToggleVoiceDrawer}
        sidebar={
          <>
            <div className="file-sidebar-header-row">
              <div className="button-row files-actions">
                <button
                  className="button-secondary notes-new-button"
                  type="button"
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => setCreateFolderOpen(true)}
                >
                  <NewFolderIcon />
                </button>
                <button
                  className="button-secondary notes-new-button"
                  type="button"
                  aria-label="Rename folder"
                  title="Rename folder"
                  disabled={currentVoiceFolderPath === 'voice'}
                  onClick={() => {
                    setRenameFolderName(currentVoiceFolderPath.split('/').pop() ?? '')
                    setRenameFolderOpen(true)
                  }}
                >
                  <RenameIcon />
                </button>
                <button
                  className="button voice-record-launcher"
                  onClick={onOpenRecorder}
                  aria-label={recording ? 'Open recording window' : 'Start recording'}
                  title={recording ? 'Open recording window' : 'Start recording'}
                  type="button"
                >
                  <span className="voice-record-launcher-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="voice-record-mic-svg" aria-hidden="true">
                      <path
                        d="M12 15.2a3.8 3.8 0 0 1-3.8-3.8V6.9a3.8 3.8 0 1 1 7.6 0v4.5a3.8 3.8 0 0 1-3.8 3.8Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6.7 10.9v.6a5.3 5.3 0 0 0 10.6 0v-.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 16.8v3.1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />
                      <path
                        d="M9 19.9h6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>
                <button
                  className="button-secondary voice-upload-button"
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  aria-label="Upload audio"
                  title="Upload audio"
                >
                  <svg viewBox="0 0 24 24" className="voice-upload-svg" aria-hidden="true">
                    <path
                      d="M12 4.75v10.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                    <path
                      d="M8.6 8.35 12 4.75l3.4 3.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 15.75v1.5c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-1.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onUploadAudioFile(file)
                    event.currentTarget.value = ''
                  }}
                />
              </div>
            </div>
            <div className="folder-tree file-tree notes-folder-tree voice-folder-tree">
              {voiceTree ? (
                <FileTreeNode
                  node={voiceTree}
                  getDisplayName={(node) => memoLabelByPath.get(node.path) ?? node.name}
                  selectedPath={selectedVoiceMemo?.audio_path ?? voiceTree.path}
                  activePath={selectedVoiceMemo?.audio_path ?? null}
                  markedPaths={[]}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={onSelectVoicePath}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  canDragNode={(node) => node.path !== 'voice' && (node.path === 'voice' || node.path.startsWith('voice/'))}
                />
              ) : (
                <div className="empty-state">No voice files yet.</div>
              )}
            </div>
          </>
        }
        content={
          <div className="notes-editor-shell voice-content">
          <div className="panel-header voice-header">
            <div />
            <div />
          </div>
          {selectedVoiceMemo ? (
            <div className="memo-grid">
              <div className="memo-card">
                <div className="voice-memo-card-header">
                  <strong>{voiceMemoDisplayTitle(selectedVoiceMemo.created_at, selectedVoiceMemo.title || 'Memo')}</strong>
                  <div className="voice-header-actions">
                    <button
                      className="button-secondary voice-upload-button"
                      type="button"
                      aria-label="Refresh transcript"
                      title="Refresh transcript"
                      onClick={() => onPollTranscript(selectedVoiceMemo)}
                    >
                      <span className="voice-transcript-refresh-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="voice-upload-svg" aria-hidden="true">
                          <path
                            d="M18.2 8.8A6.7 6.7 0 1 0 19 15.9"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M18.3 5.2v4.5h-4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="voice-transcript-refresh-badge">T</span>
                      </span>
                    </button>
                    <button
                      className="button-secondary voice-upload-button"
                      type="button"
                      aria-label="Delete memo"
                      title="Delete memo"
                      onClick={() => {
                        if (confirmVoiceDelete) {
                          setDeleteMemoOpen(true)
                          return
                        }
                        void onDeleteVoiceMemo(selectedVoiceMemo.id)
                      }}
                    >
                      <svg viewBox="0 0 24 24" className="voice-upload-svg" aria-hidden="true">
                        <path d="M9 5h6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M10 5V4c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M6 7h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M8 7.5v10c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5v-10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="voice-memo-meta-grid">
                  <div>
                    <span className="muted">Duration</span>
                    <strong>{formatDurationSeconds(selectedMemoDurationSeconds)}</strong>
                  </div>
                  <div>
                    <span className="muted">Size</span>
                    <strong>{formatFileSize(selectedVoiceMemoSizeBytes)}</strong>
                  </div>
                </div>
                <audio
                  controls
                  src={api.voiceMemoAudioUrl(selectedVoiceMemo.id)}
                  style={{ width: '100%', marginTop: 12 }}
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration
                    setSelectedMemoDurationSeconds(Number.isFinite(duration) ? duration : null)
                  }}
                />
                <div className="memo-transcript-block">
                  <div className="memo-transcript-label">Transcript</div>
                  <div className="memo-transcript-text">
                    {selectedVoiceMemo.failure_reason
                      ? `Transcription failed: ${selectedVoiceMemo.failure_reason}`
                      : selectedVoiceMemo.transcript?.trim() || 'Transcript pending'}
                  </div>
                </div>
                {selectedVoiceMemo.transcript_segments.length > 0 ? (
                  <div className="memo-segments">
                    {selectedVoiceMemo.transcript_segments.map((segment) => (
                      <div className="memo-segment" key={`${selectedVoiceMemo.id}-${segment.start_ms}`}>
                        <span className="memo-segment-time">
                          {Math.round(segment.start_ms / 1000)}s-{Math.round(segment.end_ms / 1000)}s
                        </span>
                        <span>{segment.text}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="empty-state">Select a voice memo.</div>
          )}
          </div>
        }
      />
      {deleteMemoOpen && selectedVoiceMemo ? (
        <ConfirmModal
          title="Delete memo?"
          onClose={() => setDeleteMemoOpen(false)}
          onConfirm={() => {
            void onDeleteVoiceMemo(selectedVoiceMemo.id)
            setDeleteMemoOpen(false)
          }}
          confirmLabel="Delete"
        >
          <p className="muted">{selectedVoiceMemo.title || 'Untitled memo'}</p>
        </ConfirmModal>
      ) : null}
    </section>
  )
}
