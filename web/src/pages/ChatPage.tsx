import type { RefObject } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Message, Room, UserProfile } from '../lib/types'
import { formatFileTimestamp } from '../lib/ui-helpers'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type Props = {
  chatDrawerOpen: boolean
  chatPaneSize: { width: number; height: number }
  activeChatSplitter: boolean
  currentUserId: string | null
  currentUserLabel: string
  comsParticipants: UserProfile[]
  rooms: Room[]
  roomUnreadCounts: Record<string, number>
  selectedRoomId: string | null
  selectedRoom: Room | null
  messages: Message[]
  activeCallRoomId: string | null
  callJoined: boolean
  callMediaMode: 'audio' | 'video' | null
  screenSharing: boolean
  remoteParticipants: RemoteParticipant[]
  localVideoRef: RefObject<HTMLVideoElement | null>
  onCreateRoom: () => void
  onCreateDirectRoom: (participantIds: string[]) => void
  onRenameRoom: (roomId: string, name: string) => Promise<void>
  onUpdateRoomParticipants: (roomId: string, participantIds: string[]) => Promise<void>
  onSelectRoom: (id: string) => void
  onJoinVoiceCall: () => void
  onJoinVideoCall: () => void
  onToggleScreenShare: () => void
  onLeaveCall: () => void
  onStartChatResize: () => void
  onToggleChatDrawer: () => void
  onSendMessage: (body: string) => Promise<void>
}

