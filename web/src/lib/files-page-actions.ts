import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import type { ShareTarget } from './share-actions'
import type { FileColumnKey } from './file-browser'
import type { AdminDeletedItem, FileNode } from './types'

type CreateFilesPageActionsContext = {
  setCreatingDriveFolder: Dispatch<SetStateAction<boolean>>
  setNewDriveFolderName: Dispatch<SetStateAction<string>>
  setPendingDeletePaths: Dispatch<SetStateAction<string[]>>
  setMarkedFilePaths: Dispatch<SetStateAction<string[]>>
  setRenamingFilePath: Dispatch<SetStateAction<string | null>>
  setRenameFileName: Dispatch<SetStateAction<string>>
  setConvertingFilePath: Dispatch<SetStateAction<string | null>>
  setFileHelpOpen: Dispatch<SetStateAction<boolean>>
  setDraggingFilePath: Dispatch<SetStateAction<string | null>>
  setDropTargetPath: Dispatch<SetStateAction<string | null>>
  setActiveSplitter: Dispatch<SetStateAction<'left' | 'right' | null>>
  setFileSearchOpen: Dispatch<SetStateAction<boolean>>
  setFileSearchQuery: Dispatch<SetStateAction<string>>
  setFileColumnViewOpen: Dispatch<SetStateAction<boolean>>
  setActiveFilePath: Dispatch<SetStateAction<string | null>>
  createDriveFolderFromSelection: () => Promise<void>
  deleteManagedPaths: (paths: string[]) => Promise<void>
  renameManagedPath: (path: string, name: string) => Promise<void>
  convertManagedTextFile: (path: string) => Promise<void>
  selectFileTreeNode: (path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void
  beginFileDrag: (event: React.DragEvent<HTMLElement>, path: string) => void
  handleDirectoryDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  toggleFilePreviewPane: () => void
  goToParentDirectory: () => void
  toggleFileColumnVisibility: (column: FileColumnKey) => void
  handleDriveUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  beginFileColumnResize: (column: FileColumnKey, clientX: number) => void
  renderFileColumnCell: (node: FileNode, column: FileColumnKey) => React.ReactNode
  openFileNode: (node: FileNode | null | undefined) => Promise<void>
  canDeleteFilePath: (path: string | null | undefined) => boolean
  canRenameFilePath: (path: string | null | undefined) => boolean
  canConvertFilePath: (path: string | null | undefined) => boolean
  requestDeletePaths: (paths: string[]) => void
  openShareDialog: (target: ShareTarget) => Promise<void>
  resourceKeyForFilePath: (path: string) => string
  downloadManagedPath: (path: string) => void
  beginRenameCurrentFile: () => void
  restoreUserDeletedItem: (id: string) => Promise<void>
}

export function createFilesPageActions(context: CreateFilesPageActionsContext) {
  return {
    onSetCreatingDriveFolder: context.setCreatingDriveFolder,
    onSetNewDriveFolderName: context.setNewDriveFolderName,
    onCreateDriveFolderFromSelection: () => void context.createDriveFolderFromSelection(),
    onSetPendingDeletePaths: context.setPendingDeletePaths,
    onSetMarkedFilePaths: context.setMarkedFilePaths,
    onDeleteManagedPaths: (paths: string[]) => void context.deleteManagedPaths(paths),
    onSetRenamingFilePath: context.setRenamingFilePath,
    onSetRenameFileName: context.setRenameFileName,
    onRenameManagedPath: (path: string | null, name: string) => {
      if (!path) return
      void context.renameManagedPath(path, name)
    },
    onSetConvertingFilePath: context.setConvertingFilePath,
    onConvertManagedTextFile: (path: string | null) => {
      if (!path) return
      void context.convertManagedTextFile(path)
    },
    onSetFileHelpOpen: context.setFileHelpOpen,
    selectFileTreeNode: context.selectFileTreeNode,
    beginFileDrag: context.beginFileDrag,
    onFileDragEnd: () => {
      context.setDraggingFilePath(null)
      context.setDropTargetPath(null)
    },
    onDropTargetChange: context.setDropTargetPath,
    handleDirectoryDrop: context.handleDirectoryDrop,
    onSetActiveSplitter: context.setActiveSplitter,
    onToggleFilePreviewPane: context.toggleFilePreviewPane,
    onOpenSearch: () => context.setFileSearchOpen(true),
    onCloseSearch: () => {
      context.setFileSearchOpen(false)
      context.setFileSearchQuery('')
    },
    onChangeSearchQuery: context.setFileSearchQuery,
    goToParentDirectory: context.goToParentDirectory,
    onToggleFileColumnView: () => context.setFileColumnViewOpen((current) => !current),
    onToggleFileColumnVisibility: context.toggleFileColumnVisibility,
    onBeginCreateFolder: () => {
      context.setCreatingDriveFolder(true)
      context.setNewDriveFolderName('')
    },
    onHandleDriveUpload: (event: ChangeEvent<HTMLInputElement>) => void context.handleDriveUpload(event),
    beginFileColumnResize: context.beginFileColumnResize,
    renderFileColumnCell: context.renderFileColumnCell,
    onSetActiveFilePath: context.setActiveFilePath,
    onOpenFileNode: (node: FileNode | null | undefined) => void context.openFileNode(node),
    canDeleteFilePath: context.canDeleteFilePath,
    canRenameFilePath: context.canRenameFilePath,
    canConvertFilePath: context.canConvertFilePath,
    onRequestDeletePaths: context.requestDeletePaths,
    onOpenShareDialog: (target: ShareTarget) => void context.openShareDialog(target),
    resourceKeyForFilePath: context.resourceKeyForFilePath,
    onDownloadManagedPath: context.downloadManagedPath,
    onBeginRenameCurrentFile: context.beginRenameCurrentFile,
    onRestoreDeletedItem: (item: AdminDeletedItem | null) => {
      if (!item) return
      void context.restoreUserDeletedItem(item.id)
    },
  }
}
