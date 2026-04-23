import { useRef } from 'react'
import { FileTreeNode } from '../components/FileTreeNode'
import { api } from '../lib/api'
import type { FileNode, VoiceMemo } from '../lib/types'

type Props = {
  voiceTree: FileNode | null
  voiceDrawerOpen: boolean
  voicePaneSize: { width: number; height: number }
  activeVoiceSplitter: boolean
  memos: VoiceMemo[]
  selectedVoiceMemoId: string | null
  selectedVoiceMemo: VoiceMemo | null
  recording: boolean
  onSelectVoiceMemo: (id: string) => void
  onSelectVoicePath: (path: string) => void
  onStartVoiceResize: () => void
  onToggleVoiceDrawer: () => void
  onToggleRecording: () => void
  onUploadAudioFile: (file: File) => void
  onPollTranscript: (memo: VoiceMemo) => void
}

export function VoicePage({
  voiceTree,
  voiceDrawerOpen,
  voicePaneSize,
  activeVoiceSplitter,
  memos,
  selectedVoiceMemoId,
  selectedVoiceMemo,
  recording,
  onSelectVoiceMemo,
  onSelectVoicePath,
  onStartVoiceResize,
  onToggleVoiceDrawer,
  onToggleRecording,
  onUploadAudioFile,
  onPollTranscript,
}: Props) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const orderedMemos = selectedVoiceMemo
    ? [selectedVoiceMemo, ...memos.filter((memo) => memo.id !== selectedVoiceMemo.id)]
    : memos

  return (
    <section className="panel">
      <div
        className={`notes-manager voice-manager ${voiceDrawerOpen ? '' : 'library-hidden'} ${activeVoiceSplitter ? 'resizing' : ''}`}
        style={
          {
            ['--notes-pane-width' as string]: `${voicePaneSize.width}px`,
            ['--notes-pane-height' as string]: `${voicePaneSize.height}px`,
          } as React.CSSProperties
        }
      >
        {voiceDrawerOpen ? (
          <aside className="notes-sidebar voice-sidebar">
            <div className="file-sidebar-header-row voice-sidebar-actions">
              <div />
            </div>
            <div className="folder-tree file-tree notes-folder-tree voice-folder-tree">
              {voiceTree ? (
                <FileTreeNode
                  node={voiceTree}
                  getDisplayName={(node) => node.name}
                  selectedPath={selectedVoiceMemo?.audio_path ?? voiceTree.path}
                  activePath={selectedVoiceMemo?.audio_path ?? null}
                  markedPaths={[]}
                  draggingPath={null}
                  dropTargetPath={null}
                  onSelect={onSelectVoicePath}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onDropTargetChange={() => {}}
                  onDrop={async () => {}}
                />
              ) : (
                <div className="empty-state">No voice files yet.</div>
              )}
            </div>
          </aside>
        ) : null}
        <div
          className={`pane-splitter notes-pane-splitter ${activeVoiceSplitter ? 'active' : ''} ${voiceDrawerOpen ? '' : 'collapsed'}`}
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => {
            if (voiceDrawerOpen) onStartVoiceResize()
          }}
          onDoubleClick={onToggleVoiceDrawer}
        />
        <div className="notes-editor-shell voice-content">
          <div className="panel-header voice-header">
            <div />
            <div className="voice-header-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => uploadInputRef.current?.click()}
              >
                Upload audio
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
              <button className="button" onClick={onToggleRecording}>
                {recording ? 'Stop recording' : 'Record memo'}
              </button>
            </div>
          </div>
          <div className="memo-grid">
            {orderedMemos.map((memo) => (
              <div
                className={`memo-card ${memo.id === selectedVoiceMemoId ? 'active' : ''}`}
                key={memo.id}
                onClick={() => onSelectVoiceMemo(memo.id)}
              >
                <strong>{memo.title}</strong>
                <div className="muted">
                  {memo.status} via {memo.model} on {memo.device}
                </div>
                <audio controls src={api.voiceMemoAudioUrl(memo.id)} style={{ width: '100%', marginTop: 12 }} />
                <div className="memo-transcript-block">
                  <div className="memo-transcript-label">Transcript</div>
                  <div className="memo-transcript-text">
                    {memo.failure_reason
                      ? `Transcription failed: ${memo.failure_reason}`
                      : memo.transcript?.trim() || 'Transcript pending'}
                  </div>
                </div>
                {memo.transcript_segments.length > 0 ? (
                  <div className="memo-segments">
                    {memo.transcript_segments.map((segment) => (
                      <div className="memo-segment" key={`${memo.id}-${segment.start_ms}`}>
                        <span className="memo-segment-time">
                          {Math.round(segment.start_ms / 1000)}s-{Math.round(segment.end_ms / 1000)}s
                        </span>
                        <span>{segment.text}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  className="button-secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    onPollTranscript(memo)
                  }}
                >
                  Refresh transcript
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
