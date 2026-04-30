import type { ChangeEvent, DragEvent, ReactNode, RefObject } from 'react'
import type { AdminDeletedItem, FileNode } from './types'
import type { ShareTarget } from './share-actions'

type FileColumnKey = 'name' | 'directory' | 'type' | 'size' | 'modified' | 'created'
type VisibleFileColumn = {
  key: FileColumnKey
  label: string
  className?: string
  resizable?: boolean
}
type FileColumnVisibility = Record<Exclude<FileColumnKey, 'name'>, boolean>

type BuildFilesPagePropsArgs = {
  creatingDriveFolder: boolean
  newDriveFolderName: string
  pendingDeletePaths: string[]
  pendingDeleteNodes: FileNode[]
  renamingFilePath: string | null
  renameFileName: string
  convertingFilePath: string | null
  fileHelpOpen: boolean
  fileManagerRef: RefObject<HTMLDivElement | null>
  fileSearchInputRef: RefObject<HTMLInputElement | null>
  fileColumnViewRef: RefObject<HTMLDivElement | null>
  renameInputRef: RefObject<HTMLInputElement | null>
  deleteConfirmButtonRef: RefObject<HTMLButtonElement | null>
  deleteCancelButtonRef: RefObject<HTMLButtonElement | null>
  activeSplitter: 'left' | 'right' | null
  filePreviewOpen: boolean
  filePaneWidths: { left: number; right: number }
  filePaneHeights: { top: number; middle: number }
  filesTree: FileNode[]
  deletedItems: AdminDeletedItem[]
  displayNameForFileNode: (node: FileNode) => string
  selectedFilePath: string
  activeFileNode: FileNode | null
  markedFilePaths: string[]
  draggingFilePath: string | null
  dropTargetPath: string | null
  currentDirectoryPath: string
  trimmedFileSearchQuery: string
  fileSearchOpen: boolean
  fileSearchQuery: string
  fileColumnViewOpen: boolean
  fileColumnVisibility: FileColumnVisibility
  showFileTable: boolean
  fileGridTemplateColumns: string
  visibleFileColumns: VisibleFileColumn[]
  displayedFileNodes: FileNode[]
  onSetCreatingDriveFolder: (value: boolean) => void
  onSetNewDriveFolderName: (value: string) => void
  onCreateDriveFolderFromSelection: () => void
  onSetPendingDeletePaths: (paths: string[]) => void
  onSetMarkedFilePaths: (paths: string[] | ((current: string[]) => string[])) => void
  onDeleteManagedPaths: (paths: string[]) => void
  onSetRenamingFilePath: (path: string | null) => void
  onSetRenameFileName: (value: string) => void
  onRenameManagedPath: (path: string | null, name: string) => void
  onSetConvertingFilePath: (path: string | null) => void
  onConvertManagedTextFile: (path: string | null) => void
  onSetFileHelpOpen: (open: boolean) => void
  selectFileTreeNode: (path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void
  beginFileDrag: (event: DragEvent<HTMLElement>, path: string) => void
  onFileDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  handleDirectoryDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onSetActiveSplitter: (splitter: 'left' | 'right' | null) => void
  onToggleFilePreviewPane: () => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onChangeSearchQuery: (value: string) => void
  goToParentDirectory: () => void
  onToggleFileColumnView: () => void
  onToggleFileColumnVisibility: (column: FileColumnKey) => void
  onBeginCreateFolder: () => void
  onHandleDriveUpload: (event: ChangeEvent<HTMLInputElement>) => void
  beginFileColumnResize: (column: FileColumnKey, clientX: number) => void
  renderFileColumnCell: (node: FileNode, column: FileColumnKey) => ReactNode
  onSetActiveFilePath: (path: string) => void
  onOpenFileNode: (node: FileNode | null | undefined) => void
  canDeleteFilePath: (path: string | null | undefined) => boolean
  canRenameFilePath: (path: string | null | undefined) => boolean
  canConvertFilePath: (path: string | null | undefined) => boolean
  onRequestDeletePaths: (paths: string[]) => void
  onOpenShareDialog: (target: ShareTarget) => void
  resourceKeyForFilePath: (path: string) => string
  onDownloadManagedPath: (path: string) => void
  onBeginRenameCurrentFile: () => void
  onRestoreDeletedItem: (item: AdminDeletedItem | null) => void
}

export function buildFilesPageProps(args: BuildFilesPagePropsArgs) {
  return { ...args }
}
