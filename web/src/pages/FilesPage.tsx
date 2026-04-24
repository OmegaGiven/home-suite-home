import type { CSSProperties, ChangeEvent, DragEvent, ReactNode, RefObject } from 'react'
import { FileTreeNode } from '../components/FileTreeNode'
import { LibraryShell } from '../components/LibraryShell'
import type { FileNode, ResourceVisibility } from '../lib/types'
import { FilesBrowserPane } from './files/FilesBrowserPane'
import { FilesModals } from './files/FilesModals'
import { FilesPreviewPane } from './files/FilesPreviewPane'

type FileColumnKey = 'name' | 'directory' | 'type' | 'size' | 'modified' | 'created'

type VisibleFileColumn = {
  key: FileColumnKey
  label: string
  className?: string
  resizable?: boolean
}

type Props = {
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
  fileColumnVisibility: Record<Exclude<FileColumnKey, 'name'>, boolean>
  showFileTable: boolean
  fileGridTemplateColumns: string
  visibleFileColumns: VisibleFileColumn[]
  displayedFileNodes: FileNode[]
  onSetCreatingDriveFolder: (value: boolean) => void
  onSetNewDriveFolderName: (value: string) => void
  onCreateDriveFolderFromSelection: () => void
  onSetPendingDeletePaths: (paths: string[]) => void
  onDeleteManagedPaths: (paths: string[]) => void
  onSetRenamingFilePath: (path: string | null) => void
  onSetRenameFileName: (value: string) => void
  onRenameManagedPath: (path: string | null, name: string) => void
  onSetConvertingFilePath: (path: string | null) => void
  onConvertManagedTextFile: (path: string | null) => void
  onSetFileHelpOpen: (open: boolean) => void
  selectFileTreeNode: (path: string) => void
  beginFileDrag: (event: DragEvent<HTMLElement>, path: string) => void
  onFileDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  handleDirectoryDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onSetActiveSplitter: (side: 'left' | 'right') => void
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
  onOpenShareDialog: (target: { resourceKey: string; label: string; visibility?: ResourceVisibility }) => void
  resourceKeyForFilePath: (path: string) => string
  onDownloadManagedPath: (path: string) => void
  onBeginRenameCurrentFile: () => void
}

