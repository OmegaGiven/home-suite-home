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

export type NoteOperation =
  | { type: 'replace_document'; blocks: NoteBlock[] }
  | { type: 'insert_block'; block: NoteBlock; after_block_id?: string | null }
  | { type: 'update_block_text'; block_id: string; text: string }
  | { type: 'update_block_attrs'; block_id: string; attrs: Record<string, string> }
  | { type: 'delete_block'; block_id: string }
  | { type: 'move_block'; block_id: string; after_block_id?: string | null }

export interface NoteDocumentOperationBatch {
  actor_id: string
  client_id: string
  operation_id: string
  base_clock: Record<string, number>
  operations: NoteOperation[]
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
  document: NoteDocument
  storage_mode: 'local' | 'synced'
  visibility: ResourceVisibility
  selected_server_identity_id?: string | null
  created_at: string
  updated_at: string
}

export interface PendingNoteOperationRecord {
  id: string
  note_id: string
  server_account_id: string
  server_identity_id: string
  created_at: string
  batch: NoteDocumentOperationBatch
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

export interface NoteOperationRecord {
  note_id: string
  operation_id: string
  actor_id: string
  client_id: string
  created_at: string
  resulting_revision: number
  batch: NoteDocumentOperationBatch
}

export interface NoteOperationsPullResponse {
  note: {
    id: string
    title: string
    folder: string
    markdown: string
    document: NoteDocument
    revision: number
    updated_at: string
  }
  operations: NoteOperationRecord[]
  conflicts: SyncConflictRecord[]
  share: NoteShareState
}

export interface NoteOperationsPushResponse {
  note: {
    id: string
    title: string
    folder: string
    markdown: string
    document: NoteDocument
    revision: number
    updated_at: string
  }
  applied: boolean
  operation?: NoteOperationRecord
  conflicts: SyncConflictRecord[]
}

export interface NoteSessionOpenResponse {
  note: {
    id: string
    title: string
    folder: string
    markdown: string
    document: NoteDocument
    revision: number
    updated_at: string
  }
  share: NoteShareState
  sessions: PresenceSession[]
  conflicts: SyncConflictRecord[]
}

export type RealtimeEvent =
  | {
      type: 'note_patch'
      note_id: string
      title: string
      folder: string
      markdown: string
      revision: number
      document?: NoteDocument | null
    }
  | {
      type: 'note_operations'
      note_id: string
      title: string
      folder: string
      markdown: string
      revision: number
      client_id: string
      user: string
      batch: NoteDocumentOperationBatch
      document?: NoteDocument | null
    }
  | {
      type: 'note_cursor'
      note_id: string
      user: string
      client_id: string
      offset: number | null
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

export function applyOperationsToDocument(
  current: NoteDocument,
  batch: NoteDocumentOperationBatch,
): NoteDocument {
  const actorId = batch.actor_id || 'local-user'
  const next: NoteDocument = {
    blocks: current.blocks.map((block) => ({ ...block, attrs: { ...block.attrs } })),
    clock: { ...current.clock },
    last_operation_id: batch.operation_id,
  }
  let counter = next.clock[actorId] ?? 0
  for (const operation of batch.operations) {
    counter += 1
    switch (operation.type) {
      case 'replace_document':
        next.blocks = operation.blocks.map((block, index) => ({
          ...block,
          order: index + 1,
          last_modified_by: actorId,
          last_modified_counter: counter,
        }))
        break
      case 'insert_block': {
        const anchor = operation.after_block_id
          ? next.blocks.find((block) => block.id === operation.after_block_id)
          : null
        next.blocks.push({
          ...operation.block,
          order: anchor ? anchor.order + 0.5 : next.blocks.length + 1,
          last_modified_by: actorId,
          last_modified_counter: counter,
        })
        break
      }
      case 'update_block_text': {
        const block = next.blocks.find((candidate) => candidate.id === operation.block_id)
        if (block) {
          block.text = operation.text
          block.last_modified_by = actorId
          block.last_modified_counter = counter
        }
        break
      }
      case 'update_block_attrs': {
        const block = next.blocks.find((candidate) => candidate.id === operation.block_id)
        if (block) {
          block.attrs = { ...operation.attrs }
          block.last_modified_by = actorId
          block.last_modified_counter = counter
        }
        break
      }
      case 'delete_block': {
        const block = next.blocks.find((candidate) => candidate.id === operation.block_id)
        if (block) {
          block.deleted = true
          block.last_modified_by = actorId
          block.last_modified_counter = counter
        }
        break
      }
      case 'move_block': {
        const block = next.blocks.find((candidate) => candidate.id === operation.block_id)
        const anchor = operation.after_block_id
          ? next.blocks.find((candidate) => candidate.id === operation.after_block_id)
          : null
        if (block) {
          block.order = anchor ? anchor.order + 0.5 : Math.max(...next.blocks.map((entry) => entry.order), 0) + 1
          block.last_modified_by = actorId
          block.last_modified_counter = counter
        }
        break
      }
    }
  }
  next.blocks.sort((left, right) => left.order - right.order)
  next.clock[actorId] = counter
  next.last_operation_id = batch.operation_id
  return next
}
