import type { Note, RealtimeEvent } from './types'
import { colorForPresenceLabel } from './ui-helpers'

export function isConflictForkNote(note: Note) {
  return Boolean(note.conflict_tag || note.forked_from_note_id)
}

export function filterVisibleNotes(notes: Note[]) {
  return notes.filter((note) => !isConflictForkNote(note))
}

export function deleteNoteFamily(notes: Note[], rootNoteId: string) {
  const pending = new Set([rootNoteId])
  let changed = true
  while (changed) {
    changed = false
    for (const note of notes) {
      if (note.forked_from_note_id && pending.has(note.forked_from_note_id) && !pending.has(note.id)) {
        pending.add(note.id)
        changed = true
      }
    }
  }
  return notes.filter((note) => !pending.has(note.id))
}

function filterVisibleManagedNodes(
  nodes: import('./types').FileNode[],
  hiddenNoteIds: Set<string>,
): import('./types').FileNode[] {
  return nodes
    .flatMap((node) => {
      if (node.kind === 'file' && node.path.startsWith('notes/')) {
        const noteId = noteIdFromPath(node.path)
        if (noteId && hiddenNoteIds.has(noteId)) {
          return []
        }
      }
      const nextChildren = filterVisibleManagedNodes(node.children, hiddenNoteIds)
      if (node.kind === 'directory' && node.path.startsWith('notes') && nextChildren.length === 0) {
        const isRootNotesDir = node.path === 'notes'
        if (!isRootNotesDir) {
          return []
        }
      }
      return [{ ...node, children: nextChildren }]
    })
}

function noteIdFromPath(path: string) {
  const match = path.match(/-([a-z0-9-]+)\.md$/i)
  return match ? match[1] : null
}

export function buildVisibleFilesTree(tree: import('./types').FileNode[], notes: Note[]) {
  const hiddenNoteIds = new Set(notes.filter((note) => isConflictForkNote(note)).map((note) => note.id))
  return filterVisibleManagedNodes(tree, hiddenNoteIds)
}

export function pruneRemoteNoteCursors<T extends { seenAt: number }>(entriesByNote: Record<string, T[]>, maxAgeMs = 12_000) {
  return Object.fromEntries(
    Object.entries(entriesByNote).map(([noteId, entries]) => [
      noteId,
      entries.filter((entry) => Date.now() - entry.seenAt < maxAgeMs),
    ]),
  )
}

export function applyRemoteNoteCursor(
  current: Record<string, RemoteNoteCursor[]>,
  payload: Extract<RealtimeEvent, { type: 'note_cursor' }>,
) {
  const existing = current[payload.note_id] ?? []
  if (payload.offset === null || payload.offset === undefined) {
    const next = existing.filter((entry) => entry.clientId !== payload.client_id)
    return { ...current, [payload.note_id]: next }
  }
  const seenAt = Date.now()
  const next = [
    {
      clientId: payload.client_id,
      user: payload.user,
      offset: payload.offset,
      cursorB64: payload.cursor_b64 ?? null,
      seenAt,
      color: colorForPresenceLabel(payload.user),
    },
    ...existing.filter((entry) => entry.clientId !== payload.client_id),
  ].filter((entry) => seenAt - entry.seenAt < 12_000)
  return { ...current, [payload.note_id]: next }
}

export type RemoteNoteCursor = {
  clientId: string
  user: string
  offset: number
  cursorB64?: string | null
  seenAt: number
  color: string
}
