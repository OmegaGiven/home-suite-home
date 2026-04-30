import type { RefObject } from 'react'
import type { Message, Room, UserProfile } from './types'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type BuildChatPagePropsArgs = {
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
  onSelectRoom: (roomId: string) => void
  onJoinVoiceCall: () => void
  onJoinVideoCall: () => void
  onToggleScreenShare: () => void
  onLeaveCall: () => void
  onStartChatResize: () => void
  onToggleChatDrawer: () => void
  onSendMessage: (body: string) => Promise<void>
  onToggleMessageReaction: (messageId: string, emoji: string) => Promise<void>
}

export function buildChatPageProps(args: BuildChatPagePropsArgs) {
  return { ...args }
}
