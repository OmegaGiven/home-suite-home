import type { Dispatch, SetStateAction } from 'react'
import { beginTreeDrag, draggedPathsFromEvent } from './app-shell'
import type { Diagram } from './types'

type CreateLibraryMoveActionsContext = {
  markedDiagramPaths: string[]
  markedVoicePaths: string[]
  draggingDiagramTreePath: string | null
  draggingVoiceTreePath: string | null
  diagrams: Diagram[]
  moveDriveItem: (sourcePath: string, destinationDir: string) => Promise<void>
  updateDiagramLocalFirst: (diagram: Diagram, xml: string) => Promise<Diagram>
  refreshFilesTree: () => Promise<void>
  showActionNotice: (message: string) => void
  normalizeDiagramFolderPath: (path: string) => string
  diagramDisplayName: (title: string) => string
  setDraggingDiagramTreePath: Dispatch<SetStateAction<string | null>>
  setDiagramTreeDropTargetPath: Dispatch<SetStateAction<string | null>>
  setDraggingVoiceTreePath: Dispatch<SetStateAction<string | null>>
  setVoiceTreeDropTargetPath: Dispatch<SetStateAction<string | null>>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setCustomDiagramFolders: Dispatch<SetStateAction<string[]>>
}

export function createLibraryMoveActions(context: CreateLibraryMoveActionsContext) {
  function beginDiagramTreeDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (!path.startsWith('diagram:') && path === 'Diagrams') return
    beginTreeDrag(event, path, context.setDraggingDiagramTreePath, context.markedDiagramPaths)
  }

  async function handleDiagramTreeDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePaths = draggedPathsFromEvent(event, context.draggingDiagramTreePath)
    context.setDiagramTreeDropTargetPath(null)
    context.setDraggingDiagramTreePath(null)
    if (sourcePaths.length === 0) return

    if (sourcePaths.every((path) => path.startsWith('diagram:'))) {
      const diagramIds = Array.from(new Set(sourcePaths.map((path) => path.slice('diagram:'.length))))
      const updatedDiagrams = await Promise.all(
        diagramIds.map(async (diagramId) => {
          const diagram = context.diagrams.find((entry) => entry.id === diagramId)
          if (!diagram) return null
          const currentFolder = context.normalizeDiagramFolderPath(diagram.title)
          const nextFolder = context.normalizeDiagramFolderPath(`${destinationDir}/${context.diagramDisplayName(diagram.title)}`)
          if (nextFolder === currentFolder) return null
          return context.updateDiagramLocalFirst(
            { ...diagram, title: `${destinationDir}/${context.diagramDisplayName(diagram.title)}` },
            diagram.xml,
          )
        }),
      )
      const movedDiagrams = updatedDiagrams.filter((diagram): diagram is Diagram => Boolean(diagram))
      if (movedDiagrams.length === 0) return
      const updatedById = new Map(movedDiagrams.map((diagram) => [diagram.id, diagram]))
      context.setDiagrams((current) => current.map((entry) => updatedById.get(entry.id) ?? entry))
      context.setCustomDiagramFolders((current) =>
        Array.from(new Set([...current, ...movedDiagrams.map((diagram) => context.normalizeDiagramFolderPath(diagram.title))])).sort((left, right) => left.localeCompare(right)),
      )
      await context.refreshFilesTree()
      context.showActionNotice(
        movedDiagrams.length === 1
          ? `Moved diagram: ${context.diagramDisplayName(movedDiagrams[0].title)}`
          : `Moved ${movedDiagrams.length} diagrams`,
      )
      return
    }

    const sourcePath = sourcePaths[0]
    const sourceFolder = sourcePath
    const targetFolder = destinationDir
    if (sourceFolder === 'Diagrams') return
    if (targetFolder === sourceFolder || targetFolder.startsWith(`${sourceFolder}/`)) return

    const folderName = sourceFolder.split('/').pop() || sourceFolder
    const rebasedRoot = `${targetFolder}/${folderName}`
    if (rebasedRoot === sourceFolder) return

    const rebaseTitle = (title: string) => {
      if (title === sourceFolder) return rebasedRoot
      if (title.startsWith(`${sourceFolder}/`)) {
        return `${rebasedRoot}/${title.slice(sourceFolder.length + 1)}`
      }
      return title
    }

    const affectedDiagrams = context.diagrams.filter((diagram) => {
      const currentPath = diagram.title
      return currentPath === sourceFolder || currentPath.startsWith(`${sourceFolder}/`)
    })
    const updatedDiagrams = await Promise.all(
      affectedDiagrams.map((diagram) =>
        context.updateDiagramLocalFirst(
          {
            ...diagram,
            title: rebaseTitle(diagram.title),
          },
          diagram.xml,
        ),
      ),
    )
    const updatedById = new Map(updatedDiagrams.map((diagram) => [diagram.id, diagram]))
    context.setDiagrams((current) => current.map((diagram) => updatedById.get(diagram.id) ?? diagram))
    context.setCustomDiagramFolders((current) =>
      Array.from(
        new Set(
          current.map((folderPath) => {
            if (folderPath === sourceFolder) return rebasedRoot
            if (folderPath.startsWith(`${sourceFolder}/`)) {
              return `${rebasedRoot}/${folderPath.slice(sourceFolder.length + 1)}`
            }
            return folderPath
          }),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    )
    await context.refreshFilesTree()
    context.showActionNotice(`Moved folder: ${folderName}`)
  }

  function beginVoiceTreeDrag(event: React.DragEvent<HTMLElement>, path: string) {
    if (path === 'voice') return
    beginTreeDrag(event, path, context.setDraggingVoiceTreePath, context.markedVoicePaths)
  }

  async function handleVoiceTreeDrop(event: React.DragEvent<HTMLElement>, destinationDir: string) {
    event.preventDefault()
    const sourcePaths = draggedPathsFromEvent(event, context.draggingVoiceTreePath)
    context.setVoiceTreeDropTargetPath(null)
    context.setDraggingVoiceTreePath(null)
    for (const sourcePath of sourcePaths) {
      if (!sourcePath) continue
      await context.moveDriveItem(sourcePath, destinationDir)
    }
  }

  return {
    beginDiagramTreeDrag,
    handleDiagramTreeDrop,
    beginVoiceTreeDrag,
    handleVoiceTreeDrop,
  }
}

