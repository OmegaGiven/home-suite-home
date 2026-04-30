import { useMemo } from 'react'
import type { RoutePath } from './app-config'
import type { AdminSettings, Diagram, FileNode, Note, SessionResponse, VoiceMemo } from './types'
import type { FileColumnKey } from './file-browser'
import {
  deriveDirectoryPath,
  findFileNode,
  flattenFileNodes,
  normalizeVoiceDirectoryPath,
} from './ui-helpers'

type VisibleFileColumn = {
  key: FileColumnKey
  label: string
  width: number
  min: number
  max: number
  resizable: boolean
  className?: string
}

type RolePolicy = {
  tool_scope: { notes: boolean; files: boolean; diagrams: boolean; voice: boolean; coms: boolean }
  admin_panel: boolean
  manage_users: boolean
  manage_org_settings: boolean
  customize_appearance: boolean
}

type UseAppDerivedStateArgs = {
  callJoined: boolean
  remoteParticipants: Array<{ id: string; label: string }>
  session: SessionResponse | null
  filesTree: FileNode[]
  selectedFilePath: string
  selectedVoiceMemo: VoiceMemo | null
  selectedDiagramId: string | null
  fileSearchQuery: string
  activeFilePath: string | null
  fileColumnWidths: Record<FileColumnKey, number>
  fileColumnVisibility: Record<Exclude<FileColumnKey, 'name'>, boolean>
  pendingDeletePaths: string[]
  adminSettings: AdminSettings | null
  notes: Note[]
  diagrams: Diagram[]
  memos: VoiceMemo[]
  route: RoutePath
  displayNameForFileNode: (node: FileNode) => string
  diagramIdFromManagedPath: (path: string) => string | null
}

