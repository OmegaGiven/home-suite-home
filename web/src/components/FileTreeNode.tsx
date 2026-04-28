import { useEffect, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { FileNode } from '../lib/types'
import type { FileTreeSortKey, FileTreeSortState } from '../lib/ui-helpers'

export type FileTreeRowMeta = {
  type?: string
  size?: string
  modified?: string
  created?: string
}

export type FileTreeRowMetaVisibility = {
  type: boolean
  size: boolean
  modified: boolean
  created: boolean
}

type Props = {
  node: FileNode
  getDisplayName: (node: FileNode) => string
  selectedPath: string
  activePath: string | null
  highlightedPaths?: string[]
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  onSelect: (path: string, options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  isNodeActive?: (node: FileNode, selectedPath: string, activePath: string | null) => boolean
  canDragNode?: (node: FileNode) => boolean
  getRowMeta?: (node: FileNode) => FileTreeRowMeta | null
  rowMetaVisibility?: FileTreeRowMetaVisibility
}

export type FileTreeNodeSharedProps = Omit<Props, 'node'>

type HeaderProps = {
  rowMetaVisibility: FileTreeRowMetaVisibility
  sortState: FileTreeSortState | null
  onSort: (key: FileTreeSortKey) => void
}

export function FileTreeHeader({ rowMetaVisibility, sortState, onSort }: HeaderProps) {
  const indicatorFor = (key: FileTreeSortKey) =>
    sortState?.key === key ? (sortState.direction === 'desc' ? '↓' : '↑') : ''

  return (
    <div className="file-tree-header" aria-label="Directory columns">
      <span className="tree-row-markers" aria-hidden="true" />
      <span className="tree-row-label tree-row-header-label">
        <button type="button" className="tree-header-button tree-header-button-name" onClick={() => onSort('name')}>
          <span>Name</span>
          <span className="tree-header-indicator" aria-hidden="true">{indicatorFor('name')}</span>
        </button>
      </span>
      <span className="tree-row-meta" aria-hidden="true">
        {rowMetaVisibility.type ? (
          <button type="button" className="tree-header-button tree-row-meta-item tree-row-meta-type" onClick={() => onSort('type')}>
            <span>Type</span>
            <span className="tree-header-indicator">{indicatorFor('type')}</span>
          </button>
        ) : null}
        {rowMetaVisibility.size ? (
          <button type="button" className="tree-header-button tree-row-meta-item tree-row-meta-size" onClick={() => onSort('size')}>
            <span>Size</span>
            <span className="tree-header-indicator">{indicatorFor('size')}</span>
          </button>
        ) : null}
        {rowMetaVisibility.modified ? (
          <button type="button" className="tree-header-button tree-row-meta-item tree-row-meta-modified" onClick={() => onSort('modified')}>
            <span>Modified</span>
            <span className="tree-header-indicator">{indicatorFor('modified')}</span>
          </button>
        ) : null}
        {rowMetaVisibility.created ? (
          <button type="button" className="tree-header-button tree-row-meta-item tree-row-meta-created" onClick={() => onSort('created')}>
            <span>Created</span>
            <span className="tree-header-indicator">{indicatorFor('created')}</span>
          </button>
        ) : null}
      </span>
      <span className="tree-collapse-toggle tree-collapse-toggle-end tree-collapse-spacer" aria-hidden="true" />
    </div>
  )
}

export function FileTreeNode({
  node,
  getDisplayName,
  selectedPath,
  activePath,
  highlightedPaths = [],
  markedPaths,
  draggingPath,
  dropTargetPath,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  isNodeActive,
  canDragNode,
  getRowMeta,
  rowMetaVisibility = { type: true, size: true, modified: true, created: true },
}: Props) {
  const isCurrent = isNodeActive ? isNodeActive(node, selectedPath, activePath) : selectedPath === node.path || activePath === node.path
  const isActive = isCurrent || highlightedPaths.includes(node.path)
  const isMarked = markedPaths.includes(node.path)
  const displayName = getDisplayName(node)
  const isDraggable = canDragNode
    ? canDragNode(node)
    : node.path.startsWith('drive/') || node.path.startsWith('notes/') || node.path.startsWith('diagrams/')
  const hasChildren = node.kind === 'directory' && node.children.length > 0
  const [collapsed, setCollapsed] = useState(false)
  const rowMeta = getRowMeta?.(node)

  useEffect(() => {
    if (isActive) {
      setCollapsed(false)
    }
  }, [isActive])

  return (
    <div className="folder-node">
      <button
        className={`folder-row ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''} ${dropTargetPath === node.path ? 'drop-target' : ''}`}
        draggable={isDraggable}
        onDragStart={(event) => onDragStart(event, node.path)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (node.kind !== 'directory' || !draggingPath) return
          event.preventDefault()
          onDropTargetChange(node.path)
        }}
        onDragLeave={() => {
          if (dropTargetPath === node.path) onDropTargetChange(null)
        }}
        onDrop={(event) => {
          if (node.kind !== 'directory') return
          void onDrop(event, node.path)
        }}
        data-file-tree-path={node.path}
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
          onSelect(node.path, {
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
          })
        }
      >
        <span className="tree-row-markers" aria-hidden="true">
          {isCurrent ? <span className="tree-active-arrow">&gt;</span> : null}
          {isMarked ? <span className="tree-marked-dot" /> : null}
        </span>
        <span className={`tree-row-label ${node.kind === 'file' ? 'file-entry' : 'directory-entry'}`}>
          <span>{node.kind === 'directory' ? `/${displayName}` : displayName}</span>
        </span>
        {rowMeta && (rowMetaVisibility.type || rowMetaVisibility.size || rowMetaVisibility.modified || rowMetaVisibility.created) ? (
          <span className="tree-row-meta" aria-hidden="true">
            {rowMetaVisibility.type && rowMeta.type ? <span className="tree-row-meta-item tree-row-meta-type">{rowMeta.type}</span> : null}
            {rowMetaVisibility.size && rowMeta.size ? <span className="tree-row-meta-item tree-row-meta-size">{rowMeta.size}</span> : null}
            {rowMetaVisibility.modified && rowMeta.modified ? <span className="tree-row-meta-item tree-row-meta-modified">{rowMeta.modified}</span> : null}
            {rowMetaVisibility.created && rowMeta.created ? <span className="tree-row-meta-item tree-row-meta-created">{rowMeta.created}</span> : null}
          </span>
        ) : null}
        <span
          className={`tree-collapse-toggle tree-collapse-toggle-end ${hasChildren ? '' : 'tree-collapse-toggle-placeholder'} ${collapsed ? 'collapsed' : ''}`}
          onClick={(event) => {
            if (!hasChildren) return
            event.preventDefault()
            event.stopPropagation()
            setCollapsed((current) => !current)
          }}
        >
          {hasChildren ? '▾' : ''}
        </span>
      </button>
      {hasChildren && !collapsed ? (
        <div className="folder-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              getDisplayName={getDisplayName}
              selectedPath={selectedPath}
              activePath={activePath}
              highlightedPaths={highlightedPaths}
              markedPaths={markedPaths}
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropTargetChange={onDropTargetChange}
              onDrop={onDrop}
              isNodeActive={isNodeActive}
              canDragNode={canDragNode}
              getRowMeta={getRowMeta}
              rowMetaVisibility={rowMetaVisibility}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FileTreeNodes({
  nodes,
  ...props
}: { nodes: FileNode[] } & FileTreeNodeSharedProps) {
  return (
    <>
      {nodes.map((node) => (
        <FileTreeNode key={node.path} node={node} {...props} />
      ))}
    </>
  )
}
