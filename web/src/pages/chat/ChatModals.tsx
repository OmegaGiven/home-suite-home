import { ConfirmModal } from '../../components/ConfirmModal'
import { UserAvatar } from '../../components/UserAvatar'
import type { Room, UserProfile } from '../../lib/types'

type Props = {
  participantsOpen: boolean
  setParticipantsOpen: (value: boolean) => void
  selectedRoom: Room | null
  selectedRoomParticipantProfiles: UserProfile[]
  currentUserId: string | null
  addingParticipant: boolean
  setAddingParticipant: (value: boolean) => void
  participantSearch: string
  setParticipantSearch: (value: string) => void
  addableParticipants: UserProfile[]
  onUpdateRoomParticipants: (roomId: string, participantIds: string[]) => Promise<void>
  createDirectOpen: boolean
  setCreateDirectOpen: (value: boolean) => void
  directParticipantIds: string[]
  setDirectParticipantIds: (updater: (current: string[]) => string[]) => void
  directParticipantQuery: string
  setDirectParticipantQuery: (value: string) => void
  directFolderDraft: string
  setDirectFolderDraft: (value: string) => void
  selectedDirectParticipants: UserProfile[]
  filteredDirectParticipants: UserProfile[]
  onCreateDirectRoom: (participantIds: string[], folder?: string) => void
  createThreadOpen: boolean
  setCreateThreadOpen: (value: boolean) => void
  threadNameDraft: string
  setThreadNameDraft: (value: string) => void
  threadParticipantIds: string[]
  setThreadParticipantIds: (updater: (current: string[]) => string[]) => void
  threadParticipantQuery: string
  setThreadParticipantQuery: (value: string) => void
  threadFolderDraft: string
  setThreadFolderDraft: (value: string) => void
  selectedThreadParticipants: UserProfile[]
  filteredThreadParticipants: UserProfile[]
  onCreateRoom: (name: string, participantIds: string[], folder?: string) => Promise<void>
  deleteRoomOpen: boolean
  setDeleteRoomOpen: (value: boolean) => void
  onDeleteRoom: (roomId: string) => Promise<void>
}

