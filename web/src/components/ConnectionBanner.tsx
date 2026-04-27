type Props = {
  tone?: 'offline' | 'error'
  message: string
}

export function ConnectionBanner({ tone = 'error', message }: Props) {
  return (
    <div className={`connection-banner ${tone}`} role="status" aria-live="polite">
      <span className="connection-banner-dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
