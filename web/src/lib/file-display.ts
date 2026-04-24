import type { Diagram, FileNode, Note, VoiceMemo } from './types'
import { diagramDisplayName, deriveParentPath, voiceMemoDisplayTitle } from './ui-helpers'

type ManagedFileCollections = {
  notes: Note[]
  memos: VoiceMemo[]
  diagrams: Diagram[]
}

export function noteIdFromPath(path: string) {
  const match = path.match(
    /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.md$/i,
  )
  return match?.[1] ?? null
}

export function noteTitleFromPath(path: string) {
  const filename = path.split('/').pop() ?? 'Imported note.md'
  const base = filename.replace(/\.md$/i, '')
  const withoutId = base.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
  return (
    withoutId
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Imported note'
  )
}

export function diagramIdFromPath(path: string) {
  const filename = path.split('/').filter(Boolean).pop()
  if (!filename?.toLowerCase().endsWith('.drawio')) return null
  const stem = filename.slice(0, -'.drawio'.length)
  const parts = stem.split('-')
  if (parts.length < 5) return null
  return parts.slice(-5).join('-')
}

export function diagramTitleFromPath(path: string) {
  const filename = path.split('/').pop() ?? 'Imported diagram.drawio'
  const base = filename.replace(/\.drawio$/i, '')
  const withoutId = base.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
  return (
    withoutId
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Imported diagram'
  )
}

export function displayNameForFileNode(node: FileNode, collections: ManagedFileCollections) {
  const { notes, memos, diagrams } = collections
  if (node.kind === 'file' && node.path.startsWith('notes/')) {
    const noteId = noteIdFromPath(node.path)
    const note = noteId ? notes.find((item) => item.id === noteId) : null
    if (note) return note.title
  }
  if (node.kind === 'file' && node.path.startsWith('voice/')) {
    const memo = memos.find((item) => item.audio_path === node.path)
    if (memo) return voiceMemoDisplayTitle(memo.created_at, memo.title || 'Memo')
  }
  if (node.kind === 'file' && node.path.startsWith('diagrams/')) {
    const diagramId = diagramIdFromPath(node.path)
    const diagram = diagramId ? diagrams.find((item) => item.id === diagramId) : null
    if (diagram) return diagramDisplayName(diagram.title)
    return diagramTitleFromPath(node.path)
  }
  return node.name
}

export function parentDirectoryLabel(path: string) {
  const parent = deriveParentPath(path)
  return parent && parent.length > 0 ? parent : '/'
}
