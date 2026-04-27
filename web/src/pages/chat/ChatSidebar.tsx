import type { CSSProperties, DragEvent, ReactNode, RefObject } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { FolderPromptModal } from '../../components/FolderPromptModal'
import { FileTreeNodes, type FileTreeRowMetaVisibility } from '../../components/FileTreeNode'
import { LibraryActionBar } from '../../components/LibraryActionBar'
import { FilterIcon, NewFolderIcon, RenameIcon } from '../../components/LibraryActionIcons'
import { PaneSplitter } from '../../components/PaneSplitter'
import type { FileNode, Room, UserProfile } from '../../lib/types'
import { sortFileTree } from '../../lib/ui-helpers'

type ChatFolderNode = {
  name: string
  path: string
  children: ChatFolderNode[]
  rooms: Room[]
}

type Props = {
  chatManagerRef: RefObject<HTMLDivElement | null>
  chatDrawerOpen: boolean
  chatPaneSize: { width: number; height: number }
  activeChatSplitter: boolean
  rooms: Room[]
  roomUnreadCounts: Record<string, number>
  selectedRoomId: string | null
  activeCallRoomId: string | null
  selectedRoom: Room | null
  comsParticipants: UserProfile[]
  onSelectRoom: (id: string) => void
  onStartChatResize: () => void
  onToggleChatDrawer: () => void
  onCreateFolder: (folderPath: string) => void
  onCreateDirectMessage: (folder: string) => void
  onCreateThread: (folder: string) => void
  onRenameSelectedConversation: () => void
  onMoveConversationToFolder: (roomId: string, folder: string) => void
  children: ReactNode
}

const EMPTY_ROW_META_VISIBILITY: FileTreeRowMetaVisibility = {
  type: false,
  size: false,
  modified: false,
  created: false,
}

function normalizeChatFolderPath(path: string) {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
}

function folderAncestorPaths(path: string) {
  const segments = normalizeChatFolderPath(path).split('/').filter(Boolean)
  const results: string[] = []
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    results.push(`chat-folder:${current}`)
  }
  return results
}

function buildChatFolderTree(rooms: Room[], customFolders: string[]) {
  const roots: ChatFolderNode[] = []
  const folderMap = new Map<string, ChatFolderNode>()

  function ensureFolder(path: string) {
    const normalized = normalizeChatFolderPath(path)
    if (!normalized) return null
    if (folderMap.has(normalized)) return folderMap.get(normalized) ?? null
    const segments = normalized.split('/')
    const name = segments[segments.length - 1]
    const node: ChatFolderNode = { name, path: normalized, children: [], rooms: [] }
    folderMap.set(normalized, node)
    const parentPath = segments.slice(0, -1).join('/')
    const parent = parentPath ? ensureFolder(parentPath) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
    return node
  }

  for (const path of customFolders) {
    ensureFolder(path)
  }
  for (const room of rooms) {
    const folder = normalizeChatFolderPath(room.folder || '')
    if (folder) {
      const parent = ensureFolder(folder)
      parent?.rooms.push(room)
    }
  }

  const rootRooms = rooms.filter((room) => !normalizeChatFolderPath(room.folder || ''))
  return { roots, rootRooms }
}

function filterChatTree(nodes: ChatFolderNode[], rootRooms: Room[], query: string, participantIds: string[]) {
  const normalizedQuery = query.trim().toLowerCase()
  const participantSet = new Set(participantIds)

  const roomMatches = (room: Room) => {
    const queryMatch =
      !normalizedQuery ||
      room.name.toLowerCase().includes(normalizedQuery) ||
      normalizeChatFolderPath(room.folder || '').toLowerCase().includes(normalizedQuery)
    const participantMatch =
      participantSet.size === 0 ||
      room.participant_ids.some((participantId) => participantSet.has(participantId))
    return queryMatch && participantMatch
  }

  const filterNode = (node: ChatFolderNode): ChatFolderNode | null => {
    const children = node.children.map(filterNode).filter((child): child is ChatFolderNode => !!child)
    const rooms = node.rooms.filter(roomMatches)
    const folderMatches = normalizedQuery && node.name.toLowerCase().includes(normalizedQuery)
    if (!children.length && !rooms.length && !folderMatches) return null
    return { ...node, children, rooms }
  }

  return {
    roots: nodes.map(filterNode).filter((node): node is ChatFolderNode => !!node),
    rootRooms: rootRooms.filter(roomMatches),
  }
}

function roomNodeName(room: Room, roomUnreadCounts: Record<string, number>, activeCallRoomId: string | null) {
  const base = room.kind === 'direct' ? room.name : `#${room.name}`
  const unread = roomUnreadCounts[room.id] ?? 0
  const active = room.id === activeCallRoomId ? ' ☎' : ''
  const badge = unread > 0 ? ` (${unread})` : ''
  return `${base}${badge}${active}`
}

