import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { api } from './api'
import { noteIdFromPath } from './file-display'
import {
  moveFileTreeNode,
  removeFileTreeNode,
  renameFileTreeNode,
  replaceFileTreeNode,
} from './file-tree-state'
import { deleteNoteFamily } from './notes-runtime'
import { getConnectivityState } from './platform'
import { queueSyncOperation } from './sync-engine'
import type { Diagram, FileNode, Note, SessionResponse, VoiceMemo } from './types'
import {
  deriveParentPath,
  diagramDisplayName,
  managedPathForNoteFolder,
  normalizeDiagramFolderPath,
  normalizeDiagramTitlePath,
  normalizeFolderPath,
} from './ui-helpers'

type CreateManagedFileLocalActionsContext = {
  session: SessionResponse | null
  notesRef: MutableRefObject<Note[]>
  diagramsRef: MutableRefObject<Diagram[]>
  memosRef: MutableRefObject<VoiceMemo[]>
  selectedNoteIdRef: MutableRefObject<string | null>
  selectedFolderPathRef: MutableRefObject<string>
  setFilesTree: Dispatch<SetStateAction<FileNode[]>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setCustomDiagramFolders: Dispatch<SetStateAction<string[]>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  setSelectedVoiceMemoId: Dispatch<SetStateAction<string | null>>
  rememberPersistedNotes: (nextNotes: Note[]) => void
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  diagramIdFromManagedPath: (path: string) => string | null
}

function slugForTitle(title: string) {
  const slug = title
    .split('')
    .map((char) => (/[a-z0-9]/i.test(char) ? char.toLowerCase() : '-'))
    .join('')
    .split('-')
    .filter(Boolean)
    .join('-')
  return slug || 'item'
}

function noteManagedFilePath(note: Note) {
  return `${managedPathForNoteFolder(note.folder || 'Inbox')}/${slugForTitle(note.title)}-${note.id}.md`
}

function diagramManagedFilePath(diagram: Diagram) {
  const normalizedTitle = normalizeDiagramTitlePath(diagram.title)
  const parts = normalizedTitle.split('/').filter(Boolean)
  const leaf = parts[parts.length - 1] || 'Untitled'
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const prefix = folder ? `diagrams/${folder}` : 'diagrams'
  return `${prefix}/${slugForTitle(leaf)}-${diagram.id}.drawio`
}

