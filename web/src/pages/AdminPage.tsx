import { useEffect, useMemo, useRef, useState } from 'react'
import { OverflowCategoryNav } from '../components/OverflowCategoryNav'
import { UserAvatar } from '../components/UserAvatar'
import type {
  AdminSettings,
  AdminStorageOverview,
  AdminUserSummary,
  CreateUserRequest,
  OidcConfig,
  OidcProviderSettings,
  RolePolicy,
  SystemUpdateStatus,
  UpdateUserAccessRequest,
  UserRole,
  UserToolScope,
} from '../lib/types'

type Props = {
  isAdmin: boolean
  canManageUsers: boolean
  canManageOrgSettings: boolean
  settings: AdminSettings | null
  users: AdminUserSummary[]
  storageOverview: AdminStorageOverview | null
  currentFontFamily: string
  currentAccent: string
  currentPageGutter: number
  currentRadius: number
  oidcConfig: OidcConfig | null
  systemUpdateStatus: SystemUpdateStatus | null
  onSave: (settings: AdminSettings) => void
  onRefreshSystemUpdateStatus: () => void
  onRunSystemUpdate: () => void
  onApplyCurrentAppearance: () => void
  onCreateUser: (payload: CreateUserRequest) => Promise<void>
  onResetPassword: (userId: string, password: string) => void
  onUpdateUserAccess: (userId: string, payload: UpdateUserAccessRequest) => void
  onResolveCredentialRequest: (userId: string, approve: boolean) => void
}

type AdminCategory = 'roles' | 'users' | 'storage' | 'authentication' | 'deployment'

const TOOL_SCOPE_FIELDS: Array<{ key: keyof UserToolScope; label: string }> = [
  { key: 'notes', label: 'Notes' },
  { key: 'files', label: 'Files' },
  { key: 'diagrams', label: 'Diagrams' },
  { key: 'voice', label: 'Voice' },
  { key: 'coms', label: 'Coms' },
]

const ROLE_ABILITY_FIELDS: Array<{ key: keyof Pick<RolePolicy, 'admin_panel' | 'manage_users' | 'manage_org_settings' | 'customize_appearance'>; label: string }> = [
  { key: 'admin_panel', label: 'Admin' },
  { key: 'manage_users', label: 'Users' },
  { key: 'manage_org_settings', label: 'Org settings' },
  { key: 'customize_appearance', label: 'Appearance' },
]

const ADMIN_CATEGORIES: Array<{ key: AdminCategory; label: string }> = [
  { key: 'roles', label: 'Roles' },
  { key: 'users', label: 'Users' },
  { key: 'storage', label: 'Storage Limits' },
  { key: 'authentication', label: 'Authentication' },
  { key: 'deployment', label: 'Deployment' },
]

const EMPTY_OIDC_SETTINGS: OidcProviderSettings = {
  id: '',
  title: 'Authentication',
  enabled: false,
  provider: 'authentik',
  issuer: '',
  client_id: '',
  client_secret: '',
  authorization_url: '',
  token_url: '',
  userinfo_url: '',
  scopes: 'openid profile email',
}

function authProviderLabel(provider: OidcProviderSettings) {
  return provider.title.trim() || (provider.provider === 'authentik' ? 'Authentik' : 'Authentication')
}

function createAuthProvider(seed?: Partial<OidcProviderSettings>): OidcProviderSettings {
  return {
    ...EMPTY_OIDC_SETTINGS,
    id: seed?.id?.trim() || globalThis.crypto?.randomUUID?.() || `auth-${Date.now()}`,
    title: seed?.title ?? 'Authentication',
    enabled: seed?.enabled ?? false,
    provider: seed?.provider ?? 'authentik',
    issuer: seed?.issuer ?? '',
    client_id: seed?.client_id ?? '',
    client_secret: seed?.client_secret ?? '',
    authorization_url: seed?.authorization_url ?? '',
    token_url: seed?.token_url ?? '',
    userinfo_url: seed?.userinfo_url ?? '',
    scopes: seed?.scopes ?? 'openid profile email',
  }
}

function normalizeAuthProviders(settings: AdminSettings | null) {
  if (!settings) return { providers: [createAuthProvider()], activeId: '' }
  const providers = (settings.oidc_providers?.length ? settings.oidc_providers : [settings.oidc]).map((provider, index) =>
    createAuthProvider({
      ...provider,
      id: provider.id || `auth-${index + 1}`,
      title:
        provider.title ||
        (provider.provider === 'authentik' ? 'Authentik' : index === 0 ? 'Authentication' : `Authentication ${index + 1}`),
    }),
  )
  const activeId =
    (settings.active_oidc_provider_id && providers.some((provider) => provider.id === settings.active_oidc_provider_id)
      ? settings.active_oidc_provider_id
      : providers.find((provider) => provider.enabled)?.id) || providers[0]?.id || ''
  return { providers, activeId }
}

