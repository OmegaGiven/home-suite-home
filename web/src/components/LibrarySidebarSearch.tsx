import { SearchIcon } from './LibraryActionIcons'

type Props = {
  open: boolean
  query: string
  placeholder: string
  onOpen: () => void
  onClose: () => void
  onChange: (value: string) => void
}

export function LibrarySidebarSearch({ open, query, placeholder, onOpen, onClose, onChange }: Props) {
  if (open) {
    return (
      <div className="library-search-row">
        <input
          className="input library-search-input"
          value={query}
          placeholder={placeholder}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
      </div>
    )
  }

  return (
    <button
      className="button-secondary notes-new-button"
      type="button"
      onClick={onOpen}
      aria-label="Search"
      title="Search"
    >
      <SearchIcon />
    </button>
  )
}
