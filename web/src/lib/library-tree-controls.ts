import { useState } from 'react'
import type { FileTreeRowMetaVisibility } from '../components/FileTreeNode'
import type { FileTreeSortState } from './ui-helpers'

export type TreeSelectionOptions = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }

export const DEFAULT_LIBRARY_ROW_META_VISIBILITY: FileTreeRowMetaVisibility = {
  type: true,
  size: true,
  modified: true,
  created: true,
}

export function useLibraryTreeControls() {
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [metaFilterOpen, setMetaFilterOpen] = useState(false)
  const [sortState, setSortState] = useState<FileTreeSortState | null>(null)
  const [rowMetaVisibility, setRowMetaVisibility] = useState<FileTreeRowMetaVisibility>(
    DEFAULT_LIBRARY_ROW_META_VISIBILITY,
  )

  return {
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
  }
}

export function getVisibleTreePaths(container: HTMLDivElement | null) {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>('[data-file-tree-path]'))
    .map((element) => element.dataset.fileTreePath)
    .filter((value): value is string => Boolean(value))
}

export function getTreeRangeSelection(
  container: HTMLDivElement | null,
  anchorPath: string | null,
  targetPath: string,
  includePath: (path: string) => boolean,
) {
  if (!container || !anchorPath) return null
  const orderedPaths = getVisibleTreePaths(container)
  const anchorIndex = orderedPaths.indexOf(anchorPath)
  const targetIndex = orderedPaths.indexOf(targetPath)
  if (anchorIndex < 0 || targetIndex < 0) return null
  const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
  return orderedPaths.slice(start, end + 1).filter(includePath)
}

export function toggleMarkedTreePath(current: string[], path: string) {
  return current.includes(path)
    ? current.filter((entry) => entry !== path)
    : Array.from(new Set([...current, path]))
}
