import { api } from './api'
import type { DiagramEditorMode, RoutePath } from './app-config'
import type { ParsedDrawioDiagram } from './drawio-diagram'
import type { Diagram, FileNode, VoiceMemo } from './types'

type CreateFileNavigationActionsContext = {
  memos: VoiceMemo[]
  diagrams: Diagram[]
  route: RoutePath
  filesTree: FileNode[]
  fileRootNode: FileNode
  setSelectedVoiceMemoId: (value: string | null | ((current: string | null) => string | null)) => void
  setSelectedDiagramId: (value: string | null | ((current: string | null) => string | null)) => void
  setDiagramSourceFormat: (value: ParsedDrawioDiagram['sourceFormat']) => void
  setDiagramDraft: (value: string) => void
  setDiagramMode: (value: DiagramEditorMode) => void
  setDiagramDrawerOpen: (value: boolean) => void
  setRoute: (value: RoutePath) => void
  setStatus: (value: string) => void
  setSelectedFilePath: (value: string) => void
  setActiveFilePath: (value: string | null) => void
  setMarkedFilePaths: (value: string[] | ((current: string[]) => string[])) => void
  deriveParentPath: (path: string) => string | null
  diagramDisplayName: (title: string) => string
  parseDrawioDiagramXml: (xml: string) => ParsedDrawioDiagram
  findFileNode: (nodes: FileNode[], path: string) => FileNode | null
  openMarkdownInNotes: (node: FileNode) => Promise<void>
  showActionNotice: (message: string) => void
}

export function createFileNavigationActions(context: CreateFileNavigationActionsContext) {
  function isMarkdownFile(path: string) {
    return path.toLowerCase().endsWith('.md')
  }

  function openVoiceMemoInVoice(path: string) {
    const memo = context.memos.find((item) => item.audio_path === path)
    if (!memo) return false
    context.setSelectedVoiceMemoId(memo.id)
    if (context.route !== '/voice') {
      window.history.pushState({}, '', '/voice')
      context.setRoute('/voice')
    }
    context.setStatus(`Opened ${memo.title} in Voice`)
    return true
  }

  function selectVoicePath(path: string) {
    const memo = context.memos.find((item) => item.audio_path === path)
    if (memo) {
      context.setSelectedVoiceMemoId(memo.id)
    }
  }

  function diagramIdFromPath(path: string) {
    const filename = path.split('/').filter(Boolean).pop()
    if (!filename?.toLowerCase().endsWith('.drawio')) return null
    const stem = filename.slice(0, -'.drawio'.length)
    const parts = stem.split('-')
    if (parts.length < 5) return null
    return parts.slice(-5).join('-')
  }

  function openDiagramInDiagrams(path: string) {
    const diagramId = diagramIdFromPath(path)
    const diagram = diagramId ? context.diagrams.find((item) => item.id === diagramId) : null
    if (!diagram) return false
    context.setSelectedDiagramId(diagram.id)
    context.setDiagramSourceFormat(context.parseDrawioDiagramXml(diagram.xml).sourceFormat)
    context.setDiagramDraft(diagram.xml)
    context.setDiagramMode('diagram')
    context.setDiagramDrawerOpen(true)
    if (context.route !== '/diagrams') {
      window.history.pushState({}, '', '/diagrams')
      context.setRoute('/diagrams')
    }
    context.setStatus(`Opened ${context.diagramDisplayName(diagram.title)} in Diagrams`)
    return true
  }

  async function openFileNode(node: FileNode | null | undefined) {
    if (!node) return
    if (node.kind === 'directory') {
      context.setSelectedFilePath(node.path)
      return
    }
    if (node.path.startsWith('voice/')) {
      if (!openVoiceMemoInVoice(node.path)) {
        window.open(api.fileDownloadUrl(node.path), '_blank', 'noopener,noreferrer')
      }
      return
    }
    if (node.path.startsWith('diagrams/') && node.path.endsWith('.drawio')) {
      if (!openDiagramInDiagrams(node.path)) {
        window.open(api.fileDownloadUrl(node.path), '_blank', 'noopener,noreferrer')
      }
      return
    }
    if (isMarkdownFile(node.path)) {
      try {
        await context.openMarkdownInNotes(node)
      } catch (error) {
        context.setStatus(error instanceof Error ? error.message : 'Failed to open markdown in Notes')
      }
      return
    }
    window.open(api.fileDownloadUrl(node.path), '_blank', 'noopener,noreferrer')
  }

  function downloadManagedPath(path: string) {
    const link = document.createElement('a')
    link.href = api.fileDownloadUrl(path)
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function downloadManagedPaths(paths: string[]) {
    const targets = [...new Set(paths.filter(Boolean))]
    if (targets.length === 0) return
    for (const path of targets) {
      downloadManagedPath(path)
    }
    context.showActionNotice(
      targets.length === 1 ? `Downloading ${targets[0]}` : `Downloading ${targets.length} items`,
    )
  }

  function goToParentDirectory(currentDirectoryPath: string) {
    const parentPath = context.deriveParentPath(currentDirectoryPath)
    if (parentPath !== null) {
      context.setSelectedFilePath(parentPath)
    }
  }

  function selectFileTreeNode(path: string) {
    context.setSelectedFilePath(path)
    const node = path === '' ? context.fileRootNode : context.findFileNode(context.filesTree, path)
    context.setActiveFilePath(node?.kind === 'file' ? path : null)
  }

  function toggleMarkedPath(path: string | null | undefined) {
    if (!path) return
    context.setMarkedFilePaths((current) =>
      current.includes(path) ? current.filter((value) => value !== path) : [...current, path],
    )
  }

  return {
    selectVoicePath,
    openVoiceMemoInVoice,
    diagramIdFromPath,
    openDiagramInDiagrams,
    openFileNode,
    downloadManagedPath,
    downloadManagedPaths,
    goToParentDirectory,
    selectFileTreeNode,
    toggleMarkedPath,
  }
}
