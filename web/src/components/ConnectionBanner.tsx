type Props = {
  tone?: 'offline' | 'error'
  message: string
}

export function ConnectionBanner({ tone = 'error', message }: Props) {
  return (
    <div className="connection-banner-wrap" aria-live="polite" aria-atomic="true">
      <div className={`connection-banner ${tone}`} role="status">
        <span className="connection-banner-dot" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  )
}
