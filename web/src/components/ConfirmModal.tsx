import type { ReactNode, RefObject } from 'react'

type Props = {
  title: string
  onClose: () => void
  onConfirm: () => void
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmRef?: RefObject<HTMLButtonElement | null>
  cancelRef?: RefObject<HTMLButtonElement | null>
}

export function ConfirmModal({
  title,
  onClose,
  onConfirm,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmRef,
  cancelRef,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <div className="button-row">
          <button ref={confirmRef} className="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button ref={cancelRef} className="button-secondary" onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