export function useAppDerivedState(args: UseAppDerivedStateArgs) {
  const floatingCallParticipants = useMemo(
    () =>
      args.callJoined
        ? [
            { id: args.session?.user.id ?? 'local', label: args.session?.user.display_name ?? 'You' },
            ...args.remoteParticipants.map((participant) => ({ id: participant.id, label: participant.label })),
          ]
        : [],
    [args.callJoined, args.remoteParticipants, args.session?.user.display_name, args.session?.user.id],
  )

  const fileRootNode = useMemo(
    () =>
      ({
        name: 'root',
        path: '',
        kind: 'directory',
        size_bytes: null,
        created_at: null,
        updated_at: null,
        children: args.filesTree,
      }) satisfies FileNode,
    [args.filesTree],
  )

  const selectedFileNode = useMemo(
    () =>
      args.selectedFilePath === ''
        ? fileRootNode
        : findFileNode(args.filesTree, args.selectedFilePath) ?? args.filesTree[0] ?? fileRootNode,
    [fileRootNode, args.filesTree, args.selectedFilePath],
  )

  const currentDirectoryPath = useMemo(
    () => deriveDirectoryPath(selectedFileNode?.path ?? '', selectedFileNode?.kind === 'directory'),
    [selectedFileNode?.path, selectedFileNode?.kind],
  )

  const currentDirectoryNode = useMemo(
    () => (currentDirectoryPath === '' ? fileRootNode : findFileNode(args.filesTree, currentDirectoryPath)),
    [fileRootNode, args.filesTree, currentDirectoryPath],
  )

  const voiceTreeNode = useMemo(() => findFileNode(args.filesTree, 'voice') ?? null, [args.filesTree])
  const diagramsTreeNode = useMemo(() => findFileNode(args.filesTree, 'diagrams') ?? null, [args.filesTree])
  const selectedVoiceMemoNode = useMemo(
    () => (args.selectedVoiceMemo ? findFileNode(args.filesTree, args.selectedVoiceMemo.audio_path) : null),
    [args.filesTree, args.selectedVoiceMemo],
  )

  const currentVoiceFolderPath = useMemo(() => {
    const selectedPath = args.selectedVoiceMemo?.audio_path ?? args.selectedFilePath
    if (!selectedPath || !selectedPath.startsWith('voice')) return 'voice'
    const selectedNode = findFileNode(args.filesTree, selectedPath)
    const basePath = selectedNode?.kind === 'directory' ? selectedNode.path : deriveDirectoryPath(selectedPath, false)
    return normalizeVoiceDirectoryPath(basePath || 'voice')
  }, [args.filesTree, args.selectedFilePath, args.selectedVoiceMemo?.audio_path])

  const selectedVoicePath = useMemo(() => {
    if (args.selectedVoiceMemo?.audio_path) return args.selectedVoiceMemo.audio_path
    return args.selectedFilePath.startsWith('voice') ? args.selectedFilePath : null
  }, [args.selectedFilePath, args.selectedVoiceMemo?.audio_path])

  const directoryNodes = currentDirectoryNode?.children ?? []
  const allFileNodes = useMemo(() => flattenFileNodes(args.filesTree), [args.filesTree])

  const selectedDiagramPath = useMemo(
    () =>
      args.selectedDiagramId
        ? (allFileNodes.find(
            (node) =>
              node.kind === 'file' &&
              node.path.startsWith('diagrams/') &&
              args.diagramIdFromManagedPath(node.path) === args.selectedDiagramId,
          )?.path ?? null)
        : null,
    [allFileNodes, args.selectedDiagramId, args.diagramIdFromManagedPath],
  )

  const trimmedFileSearchQuery = args.fileSearchQuery.trim().toLowerCase()
  const displayedFileNodes = useMemo(() => {
    if (!trimmedFileSearchQuery) return directoryNodes
    return allFileNodes.filter(
      (node) =>
        args.displayNameForFileNode(node).toLowerCase().includes(trimmedFileSearchQuery) ||
        node.path.toLowerCase().includes(trimmedFileSearchQuery),
    )
  }, [allFileNodes, directoryNodes, trimmedFileSearchQuery, args.displayNameForFileNode])

  const activeFileNode = useMemo(
    () => findFileNode(args.filesTree, args.activeFilePath ?? '') ?? displayedFileNodes[0] ?? selectedFileNode,
    [args.filesTree, args.activeFilePath, displayedFileNodes, selectedFileNode],
  )

  const visibleFileColumns = useMemo(() => {
    const columns: Array<VisibleFileColumn & { visible: boolean }> = [
      {
        key: 'name',
        label: 'Name',
        width: args.fileColumnWidths.name,
        min: 160,
        max: 960,
        resizable: true,
        visible: true,
      },
      {
        key: 'directory',
        label: 'Directory',
        width: args.fileColumnWidths.directory,
        min: 140,
        max: 520,
        resizable: true,
        visible: !!trimmedFileSearchQuery && args.fileColumnVisibility.directory,
        className: 'file-directory-cell',
      },
      {
        key: 'type',
        label: 'Type',
        width: args.fileColumnWidths.type,
        min: 40,
        max: 180,
        resizable: true,
        visible: args.fileColumnVisibility.type,
      },
      {
        key: 'size',
        label: 'Size',
        width: args.fileColumnWidths.size,
        min: 44,
        max: 220,
        resizable: true,
        visible: args.fileColumnVisibility.size,
        className: 'file-size-cell',
      },
      {
        key: 'modified',
        label: 'Modified',
        width: args.fileColumnWidths.modified,
        min: 120,
        max: 260,
        resizable: true,
        visible: args.fileColumnVisibility.modified,
        className: 'file-modified-cell',
      },
      {
        key: 'created',
        label: 'Created',
        width: args.fileColumnWidths.created,
        min: 120,
        max: 260,
        resizable: true,
        visible: args.fileColumnVisibility.created,
        className: 'file-created-cell',
      },
    ]
    return columns.filter((column) => column.visible)
  }, [args.fileColumnVisibility, args.fileColumnWidths, trimmedFileSearchQuery])

  const fileGridTemplateColumns = useMemo(
    () => visibleFileColumns.map((column) => `minmax(${column.min}px, ${column.width}px)`).join(' '),
    [visibleFileColumns],
  )

  const pendingDeleteNodes = useMemo(
    () => args.pendingDeletePaths.map((path) => findFileNode(args.filesTree, path)).filter(Boolean) as FileNode[],
    [args.filesTree, args.pendingDeletePaths],
  )

  const currentRoleKeys = useMemo(() => {
    const assigned = args.session?.user.roles?.length ? args.session.user.roles : args.session?.user.role ? [args.session.user.role] : []
    const normalized = Array.from(new Set(assigned))
    return normalized.length ? normalized : ['member']
  }, [args.session?.user.role, args.session?.user.roles])

  const currentRolePolicy = useMemo(
    () =>
      currentRoleKeys.reduce<RolePolicy>(
        (merged, roleKey) => {
          const fallbackAdmin = roleKey === 'admin'
          const policy =
            args.adminSettings?.role_policies?.[roleKey as keyof NonNullable<typeof args.adminSettings>['role_policies']] ?? {
              tool_scope: { notes: true, files: true, diagrams: true, voice: true, coms: true },
              admin_panel: fallbackAdmin,
              manage_users: fallbackAdmin,
              manage_org_settings: fallbackAdmin,
              customize_appearance: true,
            }
          return {
            tool_scope: {
              notes: merged.tool_scope.notes || policy.tool_scope.notes,
              files: merged.tool_scope.files || policy.tool_scope.files,
              diagrams: merged.tool_scope.diagrams || policy.tool_scope.diagrams,
              voice: merged.tool_scope.voice || policy.tool_scope.voice,
              coms: merged.tool_scope.coms || policy.tool_scope.coms,
            },
            admin_panel: merged.admin_panel || policy.admin_panel,
            manage_users: merged.manage_users || policy.manage_users,
            manage_org_settings: merged.manage_org_settings || policy.manage_org_settings,
            customize_appearance: merged.customize_appearance || policy.customize_appearance,
          }
        },
        {
          tool_scope: { notes: false, files: false, diagrams: false, voice: false, coms: false },
          admin_panel: false,
          manage_users: false,
          manage_org_settings: false,
          customize_appearance: false,
        },
      ),
    [args.adminSettings?.role_policies, currentRoleKeys],
  )

  const canAccessRoute = useMemo(
    () => (path: RoutePath) => {
      switch (path) {
        case '/notes':
          return currentRolePolicy.tool_scope.notes
        case '/files':
          return currentRolePolicy.tool_scope.files
        case '/diagrams':
          return currentRolePolicy.tool_scope.diagrams
        case '/voice':
          return currentRolePolicy.tool_scope.voice
        case '/calendar':
          return true
        case '/coms':
          return currentRolePolicy.tool_scope.coms
        case '/admin':
          return currentRolePolicy.admin_panel
        case '/settings':
          return true
        default:
          return true
      }
    },
    [currentRolePolicy],
  )

  return {
    floatingCallParticipants,
    fileRootNode,
    selectedFileNode,
    currentDirectoryPath,
    currentDirectoryNode,
    voiceTreeNode,
    diagramsTreeNode,
    selectedVoiceMemoNode,
    currentVoiceFolderPath,
    selectedVoicePath,
    directoryNodes,
    allFileNodes,
    selectedDiagramPath,
    trimmedFileSearchQuery,
    displayedFileNodes,
    activeFileNode,
    visibleFileColumns,
    fileGridTemplateColumns,
    pendingDeleteNodes,
    currentRoleKeys,
    currentRolePolicy,
    canAccessRoute,
  }
}