export function FilesPage({
  creatingDriveFolder,
  newDriveFolderName,
  pendingDeletePaths,
  pendingDeleteNodes,
  renamingFilePath,
  renameFileName,
  convertingFilePath,
  fileHelpOpen,
  fileManagerRef,
  fileSearchInputRef,
  fileColumnViewRef,
  renameInputRef,
  deleteConfirmButtonRef,
  deleteCancelButtonRef,
  activeSplitter,
  filePreviewOpen,
  filePaneWidths,
  filePaneHeights,
  filesTree,
  displayNameForFileNode,
  selectedFilePath,
  activeFileNode,
  markedFilePaths,
  draggingFilePath,
  dropTargetPath,
  currentDirectoryPath,
  trimmedFileSearchQuery,
  fileSearchOpen,
  fileSearchQuery,
  fileColumnViewOpen,
  fileColumnVisibility,
  showFileTable,
  fileGridTemplateColumns,
  visibleFileColumns,
  displayedFileNodes,
  onSetCreatingDriveFolder,
  onSetNewDriveFolderName,
  onCreateDriveFolderFromSelection,
  onSetPendingDeletePaths,
  onDeleteManagedPaths,
  onSetRenamingFilePath,
  onSetRenameFileName,
  onRenameManagedPath,
  onSetConvertingFilePath,
  onConvertManagedTextFile,
  onSetFileHelpOpen,
  selectFileTreeNode,
  beginFileDrag,
  onFileDragEnd,
  onDropTargetChange,
  handleDirectoryDrop,
  onSetActiveSplitter,
  onToggleFilePreviewPane,
  onOpenSearch,
  onCloseSearch,
  onChangeSearchQuery,
  goToParentDirectory,
  onToggleFileColumnView,
  onToggleFileColumnVisibility,
  onBeginCreateFolder,
  onHandleDriveUpload,
  beginFileColumnResize,
  renderFileColumnCell,
  onSetActiveFilePath,
  onOpenFileNode,
  canDeleteFilePath,
  canRenameFilePath,
  canConvertFilePath,
  onRequestDeletePaths,
  onOpenShareDialog,
  resourceKeyForFilePath,
  onDownloadManagedPath,
  onBeginRenameCurrentFile,
}: Props) {
  return (
    <section className="panel">
      <FilesModals
        creatingDriveFolder={creatingDriveFolder}
        newDriveFolderName={newDriveFolderName}
        pendingDeletePaths={pendingDeletePaths}
        pendingDeleteNodes={pendingDeleteNodes}
        renamingFilePath={renamingFilePath}
        renameFileName={renameFileName}
        convertingFilePath={convertingFilePath}
        fileHelpOpen={fileHelpOpen}
        renameInputRef={renameInputRef}
        deleteConfirmButtonRef={deleteConfirmButtonRef}
        deleteCancelButtonRef={deleteCancelButtonRef}
        onSetCreatingDriveFolder={onSetCreatingDriveFolder}
        onSetNewDriveFolderName={onSetNewDriveFolderName}
        onCreateDriveFolderFromSelection={onCreateDriveFolderFromSelection}
        onSetPendingDeletePaths={onSetPendingDeletePaths}
        onDeleteManagedPaths={onDeleteManagedPaths}
        onSetRenamingFilePath={onSetRenamingFilePath}
        onSetRenameFileName={onSetRenameFileName}
        onRenameManagedPath={onRenameManagedPath}
        onSetConvertingFilePath={onSetConvertingFilePath}
        onConvertManagedTextFile={onConvertManagedTextFile}
        onSetFileHelpOpen={onSetFileHelpOpen}
      />
      <LibraryShell
        managerRef={fileManagerRef}
        managerClassName={`file-manager ${activeSplitter ? 'resizing' : ''} ${filePreviewOpen ? '' : 'preview-collapsed'}`}
        drawerOpen
        activeSplitter={activeSplitter === 'left'}
        paneSize={{ width: filePaneWidths.left, height: filePaneHeights.top }}
        style={
          {
            ['--files-left-width' as string]: `${filePaneWidths.left}px`,
            ['--files-right-width' as string]: `${filePaneWidths.right}px`,
            ['--files-top-height' as string]: `${filePaneHeights.top}px`,
            ['--files-middle-height' as string]: `${filePaneHeights.middle}px`,
          } as CSSProperties
        }
        sidebarClassName="file-sidebar"
        splitterClassName="pane-splitter"
        onStartResize={() => onSetActiveSplitter('left')}
        sidebar={
          <div className="folder-tree file-tree">
            {filesTree.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                getDisplayName={displayNameForFileNode}
                selectedPath={selectedFilePath}
                activePath={activeFileNode?.path ?? null}
                markedPaths={markedFilePaths}
                draggingPath={draggingFilePath}
                dropTargetPath={dropTargetPath}
                onSelect={selectFileTreeNode}
                onDragStart={beginFileDrag}
                onDragEnd={onFileDragEnd}
                onDropTargetChange={onDropTargetChange}
                onDrop={handleDirectoryDrop}
              />
            ))}
          </div>
        }
        content={
          <>
            <FilesBrowserPane
              fileSearchInputRef={fileSearchInputRef}
              fileColumnViewRef={fileColumnViewRef}
              currentDirectoryPath={currentDirectoryPath}
              trimmedFileSearchQuery={trimmedFileSearchQuery}
              fileSearchOpen={fileSearchOpen}
              fileSearchQuery={fileSearchQuery}
              fileColumnViewOpen={fileColumnViewOpen}
              fileColumnVisibility={fileColumnVisibility}
              showFileTable={showFileTable}
              fileGridTemplateColumns={fileGridTemplateColumns}
              visibleFileColumns={visibleFileColumns}
              displayedFileNodes={displayedFileNodes}
              dropTargetPath={dropTargetPath}
              activeFilePath={activeFileNode?.path ?? null}
              markedFilePaths={markedFilePaths}
              draggingFilePath={draggingFilePath}
              onOpenSearch={onOpenSearch}
              onCloseSearch={onCloseSearch}
              onChangeSearchQuery={onChangeSearchQuery}
              goToParentDirectory={goToParentDirectory}
              onToggleFileColumnView={onToggleFileColumnView}
              onToggleFileColumnVisibility={onToggleFileColumnVisibility}
              onBeginCreateFolder={onBeginCreateFolder}
              onHandleDriveUpload={onHandleDriveUpload}
              beginFileColumnResize={beginFileColumnResize}
              renderFileColumnCell={renderFileColumnCell}
              beginFileDrag={beginFileDrag}
              onFileDragEnd={onFileDragEnd}
              onDropTargetChange={onDropTargetChange}
              handleDirectoryDrop={handleDirectoryDrop}
              onSetActiveFilePath={onSetActiveFilePath}
              onOpenFileNode={onOpenFileNode}
            />
            <div
              className={`pane-splitter ${activeSplitter === 'right' ? 'active' : ''} ${filePreviewOpen ? '' : 'collapsed'}`}
              role="separator"
              aria-orientation="vertical"
              aria-expanded={filePreviewOpen}
              onMouseDown={() => {
                if (!filePreviewOpen) return
                onSetActiveSplitter('right')
              }}
              onDoubleClick={onToggleFilePreviewPane}
            />
            <FilesPreviewPane
              filePreviewOpen={filePreviewOpen}
              activeFileNode={activeFileNode}
              markedFilePaths={markedFilePaths}
              displayNameForFileNode={displayNameForFileNode}
              onSetActiveFilePath={onSetActiveFilePath}
              onOpenFileNode={onOpenFileNode}
              onDownloadManagedPath={onDownloadManagedPath}
              onOpenShareDialog={onOpenShareDialog}
              resourceKeyForFilePath={resourceKeyForFilePath}
              canConvertFilePath={canConvertFilePath}
              onSetConvertingFilePath={onSetConvertingFilePath}
              onBeginRenameCurrentFile={onBeginRenameCurrentFile}
              canRenameFilePath={canRenameFilePath}
              onRequestDeletePaths={onRequestDeletePaths}
              canDeleteFilePath={canDeleteFilePath}
            />
          </>
        }
      />
    </section>
  )
}
