import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { api } from './api'
import { canConvertManagedPath, canDeleteManagedPath, canRenameManagedPath, convertibleTextExtension, normalizeManagedDeletePaths } from './file-browser'
import { getConnectivityState } from './platform'
import type { Diagram, FileNode, Note, VoiceMemo } from './types'

type CreateFileMutationActionsContext = {
  notes: Note[]
  memos: VoiceMemo[]
  diagrams: Diagram[]
  currentDirectoryPath: string
  selectedFileNode: FileNode | null
  selectedFilePath: string
  activeFilePath: string | null
  currentRoleIsAdmin: boolean
  confirmFileDelete: boolean
  newDriveFolderName: string
  activeFileNode: FileNode | null
  setStatus: Dispatch<SetStateAction<string>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setSelectedVoiceMemoId: Dispatch<SetStateAction<string | null>>
  setNewDriveFolderName: Dispatch<SetStateAction<string>>
  setCreatingDriveFolder: Dispatch<SetStateAction<boolean>>
  setSelectedFilePath: Dispatch<SetStateAction<string>>
  setPendingDeletePaths: Dispatch<SetStateAction<string[]>>
  setRenamingFilePath: Dispatch<SetStateAction<string | null>>
  setRenameFileName: Dispatch<SetStateAction<string>>
  setConvertingFilePath: Dispatch<SetStateAction<string | null>>
  setActiveFilePath: Dispatch<SetStateAction<string | null>>
  setMarkedFilePaths: Dispatch<SetStateAction<string[]>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  createManagedFolderRecord: (path: string) => Promise<FileNode>
  moveManagedPathRecord: (sourcePath: string, destinationDir: string) => Promise<FileNode>
  renameManagedPathRecord: (path: string, newName: string) => Promise<FileNode>
  deleteManagedPathRecord: (path: string) => Promise<void>
  uploadManagedFileRecord: (path: string, file: Blob, filename: string) => Promise<FileNode>
  refreshFilesTree: () => Promise<void>
  rememberPersistedNotes: (nextNotes: Note[]) => void
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  noteIdFromPath: (path: string) => string | null
  diagramIdFromPath: (path: string) => string | null
  diagramDisplayName: (title: string) => string
  deriveParentPath: (path: string) => string | null
  showActionNotice: (message: string) => void
}

