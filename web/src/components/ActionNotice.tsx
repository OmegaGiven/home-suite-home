type Props = {
  message: string
  id: string
}

export function ActionNotice({ message, id }: Props) {
  return (
    <div className="action-notice-wrap" aria-live="polite" aria-atomic="true">
      <div key={id} className="action-notice">
        {message}
      </div>
    </div>
  )
}
