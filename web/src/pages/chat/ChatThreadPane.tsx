import type { RefObject } from 'react'
import { UserAvatar } from '../../components/UserAvatar'
import type { Message, Room } from '../../lib/types'
import { formatFileTimestamp } from '../../lib/ui-helpers'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type Props = {
  renamingRoom: boolean
  roomNameDraft: string
  setRoomNameDraft: (value: string) => void
  setRenamingRoom: (value: boolean) => void
  confirmRoomDelete: boolean
  setDeleteRoomOpen: (value: boolean) => void
  selectedRoom: Room | null
  selectedRoomId: string | null
  selectedRoomHasActiveCall: boolean
  callActionsDisabled: boolean
  currentUserId: string | null
  currentUserLabel: string
  callJoined: boolean
  callMediaMode: 'audio' | 'video' | null
  screenSharing: boolean
  remoteParticipants: RemoteParticipant[]
  localVideoRef: RefObject<HTMLVideoElement | null>
  messages: Message[]
  messageDraft: string
  setMessageDraft: (value: string) => void
  participantsOpen: boolean
  setParticipantsOpen: (value: boolean) => void
  onRenameRoom: (roomId: string, name: string) => Promise<void>
  onJoinVoiceCall: () => void
  onJoinVideoCall: () => void
  onToggleScreenShare: () => void
  onLeaveCall: () => void
  onDeleteRoom: (roomId: string) => Promise<void>
  onSendMessage: (body: string) => Promise<void>
}