export function ChatPage({
  chatDrawerOpen,
  chatPaneSize,
  activeChatSplitter,
  currentUserId,
  currentUserLabel,
  comsParticipants,
  rooms,
  roomUnreadCounts,
  selectedRoomId,
  selectedRoom,
  messages,
  activeCallRoomId,
  callJoined,
  callMediaMode,
  screenSharing,
  remoteParticipants,
  localVideoRef,
  onCreateRoom,
  onCreateDirectRoom,
  onRenameRoom,
  onUpdateRoomParticipants,
  onSelectRoom,
  onJoinVoiceCall,
  onJoinVideoCall,
  onToggleScreenShare,
  onLeaveCall,
  onStartChatResize,
  onToggleChatDrawer,
  onSendMessage,
}: Props) {
  const [renamingRoom, setRenamingRoom] = useState(false)
  const [roomNameDraft, setRoomNameDraft] = useState(selectedRoom?.name ?? '')
  const [createDirectOpen, setCreateDirectOpen] = useState(false)
  const [directParticipantIds, setDirectParticipantIds] = useState<string[]>([])
  const [directParticipantQuery, setDirectParticipantQuery] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [participantSearch, setParticipantSearch] = useState('')

  useEffect(() => {
    setRoomNameDraft(selectedRoom?.name ?? '')
    setRenamingRoom(false)
    setParticipantsOpen(false)
    setAddingParticipant(false)
    setParticipantSearch('')
  }, [selectedRoom?.id, selectedRoom?.name])

  useEffect(() => {
    setMessageDraft('')
  }, [selectedRoom?.id])

  const selectedRoomHasActiveCall = !!selectedRoom && selectedRoom.id === activeCallRoomId
  const callActionsDisabled = callJoined && !selectedRoomHasActiveCall
  const selectedRoomParticipantProfiles = useMemo(() => {
    if (!selectedRoom) return []
    if (selectedRoom.kind === 'channel') return []
    return selectedRoom.participant_ids.map((participantId, index) => {
      const knownParticipant = comsParticipants.find((participant) => participant.id === participantId)
      if (knownParticipant) return knownParticipant
      if (participantId === currentUserId) {
        return {
          id: participantId,
          username: 'you',
          email: '',
          display_name: currentUserLabel,
          role: 'member',
          roles: [],
          must_change_password: false,
        } satisfies UserProfile
      }
      return {
        id: participantId,
        username: '',
        email: '',
        display_name: selectedRoom.participant_labels[index] ?? 'Unknown participant',
        role: 'member',
        roles: [],
        must_change_password: false,
      } satisfies UserProfile
    })
  }, [comsParticipants, currentUserId, currentUserLabel, selectedRoom])
  const selectedRoomOtherParticipantCount = selectedRoom?.kind === 'direct'
    ? Math.max(0, selectedRoom.participant_ids.filter((id) => id !== currentUserId).length)
    : 3
  const participantIcon = selectedRoomOtherParticipantCount <= 1 ? '👤' : '👥'
  const selectedDirectParticipants = useMemo(
    () => comsParticipants.filter((participant) => directParticipantIds.includes(participant.id)),
    [comsParticipants, directParticipantIds],
  )
  const filteredDirectParticipants = useMemo(() => {
    const query = directParticipantQuery.trim().toLowerCase()
    return comsParticipants.filter((participant) => {
      if (directParticipantIds.includes(participant.id)) return false
      if (!query) return true
      return (
        participant.display_name.toLowerCase().includes(query) ||
        participant.username.toLowerCase().includes(query) ||
        participant.email.toLowerCase().includes(query)
      )
    })
  }, [comsParticipants, directParticipantIds, directParticipantQuery])
  const addableParticipants = useMemo(() => {
    const query = participantSearch.trim().toLowerCase()
    return comsParticipants.filter((participant) => {
      if (selectedRoom?.participant_ids.includes(participant.id)) return false
      if (!query) return true
      return (
        participant.display_name.toLowerCase().includes(query) ||
        participant.username.toLowerCase().includes(query) ||
        participant.email.toLowerCase().includes(query)
      )
    })
  }, [comsParticipants, participantSearch, selectedRoom?.participant_ids])

  return (
    <section className="panel">
      <div
        className={`notes-manager chat-manager ${chatDrawerOpen ? '' : 'library-hidden'} ${activeChatSplitter ? 'resizing' : ''}`}
        style={
          {
            ['--notes-pane-width' as string]: `${chatPaneSize.width}px`,
            ['--notes-pane-height' as string]: `${chatPaneSize.height}px`,
          } as React.CSSProperties
        }
      >
        {chatDrawerOpen ? (
          <aside className="notes-sidebar chat-sidebar">
            <div className="file-sidebar-header-row chat-sidebar-header">
              <div />
              <div className="button-row">
                <button
                  className="button-secondary"
                  onClick={() => {
                    setDirectParticipantIds([])
                    setDirectParticipantQuery('')
                    setCreateDirectOpen(true)
                  }}
                >
                  Message
                </button>
                <button className="button-secondary" onClick={onCreateRoom}>
                  Create thread
                </button>
              </div>
            </div>
            <div className="folder-tree file-tree notes-folder-tree chat-thread-tree">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  className={`folder-row ${room.id === selectedRoomId ? 'active' : ''}`}
                  onClick={() => onSelectRoom(room.id)}
                >
                  <span className="tree-row-markers" aria-hidden="true">
                    {room.id === selectedRoomId ? <span className="tree-active-arrow">&gt;</span> : null}
                  </span>
                  <span className="tree-row-label file-entry">
                    <span>{room.kind === 'direct' ? room.name : `#${room.name}`}</span>
                    {(roomUnreadCounts[room.id] ?? 0) > 0 ? (
                      <span className="thread-unread-badge" aria-label={`${roomUnreadCounts[room.id]} unread`}>
                        {roomUnreadCounts[room.id]}
                      </span>
                    ) : null}
                    {room.id === activeCallRoomId ? <span className="chat-call-indicator" title="Ongoing call">☎</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
        <div
          className={`pane-splitter notes-pane-splitter ${activeChatSplitter ? 'active' : ''} ${chatDrawerOpen ? '' : 'collapsed'}`}
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => {
            if (chatDrawerOpen) onStartChatResize()
          }}
          onDoubleClick={onToggleChatDrawer}
        />
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
                        if (!selectedRoom) return
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
                      <button className="button-secondary" type="button" onClick={() => {
                        setRoomNameDraft(selectedRoom.name)
                        setRenamingRoom(false)
                      }}>Cancel</button>
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
                          {participantIcon}
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
                            <button className="button-secondary" type="button" onClick={onJoinVoiceCall} disabled={callActionsDisabled}>
                              Voice
                            </button>
                            <button className="button" type="button" onClick={onJoinVideoCall} disabled={callActionsDisabled}>
                              Video
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {callActionsDisabled ? (
                  <div className="chat-thread-visibility">A call is already active in another thread.</div>
                ) : null}
              </>
            ) : (
              <div className="chat-thread-visibility">Select a thread to see messages and who can interact with it.</div>
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
                {remoteParticipants.map((participant) => (
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
                  )
                ))}
              </div>
            </div>
          ) : null}
          <div className="messages">
            {messages.map((message) => (
              <div
                className={`message-row ${message.author.id === currentUserId ? 'own' : 'other'}`}
                key={message.id}
              >
                <div className={`message ${message.author.id === currentUserId ? 'own' : 'other'}`}>
                  <div className="message-meta">
                    <strong>{message.author.display_name}</strong>
                    <span className="message-timestamp">{formatFileTimestamp(message.created_at)}</span>
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
      </div>
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
                      <strong>{participant.display_name}</strong>
                      <span className="muted">
                        {participant.id === currentUserId ? 'You' : `@${participant.username || participant.email || 'participant'}`}
                      </span>
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
                              await onUpdateRoomParticipants(selectedRoom.id, [
                                ...selectedRoom.participant_ids,
                                participant.id,
                              ])
                              setParticipantSearch('')
                              setAddingParticipant(false)
                            }}
                          >
                            {participant.display_name} <span className="muted">@{participant.username} · {participant.email}</span>
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
                      setAddingParticipant((current) => !current)
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
        <div className="modal-backdrop" onClick={() => setCreateDirectOpen(false)}>
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
                    onClick={() =>
                      setDirectParticipantIds((current) => current.filter((id) => id !== participant.id))
                    }
                  >
                    {participant.display_name} ×
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
                      setDirectParticipantIds((current) =>
                        current.includes(participant.id) ? current : [...current, participant.id],
                      )
                      setDirectParticipantQuery('')
                    }}
                  >
                    {participant.display_name} <span className="muted">@{participant.username} · {participant.email}</span>
                  </button>
                ))
              ) : (
                <div className="muted">No matching users found.</div>
              )}
            </div>
            <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="button-secondary" type="button" onClick={() => setCreateDirectOpen(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                disabled={directParticipantIds.length === 0}
                onClick={() => {
                  onCreateDirectRoom(directParticipantIds)
                  setDirectParticipantIds([])
                  setCreateDirectOpen(false)
                }}
              >
                Start message
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
