import type { Dispatch, KeyboardEvent, MutableRefObject, SetStateAction } from 'react'
import { api } from './api'
import { getConnectivityState } from './platform'
import { filterVisibleNotes } from './notes-runtime'
import type { NoteContextMenuState, NoteContextSubmenu, NoteEditorMode } from './app-config'
import type { ShareTarget } from './share-actions'

type CreateNotesPageActionsContext = {
  selectedFolderPath: string
  selectedNote: import('./types').Note | null
  notesRef: MutableRefObject<import('./types').Note[]>
  noteDraftRef: MutableRefObject<string>
  adminConfirmDelete: boolean
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  setSelectedFolderPath: Dispatch<SetStateAction<string>>
  setNotes: Dispatch<SetStateAction<import('./types').Note[]>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setNoteTitleModalOpen: Dispatch<SetStateAction<boolean>>
  setNoteDrawerOpen: Dispatch<SetStateAction<boolean>>
  setActiveNoteSplitter: Dispatch<SetStateAction<boolean>>
  setMarkedNotePaths: Dispatch<SetStateAction<string[]>>
  setDraggingNoteTreePath: Dispatch<SetStateAction<string | null>>
  setNoteTreeDropTargetPath: Dispatch<SetStateAction<string | null>>
  setNoteFullscreen: Dispatch<SetStateAction<boolean>>
  setNoteEditorMode: Dispatch<SetStateAction<NoteEditorMode>>
  setNoteContextMenu: Dispatch<SetStateAction<NoteContextMenuState>>
  setNoteContextSubmenu: Dispatch<SetStateAction<NoteContextSubmenu>>
  createManagedFolderLocalFirst: (path: string) => Promise<unknown>
  createNoteLocalFirst: (title: string, folder: string, markdown: string) => Promise<import('./types').Note>
  renameManagedPathLocalFirst: (path: string, newName: string) => Promise<{ path: string }>
  rememberPersistedNotes: (notes: import('./types').Note[]) => void
  refreshFilesTree: () => Promise<unknown>
  mergeFolderPaths: (current: string[], incoming: string[]) => string[]
  normalizeFolderPath: (path: string) => string
  managedPathForNoteFolder: (path: string) => string
  rebaseFolderEntries: (paths: string[], sourcePath: string, renamedPath: string) => string[]
  applySelectedNoteMarkdown: (markdown: string, options?: { note?: import('./types').Note | null }) => void
  currentNoteMarkdown: () => string
  scheduleNoteDraftBroadcast: (markdown: string) => void
  createNote: () => void
  openNoteInNotes: (note: import('./types').Note) => Promise<void>
  beginNoteTreeDrag: (event: React.DragEvent<HTMLElement>, path: string) => void
  handleNoteTreeDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  saveNote: () => Promise<boolean>
  deleteSelectedNote: () => Promise<unknown>
  restoreUserDeletedItem: (id: string) => Promise<void>
  openShareDialog: (target: import('./share-actions').ShareTarget) => Promise<void>
  resourceKeyForNote: (noteId: string) => string
  handleTextareaTabKeyDown: (
    event: KeyboardEvent<HTMLTextAreaElement>,
    setValue: Dispatch<SetStateAction<string>>,
    onNextValue?: (value: string) => void,
  ) => void
  showActionNotice: (message: string) => void
}