export function ChatModals({
  participantsOpen,
  setParticipantsOpen,
  selectedRoom,
  selectedRoomParticipantProfiles,
  currentUserId,
  addingParticipant,
  setAddingParticipant,
  participantSearch,
  setParticipantSearch,
  addableParticipants,
  onUpdateRoomParticipants,
  createDirectOpen,
  setCreateDirectOpen,
  directParticipantIds,
  setDirectParticipantIds,
  directParticipantQuery,
  setDirectParticipantQuery,
  directFolderDraft,
  setDirectFolderDraft,
  selectedDirectParticipants,
  filteredDirectParticipants,
  onCreateDirectRoom,
  createThreadOpen,
  setCreateThreadOpen,
  threadNameDraft,
  setThreadNameDraft,
  threadParticipantIds,
  setThreadParticipantIds,
  threadParticipantQuery,
  setThreadParticipantQuery,
  threadFolderDraft,
  setThreadFolderDraft,
  selectedThreadParticipants,
  filteredThreadParticipants,
  onCreateRoom,
  deleteRoomOpen,
  setDeleteRoomOpen,
  onDeleteRoom,
}: Props) {
  return (
    <>
      {participantsOpen && selectedRoom ? (
        <div className="modal-backdrop" onClick={() => setParticipantsOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Participants</h3>
            {selectedRoom.kind === 'channel' ? (
              <>
                <div className="muted">This thread is visible to all signed-in workspace members.</div>
                <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="button" type="button" onClick={() => setParticipantsOpen(false)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="admin-role-list">
                  {selectedRoomParticipantProfiles.map((participant) => (
                    <div className="chat-participant-row" key={participant.id}>
                      <div className="chat-participant-summary">
                        <UserAvatar user={participant} className="user-avatar-participant" />
                        <div className="chat-participant-copy">
                          <strong>{participant.display_name}</strong>
                          <span className="muted">
                            {participant.id === currentUserId ? 'You' : `@${participant.username || participant.email || 'participant'}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {addingParticipant ? (
                  <>
                    <input
                      autoFocus
                      className="input"
                      placeholder="Search username or email"
                      value={participantSearch}
                      onChange={(event) => setParticipantSearch(event.target.value)}
                    />
                    <div className="admin-role-list">
                      {addableParticipants.length > 0 ? (
                        addableParticipants.map((participant) => (
                          <button
                            key={participant.id}
                            type="button"
                            className="button-secondary"
                            style={{ justifyContent: 'flex-start' }}
                            onClick={async () => {
                              await onUpdateRoomParticipants(selectedRoom.id, [...selectedRoom.participant_ids, participant.id])
                              setParticipantSearch('')
                              setAddingParticipant(false)
                            }}
                          >
                            <span className="chat-selection-row">
                              <UserAvatar user={participant} className="user-avatar-selection" />
                              <span>
                                {participant.display_name} <span className="muted">@{participant.username} · {participant.email}</span>
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="muted">No matching users found.</div>
                      )}
                    </div>
                  </>
                ) : null}
                <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => {
                      setAddingParticipant(!addingParticipant)
                      setParticipantSearch('')
                    }}
                  >
                    Add contact
                  </button>
                  <button className="button" type="button" onClick={() => setParticipantsOpen(false)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {createDirectOpen ? (
        <div className="modal-backdrop" onClick={() => {
          setDirectFolderDraft('')
          setCreateDirectOpen(false)
        }}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>New message</h3>
            <input
              autoFocus
              className="input"
              placeholder="Search username or email"
              value={directParticipantQuery}
              onChange={(event) => setDirectParticipantQuery(event.target.value)}
            />
            {selectedDirectParticipants.length > 0 ? (
              <div className="button-row">
                {selectedDirectParticipants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className="button-secondary"
                    onClick={() => setDirectParticipantIds((current) => current.filter((id) => id !== participant.id))}
                  >
                    <span className="chat-selection-chip">
                      <UserAvatar user={participant} className="user-avatar-selection user-avatar-selection-small" />
                      {participant.display_name} ×
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="admin-role-list">
              {filteredDirectParticipants.length > 0 ? (
                filteredDirectParticipants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className="button-secondary"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => {
                      setDirectParticipantIds((current) => (current.includes(participant.id) ? current : [...current, participant.id]))
                      setDirectParticipantQuery('')
                    }}
                  >
                    <span className="chat-selection-row">
                      <UserAvatar user={participant} className="user-avatar-selection" />
                      <span>
                        {participant.display_name} <span className="muted">@{participant.username} · {participant.email}</span>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="muted">No matching users found.</div>
              )}
            </div>
            <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="button-secondary" type="button" onClick={() => {
                setDirectFolderDraft('')
                setCreateDirectOpen(false)
              }}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                disabled={directParticipantIds.length === 0}
                onClick={() => {
                  onCreateDirectRoom(directParticipantIds, directFolderDraft)
                  setDirectParticipantIds(() => [])
                  setDirectFolderDraft('')
                  setCreateDirectOpen(false)
                }}
              >
                Start message
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {createThreadOpen ? (
        <div className="modal-backdrop" onClick={() => {
          setThreadFolderDraft('')
          setCreateThreadOpen(false)
        }}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Create thread</h3>
            <input
              autoFocus
              className="input"
              placeholder="Thread name"
              value={threadNameDraft}
              onChange={(event) => setThreadNameDraft(event.target.value)}
            />
            <input
              className="input"
              placeholder="Search username or email"
              value={threadParticipantQuery}
              onChange={(event) => setThreadParticipantQuery(event.target.value)}
            />
            {selectedThreadParticipants.length > 0 ? (
              <div className="button-row">
                {selectedThreadParticipants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className="button-secondary"
                    onClick={() => setThreadParticipantIds((current) => current.filter((id) => id !== participant.id))}
                  >
                    <span className="chat-selection-chip">
                      <UserAvatar user={participant} className="user-avatar-selection user-avatar-selection-small" />
                      {participant.display_name} ×
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="admin-role-list">
              {filteredThreadParticipants.length > 0 ? (
                filteredThreadParticipants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className="button-secondary"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => {
                      setThreadParticipantIds((current) => (current.includes(participant.id) ? current : [...current, participant.id]))
                      setThreadParticipantQuery('')
                    }}
                  >
                    <span className="chat-selection-row">
                      <UserAvatar user={participant} className="user-avatar-selection" />
                      <span>
                        {participant.display_name} <span className="muted">@{participant.username} · {participant.email}</span>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="muted">No matching users found.</div>
              )}
            </div>
            <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="button-secondary" type="button" onClick={() => {
                setThreadFolderDraft('')
                setCreateThreadOpen(false)
              }}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                disabled={!threadNameDraft.trim()}
                onClick={async () => {
                  await onCreateRoom(threadNameDraft.trim(), threadParticipantIds, threadFolderDraft)
                  setThreadNameDraft('')
                  setThreadParticipantIds(() => [])
                  setThreadParticipantQuery('')
                  setThreadFolderDraft('')
                  setCreateThreadOpen(false)
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteRoomOpen && selectedRoom ? (
        <ConfirmModal
          title="Delete thread?"
          onClose={() => setDeleteRoomOpen(false)}
          onConfirm={() => {
            void onDeleteRoom(selectedRoom.id)
            setDeleteRoomOpen(false)
          }}
          confirmLabel="Delete"
          cancelLabel="Cancel"
        >
          <div className="muted">
            {selectedRoom.kind === 'direct' ? `Delete ${selectedRoom.name}?` : `Delete #${selectedRoom.name}?`}
          </div>
        </ConfirmModal>
      ) : null}
    </>
  )
}
