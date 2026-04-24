import type { ChangeEvent, DragEvent, ReactNode, RefObject } from 'react'
import type { FileNode } from '../../lib/types'
import { deriveParentPath } from '../../lib/ui-helpers'

type FileColumnKey = 'name' | 'directory' | 'type' | 'size' | 'modified' | 'created'

type VisibleFileColumn = {
  key: FileColumnKey
  label: string
  className?: string
  resizable?: boolean
}

type Props = {
  fileSearchInputRef: RefObject<HTMLInputElement | null>
  fileColumnViewRef: RefObject<HTMLDivElement | null>
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
  dropTargetPath: string | null
  activeFilePath: string | null
  markedFilePaths: string[]
  draggingFilePath: string | null
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
  beginFileDrag: (event: DragEvent<HTMLElement>, path: string) => void
  onFileDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  handleDirectoryDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  onSetActiveFilePath: (path: string) => void
  onOpenFileNode: (node: FileNode | null | undefined) => void
}

export function FilesBrowserPane({
  fileSearchInputRef,
  fileColumnViewRef,
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
  dropTargetPath,
  activeFilePath,
  markedFilePaths,
  draggingFilePath,
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
  beginFileDrag,
  onFileDragEnd,
  onDropTargetChange,
  handleDirectoryDrop,
  onSetActiveFilePath,
  onOpenFileNode,
}: Props) {
  return (
    <div className="file-browser-pane">
      <div className="file-list-shell">
        <div className="file-browser-header">
          {fileSearchOpen ? (
            <div className="file-current-directory file-current-directory-search">
              <input
                ref={fileSearchInputRef}
                className="input file-search-inline-input"
                value={fileSearchQuery}
                placeholder="Search everything"
                onChange={(event) => onChangeSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCloseSearch()
                  }
                }}
              />
            </div>
          ) : deriveParentPath(currentDirectoryPath) !== null ? (
            <button
              className="file-current-directory file-current-directory-button"
              onClick={goToParentDirectory}
              title={`Go to ${deriveParentPath(currentDirectoryPath) || '/'}`}
            >
              {trimmedFileSearchQuery ? `Search: ${fileSearchQuery.trim()}` : `/${currentDirectoryPath || ''}`.replace(/\/$/, '/')}
            </button>
          ) : (
            <div className="file-current-directory">
              {trimmedFileSearchQuery ? `Search: ${fileSearchQuery.trim()}` : `/${currentDirectoryPath || ''}`.replace(/\/$/, '/')}
            </div>
          )}
          <div className="button-row files-actions">
            {!fileSearchOpen ? (
              <button
                className="button-secondary files-search-button files-toolbar-icon-button"
                onClick={onOpenSearch}
                aria-label="Open search"
                title="Open search"
              >
                <svg viewBox="0 0 24 24" className="files-toolbar-icon" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
                  <path d="M14.35 14.35 18.8 18.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
            <div className="files-view-anchor" ref={fileColumnViewRef}>
              <button
                className="button-secondary files-toolbar-icon-button"
                onClick={onToggleFileColumnView}
                aria-expanded={fileColumnViewOpen}
                aria-label="View columns"
                title="View columns"
              >
                <svg viewBox="0 0 24 24" className="files-toolbar-icon" aria-hidden="true">
                  <path d="M4.5 6.25h15l-5.65 6.35v5.15l-3.7 1.65V12.6Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                </svg>
              </button>
              {fileColumnViewOpen ? (
                <div className="files-view-menu">
                  {[
                    { key: 'directory', label: 'Directory' },
                    { key: 'type', label: 'Type' },
                    { key: 'size', label: 'Size' },
                    { key: 'modified', label: 'Modified' },
                    { key: 'created', label: 'Created' },
                  ].map((column) => (
                    <label key={column.key} className="files-view-option">
                      <input
                        type="checkbox"
                        checked={fileColumnVisibility[column.key as Exclude<FileColumnKey, 'name'>]}
                        onChange={() => onToggleFileColumnVisibility(column.key as FileColumnKey)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            {trimmedFileSearchQuery ? <button className="button-secondary" onClick={onCloseSearch}>Clear</button> : null}
            <button
              className="button-secondary files-toolbar-icon-button"
              onClick={onBeginCreateFolder}
              aria-label="New folder"
              title="New folder"
            >
              <svg viewBox="0 0 24 24" className="files-toolbar-icon" aria-hidden="true">
                <path d="M3.75 7.25A2.25 2.25 0 0 1 6 5h4.15l1.55 1.7H18A2.25 2.25 0 0 1 20.25 9v7.75A2.25 2.25 0 0 1 18 19H6a2.25 2.25 0 0 1-2.25-2.25Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                <path d="M15.75 10.25v5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <path d="M13 13h5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </button>
            <label className="button-secondary upload-button files-toolbar-icon-button" aria-label="Upload" title="Upload">
              <svg viewBox="0 0 24 24" className="files-toolbar-icon" aria-hidden="true">
                <path d="M12 4.75v10.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <path d="M8.6 8.35 12 4.75l3.4 3.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 15.75v1.5c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-1.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input type="file" hidden onChange={onHandleDriveUpload} />
            </label>
          </div>
        </div>
        {showFileTable ? (
          <div className="file-table-wrap">
            <div className={`file-list-header ${trimmedFileSearchQuery ? 'search-mode' : ''}`} style={{ gridTemplateColumns: fileGridTemplateColumns }}>
              {visibleFileColumns.map((column) => (
                <span key={column.key} className={`file-header-cell ${column.className ?? ''}`}>
                  <span>{column.label}</span>
                  {column.resizable ? (
                    <span className="file-col-resizer" onMouseDown={(event) => beginFileColumnResize(column.key, event.clientX)} />
                  ) : null}
                </span>
              ))}
            </div>
            <div className="file-list">
              {displayedFileNodes.map((node) => (
                <div
                  key={node.path}
                  className={`file-row ${trimmedFileSearchQuery ? 'search-mode' : ''} ${dropTargetPath === node.path ? 'drop-target' : ''} ${activeFilePath === node.path ? 'active' : ''} ${markedFilePaths.includes(node.path) ? 'marked' : ''}`}
                  style={{ gridTemplateColumns: fileGridTemplateColumns }}
                  draggable={node.path.startsWith('drive/') || node.path.startsWith('notes/') || node.path.startsWith('diagrams/')}
                  onDragStart={(event) => beginFileDrag(event, node.path)}
                  onDragEnd={onFileDragEnd}
                  onDragOver={(event) => {
                    if (node.kind !== 'directory' || !draggingFilePath) return
                    event.preventDefault()
                    onDropTargetChange(node.path)
                  }}
                  onDragLeave={() => {
                    if (dropTargetPath === node.path) onDropTargetChange(null)
                  }}
                  onDrop={(event) => {
                    if (node.kind !== 'directory') return
                    void handleDirectoryDrop(event, node.path)
                  }}
                  onClick={() => onSetActiveFilePath(node.path)}
                  onDoubleClick={() => onOpenFileNode(node)}
                >
                  {visibleFileColumns.map((column) => (
                    <span key={column.key} className={column.className}>
                      {renderFileColumnCell(node, column.key)}
                    </span>
                  ))}
                </div>
              ))}
              {displayedFileNodes.length === 0 ? (
                <div className="empty-state">{trimmedFileSearchQuery ? 'No search results.' : 'This directory is empty.'}</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="empty-state">No files yet.</div>
        )}
      </div>
    </div>
  )
}
