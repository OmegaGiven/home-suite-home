type Props = {
  open: boolean
  title: string
  value: string
  placeholder?: string
  confirmLabel: string
  onChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function FolderPromptModal({
  open,
  title,
  value,
  placeholder = 'Folder name',
  confirmLabel,
  onChange,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (!value.trim()) return
              onConfirm()
            }
            if (event.key === 'Escape') {
              onClose()
            }
          }}
        />
        <div className="button-row">
          <button className="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className="button-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
