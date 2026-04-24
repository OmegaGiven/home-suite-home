import { useEffect, useState, type DragEvent } from 'react'
import type { FileNode } from '../lib/types'

type Props = {
  node: FileNode
  getDisplayName: (node: FileNode) => string
  selectedPath: string
  activePath: string | null
  markedPaths: string[]
  draggingPath: string | null
  dropTargetPath: string | null
  onSelect: (path: string) => void
  onDragStart: (event: DragEvent<HTMLElement>, path: string) => void
  onDragEnd: () => void
  onDropTargetChange: (path: string | null) => void
  onDrop: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  isNodeActive?: (node: FileNode, selectedPath: string, activePath: string | null) => boolean
  canDragNode?: (node: FileNode) => boolean
}

export function FileTreeNode({
  node,
  getDisplayName,
  selectedPath,
  activePath,
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
}: Props) {
  const isActive = isNodeActive ? isNodeActive(node, selectedPath, activePath) : selectedPath === node.path || activePath === node.path
  const isMarked = markedPaths.includes(node.path)
  const displayName = getDisplayName(node)
  const isDraggable = canDragNode
    ? canDragNode(node)
    : node.path.startsWith('drive/') || node.path.startsWith('notes/') || node.path.startsWith('diagrams/')
  const hasChildren = node.kind === 'directory' && node.children.length > 0
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (isActive) {
      setCollapsed(false)
    }
  }, [isActive])

  return (
    <div className="folder-node">
      <button
        className={`folder-row ${isActive ? 'active' : ''} ${dropTargetPath === node.path ? 'drop-target' : ''}`}
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
        onClick={() => onSelect(node.path)}
      >
        <span className="tree-row-markers" aria-hidden="true">
          {isActive ? <span className="tree-active-arrow">&gt;</span> : null}
          {isMarked ? <span className="tree-marked-dot" /> : null}
        </span>
        <span className={`tree-row-label ${node.kind === 'file' ? 'file-entry' : 'directory-entry'}`}>
          <span>{node.kind === 'directory' ? `/${displayName}` : displayName}</span>
        </span>
        {hasChildren ? (
          <span
            className={`tree-collapse-toggle tree-collapse-toggle-end ${collapsed ? 'collapsed' : ''}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setCollapsed((current) => !current)
            }}
          >
            ▾
          </span>
        ) : null}
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
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