function convertChatFolderNode(node: ChatFolderNode, roomUnreadCounts: Record<string, number>, activeCallRoomId: string | null): FileNode {
  return {
    name: node.name,
    path: `chat-folder:${node.path}`,
    kind: 'directory',
    size_bytes: null,
    created_at: null,
    updated_at: null,
    children: sortFileTree(
      [
        ...node.children.map((child) => convertChatFolderNode(child, roomUnreadCounts, activeCallRoomId)),
        ...node.rooms.map((room) => ({
          name: roomNodeName(room, roomUnreadCounts, activeCallRoomId),
          path: `room:${room.id}`,
          kind: 'file' as const,
          size_bytes: null,
          created_at: room.created_at,
          updated_at: room.created_at,
          children: [],
        })),
      ],
      { key: 'name', direction: 'asc' },
    ),
  }
}

function ChatParticipantFilter({
  open,
  participants,
  selectedParticipantIds,
  onToggleOpen,
  onToggleParticipant,
}: {
  open: boolean
  participants: UserProfile[]
  selectedParticipantIds: string[]
  onToggleOpen: () => void
  onToggleParticipant: (participantId: string) => void
}) {
  return (
    <div className="files-view-anchor">
      <button
        className="button-secondary notes-new-button"
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Filter conversations by participant"
        title="Filter conversations by participant"
      >
        <FilterIcon />
      </button>
      {open ? (
        <div className="files-view-menu">
          {participants.map((participant) => (
            <label key={participant.id} className="files-view-option">
              <input
                type="checkbox"
                checked={selectedParticipantIds.includes(participant.id)}
                onChange={() => onToggleParticipant(participant.id)}
              />
              <span>{participant.display_name}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChatSidebar({
  chatManagerRef,
  chatDrawerOpen,
  chatPaneSize,
  activeChatSplitter,
  rooms,
  roomUnreadCounts,
  selectedRoomId,
  activeCallRoomId,
  selectedRoom,
  comsParticipants,
  onSelectRoom,
  onStartChatResize,
  onToggleChatDrawer,
  onCreateFolder,
  onCreateDirectMessage,
  onCreateThread,
  onRenameSelectedConversation,
  onMoveConversationToFolder,
  children,
}: Props) {
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [participantFilterOpen, setParticipantFilterOpen] = useState(false)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [customChatFolders, setCustomChatFolders] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('sweet.chatFolders')
      if (!stored) return
      const parsed = JSON.parse(stored) as string[]
      setCustomChatFolders(parsed.map(normalizeChatFolderPath).filter(Boolean))
    } catch {
      setCustomChatFolders([])
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sweet.chatFolders', JSON.stringify(customChatFolders))
  }, [customChatFolders])

  const currentFolderPath = normalizeChatFolderPath(selectedRoom?.folder || '')
  const { roots, rootRooms } = useMemo(() => buildChatFolderTree(rooms, customChatFolders), [rooms, customChatFolders])
  const filteredTree = useMemo(
    () => filterChatTree(roots, rootRooms, sidebarSearchQuery, selectedParticipantIds),
    [roots, rootRooms, sidebarSearchQuery, selectedParticipantIds],
  )
  const treeNodes = useMemo(
    () =>
      sortFileTree(
        [
          ...filteredTree.roots.map((node) => convertChatFolderNode(node, roomUnreadCounts, activeCallRoomId)),
          ...filteredTree.rootRooms.map((room) => ({
            name: roomNodeName(room, roomUnreadCounts, activeCallRoomId),
            path: `room:${room.id}`,
            kind: 'file' as const,
            size_bytes: null,
            created_at: room.created_at,
            updated_at: room.created_at,
            children: [],
          })),
        ],
        { key: 'name', direction: 'asc' },
      ),
    [filteredTree, roomUnreadCounts, activeCallRoomId],
  )
  const highlightedPaths = folderAncestorPaths(currentFolderPath)

  const selectedPath = selectedRoomId ? `room:${selectedRoomId}` : ''

  return (
    <>
      <FolderPromptModal
        open={createFolderOpen}
        title="Create folder"
        value={newFolderName}
        confirmLabel="Confirm"
        onChange={setNewFolderName}
        onConfirm={() => {
          const trimmed = newFolderName.trim()
          if (!trimmed) return
          const nextPath = normalizeChatFolderPath(currentFolderPath ? `${currentFolderPath}/${trimmed}` : trimmed)
          setCustomChatFolders((current) => Array.from(new Set([...current, nextPath])))
          onCreateFolder(nextPath)
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
        onClose={() => {
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
      />
      <div
        ref={chatManagerRef}
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
            <div className="chat-thread-tree">
              <LibraryActionBar
                searchOpen={sidebarSearchOpen}
                searchQuery={sidebarSearchQuery}
                searchPlaceholder="Search conversations"
                onOpenSearch={() => setSidebarSearchOpen(true)}
                onCloseSearch={() => {
                  setSidebarSearchOpen(false)
                  setSidebarSearchQuery('')
                }}
                onChangeSearchQuery={setSidebarSearchQuery}
                metaFilterOpen={false}
                rowMetaVisibility={EMPTY_ROW_META_VISIBILITY}
                onToggleMetaFilterOpen={() => undefined}
                onToggleMetaVisibility={() => undefined}
                customFilterSlot={
                  <ChatParticipantFilter
                    open={participantFilterOpen}
                    participants={comsParticipants}
                    selectedParticipantIds={selectedParticipantIds}
                    onToggleOpen={() => setParticipantFilterOpen((current) => !current)}
                    onToggleParticipant={(participantId) =>
                      setSelectedParticipantIds((current) =>
                        current.includes(participantId)
                          ? current.filter((id) => id !== participantId)
                          : [...current, participantId],
                      )
                    }
                  />
                }
                hideMetaFilter
                rootDropPath="__coms_root__"
                draggingPath={draggingPath}
                dropTargetPath={dropTargetPath}
                onDropTargetChange={setDropTargetPath}
                onDropRoot={async (event, destinationDir) => {
                  if (destinationDir !== '__coms_root__') return
                  const sourcePath = event.dataTransfer.getData('text/plain') || draggingPath
                  if (!sourcePath?.startsWith('room:')) return
                  const roomId = sourcePath.slice('room:'.length)
                  onMoveConversationToFolder(roomId, '')
                  setDropTargetPath(null)
                }}
                commonActions={[
                  { key: 'folder', label: 'New folder', icon: <NewFolderIcon />, onClick: () => setCreateFolderOpen(true) },
                  {
                    key: 'rename',
                    label: 'Rename conversation',
                    icon: <RenameIcon />,
                    disabled: !selectedRoomId,
                    onClick: onRenameSelectedConversation,
                  },
                ]}
                pageActions={[
                  {
                    key: 'message',
                    label: 'New message',
                    icon: (
                      <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
                        <path d="M5.5 7.25A2.75 2.75 0 0 1 8.25 4.5h7.5a2.75 2.75 0 0 1 2.75 2.75v5.5a2.75 2.75 0 0 1-2.75 2.75H11l-3.9 3.05c-.45.35-1.1.03-1.1-.54V15.5h-1A2.75 2.75 0 0 1 2.25 12.75v-5.5A2.75 2.75 0 0 1 5 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10.8 7.7v4.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M8.4 10.1h4.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      </svg>
                    ),
                    onClick: () => onCreateDirectMessage(currentFolderPath),
                  },
                  {
                    key: 'thread',
                    label: 'Create thread',
                    icon: (
                      <svg viewBox="0 0 24 24" className="chat-call-icon" aria-hidden="true">
                        <path d="M5.5 6.25h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M5.5 11h13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M5.5 15.75h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M17.6 4.9v5.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        <path d="M14.9 7.6h5.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      </svg>
                    ),
                    onClick: () => onCreateThread(currentFolderPath),
                  },
                ]}
              />
              <div className="folder-tree file-tree notes-folder-tree">
                {treeNodes.length > 0 ? (
                  <FileTreeNodes
                    nodes={treeNodes}
                    getDisplayName={(node) => node.name}
                    selectedPath={selectedPath}
                    activePath={selectedPath}
                    highlightedPaths={highlightedPaths}
                    markedPaths={[]}
                    draggingPath={draggingPath}
                    dropTargetPath={dropTargetPath}
                    onSelect={(path) => {
                      if (!path.startsWith('room:')) return
                      onSelectRoom(path.slice('room:'.length))
                    }}
                    onDragStart={(event, path) => {
                      if (!path.startsWith('room:')) return
                      setDraggingPath(path)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', path)
                    }}
                    onDragEnd={() => {
                      setDraggingPath(null)
                      setDropTargetPath(null)
                    }}
                    onDropTargetChange={setDropTargetPath}
                    onDrop={async (event: DragEvent<HTMLElement>, destinationDir: string) => {
                      const sourcePath = event.dataTransfer.getData('text/plain') || draggingPath
                      if (!sourcePath?.startsWith('room:')) return
                      const roomId = sourcePath.slice('room:'.length)
                      const folder = destinationDir.startsWith('chat-folder:') ? destinationDir.slice('chat-folder:'.length) : ''
                      onMoveConversationToFolder(roomId, folder)
                      setCustomChatFolders((current) => Array.from(new Set([...current, folder].filter(Boolean))))
                      setDropTargetPath(null)
                    }}
                    canDragNode={(node) => node.kind === 'file' && node.path.startsWith('room:')}
                    rowMetaVisibility={EMPTY_ROW_META_VISIBILITY}
                  />
                ) : (
                  <div className="empty-state">No matching conversations.</div>
                )}
              </div>
            </div>
          </aside>
        ) : null}
        <PaneSplitter
          className="pane-splitter notes-pane-splitter"
          active={activeChatSplitter}
          drawerOpen={chatDrawerOpen}
          onStartResize={onStartChatResize}
          onDoubleClick={onToggleChatDrawer}
        />
        {children}
      </div>
    </>
  )
}