export function createManagedFileLocalActions(context: CreateManagedFileLocalActionsContext) {
  async function moveManagedPathLocalFirst(sourcePath: string, destinationDir: string) {
    if (getConnectivityState()) {
      return api.moveFile(sourcePath, destinationDir)
    }
    const now = new Date().toISOString()
    let moved: FileNode | null = null

    if (sourcePath === 'drive' || sourcePath.startsWith('drive/')) {
      context.setFilesTree((current) => {
        const result = moveFileTreeNode(current, sourcePath, destinationDir)
        moved = result.moved
        return result.nodes
      })
      if (!moved) {
        throw new Error('Could not find the item to move.')
      }
    } else if (sourcePath === 'notes' || sourcePath.startsWith('notes/')) {
      if (sourcePath.endsWith('.md')) {
        const noteId = noteIdFromPath(sourcePath)
        const current = noteId ? context.notesRef.current.find((entry) => entry.id === noteId) : null
        if (!current) throw new Error('Note not found.')
        const nextFolder = normalizeFolderPath(destinationDir.replace(/^notes\/?/, '') || 'Inbox')
        const updated: Note = {
          ...current,
          folder: nextFolder,
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: context.session?.user.id ?? current.last_editor_id,
        }
        context.setNotes((entries) => entries.map((entry) => (entry.id === updated.id ? updated : entry)))
        context.rememberPersistedNotes(
          context.notesRef.current.map((entry) => (entry.id === updated.id ? updated : entry)),
        )
        context.setCustomFolders((currentFolders) =>
          context.mergeFolderPaths(currentFolders, [current.folder || 'Inbox', updated.folder || 'Inbox']),
        )
        if (context.selectedNoteIdRef.current === updated.id) {
          context.setSelectedFolderPath(nextFolder)
        }
        const nextPath = noteManagedFilePath(updated)
        context.setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, sourcePath, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.markdown.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          moved = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = normalizeFolderPath(sourcePath.replace(/^notes\/?/, '') || 'Inbox')
        const folderName = sourceFolder.split('/').pop() || sourceFolder
        const targetFolder = normalizeFolderPath(destinationDir.replace(/^notes\/?/, '') || 'Inbox')
        const rebasedRoot = normalizeFolderPath(targetFolder === 'Inbox' ? folderName : `${targetFolder}/${folderName}`)
        const rebaseFolderPath = (folderPath: string) => {
          const normalized = normalizeFolderPath(folderPath || 'Inbox')
          if (normalized === sourceFolder) return rebasedRoot
          if (normalized.startsWith(`${sourceFolder}/`)) {
            return normalizeFolderPath(`${rebasedRoot}/${normalized.slice(sourceFolder.length + 1)}`)
          }
          return normalized
        }
        const nextNotes = context.notesRef.current.map((note) => {
          const normalized = normalizeFolderPath(note.folder || 'Inbox')
          if (normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)) return note
          return {
            ...note,
            folder: rebaseFolderPath(note.folder || 'Inbox'),
            revision: note.revision + 1,
            updated_at: now,
            last_editor_id: context.session?.user.id ?? note.last_editor_id,
          }
        })
        context.setNotes(nextNotes)
        context.rememberPersistedNotes(nextNotes)
        context.setCustomFolders((currentFolders) =>
          context.mergeFolderPaths(
            currentFolders.map((folderPath) => {
              const normalized = normalizeFolderPath(folderPath)
              if (normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)) {
                return rebaseFolderPath(normalized)
              }
              return normalized
            }),
            nextNotes.map((note) => note.folder || 'Inbox'),
          ),
        )
        if (
          context.selectedFolderPathRef.current === sourceFolder ||
          context.selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)
        ) {
          context.setSelectedFolderPath(rebaseFolderPath(context.selectedFolderPathRef.current))
        }
        context.setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      }
    } else if (sourcePath === 'diagrams' || sourcePath.startsWith('diagrams/')) {
      if (sourcePath.endsWith('.drawio')) {
        const diagramId = context.diagramIdFromManagedPath(sourcePath)
        const current = diagramId ? context.diagramsRef.current.find((entry) => entry.id === diagramId) : null
        if (!current) throw new Error('Diagram not found.')
        const folderSuffix = destinationDir.replace(/^diagrams\/?/, '')
        const nextTitle = normalizeDiagramTitlePath(
          folderSuffix ? `Diagrams/${folderSuffix}/${diagramDisplayName(current.title)}` : `Diagrams/${diagramDisplayName(current.title)}`,
        )
        const updated: Diagram = {
          ...current,
          title: nextTitle,
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: context.session?.user.id ?? current.last_editor_id,
        }
        const nextDiagrams = context.diagramsRef.current.map((entry) => (entry.id === updated.id ? updated : entry))
        context.setDiagrams(nextDiagrams)
        context.setCustomDiagramFolders((currentFolders) =>
          Array.from(
            new Set([
              ...currentFolders,
              normalizeDiagramFolderPath(current.title),
              normalizeDiagramFolderPath(updated.title),
            ]),
          ).sort((left, right) => left.localeCompare(right)),
        )
        const nextPath = diagramManagedFilePath(updated)
        context.setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, sourcePath, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.xml.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          moved = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = sourcePath.replace(/^diagrams\/?/, '')
        const folderName = sourceFolder.split('/').pop() || sourceFolder
        const targetFolder = destinationDir.replace(/^diagrams\/?/, '')
        const rebasedRoot = targetFolder ? `${targetFolder}/${folderName}` : folderName
        const rebaseTitle = (title: string) => {
          if (title === sourceFolder) return rebasedRoot
          if (title.startsWith(`${sourceFolder}/`)) {
            return `${rebasedRoot}/${title.slice(sourceFolder.length + 1)}`
          }
          return title
        }
        const nextDiagrams = context.diagramsRef.current.map((diagram) => {
          if (diagram.title !== sourceFolder && !diagram.title.startsWith(`${sourceFolder}/`)) return diagram
          return {
            ...diagram,
            title: rebaseTitle(diagram.title),
            revision: diagram.revision + 1,
            updated_at: now,
            last_editor_id: context.session?.user.id ?? diagram.last_editor_id,
          }
        })
        context.setDiagrams(nextDiagrams)
        context.setCustomDiagramFolders((currentFolders) =>
          Array.from(
            new Set(
              currentFolders.map((folderPath) => {
                if (folderPath === sourceFolder) return rebasedRoot
                if (folderPath.startsWith(`${sourceFolder}/`)) {
                  return `${rebasedRoot}/${folderPath.slice(sourceFolder.length + 1)}`
                }
                return folderPath
              }),
            ),
          ).sort((left, right) => left.localeCompare(right)),
        )
        context.setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      }
    } else if (sourcePath === 'voice' || sourcePath.startsWith('voice/')) {
      if (sourcePath.includes('.') && !sourcePath.endsWith('/')) {
        const current = context.memosRef.current.find((entry) => entry.audio_path === sourcePath)
        if (!current) throw new Error('Voice memo not found.')
        const leaf = sourcePath.split('/').pop() ?? current.audio_path
        const nextPath = `${destinationDir}/${leaf}`
        const nextMemos = context.memosRef.current.map((entry) =>
          entry.id === current.id ? { ...entry, audio_path: nextPath, updated_at: now } : entry,
        )
        context.setMemos(nextMemos)
        context.setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      } else {
        const nextMemos = context.memosRef.current.map((memo) => {
          if (memo.audio_path !== sourcePath && !memo.audio_path.startsWith(`${sourcePath}/`)) return memo
          return {
            ...memo,
            audio_path: memo.audio_path.replace(sourcePath, `${destinationDir}/${sourcePath.split('/').pop() || ''}`),
            updated_at: now,
          }
        })
        context.setMemos(nextMemos)
        context.setFilesTree((tree) => {
          const result = moveFileTreeNode(tree, sourcePath, destinationDir)
          moved = result.moved
          return result.nodes
        })
      }
    } else {
      throw new Error('Managed path is not supported for offline move.')
    }

    if (!moved) throw new Error('Could not find the item to move.')

    await queueSyncOperation({ kind: 'move_managed_path', source_path: sourcePath, destination_dir: destinationDir })
    return moved
  }

  async function renameManagedPathLocalFirst(path: string, newName: string) {
    if (getConnectivityState()) {
      return api.renameFile(path, newName)
    }
    const now = new Date().toISOString()
    let renamed: FileNode | null = null

    if (path === 'drive' || path.startsWith('drive/')) {
      context.setFilesTree((current) => {
        const result = renameFileTreeNode(current, path, newName)
        renamed = result.renamed
        return result.nodes
      })
    } else if (path === 'notes' || path.startsWith('notes/')) {
      if (path.endsWith('.md')) {
        const noteId = noteIdFromPath(path)
        const current = noteId ? context.notesRef.current.find((entry) => entry.id === noteId) : null
        if (!current) throw new Error('Note not found.')
        const updated: Note = {
          ...current,
          title: newName.trim(),
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: context.session?.user.id ?? current.last_editor_id,
        }
        const nextNotes = context.notesRef.current.map((entry) => (entry.id === updated.id ? updated : entry))
        context.setNotes(nextNotes)
        context.rememberPersistedNotes(nextNotes)
        const nextPath = noteManagedFilePath(updated)
        context.setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, path, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.markdown.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          renamed = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = normalizeFolderPath(path.replace(/^notes\/?/, '') || 'Inbox')
        const leaf = normalizeFolderPath(sourceFolder).split('/').filter(Boolean).pop() ?? sourceFolder
        const destinationFolder = normalizeFolderPath(
          [...sourceFolder.split('/').filter(Boolean).slice(0, -1), newName.trim()].join('/'),
        )
        const rebaseFolderPath = (folderPath: string) => {
          const normalized = normalizeFolderPath(folderPath || 'Inbox')
          if (normalized === sourceFolder) return destinationFolder
          if (normalized.startsWith(`${sourceFolder}/`)) {
            return normalizeFolderPath(`${destinationFolder}/${normalized.slice(sourceFolder.length + 1)}`)
          }
          return normalized
        }
        const nextNotes = context.notesRef.current.map((note) => {
          const normalized = normalizeFolderPath(note.folder || 'Inbox')
          if (normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)) return note
          return {
            ...note,
            folder: rebaseFolderPath(note.folder || 'Inbox'),
            revision: note.revision + 1,
            updated_at: now,
            last_editor_id: context.session?.user.id ?? note.last_editor_id,
          }
        })
        context.setNotes(nextNotes)
        context.rememberPersistedNotes(nextNotes)
        context.setCustomFolders((currentFolders) =>
          context.mergeFolderPaths(
            currentFolders.map((folderPath) => {
              const normalized = normalizeFolderPath(folderPath)
              if (normalized === sourceFolder || normalized.startsWith(`${sourceFolder}/`)) {
                return rebaseFolderPath(normalized)
              }
              return normalized
            }),
            nextNotes.map((note) => note.folder || 'Inbox'),
          ),
        )
        if (
          context.selectedFolderPathRef.current === sourceFolder ||
          context.selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)
        ) {
          context.setSelectedFolderPath(rebaseFolderPath(context.selectedFolderPathRef.current))
        }
        context.setFilesTree((tree) => {
          const result = renameFileTreeNode(tree, path, leaf === sourceFolder ? newName.trim() : newName.trim())
          renamed = result.renamed
          return result.nodes
        })
      }
    } else if (path === 'diagrams' || path.startsWith('diagrams/')) {
      if (path.endsWith('.drawio')) {
        const diagramId = context.diagramIdFromManagedPath(path)
        const current = diagramId ? context.diagramsRef.current.find((entry) => entry.id === diagramId) : null
        if (!current) throw new Error('Diagram not found.')
        const updated: Diagram = {
          ...current,
          title: normalizeDiagramTitlePath(`${normalizeDiagramFolderPath(current.title)}/${newName.trim()}`),
          revision: current.revision + 1,
          updated_at: now,
          last_editor_id: context.session?.user.id ?? current.last_editor_id,
        }
        const nextDiagrams = context.diagramsRef.current.map((entry) => (entry.id === updated.id ? updated : entry))
        context.setDiagrams(nextDiagrams)
        const nextPath = diagramManagedFilePath(updated)
        context.setFilesTree((tree) => {
          const result = replaceFileTreeNode(tree, path, {
            name: nextPath.split('/').pop() ?? '',
            path: nextPath,
            kind: 'file',
            size_bytes: updated.xml.length,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            children: [],
          })
          renamed = result.replaced
          return result.nodes
        })
      } else {
        const sourceFolder = path.replace(/^diagrams\/?/, '')
        const parts = sourceFolder.split('/').filter(Boolean)
        const destinationFolder = [...parts.slice(0, -1), newName.trim()].join('/')
        const nextDiagrams = context.diagramsRef.current.map((diagram) => {
          if (diagram.title !== sourceFolder && !diagram.title.startsWith(`${sourceFolder}/`)) return diagram
          return {
            ...diagram,
            title: diagram.title.replace(sourceFolder, destinationFolder),
            revision: diagram.revision + 1,
            updated_at: now,
            last_editor_id: context.session?.user.id ?? diagram.last_editor_id,
          }
        })
        context.setDiagrams(nextDiagrams)
        context.setCustomDiagramFolders((currentFolders) =>
          Array.from(
            new Set(
              currentFolders.map((folderPath) => {
                if (folderPath === sourceFolder) return destinationFolder
                if (folderPath.startsWith(`${sourceFolder}/`)) {
                  return `${destinationFolder}/${folderPath.slice(sourceFolder.length + 1)}`
                }
                return folderPath
              }),
            ),
          ).sort((left, right) => left.localeCompare(right)),
        )
        context.setFilesTree((tree) => {
          const result = renameFileTreeNode(tree, path, newName.trim())
          renamed = result.renamed
          return result.nodes
        })
      }
    } else if (path === 'voice' || path.startsWith('voice/')) {
      const nextPath = `${deriveParentPath(path) ?? 'voice'}/${newName.trim()}`
      const nextMemos = context.memosRef.current.map((memo) => {
        if (memo.audio_path !== path && !memo.audio_path.startsWith(`${path}/`)) return memo
        return {
          ...memo,
          audio_path: memo.audio_path.replace(path, nextPath),
          updated_at: now,
        }
      })
      context.setMemos(nextMemos)
      context.setFilesTree((tree) => {
        const result = renameFileTreeNode(tree, path, newName.trim())
        renamed = result.renamed
        return result.nodes
      })
    } else {
      throw new Error('Managed path is not supported for offline rename.')
    }
    if (!renamed) throw new Error('Could not find the item to rename.')

    await queueSyncOperation({ kind: 'rename_managed_path', path, new_name: newName })
    return renamed
  }

  async function deleteManagedPathLocalFirst(path: string) {
    if (getConnectivityState()) {
      await api.deleteFile(path)
      return
    }

    if (path === 'drive' || path.startsWith('drive/')) {
      context.setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else if (path === 'notes' || path.startsWith('notes/')) {
      if (path.endsWith('.md')) {
        const noteId = noteIdFromPath(path)
        if (!noteId) throw new Error('Note not found.')
        const nextNotes = deleteNoteFamily(context.notesRef.current, noteId)
        context.setNotes(nextNotes)
        context.rememberPersistedNotes(nextNotes)
        context.setSelectedNoteId((current) =>
          current && nextNotes.some((note) => note.id === current) ? current : null,
        )
      } else {
        const sourceFolder = normalizeFolderPath(path.replace(/^notes\/?/, '') || 'Inbox')
        const nextNotes = context.notesRef.current.filter((note) => {
          const normalized = normalizeFolderPath(note.folder || 'Inbox')
          return normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)
        })
        context.setNotes(nextNotes)
        context.rememberPersistedNotes(nextNotes)
        context.setCustomFolders((current) =>
          current.filter((folderPath) => {
            const normalized = normalizeFolderPath(folderPath)
            return normalized !== sourceFolder && !normalized.startsWith(`${sourceFolder}/`)
          }),
        )
        if (
          context.selectedFolderPathRef.current === sourceFolder ||
          context.selectedFolderPathRef.current.startsWith(`${sourceFolder}/`)
        ) {
          context.setSelectedFolderPath('Inbox')
        }
        context.setSelectedNoteId((current) =>
          current && nextNotes.some((note) => note.id === current) ? current : null,
        )
      }
      context.setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else if (path === 'diagrams' || path.startsWith('diagrams/')) {
      if (path.endsWith('.drawio')) {
        const diagramId = context.diagramIdFromManagedPath(path)
        if (!diagramId) throw new Error('Diagram not found.')
        const nextDiagrams = context.diagramsRef.current.filter((entry) => entry.id !== diagramId)
        context.setDiagrams(nextDiagrams)
        context.setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      } else {
        const sourceFolder = path.replace(/^diagrams\/?/, '')
        const nextDiagrams = context.diagramsRef.current.filter(
          (diagram) => diagram.title !== sourceFolder && !diagram.title.startsWith(`${sourceFolder}/`),
        )
        context.setDiagrams(nextDiagrams)
        context.setCustomDiagramFolders((current) =>
          current.filter((folderPath) => folderPath !== sourceFolder && !folderPath.startsWith(`${sourceFolder}/`)),
        )
        context.setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      }
      context.setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else if (path === 'voice' || path.startsWith('voice/')) {
      const nextMemos = context.memosRef.current.filter(
        (memo) => memo.audio_path !== path && !memo.audio_path.startsWith(`${path}/`),
      )
      context.setMemos(nextMemos)
      context.setSelectedVoiceMemoId((current) =>
        current && nextMemos.some((memo) => memo.id === current) ? current : null,
      )
      context.setFilesTree((current) => removeFileTreeNode(current, path).nodes)
    } else {
      throw new Error('Managed path is not supported for offline delete.')
    }

    await queueSyncOperation({ kind: 'delete_managed_path', path })
  }

  return {
    moveManagedPathLocalFirst,
    renameManagedPathLocalFirst,
    deleteManagedPathLocalFirst,
  }
}
