import type { DragEvent, ReactNode } from 'react'
import type { FileTreeRowMetaVisibility } from './FileTreeNode'
import { LibrarySidebarMetaFilter } from './LibrarySidebarMetaFilter'
import { LibrarySidebarSearch } from './LibrarySidebarSearch'

type CommonAction = {
  key: string
  label: string
  title?: string
  disabled?: boolean
  className?: string
  icon: ReactNode
}

type ButtonAction = CommonAction & {
  kind?: 'button'
  onClick: () => void
}

type UploadAction = CommonAction & {
  kind: 'upload'
  accept?: string
  onFileSelected: (file: File) => void
}

export type LibraryActionBarAction = ButtonAction | UploadAction

type Props = {
  searchOpen: boolean
  searchQuery: string
  searchPlaceholder: string
  onOpenSearch: () => void
  onCloseSearch: () => void
  onChangeSearchQuery: (value: string) => void
  metaFilterOpen: boolean
  rowMetaVisibility: FileTreeRowMetaVisibility
  onToggleMetaFilterOpen: () => void
  onToggleMetaVisibility: (column: keyof FileTreeRowMetaVisibility) => void
  customFilterSlot?: ReactNode
  hideMetaFilter?: boolean
  commonActions?: LibraryActionBarAction[]
  pageActions?: LibraryActionBarAction[]
  rootDropPath?: string
  draggingPath?: string | null
  dropTargetPath?: string | null
  onDropTargetChange?: (path: string | null) => void
  onDropRoot?: (event: DragEvent<HTMLElement>, destinationDir: string) => Promise<void> | void
}

export function LibraryActionBar({
  searchOpen,
  searchQuery,
  searchPlaceholder,
  onOpenSearch,
  onCloseSearch,
  onChangeSearchQuery,
  metaFilterOpen,
  rowMetaVisibility,
  onToggleMetaFilterOpen,
  onToggleMetaVisibility,
  customFilterSlot,
  hideMetaFilter = false,
  commonActions = [],
  pageActions = [],
  rootDropPath,
  draggingPath = null,
  dropTargetPath = null,
  onDropTargetChange,
  onDropRoot,
}: Props) {
  const renderAction = (action: LibraryActionBarAction) =>
    action.kind === 'upload' ? (
      <label
        key={action.key}
        className={`button-secondary notes-new-button ${action.className ?? ''}`.trim()}
        aria-label={action.label}
        title={action.title ?? action.label}
      >
        {action.icon}
        <input
          type="file"
          hidden
          accept={action.accept}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) action.onFileSelected(file)
            event.currentTarget.value = ''
          }}
        />
      </label>
    ) : (
      <button
        key={action.key}
        className={`button-secondary notes-new-button ${action.className ?? ''}`.trim()}
        type="button"
        aria-label={action.label}
        title={action.title ?? action.label}
        disabled={action.disabled}
        onClick={action.onClick}
      >
        {action.icon}
      </button>
    )

  return (
    <div
      className={`file-sidebar-action-dropzone ${rootDropPath && dropTargetPath === rootDropPath ? 'drop-target' : ''}`}
      onDragOver={(event) => {
        if (!rootDropPath || !draggingPath || !onDropTargetChange) return
        event.preventDefault()
        onDropTargetChange(rootDropPath)
      }}
      onDragLeave={() => {
        if (!rootDropPath || !onDropTargetChange) return
        if (dropTargetPath === rootDropPath) onDropTargetChange(null)
      }}
      onDrop={(event) => {
        if (!rootDropPath || !onDropRoot) return
        void onDropRoot(event, rootDropPath)
      }}
    >
      <div className="file-sidebar-header-row">
      <div className="button-row files-actions files-actions-common">
        <LibrarySidebarSearch
          open={searchOpen}
          query={searchQuery}
          placeholder={searchPlaceholder}
          onOpen={onOpenSearch}
          onClose={onCloseSearch}
          onChange={onChangeSearchQuery}
        />
        {customFilterSlot ?? (!hideMetaFilter ? (
          <LibrarySidebarMetaFilter
            open={metaFilterOpen}
            visibility={rowMetaVisibility}
            onToggleOpen={onToggleMetaFilterOpen}
            onToggleVisibility={onToggleMetaVisibility}
          />
        ) : null)}
        {commonActions.map(renderAction)}
      </div>
      <div className="button-row files-actions files-actions-page">
        {pageActions.map(renderAction)}
      </div>
      </div>
    </div>
  )
}
