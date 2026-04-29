import { useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from 'react'
import { LibraryActionBar } from '../components/LibraryActionBar'
import { NewFolderIcon, RenameIcon, UploadIcon } from '../components/LibraryActionIcons'
import { FileTreeHeader, FileTreeNode, type FileTreeRowMetaVisibility } from '../components/FileTreeNode'
import { LibraryShell } from '../components/LibraryShell'
import { PaneSplitter } from '../components/PaneSplitter'
import type { FileNode, ResourceVisibility } from '../lib/types'
import { aggregateFileNodeSize, ancestorDirectoryPaths, fileTypeLabel, filterFileTree, formatFileSize, formatFileTimestamp, sortFileTree, toggleFileTreeSortState, type FileTreeSortState } from '../lib/ui-helpers'
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
  onSetMarkedFilePaths: (paths: string[] | ((current: string[]) => string[])) => void
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
  renameInputRef,
  deleteConfirmButtonRef,
  deleteCancelButtonRef,
  activeSplitter,
  filePreviewOpen,
  filePaneWidths,
  filesTree,
  displayNameForFileNode,
  selectedFilePath,
  activeFileNode,
  markedFilePaths,
  draggingFilePath,
  dropTargetPath,
  onSetCreatingDriveFolder,
  onSetNewDriveFolderName,
  onCreateDriveFolderFromSelection,
  onSetPendingDeletePaths,
  onSetMarkedFilePaths,
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
  onBeginCreateFolder,
  onHandleDriveUpload,
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
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [metaFilterOpen, setMetaFilterOpen] = useState(false)
  const [sortState, setSortState] = useState<FileTreeSortState | null>(null)
  const [rowMetaVisibility, setRowMetaVisibility] = useState<FileTreeRowMetaVisibility>({
    type: true,
    size: true,
    modified: true,
    created: true,
  })
  const filteredFilesTree = useMemo(
    () => filterFileTree(filesTree, sidebarSearchQuery, displayNameForFileNode),
    [filesTree, sidebarSearchQuery, displayNameForFileNode],
  )
  const sortedFilesTree = useMemo(
    () => sortFileTree(filteredFilesTree, sortState, displayNameForFileNode),
    [filteredFilesTree, sortState, displayNameForFileNode],
  )
  const highlightedPaths = useMemo(
    () => ancestorDirectoryPaths(selectedFilePath),
    [selectedFilePath],
  )

  function handleTreeSelection(path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    if (options?.shiftKey && selectedFilePath && treeContainerRef.current) {
      const orderedPaths = Array.from(treeContainerRef.current.querySelectorAll<HTMLElement>('[data-file-tree-path]'))
        .map((element) => element.dataset.fileTreePath)
        .filter((value): value is string => Boolean(value))
      const anchorIndex = orderedPaths.indexOf(selectedFilePath)
      const targetIndex = orderedPaths.indexOf(path)
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
        const range = orderedPaths.slice(start, end + 1)
        onSetMarkedFilePaths(Array.from(new Set(range)))
        selectFileTreeNode(path)
        return
      }
    }

    if (options?.metaKey || options?.ctrlKey) {
      onSetMarkedFilePaths((current) =>
        current.includes(path) ? current.filter((entry) => entry !== path) : Array.from(new Set([...current, path])),
      )
      selectFileTreeNode(path)
      return
    }

    onSetMarkedFilePaths(path ? [path] : [])
    selectFileTreeNode(path)
  }

  function handleTreeOpen(path: string) {
    const node = path === '' ? null : filesTree.length > 0 ? findNodeByPath(filesTree, path) : null
    if (!node || node.kind === 'directory') return
    void onOpenFileNode(node)
  }

  return (
    <>
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
        paneSize={{ width: filePaneWidths.left, height: 0 }}
        style={
          {
            ['--files-left-width' as string]: `${filePaneWidths.left}px`,
            ['--files-right-width' as string]: `${filePaneWidths.right}px`,
          } as CSSProperties
        }
        sidebarClassName="file-sidebar"
        splitterClassName="pane-splitter"
        showSplitter={false}
        onStartResize={() => onSetActiveSplitter('left')}
        sidebar={
          <>
            <LibraryActionBar
              searchOpen={sidebarSearchOpen}
              searchQuery={sidebarSearchQuery}
              searchPlaceholder="Search files"
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
              commonActions={[
                { key: 'folder', label: 'New folder', icon: <NewFolderIcon />, onClick: onBeginCreateFolder },
                {
                  key: 'rename',
                  label: 'Rename',
                  icon: <RenameIcon />,
                  disabled: !canRenameFilePath(activeFileNode?.path),
                  onClick: onBeginRenameCurrentFile,
                },
                {
                  key: 'upload',
                  kind: 'upload',
                  label: 'Upload',
                  icon: <UploadIcon />,
                  onFileSelected: (file) => {
                    const event = {
                      target: { files: [file] },
                    } as unknown as ChangeEvent<HTMLInputElement>
                    onHandleDriveUpload(event)
                  },
                },
              ]}
            />
            <div ref={treeContainerRef} className="folder-tree file-tree">
            <FileTreeHeader
              rowMetaVisibility={rowMetaVisibility}
              sortState={sortState}
              onSort={(key) => setSortState((current) => toggleFileTreeSortState(current, key))}
            />
            {sortedFilesTree.length > 0 ? sortedFilesTree.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                getDisplayName={displayNameForFileNode}
                selectedPath={selectedFilePath}
                activePath={activeFileNode?.path ?? null}
                highlightedPaths={highlightedPaths}
                markedPaths={markedFilePaths}
                draggingPath={draggingFilePath}
                dropTargetPath={dropTargetPath}
                onSelect={handleTreeSelection}
                onOpen={handleTreeOpen}
                onDragStart={beginFileDrag}
                onDragEnd={onFileDragEnd}
                onDropTargetChange={onDropTargetChange}
                onDrop={handleDirectoryDrop}
                getRowMeta={(node) => ({
                  type: node.kind === 'directory' ? 'Folder' : fileTypeLabel(node.name),
                  size: formatFileSize(node.kind === 'directory' ? aggregateFileNodeSize(node) : node.size_bytes),
                  modified: formatFileTimestamp(node.updated_at),
                  created: formatFileTimestamp(node.created_at),
                })}
                rowMetaVisibility={rowMetaVisibility}
              />
            )) : (
              <div className="empty-state">{sidebarSearchQuery.trim() ? 'No matching files.' : 'No files yet.'}</div>
            )}
          </div>
          </>
        }
        content={
          <>
            <PaneSplitter
              className="pane-splitter"
              active={activeSplitter === 'right'}
              collapsed={!filePreviewOpen}
              drawerOpen={filePreviewOpen}
              ariaExpanded={filePreviewOpen}
              onStartResize={() => onSetActiveSplitter('right')}
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
    </>
  )
}

function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.kind === 'directory') {
      const nested = findNodeByPath(node.children, path)
      if (nested) return nested
    }
  }
  return null
}