export function ChatThreadPane({
  renamingRoom,
  roomNameDraft,
  setRoomNameDraft,
  setRenamingRoom,
  confirmRoomDelete,
  setDeleteRoomOpen,
  selectedRoom,
  selectedRoomHasActiveCall,
  callActionsDisabled,
  currentUserId,
  currentUserLabel,
  callMediaMode,
  screenSharing,
  remoteParticipants,
  localVideoRef,
  messages,
  messageDraft,
  setMessageDraft,
  setParticipantsOpen,
  onRenameRoom,
  onJoinVoiceCall,
  onJoinVideoCall,
  onToggleScreenShare,
  onLeaveCall,
  onDeleteRoom,
  onSendMessage,
}: Props) {
  return (
    <div className="chat-card">
      <div className="chat-thread-header">
        {selectedRoom ? (
          <>
            <div className="chat-thread-title-row">
              {renamingRoom ? (
                <form
                  className="chat-thread-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const nextName = roomNameDraft.trim()
                    if (!nextName) return
                    void onRenameRoom(selectedRoom.id, nextName).then(() => {
                      setRenamingRoom(false)
                    })
                  }}
                >
                  <input
                    autoFocus
                    className="input chat-thread-title-input"
                    value={roomNameDraft}
                    onChange={(event) => setRoomNameDraft(event.target.value)}
                  />
                  <button className="button-secondary" type="submit">Save</button>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => {
                      setRoomNameDraft(selectedRoom.name)
                      setRenamingRoom(false)
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="chat-thread-title-wrap">
                    <h2 className="chat-thread-title">{selectedRoom.kind === 'direct' ? selectedRoom.name : `#${selectedRoom.name}`}</h2>
                    <button
                      className="chat-thread-rename-button"
                      type="button"
                      aria-label="Rename thread"
                      title="Rename thread"
                      onClick={() => setRenamingRoom(true)}
                    >
                      ✎
                    </button>
                  </div>
                  <div className="chat-thread-actions">
                    <button
                      className="button-secondary chat-participants-button"
                      type="button"
                      aria-label="View participants"
                      title="View participants"
                      onClick={() => setParticipantsOpen(true)}
                    >
                      <svg viewBox="0 0 24 24" className="chat-participants-icon" aria-hidden="true">
                        <circle cx="8.2" cy="8.8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
                        <circle cx="15.8" cy="8.8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
                        <path d="M4.85 17.2c0-2.15 1.82-3.7 4.05-3.7s4.05 1.55 4.05 3.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M11.1 17.2c0-2.15 1.82-3.7 4.05-3.7s4.05 1.55 4.05 3.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      </svg>
                    </button>
                    {selectedRoomHasActiveCall ? (
                      <>
                        <span className="chat-call-status">
                          {screenSharing ? 'Screen sharing' : callMediaMode === 'video' ? 'Video call live' : 'Voice call live'}
                        </span>
                        <button className="button-secondary" type="button" onClick={onToggleScreenShare}>
                          {screenSharing ? 'Stop share' : 'Share screen'}
                        </button>
                        <button className="button-secondary" type="button" onClick={onLeaveCall}>
                          Leave
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="button-secondary chat-call-icon-button"
                          type="button"
                          onClick={onJoinVoiceCall}
                          disabled={callActionsDisabled}
                          aria-label="Start voice call"
                          title="Start voice call"
                        >
                          <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
                            <path d="M8.45 5.6c.52-.52 1.34-.61 1.96-.21l2.12 1.36c.68.44.87 1.35.43 2.03l-.8 1.23c-.23.35-.18.81.11 1.1l1.9 1.9c.29.29.75.34 1.1.11l1.23-.8c.68-.44 1.59-.25 2.03.43l1.36 2.12c.4.62.31 1.44-.21 1.96l-1.1 1.1c-.84.84-2.09 1.16-3.24.82-2-.59-3.96-1.81-5.76-3.61-1.8-1.8-3.02-3.76-3.61-5.76-.34-1.15-.02-2.4.82-3.24Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          className="button chat-call-icon-button"
                          type="button"
                          onClick={onJoinVideoCall}
                          disabled={callActionsDisabled}
                          aria-label="Start video call"
                          title="Start video call"
                        >
                          <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
                            <rect x="4.75" y="6.75" width="10.5" height="10.5" rx="2.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
                            <path d="M15.25 10.1 19.25 7.8v8.4l-4-2.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          className="button-secondary chat-call-icon-button"
                          type="button"
                          onClick={() => {
                            if (confirmRoomDelete) {
                              setDeleteRoomOpen(true)
                              return
                            }
                            void onDeleteRoom(selectedRoom.id)
                          }}
                          aria-label="Delete thread"
                          title="Delete thread"
                        >
                          <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
                            <path d="M9 5h6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path d="M10 5V4c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path d="M6 7h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path d="M8 7.5v10c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5v-10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            {callActionsDisabled ? <div className="chat-thread-visibility">A call is already active in another thread.</div> : null}
          </>
        ) : (
          <div className="chat-thread-title-row">
            <div className="chat-thread-visibility">Select a thread to see messages and who can interact with it.</div>
          </div>
        )}
      </div>
      {selectedRoomHasActiveCall ? (
        <div className="chat-media-panel">
          <div className="chat-media-grid">
            {callMediaMode === 'video' || screenSharing ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="media-tile" />
            ) : (
              <div className="chat-audio-tile">
                <strong>{currentUserLabel}</strong>
                <span>Voice only</span>
              </div>
            )}
            {remoteParticipants.map((participant) =>
              participant.stream.getVideoTracks().length > 0 ? (
                <video
                  key={participant.id}
                  autoPlay
                  playsInline
                  className="media-tile"
                  ref={(node) => {
                    if (node && node.srcObject !== participant.stream) {
                      node.srcObject = participant.stream
                    }
                  }}
                />
              ) : (
                <div className="chat-audio-tile" key={participant.id}>
                  <strong>{participant.label}</strong>
                  <span>Voice only</span>
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}
      <div className="messages">
        {messages.map((message) => (
          <div className={`message-row ${message.author.id === currentUserId ? 'own' : 'other'}`} key={message.id}>
            <div className={`message ${message.author.id === currentUserId ? 'own' : 'other'}`}>
              <div className="message-meta-row">
                <UserAvatar user={message.author} className="user-avatar-chat" />
                <div className="message-meta">
                  <strong>{message.author.display_name}</strong>
                  <span className="message-timestamp">{formatFileTimestamp(message.created_at)}</span>
                </div>
              </div>
              <span>{message.body}</span>
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const body = messageDraft.trim()
          if (!body) return
          await onSendMessage(body)
          setMessageDraft('')
        }}
        className="chat-composer"
      >
        <input
          className="input chat-input"
          name="message"
          value={messageDraft}
          onChange={(event) => setMessageDraft(event.target.value)}
          placeholder={`Message ${selectedRoom?.name ?? ''}`}
        />
        <button className="button" type="submit">Send</button>
      </form>
    </div>
  )
}
