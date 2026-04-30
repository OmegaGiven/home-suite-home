import type {
  AdminAuditEntry,
  AdminDatabaseOverview,
  AdminDeletedItem,
  AdminSettings,
  AdminStorageOverview,
  AdminUserSummary,
  OidcConfig,
  SystemUpdateStatus,
  UpdateUserAccessRequest,
} from './types'

type BuildAdminPagePropsArgs = {
  isAdmin: boolean
  canManageUsers: boolean
  canManageOrgSettings: boolean
  settings: AdminSettings | null
  users: AdminUserSummary[]
  storageOverview: AdminStorageOverview | null
  databaseOverview: AdminDatabaseOverview | null
  deletedItems: AdminDeletedItem[]
  auditEntries: AdminAuditEntry[]
  currentFontFamily: string
  currentAccent: string
  currentPageGutter: number
  currentRadius: number
  oidcConfig: OidcConfig | null
  systemUpdateStatus: SystemUpdateStatus | null
  onRefreshDatabaseOverview: () => void
  onRefreshDeletedItems: () => void
  onRefreshAuditEntries: () => void
  onRestoreDeletedItem: (id: string) => void
  onSave: (settings: AdminSettings) => void
  onRefreshSystemUpdateStatus: () => void
  onRunSystemUpdate: () => void
  onApplyCurrentAppearance: () => void
  onCreateUser: (payload: {
    username: string
    email: string
    display_name: string
    password: string
    role: string
    roles: string[]
    storage_limit_mb: number
  }) => Promise<void>
  onResetPassword: (userId: string, password: string) => void
  onUpdateUserAccess: (userId: string, payload: UpdateUserAccessRequest) => void
  onResolveCredentialRequest: (userId: string, approve: boolean) => void
}

export function buildAdminPageProps(args: BuildAdminPagePropsArgs) {
  return { ...args }
}

