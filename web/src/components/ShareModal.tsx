import type { ResourceShare, ResourceVisibility, UserProfile } from '../lib/types'

type ShareTarget = {
  resourceKey: string
  label: string
}

type ShareModalProps = {
  shareTarget: ShareTarget | null
  shareDraft: ResourceShare | null
  shareUserQuery: string
  shareSaving: boolean
  participants: UserProfile[]
  onClose: () => void
  onSetVisibility: (visibility: ResourceVisibility) => void
  onSetQuery: (value: string) => void
  onToggleUser: (userId: string) => void
  onSave: () => void
}

export function ShareModal({
  shareTarget,
  shareDraft,
  shareUserQuery,
  shareSaving,
  participants,
  onClose,
  onSetVisibility,
  onSetQuery,
  onToggleUser,
  onSave,
}: ShareModalProps) {
  if (!shareTarget || !shareDraft) return null

  const query = shareUserQuery.trim().toLowerCase()
  const matchingParticipants = participants.filter((participant) => {
    const haystack = `${participant.display_name} ${participant.username} ${participant.email}`.toLowerCase()
    return !query || haystack.includes(query)
  })
  const selectedParticipants = participants.filter((participant) => shareDraft.user_ids.includes(participant.id))

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card share-modal-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="share-modal-header">
          <div>
            <h3>Visibility</h3>
            <p className="muted">{shareTarget.label}</p>
          </div>
          <button className="button-secondary modal-close-button" onClick={onClose} aria-label="Close visibility">
            x
          </button>
        </div>
        <div className="share-visibility-options">
          <button
            className={shareDraft.visibility === 'private' ? 'button' : 'button-secondary'}
            onClick={() => onSetVisibility('private')}
          >
            Private
          </button>
          <button className={shareDraft.visibility === 'org' ? 'button' : 'button-secondary'} onClick={() => onSetVisibility('org')}>
            Anyone in org
          </button>
          <button
            className={shareDraft.visibility === 'users' ? 'button' : 'button-secondary'}
            onClick={() => onSetVisibility('users')}
          >
            Specific people
          </button>
        </div>
        <div className="share-picker">
          <input
            className="input"
            value={shareUserQuery}
            placeholder="Search username or email"
            onChange={(event) => {
              onSetQuery(event.target.value)
              if (shareDraft.visibility !== 'users') onSetVisibility('users')
            }}
          />
          {selectedParticipants.length ? (
            <div className="share-selected-list" aria-label="Selected people">
              {selectedParticipants.map((participant) => (
                <button key={participant.id} className="share-chip" onClick={() => onToggleUser(participant.id)} title="Remove">
                  {participant.display_name || participant.username}
                </button>
              ))}
            </div>
          ) : null}
          <div className="share-user-list">
            {matchingParticipants.map((participant) => {
              const selected = shareDraft.user_ids.includes(participant.id)
              return (
                <button
                  key={participant.id}
                  className={`share-user-row ${selected ? 'selected' : ''}`}
                  onClick={() => onToggleUser(participant.id)}
                >
                  <span>{participant.display_name || participant.username}</span>
                  <span className="muted">{participant.email || participant.username}</span>
                  <span>{selected ? 'added' : 'add'}</span>
                </button>
              )
            })}
            {!matchingParticipants.length ? <div className="empty-state compact">No users found.</div> : null}
          </div>
        </div>
        <div className="button-row modal-actions">
          <button className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" onClick={onSave} disabled={shareSaving}>
            {shareSaving ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