export function createNotesPageActions(context: CreateNotesPageActionsContext) {
  return {
    onCreateNote: () => void context.createNote(),
    onCreateFolder: (name: string, parentPath: string | null) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const nextPath = context.normalizeFolderPath(parentPath ? `${parentPath}/${trimmed}` : trimmed)
      void (async () => {
        await context.createManagedFolderLocalFirst(context.managedPathForNoteFolder(nextPath))
        context.setCustomFolders((current) => context.mergeFolderPaths(current, [nextPath]))
        context.setSelectedFolderPath(nextPath)
        await context.refreshFilesTree()
        context.showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onUploadFile: (file: File) => {
      void (async () => {
        const markdown = await file.text()
        const leaf = file.name.replace(/\.[^.]+$/, '') || 'Imported note'
        const note = await context.createNoteLocalFirst(leaf, context.selectedFolderPath || 'Inbox', markdown)
        context.setNotes((current) => [note, ...current])
        context.setCustomFolders((current) => context.mergeFolderPaths(current, [note.folder || 'Inbox']))
        context.rememberPersistedNotes([note, ...context.notesRef.current])
        context.setSelectedFolderPath(note.folder || 'Inbox')
        context.setSelectedNoteId(note.id)
        await context.refreshFilesTree()
        context.showActionNotice(`Imported note: ${leaf}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'Inbox') return
      void (async () => {
        const renamed = await context.renameManagedPathLocalFirst(context.managedPathForNoteFolder(path), trimmed)
        const nextPath = renamed.path.replace(/^notes\//, '')
        if (getConnectivityState()) {
          const nextNotes = filterVisibleNotes(await api.listNotes())
          context.rememberPersistedNotes(nextNotes)
          context.setNotes(nextNotes)
          context.setCustomFolders((current) => context.rebaseFolderEntries(current, path, nextPath))
          context.setSelectedFolderPath((current) =>
            current === path || current.startsWith(`${path}/`) ? `${nextPath}${current.slice(path.length)}` : current,
          )
        }
        await context.refreshFilesTree()
        context.showActionNotice(`Renamed folder to ${trimmed}`)
      })()
    },
    onSelectFolderPath: context.setSelectedFolderPath,
    onSetActiveNoteSplitter: context.setActiveNoteSplitter,
    onToggleNoteDrawer: () => context.setNoteDrawerOpen((current) => !current),
    onSelectNote: (note: import('./types').Note) => {
      void context.openNoteInNotes(note)
    },
    onSetMarkedPaths: context.setMarkedNotePaths,
    onDragStart: context.beginNoteTreeDrag,
    onDragEnd: () => {
      context.setDraggingNoteTreePath(null)
      context.setNoteTreeDropTargetPath(null)
    },
    onDropTargetChange: context.setNoteTreeDropTargetPath,
    onDrop: context.handleNoteTreeDrop,
    onOpenTitleModal: () => context.setNoteTitleModalOpen(true),
    onCloseTitleModal: () => context.setNoteTitleModalOpen(false),
    onChangeSelectedNoteTitle: (value: string) => {
      if (!context.selectedNote) return
      const nextSelectedNote = { ...context.selectedNote, title: value }
      context.applySelectedNoteMarkdown(context.currentNoteMarkdown(), { note: nextSelectedNote })
      window.requestAnimationFrame(() => context.scheduleNoteDraftBroadcast(context.currentNoteMarkdown()))
    },
    onRequestSave: () => void context.saveNote(),
    onDeleteNote: () => void context.deleteSelectedNote(),
    onRestoreDeletedNote: (id: string) => void context.restoreUserDeletedItem(id),
    confirmNoteDelete: context.adminConfirmDelete,
    onEnterFullscreen: () => context.setNoteFullscreen(true),
    onExitFullscreen: () => context.setNoteFullscreen(false),
    onOpenShareDialog: (target: ShareTarget) => void context.openShareDialog(target),
    resourceKeyForNote: context.resourceKeyForNote,
    onSetNoteEditorMode: context.setNoteEditorMode,
    onRawDraftChange: (value: string) => {
      context.applySelectedNoteMarkdown(value, { note: context.selectedNote })
      context.scheduleNoteDraftBroadcast(value)
    },
    onRawDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) =>
      context.handleTextareaTabKeyDown(
        event,
        (value) => {
          const nextValue = typeof value === 'function' ? value(context.noteDraftRef.current) : value
          context.applySelectedNoteMarkdown(nextValue, { note: context.selectedNote })
        },
        context.scheduleNoteDraftBroadcast,
      ),
  }
}

type CreateDiagramsPageActionsContext = {
  selectedDiagram: import('./types').Diagram | null
  selectedDiagramId: string | null
  setCustomDiagramFolders: Dispatch<SetStateAction<string[]>>
  setDiagrams: Dispatch<SetStateAction<import('./types').Diagram[]>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  setDraggingDiagramTreePath: Dispatch<SetStateAction<string | null>>
  setDiagramTreeDropTargetPath: Dispatch<SetStateAction<string | null>>
  setActiveDiagramSplitter: Dispatch<SetStateAction<boolean>>
  setDiagramDrawerOpen: Dispatch<SetStateAction<boolean>>
  setDiagramDraft: Dispatch<SetStateAction<string>>
  createManagedFolderLocalFirst: (path: string) => Promise<unknown>
  createDiagramLocalFirst: (title: string, xml: string) => Promise<import('./types').Diagram>
  renameManagedPathLocalFirst: (path: string, newName: string) => Promise<{ path: string }>
  refreshFilesTree: () => Promise<unknown>
  createDiagram: () => void
  beginDiagramTreeDrag: (event: React.DragEvent<HTMLElement>, path: string) => void
  handleDiagramTreeDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  setDiagramMode: (mode: import('./app-config').DiagramEditorMode) => void
  saveDiagram: () => Promise<void>
  persistDiagramXml: (xml: string) => Promise<void>
  restoreUserDeletedItem: (id: string) => Promise<void>
  showActionNotice: (message: string) => void
  normalizeDiagramDirectoryPath: (path: string) => string
  normalizeDiagramTitlePath: (path: string) => string
  normalizeDiagramFolderPath: (path: string) => string
  managedPathForDiagramFolder: (path: string) => string
  diagramIdFromPath: (path: string) => string | null
  rebaseFolderEntries: (paths: string[], sourcePath: string, renamedPath: string) => string[]
  handleTextareaTabKeyDown: (
    event: KeyboardEvent<HTMLTextAreaElement>,
    setValue: Dispatch<SetStateAction<string>>,
    onNextValue?: (value: string) => void,
  ) => void
  getStandaloneDrawioUrl: typeof import('../components/DrawioDiagramEditor').getStandaloneDrawioUrl
  standaloneDrawioWindowRef: MutableRefObject<Window | null>
  standaloneDrawioEditingIdRef: MutableRefObject<string | null>
}

export function createDiagramsPageActions(context: CreateDiagramsPageActionsContext) {
  return {
    onCreateDiagram: () => void context.createDiagram(),
    onCreateFolder: (name: string, parentPath: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const nextPath = context.normalizeDiagramDirectoryPath(`${parentPath}/${trimmed}`)
      void (async () => {
        await context.createManagedFolderLocalFirst(context.managedPathForDiagramFolder(nextPath))
        context.setCustomDiagramFolders((current) =>
          Array.from(new Set([...current, nextPath])).sort((left, right) => left.localeCompare(right)),
        )
        await context.refreshFilesTree()
        context.showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onUploadFile: (file: File) => {
      void (async () => {
        const xml = await file.text()
        const leaf = file.name.replace(/\.[^.]+$/, '') || 'Imported diagram'
        const title = context.normalizeDiagramTitlePath(
          `${context.selectedDiagram ? context.normalizeDiagramFolderPath(context.selectedDiagram.title) : 'Diagrams'}/${leaf}`,
        )
        const diagram = await context.createDiagramLocalFirst(title, xml)
        context.setDiagrams((current) => [diagram, ...current])
        context.setSelectedDiagramId(diagram.id)
        await context.refreshFilesTree()
        context.showActionNotice(`Imported diagram: ${leaf}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'Diagrams') return
      void (async () => {
        const renamed = await context.renameManagedPathLocalFirst(context.managedPathForDiagramFolder(path), trimmed)
        const nextPath = renamed.path.replace(/^diagrams\/?/, '')
        const normalizedNextPath = nextPath ? `Diagrams/${nextPath}` : 'Diagrams'
        if (getConnectivityState()) {
          const nextDiagrams = await api.listDiagrams()
          context.setDiagrams(nextDiagrams)
          context.setCustomDiagramFolders((current) => context.rebaseFolderEntries(current, path, normalizedNextPath))
        }
        await context.refreshFilesTree()
        context.showActionNotice(`Renamed folder to ${trimmed}`)
      })()
    },
    onSelectDiagram: context.setSelectedDiagramId,
    onOpenStandaloneDrawio: () => {
      if (!context.selectedDiagram) return
      const popup = window.open(context.getStandaloneDrawioUrl(), '_blank')
      if (!popup) {
        context.showActionNotice('Allow popups to open draw.io')
        return
      }
      context.standaloneDrawioWindowRef.current = popup
      context.standaloneDrawioEditingIdRef.current = context.selectedDiagram.id
      popup.focus()
    },
    onSelectDiagramPath: (path: string) => {
      const diagramId = context.diagramIdFromPath(path)
      if (diagramId) {
        context.setSelectedDiagramId(diagramId)
      }
    },
    onDragStart: context.beginDiagramTreeDrag,
    onDragEnd: () => {
      context.setDraggingDiagramTreePath(null)
      context.setDiagramTreeDropTargetPath(null)
    },
    onDropTargetChange: context.setDiagramTreeDropTargetPath,
    onDrop: context.handleDiagramTreeDrop,
    onSetActiveDiagramSplitter: context.setActiveDiagramSplitter,
    onToggleDiagramDrawer: () => context.setDiagramDrawerOpen((current) => !current),
    onChangeSelectedDiagramTitle: (value: string) => {
      if (!context.selectedDiagram) return
      context.setDiagrams((current) =>
        current.map((diagram) => (diagram.id === context.selectedDiagram!.id ? { ...diagram, title: value } : diagram)),
      )
    },
    onSetDiagramMode: context.setDiagramMode,
    onSaveDiagram: () => void context.saveDiagram(),
    onChangeDiagramDraft: context.setDiagramDraft,
    onDiagramDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) =>
      context.handleTextareaTabKeyDown(event, context.setDiagramDraft),
    onPersistDiagramXml: (xml: string) => void context.persistDiagramXml(xml),
    onRestoreDeletedDiagram: (id: string) => void context.restoreUserDeletedItem(id),
  }
}

type CreateVoicePageActionsContext = {
  memosRef: MutableRefObject<import('./types').VoiceMemo[]>
  adminConfirmDelete: boolean
  setDraggingVoiceTreePath: Dispatch<SetStateAction<string | null>>
  setVoiceTreeDropTargetPath: Dispatch<SetStateAction<string | null>>
  setActiveVoiceSplitter: Dispatch<SetStateAction<boolean>>
  setVoiceDrawerOpen: Dispatch<SetStateAction<boolean>>
  setMemos: Dispatch<SetStateAction<import('./types').VoiceMemo[]>>
  createManagedFolderLocalFirst: (path: string) => Promise<unknown>
  renameManagedPathLocalFirst: (path: string, newName: string) => Promise<{ path: string }>
  refreshFilesTree: () => Promise<unknown>
  beginVoiceTreeDrag: (event: React.DragEvent<HTMLElement>, path: string) => void
  handleVoiceTreeDrop: (event: React.DragEvent<HTMLElement>, destinationDir: string) => Promise<void>
  openRecorderPanel: () => void
  uploadAudioFile: (file: File) => Promise<void>
  pollTranscript: (memo: import('./types').VoiceMemo) => Promise<void>
  renamePendingVoiceUploadLocalFirst: (memoId: string, title: string) => Promise<unknown>
  deletePendingVoiceUploadLocalFirst: (memoId: string) => Promise<void>
  deleteVoiceMemo: (memoId: string) => Promise<void>
  restoreUserDeletedItem: (id: string) => Promise<void>
  showActionNotice: (message: string) => void
  normalizeVoiceDirectoryPath: (path: string) => string
  managedPathForVoiceFolder: (path: string) => string
}

export function createVoicePageActions(context: CreateVoicePageActionsContext) {
  return {
    onCreateFolder: (name: string, parentPath: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const nextPath = context.normalizeVoiceDirectoryPath(`${parentPath}/${trimmed}`)
      void (async () => {
        await context.createManagedFolderLocalFirst(context.managedPathForVoiceFolder(nextPath))
        await context.refreshFilesTree()
        context.showActionNotice(`Created folder: ${trimmed}`)
      })()
    },
    onRenameFolder: (name: string, path: string) => {
      const trimmed = name.trim()
      if (!trimmed || path === 'voice') return
      void (async () => {
        await context.renameManagedPathLocalFirst(context.managedPathForVoiceFolder(path), trimmed)
        await context.refreshFilesTree()
        context.showActionNotice(`Renamed folder to ${trimmed}`)
      })()
    },
    onDragStart: context.beginVoiceTreeDrag,
    onDragEnd: () => {
      context.setDraggingVoiceTreePath(null)
      context.setVoiceTreeDropTargetPath(null)
    },
    onDropTargetChange: context.setVoiceTreeDropTargetPath,
    onDrop: context.handleVoiceTreeDrop,
    onStartVoiceResize: () => context.setActiveVoiceSplitter(true),
    onToggleVoiceDrawer: () => context.setVoiceDrawerOpen((current) => !current),
    onOpenRecorder: context.openRecorderPanel,
    onUploadAudioFile: (file: File) => void context.uploadAudioFile(file),
    onPollTranscript: (memo: import('./types').VoiceMemo) => void context.pollTranscript(memo),
    onRenameVoiceMemo: async (memoId: string, title: string) => {
      const localMemo = context.memosRef.current.find((entry) => entry.id === memoId)
      if (localMemo?.local_only) {
        await context.renamePendingVoiceUploadLocalFirst(memoId, title)
        return
      }
      const memo = await api.updateVoiceMemo(memoId, title)
      context.setMemos((current) => current.map((entry) => (entry.id === memo.id ? memo : entry)))
      await context.refreshFilesTree()
      context.showActionNotice(`Renamed memo to ${title}`)
    },
    onDeleteVoiceMemo: async (memoId: string) => {
      const localMemo = context.memosRef.current.find((entry) => entry.id === memoId)
      if (localMemo?.local_only) {
        await context.deletePendingVoiceUploadLocalFirst(memoId)
        return
      }
      await context.deleteVoiceMemo(memoId)
    },
    onRestoreDeletedVoiceMemo: (id: string) => void context.restoreUserDeletedItem(id),
    confirmVoiceDelete: context.adminConfirmDelete,
  }
}
