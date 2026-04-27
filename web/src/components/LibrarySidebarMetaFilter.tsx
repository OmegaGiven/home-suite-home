import type { FileTreeRowMetaVisibility } from './FileTreeNode'
import { FilterIcon } from './LibraryActionIcons'

type Props = {
  open: boolean
  visibility: FileTreeRowMetaVisibility
  onToggleOpen: () => void
  onToggleVisibility: (column: keyof FileTreeRowMetaVisibility) => void
}

export function LibrarySidebarMetaFilter({ open, visibility, onToggleOpen, onToggleVisibility }: Props) {
  return (
    <div className="files-view-anchor">
      <button
        className="button-secondary notes-new-button"
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Filter visible metadata"
        title="Filter visible metadata"
      >
        <FilterIcon />
      </button>
      {open ? (
        <div className="files-view-menu">
          {([
            ['type', 'Type'],
            ['size', 'Size'],
            ['modified', 'Modified'],
            ['created', 'Created'],
          ] as const).map(([key, label]) => (
            <label key={key} className="files-view-option">
              <input
                type="checkbox"
                checked={visibility[key]}
                onChange={() => onToggleVisibility(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
