import type { RefObject } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Message, Room, UserProfile } from '../lib/types'
import { ChatModals } from './chat/ChatModals'
import { ChatSidebar } from './chat/ChatSidebar'
import { ChatThreadPane } from './chat/ChatThreadPane'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type Props = {
  chatManagerRef: RefObject<HTMLDivElement | null>
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
  onCreateRoom: (name: string, participantIds: string[], folder?: string) => Promise<void>
  onCreateDirectRoom: (participantIds: string[], folder?: string) => void
  onDeleteRoom: (roomId: string) => Promise<void>
  confirmRoomDelete: boolean
  onRenameRoom: (roomId: string, name: string, folder?: string) => Promise<void>
  onUpdateRoomParticipants: (roomId: string, participantIds: string[]) => Promise<void>
  onSelectRoom: (id: string) => void
  onJoinVoiceCall: () => void
  onJoinVideoCall: () => void
  onToggleScreenShare: () => void
  onLeaveCall: () => void
  onStartChatResize: () => void
  onToggleChatDrawer: () => void
  onSendMessage: (body: string) => Promise<void>
  onToggleMessageReaction: (messageId: string, emoji: string) => Promise<void>
}

export function ChatPage({
  chatManagerRef,
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
  onDeleteRoom,
  confirmRoomDelete,
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
  onToggleMessageReaction,
}: Props) {
  const [renamingRoom, setRenamingRoom] = useState(false)
  const [roomNameDraft, setRoomNameDraft] = useState(selectedRoom?.name ?? '')
  const [createThreadOpen, setCreateThreadOpen] = useState(false)
  const [deleteRoomOpen, setDeleteRoomOpen] = useState(false)
  const [threadNameDraft, setThreadNameDraft] = useState('')
  const [threadParticipantIds, setThreadParticipantIds] = useState<string[]>([])
  const [threadParticipantQuery, setThreadParticipantQuery] = useState('')
  const [threadFolderDraft, setThreadFolderDraft] = useState('')
  const [createDirectOpen, setCreateDirectOpen] = useState(false)
  const [directParticipantIds, setDirectParticipantIds] = useState<string[]>([])
  const [directParticipantQuery, setDirectParticipantQuery] = useState('')
  const [directFolderDraft, setDirectFolderDraft] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [participantSearch, setParticipantSearch] = useState('')

  useEffect(() => {
    setRoomNameDraft(selectedRoom?.name ?? '')
    setRenamingRoom(false)
    setDeleteRoomOpen(false)
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
          avatar_path: null,
          avatar_content_type: null,
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
        avatar_path: null,
        avatar_content_type: null,
        role: 'member',
        roles: [],
        must_change_password: false,
      } satisfies UserProfile
    })
  }, [comsParticipants, currentUserId, currentUserLabel, selectedRoom])
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
  const selectedThreadParticipants = useMemo(
    () => comsParticipants.filter((participant) => threadParticipantIds.includes(participant.id)),
    [comsParticipants, threadParticipantIds],
  )
  const filteredThreadParticipants = useMemo(() => {
    const query = threadParticipantQuery.trim().toLowerCase()
    return comsParticipants.filter((participant) => {
      if (threadParticipantIds.includes(participant.id)) return false
      if (!query) return true
      return (
        participant.display_name.toLowerCase().includes(query) ||
        participant.username.toLowerCase().includes(query) ||
        participant.email.toLowerCase().includes(query)
      )
    })
  }, [comsParticipants, threadParticipantIds, threadParticipantQuery])
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
      <ChatSidebar
        chatManagerRef={chatManagerRef}
        chatDrawerOpen={chatDrawerOpen}
        chatPaneSize={chatPaneSize}
        activeChatSplitter={activeChatSplitter}
        rooms={rooms}
        roomUnreadCounts={roomUnreadCounts}
        selectedRoomId={selectedRoomId}
        activeCallRoomId={activeCallRoomId}
        selectedRoom={selectedRoom}
        comsParticipants={comsParticipants}
        onSelectRoom={onSelectRoom}
        onStartChatResize={onStartChatResize}
        onToggleChatDrawer={onToggleChatDrawer}
        onCreateFolder={() => undefined}
        onCreateDirectMessage={(folder) => {
          setDirectParticipantIds([])
          setDirectParticipantQuery('')
          setDirectFolderDraft(folder)
          setCreateDirectOpen(true)
        }}
        onCreateThread={(folder) => {
          setThreadNameDraft(`thread-${rooms.length + 1}`)
          setThreadParticipantIds([])
          setThreadParticipantQuery('')
          setThreadFolderDraft(folder)
          setCreateThreadOpen(true)
        }}
        onRenameSelectedConversation={() => setRenamingRoom(true)}
        onMoveConversationToFolder={(roomId, folder) => {
          const room = rooms.find((entry) => entry.id === roomId)
          if (!room) return
          void onRenameRoom(roomId, room.name, folder)
        }}
      >
        <ChatThreadPane
          renamingRoom={renamingRoom}
          roomNameDraft={roomNameDraft}
          setRoomNameDraft={setRoomNameDraft}
          setRenamingRoom={setRenamingRoom}
          confirmRoomDelete={confirmRoomDelete}
          setDeleteRoomOpen={setDeleteRoomOpen}
          selectedRoom={selectedRoom}
          selectedRoomId={selectedRoomId}
          selectedRoomHasActiveCall={selectedRoomHasActiveCall}
          callActionsDisabled={callActionsDisabled}
          currentUserId={currentUserId}
          currentUserLabel={currentUserLabel}
          callJoined={callJoined}
          callMediaMode={callMediaMode}
          screenSharing={screenSharing}
          remoteParticipants={remoteParticipants}
          localVideoRef={localVideoRef}
          messages={messages}
          messageDraft={messageDraft}
          setMessageDraft={setMessageDraft}
          participantsOpen={participantsOpen}
          setParticipantsOpen={setParticipantsOpen}
          onRenameRoom={onRenameRoom}
          onJoinVoiceCall={onJoinVoiceCall}
          onJoinVideoCall={onJoinVideoCall}
          onToggleScreenShare={onToggleScreenShare}
          onLeaveCall={onLeaveCall}
          onDeleteRoom={onDeleteRoom}
          onSendMessage={onSendMessage}
          onToggleMessageReaction={onToggleMessageReaction}
        />
      </ChatSidebar>
      <ChatModals
        participantsOpen={participantsOpen}
        setParticipantsOpen={setParticipantsOpen}
        selectedRoom={selectedRoom}
        selectedRoomParticipantProfiles={selectedRoomParticipantProfiles}
        currentUserId={currentUserId}
        addingParticipant={addingParticipant}
        setAddingParticipant={setAddingParticipant}
        participantSearch={participantSearch}
        setParticipantSearch={setParticipantSearch}
        addableParticipants={addableParticipants}
        onUpdateRoomParticipants={onUpdateRoomParticipants}
        createDirectOpen={createDirectOpen}
        setCreateDirectOpen={setCreateDirectOpen}
        directParticipantIds={directParticipantIds}
        setDirectParticipantIds={setDirectParticipantIds}
        directParticipantQuery={directParticipantQuery}
        setDirectParticipantQuery={setDirectParticipantQuery}
        directFolderDraft={directFolderDraft}
        setDirectFolderDraft={setDirectFolderDraft}
        selectedDirectParticipants={selectedDirectParticipants}
        filteredDirectParticipants={filteredDirectParticipants}
        onCreateDirectRoom={onCreateDirectRoom}
        createThreadOpen={createThreadOpen}
        setCreateThreadOpen={setCreateThreadOpen}
        threadNameDraft={threadNameDraft}
        setThreadNameDraft={setThreadNameDraft}
        threadParticipantIds={threadParticipantIds}
        setThreadParticipantIds={setThreadParticipantIds}
        threadParticipantQuery={threadParticipantQuery}
        setThreadParticipantQuery={setThreadParticipantQuery}
        threadFolderDraft={threadFolderDraft}
        setThreadFolderDraft={setThreadFolderDraft}
        selectedThreadParticipants={selectedThreadParticipants}
        filteredThreadParticipants={filteredThreadParticipants}
        onCreateRoom={onCreateRoom}
        deleteRoomOpen={deleteRoomOpen}
        setDeleteRoomOpen={setDeleteRoomOpen}
        onDeleteRoom={onDeleteRoom}
      />
    </section>
  )
}
