import { useState, type RefObject } from 'react'
import { RenameIcon } from '../../components/LibraryActionIcons'
import { UserAvatar } from '../../components/UserAvatar'
import type { Message, Room } from '../../lib/types'
import { formatFileTimestamp } from '../../lib/ui-helpers'

// Standard chat-style reactions drawn from the Unicode emoji set.
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '👏', '🔥', '👀', '👎']

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
  onToggleMessageReaction: (messageId: string, emoji: string) => Promise<void>
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
  onToggleMessageReaction,
}: Props) {
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null)
  const isImageMessage = (body: string) => body.startsWith('data:image/')

  return (
    <div className="chat-thread-pane">
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
                      <RenameIcon className="chat-thread-rename-icon" />
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
              <div className="message-reaction-picker-wrap">
                <button
                  className="message-reaction-add"
                  type="button"
                  aria-label="Add reaction"
                  title="Add reaction"
                  onClick={() =>
                    setReactionPickerMessageId((current) => (current === message.id ? null : message.id))
                  }
                >
                  +
                </button>
                {reactionPickerMessageId === message.id ? (
                  <div className="message-reaction-picker">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={`${message.id}-${emoji}-picker`}
                        className="message-reaction-emoji"
                        type="button"
                        onClick={() => {
                          setReactionPickerMessageId(null)
                          void onToggleMessageReaction(message.id, emoji)
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="message-meta-row">
                <UserAvatar user={message.author} className="user-avatar-chat" />
                <div className="message-meta">
                  <strong>{message.author.display_name}</strong>
                  <span className="message-timestamp">{formatFileTimestamp(message.created_at)}</span>
                </div>
              </div>
              {isImageMessage(message.body) ? (
                <img
                  src={message.body}
                  alt="Shared chat image"
                  className="chat-message-image"
                  loading="lazy"
                />
              ) : (
                <span>{message.body}</span>
              )}
              <div className="message-reactions">
                {message.reactions.map((reaction) => {
                  const reactedByCurrentUser = !!currentUserId && reaction.user_ids.includes(currentUserId)
                  return (
                    <button
                      key={`${message.id}-${reaction.emoji}`}
                      className={`message-reaction-chip ${reactedByCurrentUser ? 'active' : ''}`}
                      type="button"
                      onClick={() => void onToggleMessageReaction(message.id, reaction.emoji)}
                    >
                      <span>{reaction.emoji}</span>
                      <span>{reaction.user_ids.length}</span>
                    </button>
                  )
                })}
              </div>
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
        <label
          className="button-secondary chat-call-icon-button"
          aria-label="Upload image"
          title="Upload image"
        >
          <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
            <path d="M5.5 6.5h4l1.2-1.5h2.6l1.2 1.5h4a1.75 1.75 0 0 1 1.75 1.75v8.5a1.75 1.75 0 0 1-1.75 1.75h-13A1.75 1.75 0 0 1 3.75 16.75v-8.5A1.75 1.75 0 0 1 5.5 6.5Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            <circle cx="12" cy="12.5" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.9" />
          </svg>
          <input
            type="file"
            hidden
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                const result = reader.result
                if (typeof result !== 'string' || !result.startsWith('data:image/')) return
                void onSendMessage(result)
              }
              reader.readAsDataURL(file)
              event.currentTarget.value = ''
            }}
          />
        </label>
        <button className="button chat-call-icon-button" type="submit" aria-label="Send message" title="Send message">
          <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
            <path d="M4.75 19.25 20 12 4.75 4.75l2.05 6.1L13 12l-6.2 1.15-2.05 6.1Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
