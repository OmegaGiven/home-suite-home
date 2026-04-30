import { useEffect, useMemo, useRef, useState } from 'react'
import { LibraryActionBar } from '../components/LibraryActionBar'
import { MicrophoneIcon, NewFolderIcon, RenameIcon, UploadIcon } from '../components/LibraryActionIcons'
import { ConfirmModal } from '../components/ConfirmModal'
import { FileTreeHeader, FileTreeNodes } from '../components/FileTreeNode'
import { FolderPromptModal } from '../components/FolderPromptModal'
import { LibraryDeletedTreeNode } from '../components/LibraryDeletedTreeNode'
import { LibraryShell } from '../components/LibraryShell'
import { api } from '../lib/api'
import type { AdminDeletedItem, FileNode, VoiceMemo } from '../lib/types'
import { aggregateFileNodeSize, ancestorDirectoryPaths, filterFileNode, formatDurationSeconds, formatFileSize, formatFileTimestamp, sortFileTree, toggleFileTreeSortState, voiceMemoDisplayTitle } from '../lib/ui-helpers'
import { buildDeletedLibraryTreeNode } from '../lib/deleted-tree'
import { getTreeRangeSelection, toggleMarkedTreePath, useLibraryTreeControls } from '../lib/library-tree-controls'

type Props = {
  voiceTree: FileNode | null
  voiceDrawerOpen: boolean
  voicePaneSize: { width: number; height: number }
  activeVoiceSplitter: boolean
  memos: VoiceMemo[]
  deletedItems: AdminDeletedItem[]
  selectedVoiceMemo: VoiceMemo | null
  selectedVoicePath: string | null
  selectedVoiceMemoSizeBytes: number | null
  currentVoiceFolderPath: string
  recording: boolean
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  onSelectVoicePath: (path: string) => void
  onSetMarkedPaths: (paths: string[] | ((current: string[]) => string[])) => void
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
  onRenameVoiceMemo: (memoId: string, title: string) => Promise<void>
  onDeleteVoiceMemo: (memoId: string) => Promise<void>
  onRestoreDeletedVoiceMemo: (id: string) => void
  confirmVoiceDelete: boolean
}

