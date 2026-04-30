import type { DragEvent } from 'react'
import type { AdminDeletedItem, FileNode, VoiceMemo } from './types'

type BuildVoicePagePropsArgs = {
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
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
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

export function buildVoicePageProps(args: BuildVoicePagePropsArgs) {
  return { ...args }
}

