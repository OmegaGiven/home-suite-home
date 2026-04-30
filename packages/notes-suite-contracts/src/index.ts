export type ResourceVisibility = 'private' | 'org' | 'users'

export type NoteBlockKind =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'bullet_list'
  | 'checklist'
  | 'numbered_list'
  | 'code'
  | 'table'

export interface NoteBlock {
  id: string
  kind: NoteBlockKind
  text: string
  attrs: Record<string, string>
  order: number
  deleted: boolean
  last_modified_by: string
  last_modified_counter: number
}

export interface NoteDocument {
  blocks: NoteBlock[]
  clock: Record<string, number>
  last_operation_id: string
}

export interface UserProfile {
  id: string
  username: string
  email: string
  display_name: string
  avatar_path?: string | null
}

export interface NoteShareState {
  resource_key: string
  visibility: ResourceVisibility
  user_ids: string[]
  updated_at?: string
}

export interface ServerIdentity {
  id: string
  server_account_id: string
  label: string
  auth_type: 'password' | 'oidc'
  user: UserProfile
  token: string
}

export interface ServerAccount {
  id: string
  label: string
  base_url: string
  created_at: string
  updated_at: string
  identities: ServerIdentity[]
}

export interface NoteBinding {
  local_note_id: string
  server_account_id: string
  server_identity_id?: string | null
  remote_note_id?: string | null
  remote_revision: number
  last_pulled_at?: string | null
  last_pushed_at?: string | null
}

export interface LocalNoteRecord {
  id: string
  title: string
  folder: string
  markdown: string
  document?: NoteDocument
  editor_format?: string
  loro_snapshot_b64?: string
  loro_updates_b64?: string[]
  loro_version?: number
  loro_needs_migration?: boolean
  storage_mode: 'local' | 'synced'
  visibility: ResourceVisibility
  selected_server_identity_id?: string | null
  created_at: string
  updated_at: string
}

export interface PendingNoteDocumentUpdatePayload {
  kind: 'document_update'
  editor_format: string
  content_markdown: string
  content_html?: string | null
}

export interface PendingNoteOperationRecord {
  id: string
  note_id: string
  server_account_id: string
  server_identity_id: string
  created_at: string
  payload: PendingNoteDocumentUpdatePayload
}

export interface PresenceSession {
  session_id: string
  note_id: string
  user_id: string
  user_label: string
  user_avatar_path?: string | null
  client_id: string
  opened_at: string
  last_seen_at: string
}

export interface RemoteCursor {
  note_id: string
  client_id: string
  session_id?: string | null
  user_id?: string | null
  user: string
  avatar_path?: string | null
  offset: number | null
  cursor_b64?: string | null
  block_id?: string | null
  updated_at?: string | null
}

export interface SyncConflictRecord {
  id: string
  note_id: string
  operation_id: string
  reason: string
  forked_note_ids: string[]
  created_at: string
}

export interface NoteSessionOpenResponse {
  note: {
    id: string
    title: string
    folder: string
    markdown: string
    document?: NoteDocument
    revision: number
    updated_at: string
  }
  share: NoteShareState
  sessions: PresenceSession[]
  conflicts: SyncConflictRecord[]
}

export interface NoteDocumentState {
  note_id: string
  editor_format: string
  snapshot_b64: string
  updates_b64: string[]
  version: number
  needs_migration: boolean
  legacy_markdown: string
  rendered_html: string
  updated_at: string
}

export interface NoteDocumentPullResponse {
  note: {
    id: string
    title: string
    folder: string
    markdown: string
    document?: NoteDocument
    revision: number
    updated_at: string
    editor_format?: string
    loro_snapshot_b64?: string
    loro_updates_b64?: string[]
    loro_version?: number
    loro_needs_migration?: boolean
  }
  document: NoteDocumentState
  share: NoteShareState
  sessions: PresenceSession[]
}

export interface PushNoteDocumentUpdatesRequest {
  client_id?: string
  snapshot_b64?: string | null
  update_b64: string
  editor_format?: string | null
  content_markdown?: string | null
  content_html?: string | null
}

export interface PushNoteDocumentUpdatesResponse {
  note: {
    id: string
    title: string
    folder: string
    markdown: string
    document?: NoteDocument
    revision: number
    updated_at: string
    editor_format?: string
    loro_snapshot_b64?: string
    loro_updates_b64?: string[]
    loro_version?: number
    loro_needs_migration?: boolean
  }
  document: NoteDocumentState
}

export type RealtimeEvent =
  | {
      type: 'note_document_update'
      note_id: string
      client_id: string
      snapshot_b64?: string | null
      update_b64: string
      version: number
      editor_format: string
      content_markdown: string
      content_html: string
    }
  | {
      type: 'note_cursor'
      note_id: string
      user: string
      client_id: string
      offset: number | null
      cursor_b64?: string | null
      user_id?: string | null
      avatar_path?: string | null
      session_id?: string | null
      block_id?: string | null
      updated_at?: string | null
    }
  | {
      type: 'note_presence'
      note_id: string
      user: string
      user_id?: string | null
      avatar_path?: string | null
      session_id?: string | null
      last_seen_at?: string | null
    }

export function createId(prefix = 'nsn') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

export function createEmptyDocument(actorId: string): NoteDocument {
  return {
    blocks: [
      {
        id: createId('block'),
        kind: 'paragraph',
        text: '',
        attrs: {},
        order: 1,
        deleted: false,
        last_modified_by: actorId,
        last_modified_counter: 1,
      },
    ],
    clock: { [actorId]: 1 },
    last_operation_id: '',
  }
}

export function markdownFromDocument(document: NoteDocument) {
  return document.blocks
    .filter((block) => !block.deleted)
    .sort((left, right) => left.order - right.order)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
          return `${block.attrs.level ?? '#'} ${block.text}`.trim()
        case 'quote':
          return `> ${block.text}`.trim()
        case 'bullet_list':
          return `- ${block.text}`.trim()
        case 'checklist':
          return `- [ ] ${block.text}`.trim()
        case 'numbered_list':
          return `1. ${block.text}`.trim()
        case 'code':
          return `\`\`\`\n${block.text}\n\`\`\``
        case 'table':
          return block.text
        default:
          return block.text
      }
    })
    .join('\n\n')
}

export function documentFromMarkdown(markdown: string, actorId: string): NoteDocument {
  const blocks = markdown.split(/\n{2,}/).map((raw, index) => {
    const text = raw.trim()
    const isHeading = /^#{1,6}\s/.test(text)
    const attrs: Record<string, string> = isHeading ? { level: raw.match(/^#{1,6}/)?.[0] ?? '#' } : {}
    return {
      id: createId('block'),
      kind: (isHeading ? 'heading' : text.startsWith('> ') ? 'quote' : text.startsWith('- [ ] ') ? 'checklist' : text.startsWith('- ') ? 'bullet_list' : text.startsWith('```') ? 'code' : 'paragraph') as NoteBlockKind,
      text: text.replace(/^#{1,6}\s/, '').replace(/^>\s/, '').replace(/^- \[ \]\s/, '').replace(/^- /, '').replace(/^```[\r\n]?/, '').replace(/[\r\n]?```$/, ''),
      attrs,
      order: index + 1,
      deleted: false,
      last_modified_by: actorId,
      last_modified_counter: index + 1,
    }
  })
  return {
    blocks: blocks.length > 0 ? blocks : createEmptyDocument(actorId).blocks,
    clock: { [actorId]: blocks.length || 1 },
    last_operation_id: '',
  }
}