function formatStorageAmount(bytes: number, preferredUnit: 'MB' | 'GB') {
  const divisor = preferredUnit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024
  const value = bytes / divisor
  if (value >= 100) return `${Math.round(value)}`
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, '')
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function formatStorageUsage(usedBytes: number, allottedMb: number) {
  const preferredUnit = allottedMb >= 1024 ? 'GB' : 'MB'
  const allottedBytes = allottedMb * 1024 * 1024
  return `${formatStorageAmount(usedBytes, preferredUnit)}/${formatStorageAmount(allottedBytes, preferredUnit)} ${preferredUnit}`
}

function normalizeRoles(roles: UserRole[] | undefined, fallbackRole: UserRole) {
  const assigned = roles?.length ? roles : [fallbackRole]
  const normalized = Array.from(new Set(assigned)) as UserRole[]
  return normalized.length ? normalized : ['member']
}

function primaryRoleFor(roles: UserRole[]): UserRole {
  return roles.includes('admin') ? 'admin' : 'member'
}

export function AdminPage({
  isAdmin,
  canManageUsers,
  canManageOrgSettings,
  settings,
  users,
  storageOverview,
  currentFontFamily,
  currentAccent,
  currentPageGutter,
  currentRadius,
  oidcConfig,
  systemUpdateStatus,
  onSave,
  onRefreshSystemUpdateStatus,
  onRunSystemUpdate,
  onApplyCurrentAppearance,
  onCreateUser,
  onResetPassword,
  onUpdateUserAccess,
  onResolveCredentialRequest,
}: Props) {
  const [newUser, setNewUser] = useState<CreateUserRequest>({
    username: '',
    email: '',
    display_name: '',
    password: '',
    role: 'member' as UserRole,
    roles: ['member'],
    storage_limit_mb: 0,
  })
  const [userAccessDrafts, setUserAccessDrafts] = useState<Record<string, UpdateUserAccessRequest>>({})
  const [openScopeUserId, setOpenScopeUserId] = useState<string | null>(null)
  const [scopeMenuPosition, setScopeMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createUserSubmitting, setCreateUserSubmitting] = useState(false)
  const [createUserError, setCreateUserError] = useState<string | null>(null)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [storageEditUserId, setStorageEditUserId] = useState<string | null>(null)
  const [storageLimitDraft, setStorageLimitDraft] = useState('0')
  const [createRoleOpen, setCreateRoleOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePolicy, setNewRolePolicy] = useState<RolePolicy>({
    tool_scope: { notes: true, files: true, diagrams: true, voice: true, coms: true },
    admin_panel: false,
    manage_users: false,
    manage_org_settings: false,
    customize_appearance: true,
  })
  const [activeCategory, setActiveCategory] = useState<AdminCategory>('roles')
  const initialAuthState = normalizeAuthProviders(settings)
  const [authProvidersDraft, setAuthProvidersDraft] = useState<OidcProviderSettings[]>(initialAuthState.providers)
  const [selectedAuthProviderId, setSelectedAuthProviderId] = useState<string>(
    initialAuthState.providers[0]?.id || initialAuthState.activeId || '',
  )
  const [activeAuthProviderId, setActiveAuthProviderId] = useState<string>(
    initialAuthState.activeId || initialAuthState.providers[0]?.id || '',
  )
  const scopeMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setUserAccessDrafts((current) => {
      const next = { ...current }
      for (const user of users) {
        next[user.id] = {
          role: current[user.id]?.role ?? user.role,
          roles: current[user.id]?.roles ?? normalizeRoles(user.roles, user.role),
          storage_limit_mb: current[user.id]?.storage_limit_mb ?? user.storage_limit_mb,
          tool_scope: current[user.id]?.tool_scope ?? user.tool_scope,
        }
      }
      return next
    })
  }, [users])

  useEffect(() => {
    if (!settings) return
    const next = normalizeAuthProviders(settings)
    setAuthProvidersDraft(next.providers)
    setSelectedAuthProviderId(next.providers[0]?.id || next.activeId || '')
    setActiveAuthProviderId(next.activeId || next.providers[0]?.id || '')
  }, [settings])

  const publicStoragePercent = useMemo(() => {
    if (!storageOverview?.detected_total_mb) return 0
    return Math.min(100, Math.round((storageOverview.public_storage_mb / storageOverview.detected_total_mb) * 100))
  }, [storageOverview])
  const resetUser = useMemo(() => users.find((user) => user.id === resetUserId) ?? null, [users, resetUserId])
  const storageEditUser = useMemo(
    () => users.find((user) => user.id === storageEditUserId) ?? null,
    [users, storageEditUserId],
  )
  const selectedAuthProvider =
    authProvidersDraft.find((provider) => provider.id === selectedAuthProviderId) ?? authProvidersDraft[0] ?? createAuthProvider()
  const resolvedAuthorizationUrl =
    selectedAuthProvider.authorization_url.trim() ||
    (selectedAuthProvider.issuer.trim() ? `${selectedAuthProvider.issuer.trim().replace(/\/+$/, '')}/authorize` : '')
  const resolvedTokenUrl =
    selectedAuthProvider.token_url.trim() ||
    (selectedAuthProvider.issuer.trim() ? `${selectedAuthProvider.issuer.trim().replace(/\/+$/, '')}/token` : '')
  const resolvedUserInfoUrl =
    selectedAuthProvider.userinfo_url.trim() ||
    (selectedAuthProvider.issuer.trim() ? `${selectedAuthProvider.issuer.trim().replace(/\/+$/, '')}/userinfo` : '')

  useEffect(() => {
    if (!openScopeUserId || !scopeMenuRef.current || !scopeMenuPosition) return
    const menu = scopeMenuRef.current
    const rect = menu.getBoundingClientRect()
    const nextLeft = Math.min(
      Math.max(12, scopeMenuPosition.left),
      Math.max(12, window.innerWidth - rect.width - 12),
    )
    const nextTop = Math.min(
      Math.max(12, scopeMenuPosition.top),
      Math.max(12, window.innerHeight - rect.height - 12),
    )
    if (nextLeft !== scopeMenuPosition.left || nextTop !== scopeMenuPosition.top) {
      setScopeMenuPosition({ left: nextLeft, top: nextTop })
    }
  }, [openScopeUserId, scopeMenuPosition])

  useEffect(() => {
    if (!openScopeUserId) return
    function closeScopeMenu() {
      setOpenScopeUserId(null)
      setScopeMenuPosition(null)
    }
    function onPointerDown(event: MouseEvent) {
      if (scopeMenuRef.current?.contains(event.target as Node)) return
      closeScopeMenu()
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeScopeMenu()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [openScopeUserId])

  if (!isAdmin) {
    return <section className="panel"><div className="empty-state">Admin access required.</div></section>
  }
  if (!settings) {
    return <section className="panel"><div className="empty-state">Loading admin settings…</div></section>
  }

  return (
    <section className="panel settings-panel">
      <div className="settings-layout">
        <OverflowCategoryNav
          items={ADMIN_CATEGORIES}
          activeKey={activeCategory}
          ariaLabel="Admin categories"
          onChange={setActiveCategory}
        />
        <div className="settings-content">
          {activeCategory === 'roles' ? (
            <div className="settings-card">
              <div className="button-row admin-users-toolbar">
                <button className="button" type="button" disabled={!canManageOrgSettings} onClick={() => setCreateRoleOpen(true)}>
                  Create role
                </button>
              </div>
              <div className="admin-users-table-wrap">
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      {TOOL_SCOPE_FIELDS.map((field) => (
                        <th key={field.key}>{field.label}</th>
                      ))}
                      {ROLE_ABILITY_FIELDS.map((field) => (
                        <th key={field.key}>{field.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(settings.role_policies)
                      .sort(([left], [right]) => left.localeCompare(right))
                      .map(([roleKey, policy]) => {
                        return (
                          <tr key={roleKey}>
                            <td className="admin-user-cell"><strong>{roleKey}</strong></td>
                            {TOOL_SCOPE_FIELDS.map((field) => (
                              <td key={field.key}>
                                <input
                                  type="checkbox"
                                  checked={policy.tool_scope[field.key]}
                                  disabled={!canManageOrgSettings}
                                  onChange={(event) =>
                                    onSave({
                                      ...settings,
                                      role_policies: {
                                        ...settings.role_policies,
                                        [roleKey]: {
                                          ...policy,
                                          tool_scope: {
                                            ...policy.tool_scope,
                                            [field.key]: event.target.checked,
                                          },
                                        },
                                      },
                                    })
                                  }
                                />
                              </td>
                            ))}
                            {ROLE_ABILITY_FIELDS.map((field) => (
                              <td key={field.key}>
                                <input
                                  type="checkbox"
                                  checked={policy[field.key]}
                                  disabled={!canManageOrgSettings}
                                  onChange={(event) =>
                                    onSave({
                                      ...settings,
                                      role_policies: {
                                        ...settings.role_policies,
                                        [roleKey]: {
                                          ...policy,
                                          [field.key]: event.target.checked,
                                        },
                                      },
                                    })
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              <div className="settings-toggle" style={{ marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.require_account_email}
                  disabled={!canManageOrgSettings}
                  onChange={(event) => onSave({ ...settings, require_account_email: event.target.checked })}
                />
                <span>Require email for accounts</span>
              </div>
              <div className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.allow_user_credential_changes}
                  disabled={!canManageOrgSettings}
                  onChange={(event) => onSave({ ...settings, allow_user_credential_changes: event.target.checked })}
                />
                <span>Allow users to change username and email directly</span>
              </div>
              <div className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.confirm_file_delete}
                  disabled={!canManageOrgSettings}
                  onChange={(event) => onSave({ ...settings, confirm_file_delete: event.target.checked })}
                />
                <span>Confirm before deleting files or folders</span>
              </div>
              <div className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.enforce_org_appearance}
                  disabled={!canManageOrgSettings}
                  onChange={(event) => onSave({ ...settings, enforce_org_appearance: event.target.checked })}
                />
                <span>Enforce organization appearance</span>
              </div>
              <div className="settings-card" style={{ marginTop: 12, padding: 0, border: 0, background: 'transparent' }}>
                <h3>Organization Appearance</h3>
                <div className="muted" style={{ marginBottom: 12 }}>
                  Font: {settings.org_font_family || currentFontFamily}<br />
                  Accent: {settings.org_accent || currentAccent}<br />
                  Background: {settings.org_background}<br />
                  Gradient: {settings.org_gradient_top_left}, {settings.org_gradient_top_right}, {settings.org_gradient_bottom_left}, {settings.org_gradient_bottom_right}<br />
                  Gradient strength: {settings.org_gradient_strength}%<br />
                  Margins: {settings.org_page_gutter || currentPageGutter}px<br />
                  Radius: {settings.org_radius || currentRadius}px
                </div>
                <button className="button-secondary" disabled={!canManageOrgSettings} onClick={onApplyCurrentAppearance}>
                  Use current appearance as org default
                </button>
              </div>
            </div>
          ) : null}

          {activeCategory === 'users' ? (
            <div className="settings-card admin-users-card">
              <div className="button-row admin-users-toolbar">
                <button
                  className="button"
                  type="button"
                  disabled={!canManageUsers}
                  onClick={() => {
                    setCreateUserError(null)
                    setCreateUserOpen(true)
                  }}
                >
                  Create user
                </button>
              </div>

              <div className="admin-users-table-wrap">
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Roles</th>
                      <th>Password</th>
                      <th>Auth</th>
                      <th>Storage limit</th>
                      <th>Pending credentials</th>
                      <th>Reset password</th>
                      <th>Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const draft = userAccessDrafts[user.id] ?? {
                        role: user.role,
                        roles: normalizeRoles(user.roles, user.role),
                        storage_limit_mb: user.storage_limit_mb,
                        tool_scope: user.tool_scope,
                      }
                      return (
                        <tr key={user.id}>
                          <td className="admin-user-cell">
                            <div className="admin-user-summary">
                              <UserAvatar user={user} className="user-avatar-admin" />
                              <div>
                                <strong>{user.display_name}</strong>
                                <div className="muted">@{user.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="muted">{user.email}</span>
                          </td>
                          <td>
                            <span className="muted">{normalizeRoles(user.roles, user.role).join(', ')}</span>
                          </td>
                          <td>
                            <span className="muted">{user.must_change_password ? 'Must change' : 'OK'}</span>
                          </td>
                          <td>
                            <span className="muted">{user.linked_sso ? 'SSO linked' : 'Local only'}</span>
                          </td>
                          <td>
                            <div className="admin-storage-cell">
                              <span>
                                {formatStorageUsage(
                                  user.storage_used_bytes,
                                  user.storage_limit_mb === 0 ? settings.per_user_storage_mb : user.storage_limit_mb,
                                )}
                              </span>
                              <button
                                className="icon-button admin-storage-edit-button"
                                type="button"
                                aria-label={`Edit storage limit for ${user.username}`}
                                disabled={!canManageUsers}
                                onClick={() => {
                                  setStorageEditUserId(user.id)
                                  setStorageLimitDraft(String(draft.storage_limit_mb))
                                }}
                              >
                                ✎
                              </button>
                            </div>
                          </td>
                          <td>
                            {user.pending_credential_change ? (
                              <div className="settings-list" style={{ gap: 8 }}>
                                <div className="muted">
                                  @{user.pending_credential_change.requested_username}
                                  <br />
                                  {user.pending_credential_change.requested_email}
                                </div>
                                <div className="button-row">
                                  <button className="button-secondary" type="button" onClick={() => onResolveCredentialRequest(user.id, true)}>
                                    Approve
                                  </button>
                                  <button className="button-secondary" type="button" onClick={() => onResolveCredentialRequest(user.id, false)}>
                                    Deny
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="muted">None</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="button-secondary"
                              type="button"
                              disabled={!canManageUsers}
                              onClick={() => {
                                setResetUserId(user.id)
                                setResetPassword('')
                                setResetPasswordConfirm('')
                              }}
                            >
                              Reset
                            </button>
                          </td>
                          <td>
                            <button
                              className="button-secondary"
                              type="button"
                              disabled={!canManageUsers}
                              onClick={(event) => {
                                if (!canManageUsers) return
                                if (openScopeUserId === user.id) {
                                  setOpenScopeUserId(null)
                                  setScopeMenuPosition(null)
                                  return
                                }
                                const rect = event.currentTarget.getBoundingClientRect()
                                setOpenScopeUserId(user.id)
                                setScopeMenuPosition({
                                  left: Math.max(12, rect.left - 196),
                                  top: rect.top,
                                })
                              }}
                            >
                              Scope
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeCategory === 'storage' ? (
            <div className="settings-card">
              <h3>Storage Limits</h3>
              <div className="admin-storage-summary">
                <div className="admin-storage-summary-row">
                  <strong>Public share storage</strong>
                  <span className="muted">
                    {storageOverview?.public_storage_mb ?? settings.public_storage_mb} MB / {storageOverview?.detected_total_mb ?? 0} MB detected
                  </span>
                </div>
                <div className="admin-table-inline">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    disabled={!canManageOrgSettings}
                    value={settings.public_storage_mb}
                    onChange={(event) => onSave({ ...settings, public_storage_mb: Number(event.target.value) || 0 })}
                  />
                  <span className="muted">MB allocated to public/shared storage</span>
                </div>
                <div className="admin-storage-bar">
                  <div className="admin-storage-bar-fill" style={{ width: `${publicStoragePercent}%` }} />
                </div>
              <div className="muted">
                Available free space: {storageOverview?.detected_available_mb ?? 0} MB
              </div>
              </div>
              <label className="settings-field">
                <span>Voice upload limit (MB)</span>
                <input className="input" type="number" disabled={!canManageOrgSettings} value={settings.voice_upload_limit_mb} onChange={(event) => onSave({ ...settings, voice_upload_limit_mb: Number(event.target.value) || 0 })} />
              </label>
            </div>
          ) : null}

          {activeCategory === 'authentication' ? (
            <div className="settings-card">
              <h3>Authentication</h3>
              <div className="button-row" style={{ marginBottom: 12 }}>
                <button
                  className="button"
                  type="button"
                  disabled={!canManageOrgSettings}
                  onClick={() => {
                    const nextProvider = createAuthProvider({
                      title: `Authentication ${authProvidersDraft.length + 1}`,
                    })
                    setAuthProvidersDraft((current) => [...current, nextProvider])
                    setSelectedAuthProviderId(nextProvider.id)
                    if (!activeAuthProviderId) {
                      setActiveAuthProviderId(nextProvider.id)
                    }
                  }}
                >
                  Add Authentication
                </button>
              </div>
              <div className="admin-role-list" style={{ marginBottom: 16 }}>
                {authProvidersDraft.map((provider) => (
                  <button
                    key={provider.id}
                    className={`ghost-button ${provider.id === selectedAuthProviderId ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setSelectedAuthProviderId(provider.id)}
                  >
                    {authProviderLabel(provider)}
                  </button>
                ))}
              </div>
              <div className="settings-toggle">
                <input
                  type="checkbox"
                  checked={selectedAuthProvider.enabled}
                  disabled={!canManageOrgSettings}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, enabled: event.target.checked } : provider,
                      ),
                    )
                  }
                />
                <span>Enable SSO</span>
              </div>
              <label className="settings-field">
                <span>Title</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.title}
                  placeholder="Authentik Production"
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, title: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Default Authentication</span>
                <select
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={activeAuthProviderId}
                  onChange={(event) => setActiveAuthProviderId(event.target.value)}
                >
                  {authProvidersDraft.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {authProviderLabel(provider)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Provider</span>
                <select
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.provider}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, provider: event.target.value } : provider,
                      ),
                    )
                  }
                >
                  <option value="authentik">Authentik</option>
                  <option value="generic">Generic OIDC</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Issuer URL</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.issuer}
                  placeholder="https://id.example.com/application/o/home-suite-home"
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, issuer: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Client ID</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.client_id}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, client_id: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Client Secret</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.client_secret}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, client_secret: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Authorization Endpoint</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.authorization_url}
                  placeholder={resolvedAuthorizationUrl}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, authorization_url: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Token Endpoint</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.token_url}
                  placeholder={resolvedTokenUrl}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, token_url: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Userinfo Endpoint</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.userinfo_url}
                  placeholder={resolvedUserInfoUrl}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, userinfo_url: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Scopes</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={selectedAuthProvider.scopes}
                  onChange={(event) =>
                    setAuthProvidersDraft((current) =>
                      current.map((provider) =>
                        provider.id === selectedAuthProvider.id ? { ...provider, scopes: event.target.value } : provider,
                      ),
                    )
                  }
                />
              </label>
              <div className="code-block" style={{ marginBottom: 12 }}>
                Callback URL: {oidcConfig?.redirect_url ?? 'Loading...'}
                {'\n'}Authorization URL: {resolvedAuthorizationUrl || 'Not set'}
                {'\n'}Token URL: {resolvedTokenUrl || 'Not set'}
                {'\n'}Userinfo URL: {resolvedUserInfoUrl || 'Not set'}
              </div>
              <div className="button-row">
                <button
                  className="button"
                  type="button"
                  disabled={!canManageOrgSettings}
                  onClick={() =>
                    onSave({
                      ...settings,
                      oidc: authProvidersDraft.find((provider) => provider.id === activeAuthProviderId) ?? selectedAuthProvider,
                      oidc_providers: authProvidersDraft,
                      active_oidc_provider_id: activeAuthProviderId,
                    })
                  }
                >
                  Save authentication
                </button>
              </div>
              <div className="settings-divider" />
              <div className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.google_calendar_enabled}
                  disabled={!canManageOrgSettings}
                  onChange={(event) => onSave({ ...settings, google_calendar_enabled: event.target.checked })}
                />
                <span>Enable Google Calendar sync</span>
              </div>
              <label className="settings-field">
                <span>Google Calendar Client ID</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={settings.google_calendar_client_id}
                  onChange={(event) => onSave({ ...settings, google_calendar_client_id: event.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>Google Calendar Client Secret</span>
                <input
                  className="input"
                  disabled={!canManageOrgSettings}
                  value={settings.google_calendar_client_secret}
                  onChange={(event) => onSave({ ...settings, google_calendar_client_secret: event.target.value })}
                />
              </label>
              <div className="code-block" style={{ marginBottom: 12 }}>
                Google Calendar redirect URL: {`${window.location.origin}/calendar`}
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                Authentik works out of the box with issuer, client ID, and client secret. Other providers can use the same OIDC fields and override the endpoints if needed. Google Calendar sync uses the redirect URL above.
              </p>
            </div>
          ) : null}

          {activeCategory === 'deployment' ? (
            <div className="settings-card">
              <h3>Deployment</h3>
              <div className="admin-update-card">
                <div className="admin-update-row">
                  <strong>Current version</strong>
                  <span className="muted">{systemUpdateStatus?.current_version || 'Unknown'}</span>
                </div>
                <div className="admin-update-row">
                  <strong>Update target</strong>
                  <span className="muted">{systemUpdateStatus?.update_target || 'Not configured'}</span>
                </div>
                <div className="admin-update-row">
                  <strong>Status</strong>
                  <span className={`admin-update-status ${systemUpdateStatus?.update_in_progress ? 'is-running' : ''}`}>
                    {systemUpdateStatus?.update_in_progress
                      ? 'Updating'
                      : systemUpdateStatus?.update_enabled
                        ? 'Ready'
                        : 'Disabled'}
                  </span>
                </div>
                <div className="admin-update-row">
                  <strong>Last message</strong>
                  <span className="muted">{systemUpdateStatus?.last_message || 'No update activity yet.'}</span>
                </div>
                {systemUpdateStatus?.last_started_at ? (
                  <div className="admin-update-row">
                    <strong>Last started</strong>
                    <span className="muted">{new Date(systemUpdateStatus.last_started_at).toLocaleString()}</span>
                  </div>
                ) : null}
                {systemUpdateStatus?.last_finished_at ? (
                  <div className="admin-update-row">
                    <strong>Last finished</strong>
                    <span className="muted">{new Date(systemUpdateStatus.last_finished_at).toLocaleString()}</span>
                  </div>
                ) : null}
                {systemUpdateStatus?.last_error ? (
                  <div className="code-block" style={{ marginTop: 12 }}>{systemUpdateStatus.last_error}</div>
                ) : null}
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button className="button-secondary" type="button" disabled={!canManageOrgSettings} onClick={onRefreshSystemUpdateStatus}>
                    Refresh status
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={!canManageOrgSettings || !systemUpdateStatus?.update_enabled || Boolean(systemUpdateStatus?.update_in_progress)}
                    onClick={onRunSystemUpdate}
                  >
                    {systemUpdateStatus?.update_in_progress ? 'Updating…' : 'Update now'}
                  </button>
                </div>
              </div>
              <div className="code-block" style={{ marginTop: 12 }}>
                This button runs the configured host update command. For a homeserver Docker deployment,
                point that command at a script that pulls the latest published `server` and `web` images and
                restarts the stack.
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {openScopeUserId && scopeMenuPosition ? (
        <div
          ref={scopeMenuRef}
          className="admin-scope-popover admin-scope-popover-overlay"
          style={{ top: scopeMenuPosition.top, left: scopeMenuPosition.left }}
        >
          {(() => {
            const user = users.find((entry) => entry.id === openScopeUserId)
            if (!user) return null
            const draft = userAccessDrafts[user.id] ?? {
              role: user.role,
              roles: normalizeRoles(user.roles, user.role),
              storage_limit_mb: user.storage_limit_mb,
              tool_scope: user.tool_scope,
            }
            return (
              <>
                <div className="admin-scope-section-label">Roles</div>
                <div className="admin-role-list">
                  {Object.keys(settings.role_policies)
                    .sort((left, right) => left.localeCompare(right))
                    .map((roleKey) => (
                      <label className="settings-toggle" key={roleKey}>
                        <input
                          type="checkbox"
                          checked={draft.roles.includes(roleKey)}
                          disabled={!canManageUsers}
                          onChange={(event) => {
                            const nextRoles = event.target.checked
                              ? (Array.from(new Set([...draft.roles, roleKey])) as UserRole[])
                              : draft.roles.filter((role) => role !== roleKey)
                            const normalizedRoles: UserRole[] = nextRoles.length ? nextRoles : ['member']
                            setUserAccessDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...draft,
                                role: primaryRoleFor(normalizedRoles),
                                roles: normalizedRoles,
                              },
                            }))
                          }}
                        />
                        <span>{roleKey}</span>
                      </label>
                    ))}
                </div>
                <div className="admin-scope-section-label">Tool access</div>
                {TOOL_SCOPE_FIELDS.map(({ key, label }) => (
                  <label className="settings-toggle" key={key}>
                    <input
                      type="checkbox"
                      checked={draft.tool_scope[key]}
                      disabled={!canManageUsers}
                      onChange={(event) =>
                        setUserAccessDrafts((current) => ({
                          ...current,
                          [user.id]: {
                            ...draft,
                            tool_scope: {
                              ...draft.tool_scope,
                              [key]: event.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <button
                  className="button"
                  type="button"
                  disabled={!canManageUsers}
                  onClick={() => {
                    onUpdateUserAccess(user.id, draft)
                    setOpenScopeUserId(null)
                    setScopeMenuPosition(null)
                  }}
                >
                  Save scope
                </button>
              </>
            )
          })()}
        </div>
      ) : null}
      {createUserOpen ? (
        <div className="modal-backdrop" onClick={() => {
          if (createUserSubmitting) return
          setCreateUserOpen(false)
        }}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Create user</h3>
            <form
              className="auth-form"
              onSubmit={async (event) => {
                event.preventDefault()
                setCreateUserError(null)
                setCreateUserSubmitting(true)
                try {
                  await onCreateUser(newUser)
                  setNewUser({
                    username: '',
                    email: '',
                    display_name: '',
                    password: '',
                    role: 'member',
                    roles: ['member'],
                    storage_limit_mb: 0,
                  })
                  setCreateUserOpen(false)
                } catch (error) {
                  setCreateUserError(error instanceof Error ? error.message : 'Failed to create user')
                } finally {
                  setCreateUserSubmitting(false)
                }
              }}
            >
              <input autoFocus className="input" placeholder="Username" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} />
              <input
                className="input"
                type="email"
                placeholder={settings.require_account_email ? 'Email' : 'Email (optional)'}
                value={newUser.email}
                onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
              />
              <input className="input" type="password" placeholder="First-use password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} />
              <div className="admin-table-inline">
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Storage limit (0 = org default)"
                  value={newUser.storage_limit_mb}
                  onChange={(event) =>
                    setNewUser((current) => ({
                      ...current,
                      storage_limit_mb: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
                <span className="muted">MB</span>
              </div>
              <div className="admin-role-list">
                {Object.keys(settings.role_policies)
                  .sort((left, right) => left.localeCompare(right))
                  .map((roleKey) => (
                  <label className="settings-toggle" key={roleKey}>
                    <input
                      type="checkbox"
                      checked={newUser.roles.includes(roleKey)}
                      onChange={(event) =>
                        setNewUser((current) => {
                          const nextRoles = event.target.checked
                            ? (Array.from(new Set([...current.roles, roleKey])) as UserRole[])
                            : current.roles.filter((role) => role !== roleKey)
                          const normalizedRoles: UserRole[] = nextRoles.length ? nextRoles : ['member']
                          return {
                            ...current,
                            role: primaryRoleFor(normalizedRoles),
                            roles: normalizedRoles,
                          }
                        })
                      }
                    />
                    <span>{roleKey}</span>
                  </label>
                ))}
              </div>
              {createUserError ? <div className="muted">{createUserError}</div> : null}
              <div className="button-row">
                <button className="button" type="submit" disabled={createUserSubmitting}>
                  {createUserSubmitting ? 'Creating…' : 'Create user'}
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={createUserSubmitting}
                  onClick={() => setCreateUserOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {resetUser ? (
        <div className="modal-backdrop" onClick={() => setResetUserId(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Reset password for {resetUser.username}</h3>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault()
                const nextPassword = resetPassword.trim()
                if (!nextPassword || nextPassword !== resetPasswordConfirm.trim()) return
                onResetPassword(resetUser.id, nextPassword)
                setResetUserId(null)
                setResetPassword('')
                setResetPasswordConfirm('')
              }}
            >
              <input
                autoFocus
                className="input"
                type="password"
                placeholder="Temporary password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm temporary password"
                value={resetPasswordConfirm}
                onChange={(event) => setResetPasswordConfirm(event.target.value)}
              />
              {resetPasswordConfirm && resetPassword !== resetPasswordConfirm ? (
                <div className="muted">Passwords must match.</div>
              ) : null}
              <div className="button-row">
                <button
                  className="button"
                  type="submit"
                  disabled={!resetPassword.trim() || resetPassword !== resetPasswordConfirm}
                >
                  Confirm
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => setResetUserId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {storageEditUser ? (
        <div className="modal-backdrop" onClick={() => setStorageEditUserId(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Storage limit for {storageEditUser.username}</h3>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault()
                const nextLimit = Math.max(0, Number(storageLimitDraft) || 0)
                const draft = userAccessDrafts[storageEditUser.id] ?? {
                  role: storageEditUser.role,
                  roles: normalizeRoles(storageEditUser.roles, storageEditUser.role),
                  storage_limit_mb: storageEditUser.storage_limit_mb,
                  tool_scope: storageEditUser.tool_scope,
                }
                onUpdateUserAccess(storageEditUser.id, {
                  ...draft,
                  storage_limit_mb: nextLimit,
                })
                setStorageEditUserId(null)
              }}
            >
              <input
                autoFocus
                className="input"
                type="number"
                min={0}
                placeholder="Storage limit (MB, 0 = org default)"
                value={storageLimitDraft}
                onChange={(event) => setStorageLimitDraft(event.target.value)}
              />
              <div className="muted">
                Current usage: {formatStorageUsage(
                  storageEditUser.storage_used_bytes,
                  storageEditUser.storage_limit_mb === 0
                    ? settings.per_user_storage_mb
                    : storageEditUser.storage_limit_mb,
                )}
              </div>
              <div className="muted">
                If the new limit is below current usage, the user can still reduce usage but cannot add or expand content until they are back under the limit.
              </div>
              <div className="button-row">
                <button className="button" type="submit">Save limit</button>
                <button className="button-secondary" type="button" onClick={() => setStorageEditUserId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {createRoleOpen ? (
        <div className="modal-backdrop" onClick={() => setCreateRoleOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Create role</h3>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault()
                const roleKey = newRoleName.trim().toLowerCase().replace(/\s+/g, '-')
                if (!roleKey) return
                if (settings.role_policies[roleKey]) return
                onSave({
                  ...settings,
                  role_policies: {
                    ...settings.role_policies,
                    [roleKey]: newRolePolicy,
                  },
                })
                setNewRoleName('')
                setNewRolePolicy({
                  tool_scope: { notes: true, files: true, diagrams: true, voice: true, coms: true },
                  admin_panel: false,
                  manage_users: false,
                  manage_org_settings: false,
                  customize_appearance: true,
                })
                setCreateRoleOpen(false)
              }}
            >
              <input
                autoFocus
                className="input"
                placeholder="Role name"
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
              />
              {TOOL_SCOPE_FIELDS.map(({ key, label }) => (
                <label className="settings-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={newRolePolicy.tool_scope[key]}
                    onChange={(event) =>
                      setNewRolePolicy((current) => ({
                        ...current,
                        tool_scope: {
                          ...current.tool_scope,
                          [key]: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              {ROLE_ABILITY_FIELDS.map(({ key, label }) => (
                <label className="settings-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={newRolePolicy[key]}
                    onChange={(event) =>
                      setNewRolePolicy((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <div className="button-row">
                <button className="button" type="submit">Create role</button>
                <button className="button-secondary" type="button" onClick={() => setCreateRoleOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