export function VoicePage({
  voiceTree,
  voiceDrawerOpen,
  voicePaneSize,
  activeVoiceSplitter,
  memos,
  deletedItems,
  selectedVoiceMemo,
  selectedVoicePath,
  selectedVoiceMemoSizeBytes,
  currentVoiceFolderPath,
  recording,
  markedPaths,
  draggingPath,
  dropTargetPath,
  onSelectVoicePath,
  onSetMarkedPaths,
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
  onRenameVoiceMemo,
  onDeleteVoiceMemo,
  onRestoreDeletedVoiceMemo,
  confirmVoiceDelete,
}: Props) {
  const [deleteMemoOpen, setDeleteMemoOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const {
    sidebarSearchOpen,
    setSidebarSearchOpen,
    sidebarSearchQuery,
    setSidebarSearchQuery,
    metaFilterOpen,
    setMetaFilterOpen,
    sortState,
    setSortState,
    rowMetaVisibility,
    setRowMetaVisibility,
  } = useLibraryTreeControls()
  const [newFolderName, setNewFolderName] = useState('')
  const [renameFolderName, setRenameFolderName] = useState(currentVoiceFolderPath.split('/').pop() ?? '')
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedMemoDurationSeconds, setSelectedMemoDurationSeconds] = useState<number | null>(null)
  const [memoTitleDraft, setMemoTitleDraft] = useState('')
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
  const filteredVoiceTree = useMemo(
    () => filterFileNode(voiceTree, sidebarSearchQuery, (node) => memoLabelByPath.get(node.path) ?? node.name),
    [voiceTree, sidebarSearchQuery, memoLabelByPath],
  )
  const highlightedPaths = useMemo(
    () => ancestorDirectoryPaths(currentVoiceFolderPath).filter((path) => path !== 'voice'),
    [currentVoiceFolderPath],
  )
  const visibleVoiceNodes = useMemo(
    () => (filteredVoiceTree ? [filteredVoiceTree] : []),
    [filteredVoiceTree],
  )
  const sortedVisibleVoiceNodes = useMemo(
    () => sortFileTree(visibleVoiceNodes, sortState, (node) => memoLabelByPath.get(node.path) ?? node.name),
    [visibleVoiceNodes, sortState, memoLabelByPath],
  )
  const deletedVoiceTreeNode = useMemo(() => buildDeletedLibraryTreeNode('voice', deletedItems), [deletedItems])

  function handleTreeSelection(path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    if (options?.shiftKey && selectedVoicePath) {
      const range = getTreeRangeSelection(treeContainerRef.current, selectedVoicePath, path, (entry) => entry.startsWith('voice/'))
      if (range) {
        onSetMarkedPaths(Array.from(new Set(range)))
        onSelectVoicePath(path)
        return
      }
    }

    if (options?.metaKey || options?.ctrlKey) {
      onSetMarkedPaths((current) => toggleMarkedTreePath(current, path))
      onSelectVoicePath(path)
      return
    }

    onSetMarkedPaths(path.startsWith('voice/') ? [path] : [])
    onSelectVoicePath(path)
  }

  function handleTreeOpen(path: string) {
    if (path.startsWith('deleted-voice:')) {
      void onRestoreDeletedVoiceMemo(path.slice('deleted-voice:'.length))
      return
    }
    if (!path.startsWith('voice/')) return
    onSelectVoicePath(path)
  }

  useEffect(() => {
    setSelectedMemoDurationSeconds(null)
  }, [selectedVoiceMemo?.id])

  useEffect(() => {
    setMemoTitleDraft(selectedVoiceMemo?.title ?? '')
  }, [selectedVoiceMemo?.id, selectedVoiceMemo?.title])

  async function commitMemoTitle() {
    if (!selectedVoiceMemo) return
    const trimmed = memoTitleDraft.trim()
    if (!trimmed || trimmed === selectedVoiceMemo.title) {
      setMemoTitleDraft(selectedVoiceMemo.title)
      return
    }
    await onRenameVoiceMemo(selectedVoiceMemo.id, trimmed)
  }

  return (
    <>
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
            <LibraryActionBar
              searchOpen={sidebarSearchOpen}
              searchQuery={sidebarSearchQuery}
              searchPlaceholder="Search voice"
              onOpenSearch={() => setSidebarSearchOpen(true)}
              onCloseSearch={() => {
                setSidebarSearchOpen(false)
                setSidebarSearchQuery('')
              }}
              onChangeSearchQuery={setSidebarSearchQuery}
              metaFilterOpen={metaFilterOpen}
              rowMetaVisibility={rowMetaVisibility}
              onToggleMetaFilterOpen={() => setMetaFilterOpen((current) => !current)}
              onToggleMetaVisibility={(column) =>
                setRowMetaVisibility((current) => ({ ...current, [column]: !current[column] }))
              }
              rootDropPath="voice"
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onDropTargetChange={onDropTargetChange}
              onDropRoot={onDrop}
              commonActions={[
                { key: 'folder', label: 'New folder', icon: <NewFolderIcon />, onClick: () => setCreateFolderOpen(true) },
                {
                  key: 'rename',
                  label: 'Rename folder',
                  icon: <RenameIcon />,
                  disabled: currentVoiceFolderPath === 'voice',
                  onClick: () => {
                    setRenameFolderName(currentVoiceFolderPath.split('/').pop() ?? '')
                    setRenameFolderOpen(true)
                  },
                },
                {
                  key: 'upload',
                  kind: 'upload',
                  label: 'Upload audio',
                  icon: <UploadIcon />,
                  accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm',
                  onFileSelected: onUploadAudioFile,
                },
              ]}
              pageActions={[{
                key: 'record',
                label: recording ? 'Open recording window' : 'Start recording',
                icon: <MicrophoneIcon />,
                onClick: onOpenRecorder,
              }]}
            />
            <div ref={treeContainerRef} className="folder-tree file-tree notes-folder-tree voice-folder-tree">
              <FileTreeHeader
                rowMetaVisibility={rowMetaVisibility}
                sortState={sortState}
                onSort={(key) => setSortState((current) => toggleFileTreeSortState(current, key))}
              />
              {sortedVisibleVoiceNodes.length > 0 ? (
                <FileTreeNodes
                  nodes={sortedVisibleVoiceNodes}
                  getDisplayName={(node) => memoLabelByPath.get(node.path) ?? node.name}
                  selectedPath={selectedVoicePath ?? ''}
                  activePath={selectedVoicePath ?? null}
                  highlightedPaths={highlightedPaths}
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={handleTreeSelection}
                  onOpen={handleTreeOpen}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  canDragNode={(node) => node.path !== 'voice' && (node.path === 'voice' || node.path.startsWith('voice/'))}
                  getRowMeta={(node) => ({
                    type: node.kind === 'directory' ? 'Folder' : 'Audio',
                    size: formatFileSize(node.kind === 'directory' ? aggregateFileNodeSize(node) : node.size_bytes),
                    modified: formatFileTimestamp(node.updated_at),
                    created: formatFileTimestamp(node.created_at),
                  })}
                  rowMetaVisibility={rowMetaVisibility}
                />
              ) : (
                <div className="empty-state">{sidebarSearchQuery.trim() ? 'No matching voice files.' : 'No voice files yet.'}</div>
              )}
              {deletedVoiceTreeNode ? (
                <LibraryDeletedTreeNode
                  kind="voice"
                  node={deletedVoiceTreeNode}
                  deletedItems={deletedItems}
                  selectedPath={selectedVoicePath ?? ''}
                  activePath={selectedVoicePath ?? null}
                  markedPaths={markedPaths}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onSelect={handleTreeSelection}
                  onOpen={handleTreeOpen}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTargetChange={onDropTargetChange}
                  onDrop={onDrop}
                  rowMetaVisibility={rowMetaVisibility}
                />
              ) : null}
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
                  <input
                    className="input note-title-input notes-title-input"
                    value={memoTitleDraft}
                    placeholder={voiceMemoDisplayTitle(selectedVoiceMemo.created_at, 'Memo')}
                    onChange={(event) => setMemoTitleDraft(event.target.value)}
                    onBlur={() => {
                      void commitMemoTitle()
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void commitMemoTitle()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setMemoTitleDraft(selectedVoiceMemo.title)
                      }
                    }}
                  />
                  <div className="voice-header-actions">
                    <button
                      className="button-secondary voice-upload-button"
                      type="button"
                      aria-label="Refresh transcript"
                      title="Refresh transcript"
                      disabled={selectedVoiceMemo.local_only}
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
                  src={selectedVoiceMemo.local_only ? undefined : api.voiceMemoAudioUrl(selectedVoiceMemo.id)}
                  style={{ width: '100%', marginTop: 12 }}
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration
                    setSelectedMemoDurationSeconds(Number.isFinite(duration) ? duration : null)
                  }}
                />
                <div className="memo-transcript-block">
                  <div className="memo-transcript-label">Transcript</div>
                  <div className="memo-transcript-text">
                    {selectedVoiceMemo.local_only
                      ? 'Queued for upload and sync when the connection returns.'
                      : selectedVoiceMemo.failure_reason
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
    </>
  )
}
