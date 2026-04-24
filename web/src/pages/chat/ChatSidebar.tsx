import type { CSSProperties, ReactNode } from 'react'
import type { Room } from '../../lib/types'

type Props = {
  chatDrawerOpen: boolean
  chatPaneSize: { width: number; height: number }
  activeChatSplitter: boolean
  rooms: Room[]
  roomUnreadCounts: Record<string, number>
  selectedRoomId: string | null
  activeCallRoomId: string | null
  creationActionButtons: ReactNode
  onSelectRoom: (id: string) => void
  onStartChatResize: () => void
  onToggleChatDrawer: () => void
  children: ReactNode
}

export function ChatSidebar({
  chatDrawerOpen,
  chatPaneSize,
  activeChatSplitter,
  rooms,
  roomUnreadCounts,
  selectedRoomId,
  activeCallRoomId,
  creationActionButtons,
  onSelectRoom,
  onStartChatResize,
  onToggleChatDrawer,
  children,
}: Props) {
  return (
    <div
      className={`notes-manager chat-manager ${chatDrawerOpen ? '' : 'library-hidden'} ${activeChatSplitter ? 'resizing' : ''}`}
      style={
        {
          ['--notes-pane-width' as string]: `${chatPaneSize.width}px`,
          ['--notes-pane-height' as string]: `${chatPaneSize.height}px`,
        } as CSSProperties
      }
    >
      {chatDrawerOpen ? (
        <aside className="notes-sidebar chat-sidebar">
          <div className="folder-tree file-tree notes-folder-tree chat-thread-tree">
            <div className="file-sidebar-header-row chat-sidebar-header">
              <div />
              <div className="button-row">{creationActionButtons}</div>
            </div>
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
      {children}
    </div>
  )
}