export function createFileMutationActions(context: CreateFileMutationActionsContext) {
  function managedRootForPath(path: string | null | undefined) {
    if (!path) return null
    if (path === 'drive' || path.startsWith('drive/')) return 'drive'
    if (path === 'notes' || path.startsWith('notes/')) return 'notes'
    if (path === 'diagrams' || path.startsWith('diagrams/')) return 'diagrams'
    if (path === 'voice' || path.startsWith('voice/')) return 'voice'
    return null
  }

  async function deleteVoiceMemo(memoId: string) {
    const memo = context.memos.find((entry) => entry.id === memoId)
    await api.deleteVoiceMemo(memoId)
    const nextMemos = await api.listVoiceMemos()
    context.setMemos(nextMemos)
    context.setSelectedVoiceMemoId((current) => {
      if (current && nextMemos.some((nextMemo) => nextMemo.id === current)) {
        return current
      }
      return nextMemos[0]?.id ?? null
    })
    await context.refreshFilesTree()
    context.showActionNotice(`Deleted memo: ${memo?.title || memoId}`)
  }

  async function createDriveFolderFromSelection() {
    const cleaned = context.newDriveFolderName.trim()
    if (!cleaned) return
    const selectedDirectoryPath =
      context.selectedFileNode?.kind === 'directory' ? context.selectedFileNode.path : context.currentDirectoryPath
    const basePath = selectedDirectoryPath && managedRootForPath(selectedDirectoryPath)
      ? selectedDirectoryPath
      : managedRootForPath(context.currentDirectoryPath)
        ? context.currentDirectoryPath
        : 'drive'
    const nextPath = basePath === 'drive' ? cleaned : `${basePath}/${cleaned}`
    await context.createManagedFolderRecord(nextPath)
    context.setNewDriveFolderName('')
    context.setCreatingDriveFolder(false)
    context.setSelectedFilePath(nextPath)
    await context.refreshFilesTree()
  }

  async function handleDriveUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const basePath =
      context.selectedFileNode?.kind === 'directory' && context.selectedFileNode.path.startsWith('drive')
        ? context.selectedFileNode.path
        : 'drive'
    await context.uploadManagedFileRecord(basePath, file, file.name)
    event.target.value = ''
  }

  async function moveDriveItem(sourcePath: string, destinationDir: string) {
    const sameArea =
      (sourcePath === 'drive' || sourcePath.startsWith('drive/')) &&
      (destinationDir === 'drive' || destinationDir.startsWith('drive/'))
        ? 'drive'
        : (sourcePath === 'notes' || sourcePath.startsWith('notes/')) &&
            (destinationDir === 'notes' || destinationDir.startsWith('notes/'))
          ? 'notes'
          : (sourcePath === 'diagrams' || sourcePath.startsWith('diagrams/')) &&
              (destinationDir === 'diagrams' || destinationDir.startsWith('diagrams/'))
            ? 'diagrams'
            : (sourcePath === 'voice' || sourcePath.startsWith('voice/')) &&
                (destinationDir === 'voice' || destinationDir.startsWith('voice/'))
              ? 'voice'
            : null

    if (!sameArea) {
      context.setStatus('Moves must stay within drive/, notes/, diagrams/, or voice/')
      return
    }
    if (sourcePath === destinationDir || destinationDir.startsWith(`${sourcePath}/`)) {
      return
    }
    const moved = await context.moveManagedPathRecord(sourcePath, destinationDir)
    if (context.selectedFilePath === sourcePath) {
      context.setSelectedFilePath(moved.path)
    } else if (context.selectedFilePath.startsWith(`${sourcePath}/`)) {
      context.setSelectedFilePath(`${moved.path}${context.selectedFilePath.slice(sourcePath.length)}`)
    }
    if (sameArea === 'notes') {
      if (getConnectivityState()) {
        const nextNotes = await api.listNotes()
        context.rememberPersistedNotes(nextNotes)
        context.setNotes(nextNotes)
        context.setCustomFolders((current) => context.mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
      }
    }
    if (sameArea === 'diagrams') {
      if (getConnectivityState()) {
        const nextDiagrams = await api.listDiagrams()
        context.setDiagrams(nextDiagrams)
        context.setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      }
    }
    if (sameArea === 'voice') {
      if (getConnectivityState()) {
        const nextMemos = await api.listVoiceMemos()
        context.setMemos(nextMemos)
        context.setSelectedVoiceMemoId((current) =>
          current && nextMemos.some((memo) => memo.id === current) ? current : null,
        )
      }
    }
    await context.refreshFilesTree()
  }

  function canDeleteFilePath(path: string | null | undefined) {
    return canDeleteManagedPath(path)
  }

  function normalizedDeletePaths(paths: string[]) {
    return normalizeManagedDeletePaths(paths)
  }

  function requestDeletePaths(paths: string[]) {
    const deletable = normalizedDeletePaths(paths)
    if (deletable.length === 0) return
    if (context.confirmFileDelete) {
      context.setPendingDeletePaths(deletable)
      return
    }
    void deleteManagedPaths(deletable)
  }

  function canRenameFilePath(path: string | null | undefined) {
    return canRenameManagedPath(path)
  }

  function canConvertFilePath(path: string | null | undefined) {
    return canConvertManagedPath(path, context.currentRoleIsAdmin)
  }

  function baseNameForPath(path: string) {
    if (path.startsWith('notes/') && path.endsWith('.md')) {
      const noteId = context.noteIdFromPath(path)
      const note = noteId ? context.notes.find((item) => item.id === noteId) : null
      if (note) return note.title
    }
    if (path.startsWith('diagrams/') && path.endsWith('.drawio')) {
      const diagramId = context.diagramIdFromPath(path)
      const diagram = diagramId ? context.diagrams.find((item) => item.id === diagramId) : null
      if (diagram) return context.diagramDisplayName(diagram.title)
    }
    const name = path.split('/').filter(Boolean).pop() ?? ''
    return name.replace(/\.md$/i, '').replace(/\.drawio$/i, '')
  }

  function beginRenameCurrentFile() {
    if (!context.activeFileNode || !canRenameFilePath(context.activeFileNode.path)) return
    context.setRenamingFilePath(context.activeFileNode.path)
    context.setRenameFileName(baseNameForPath(context.activeFileNode.path))
  }

  async function convertManagedTextFile(path: string) {
    const targetExtension = convertibleTextExtension(path)
    if (!targetExtension) return
    const parent = context.deriveParentPath(path)
    const currentName = path.split('/').filter(Boolean).pop() ?? ''
    const nextName = `${currentName.replace(/\.[^.]+$/i, '')}.${targetExtension}`
    const content = await api.fileText(path)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    await api.uploadFile(parent || 'drive', blob, nextName)
    await api.deleteFile(path)
    if (context.selectedFilePath === path) {
      context.setSelectedFilePath(`${parent ? `${parent}/` : ''}${nextName}`)
    }
    if (context.activeFilePath === path) {
      context.setActiveFilePath(`${parent ? `${parent}/` : ''}${nextName}`)
    }
    context.setMarkedFilePaths((current) => current.filter((currentPath) => currentPath !== path))
    await context.refreshFilesTree()
    context.setConvertingFilePath(null)
    context.showActionNotice(`Converted to .${targetExtension}`)
  }

  async function renameManagedPath(path: string, newName: string) {
    const cleaned = newName.trim()
    if (!cleaned) return
    const renamed = await context.renameManagedPathRecord(path, cleaned)
    if (context.selectedFilePath === path) {
      context.setSelectedFilePath(renamed.path)
    } else if (context.selectedFilePath.startsWith(`${path}/`)) {
      context.setSelectedFilePath(`${renamed.path}${context.selectedFilePath.slice(path.length)}`)
    }
    if (context.activeFilePath === path) {
      context.setActiveFilePath(renamed.path)
    } else if (context.activeFilePath?.startsWith(`${path}/`)) {
      context.setActiveFilePath(`${renamed.path}${context.activeFilePath.slice(path.length)}`)
    }
    context.setMarkedFilePaths((current) =>
      current.map((currentPath) =>
        currentPath === path || currentPath.startsWith(`${path}/`)
          ? `${renamed.path}${currentPath.slice(path.length)}`
          : currentPath,
      ),
    )
    if (path.startsWith('notes/')) {
      if (getConnectivityState()) {
        const nextNotes = await api.listNotes()
        context.rememberPersistedNotes(nextNotes)
        context.setNotes(nextNotes)
        context.setCustomFolders((current) => context.mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
        context.setSelectedNoteId((current) => (current && nextNotes.some((note) => note.id === current) ? current : null))
      }
    }
    if (path.startsWith('voice/')) {
      if (getConnectivityState()) {
        const nextMemos = await api.listVoiceMemos()
        context.setMemos(nextMemos)
        context.setSelectedVoiceMemoId((current) => (current && nextMemos.some((memo) => memo.id === current) ? current : null))
      }
    }
    if (path.startsWith('diagrams/')) {
      if (getConnectivityState()) {
        const nextDiagrams = await api.listDiagrams()
        context.setDiagrams(nextDiagrams)
        context.setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      }
    }
    await context.refreshFilesTree()
    context.setRenamingFilePath(null)
    context.setRenameFileName('')
    context.showActionNotice(`Renamed to ${renamed.name}`)
  }

  async function deleteManagedPaths(paths: string[]) {
    const deletable = normalizedDeletePaths(paths).sort((left, right) => right.length - left.length)
    if (deletable.length === 0) return
    for (const path of deletable) {
      await context.deleteManagedPathRecord(path)
    }

    const affectedRoots = new Set(
      deletable.map((path) =>
        path.startsWith('notes/') ? 'notes' : path.startsWith('diagrams/') ? 'diagrams' : 'drive',
      ),
    )

    if (deletable.some((path) => path === context.selectedFilePath || context.selectedFilePath.startsWith(`${path}/`))) {
      const fallbackPath =
        context.deriveParentPath(
          deletable.find((path) => path === context.selectedFilePath || context.selectedFilePath.startsWith(`${path}/`)) ?? '',
        ) ?? 'drive'
      context.setSelectedFilePath(fallbackPath)
    }
    if (
      deletable.some(
        (path) => path === context.activeFilePath || (context.activeFilePath?.startsWith(`${path}/`) ?? false),
      )
    ) {
      context.setActiveFilePath(null)
    }
    context.setMarkedFilePaths((current) =>
      current.filter((path) => !deletable.some((deleted) => path === deleted || path.startsWith(`${deleted}/`))),
    )
    if (affectedRoots.has('notes')) {
      if (getConnectivityState()) {
        const nextNotes = await api.listNotes()
        context.rememberPersistedNotes(nextNotes)
        context.setNotes(nextNotes)
        context.setSelectedNoteId((current) =>
          current && nextNotes.some((note) => note.id === current) ? current : null,
        )
        context.setCustomFolders((current) => context.mergeFolderPaths(current, nextNotes.map((note) => note.folder || 'Inbox')))
      }
    }
    if (affectedRoots.has('diagrams')) {
      if (getConnectivityState()) {
        const nextDiagrams = await api.listDiagrams()
        context.setDiagrams(nextDiagrams)
        context.setSelectedDiagramId((current) =>
          current && nextDiagrams.some((diagram) => diagram.id === current) ? current : null,
        )
      }
    }
    await context.refreshFilesTree()
    context.setPendingDeletePaths([])
    context.showActionNotice(
      deletable.length === 1 ? `Deleted ${deletable[0]}` : `Deleted ${deletable.length} items`,
    )
  }

  return {
    deleteVoiceMemo,
    createDriveFolderFromSelection,
    handleDriveUpload,
    moveDriveItem,
    canDeleteFilePath,
    normalizedDeletePaths,
    requestDeletePaths,
    canRenameFilePath,
    canConvertFilePath,
    baseNameForPath,
    beginRenameCurrentFile,
    convertManagedTextFile,
    renameManagedPath,
    deleteManagedPaths,
  }
}
