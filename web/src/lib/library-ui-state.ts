import { useRef, useState } from 'react'
import type { FileColumnKey } from './file-browser'

type FileColumnVisibility = Record<FileColumnKey, boolean>

export function useLibraryUiState() {
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const [customDiagramFolders, setCustomDiagramFolders] = useState<string[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string>('drive')
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [newDriveFolderName, setNewDriveFolderName] = useState('')
  const [creatingDriveFolder, setCreatingDriveFolder] = useState(false)
  const [renamingFilePath, setRenamingFilePath] = useState<string | null>(null)
  const [renameFileName, setRenameFileName] = useState('')
  const [convertingFilePath, setConvertingFilePath] = useState<string | null>(null)
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([])
  const [draggingFilePath, setDraggingFilePath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [draggingNoteTreePath, setDraggingNoteTreePath] = useState<string | null>(null)
  const [noteTreeDropTargetPath, setNoteTreeDropTargetPath] = useState<string | null>(null)
  const [draggingDiagramTreePath, setDraggingDiagramTreePath] = useState<string | null>(null)
  const [diagramTreeDropTargetPath, setDiagramTreeDropTargetPath] = useState<string | null>(null)
  const [draggingVoiceTreePath, setDraggingVoiceTreePath] = useState<string | null>(null)
  const [voiceTreeDropTargetPath, setVoiceTreeDropTargetPath] = useState<string | null>(null)
  const [markedFilePaths, setMarkedFilePaths] = useState<string[]>([])
  const [markedNotePaths, setMarkedNotePaths] = useState<string[]>([])
  const [markedDiagramPaths, setMarkedDiagramPaths] = useState<string[]>([])
  const [markedVoicePaths, setMarkedVoicePaths] = useState<string[]>([])
  const [fileHelpOpen, setFileHelpOpen] = useState(false)
  const [pendingFileKey, setPendingFileKey] = useState<string | null>(null)
  const [filePaneWidths, setFilePaneWidths] = useState({ left: 180, right: 240 })
  const [filePaneHeights, setFilePaneHeights] = useState({ top: 220, middle: 320 })
  const [filePreviewOpen, setFilePreviewOpen] = useState(true)
  const [activeSplitter, setActiveSplitter] = useState<'left' | 'right' | null>(null)
  const [fileColumnWidths, setFileColumnWidths] = useState({ name: 260, directory: 220, type: 56, size: 56, modified: 150, created: 150 })
  const [fileColumnVisibility, setFileColumnVisibility] = useState<FileColumnVisibility>({
    name: true,
    directory: true,
    type: true,
    size: true,
    modified: true,
    created: true,
  })
  const [fileColumnViewOpen, setFileColumnViewOpen] = useState(false)
  const [activeFileColumnSplitter, setActiveFileColumnSplitter] = useState<FileColumnKey | null>(null)

  const fileManagerRef = useRef<HTMLDivElement | null>(null)
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const fileSearchInputRef = useRef<HTMLInputElement | null>(null)
  const fileColumnViewRef = useRef<HTMLDivElement | null>(null)
  const filePreviewWidthRef = useRef(240)
  const fileColumnResizeRef = useRef<{
    splitter: FileColumnKey
    startX: number
    startWidths: { name: number; directory: number; type: number; size: number; modified: number; created: number }
  } | null>(null)

  return {
    customFolders,
    setCustomFolders,
    customDiagramFolders,
    setCustomDiagramFolders,
    selectedFilePath,
    setSelectedFilePath,
    activeFilePath,
    setActiveFilePath,
    fileSearchQuery,
    setFileSearchQuery,
    fileSearchOpen,
    setFileSearchOpen,
    newDriveFolderName,
    setNewDriveFolderName,
    creatingDriveFolder,
    setCreatingDriveFolder,
    renamingFilePath,
    setRenamingFilePath,
    renameFileName,
    setRenameFileName,
    convertingFilePath,
    setConvertingFilePath,
    pendingDeletePaths,
    setPendingDeletePaths,
    draggingFilePath,
    setDraggingFilePath,
    dropTargetPath,
    setDropTargetPath,
    draggingNoteTreePath,
    setDraggingNoteTreePath,
    noteTreeDropTargetPath,
    setNoteTreeDropTargetPath,
    draggingDiagramTreePath,
    setDraggingDiagramTreePath,
    diagramTreeDropTargetPath,
    setDiagramTreeDropTargetPath,
    draggingVoiceTreePath,
    setDraggingVoiceTreePath,
    voiceTreeDropTargetPath,
    setVoiceTreeDropTargetPath,
    markedFilePaths,
    setMarkedFilePaths,
    markedNotePaths,
    setMarkedNotePaths,
    markedDiagramPaths,
    setMarkedDiagramPaths,
    markedVoicePaths,
    setMarkedVoicePaths,
    fileHelpOpen,
    setFileHelpOpen,
    pendingFileKey,
    setPendingFileKey,
    filePaneWidths,
    setFilePaneWidths,
    filePaneHeights,
    setFilePaneHeights,
    filePreviewOpen,
    setFilePreviewOpen,
    activeSplitter,
    setActiveSplitter,
    fileColumnWidths,
    setFileColumnWidths,
    fileColumnVisibility,
    setFileColumnVisibility,
    fileColumnViewOpen,
    setFileColumnViewOpen,
    activeFileColumnSplitter,
    setActiveFileColumnSplitter,
    fileManagerRef,
    deleteConfirmButtonRef,
    deleteCancelButtonRef,
    renameInputRef,
    fileSearchInputRef,
    fileColumnViewRef,
    filePreviewWidthRef,
    fileColumnResizeRef,
  }
}
