import { useEffect, useRef, useState } from 'react'
import { DEFAULT_APPEARANCE, DEFAULT_NAV_ORDER, DEFAULT_SHORTCUTS, FONT_OPTIONS, type AppearanceSettings, type NavItemPath, type ShortcutSettings } from '../lib/app-config'
import { UserAvatar } from '../components/UserAvatar'
import { OverflowCategoryNav } from '../components/OverflowCategoryNav'
import { UploadIcon } from '../components/LibraryActionIcons'
import type { SessionResponse } from '../lib/types'
import { normalizeShortcutBinding } from '../lib/shortcuts'

function isGeneratedLocalEmail(email: string | null | undefined) {
  if (!email) return false
  return email.endsWith('@local.sweet') || email.endsWith('@local.home-suite-home')
}

type NavItem = {
  path: NavItemPath
  label: string
}

type SettingsCategory = 'appearance' | 'shortcuts' | 'account'

type Props = {
  appearance: AppearanceSettings
  shortcuts: ShortcutSettings
  orderedNavItems: NavItem[]
  session: SessionResponse | null
  canCustomizeAppearance: boolean
  allowDirectCredentialChanges: boolean
  onSetAppearance: React.Dispatch<React.SetStateAction<AppearanceSettings>>
  onSetShortcuts: React.Dispatch<React.SetStateAction<ShortcutSettings>>
  onSetNavOrder: React.Dispatch<React.SetStateAction<NavItemPath[]>>
  onUploadAvatar: (file: File) => Promise<void>
  onUpdateCredentials: (payload: { username: string; email: string }) => Promise<string | null>
  onChangePassword: (payload: { current_password: string; new_password: string; new_password_confirm: string }) => Promise<void>
  onLogout: () => void
}

const CATEGORY_LABELS: Array<{ key: SettingsCategory; label: string }> = [
  { key: 'account', label: 'Account' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'shortcuts', label: 'Shortcuts' },
]

export function SettingsPage({
  appearance,
  shortcuts,
  orderedNavItems,
  session,
  canCustomizeAppearance,
  allowDirectCredentialChanges,
  onSetAppearance,
  onSetShortcuts,
  onSetNavOrder,
  onUploadAvatar,
  onUpdateCredentials,
  onChangePassword,
  onLogout,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('account')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [usernameDraft, setUsernameDraft] = useState(session?.user.username ?? '')
  const [emailDraft, setEmailDraft] = useState(session?.user.email ?? '')
  const [credentialsMessage, setCredentialsMessage] = useState<string | null>(null)
  const [usernameModalOpen, setUsernameModalOpen] = useState(false)
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundImageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setUsernameDraft(session?.user.username ?? '')
    setEmailDraft(isGeneratedLocalEmail(session?.user.email) ? '' : session?.user.email ?? '')
  }, [session?.user.email, session?.user.username])

  async function readFileAsDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  return (
    <section className="panel settings-panel">
      <div className="settings-layout">
        <OverflowCategoryNav
          items={CATEGORY_LABELS}
          activeKey={activeCategory}
          ariaLabel="Settings categories"
          onChange={setActiveCategory}
        />
        <div className="settings-content">
          {activeCategory === 'appearance' ? (
            <div className="settings-card">
              <div className="segmented-control">
                {(['dark', 'light', 'custom'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={appearance.mode === mode ? 'button' : 'button-secondary'}
                    disabled={!canCustomizeAppearance}
                    onClick={() => onSetAppearance((current) => ({ ...current, mode }))}
                  >
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <label className="settings-field">
                <span>Margins: {appearance.pageGutter}px</span>
                <input
                  type="range"
                  min="0"
                  max="40"
                  disabled={!canCustomizeAppearance}
                  value={appearance.pageGutter}
                  onChange={(event) =>
                    onSetAppearance((current) => ({
                      ...current,
                      pageGutter: Number(event.target.value),
                      mode: current.mode === 'dark' || current.mode === 'light' ? current.mode : 'custom',
                    }))
                  }
                />
              </label>
              <label className="settings-field">
                <span>Corner rounding: {appearance.radius}px</span>
                <input
                  type="range"
                  min="0"
                  max="32"
                  disabled={!canCustomizeAppearance}
                  value={appearance.radius}
                  onChange={(event) =>
                    onSetAppearance((current) => ({
                      ...current,
                      radius: Number(event.target.value),
                      mode: current.mode === 'dark' || current.mode === 'light' ? current.mode : 'custom',
                    }))
                  }
                />
              </label>
              <label className="settings-field">
                <span>Panel opacity: {appearance.surfaceOpacity}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  disabled={!canCustomizeAppearance}
                  value={appearance.surfaceOpacity}
                  onChange={(event) =>
                    onSetAppearance((current) => ({
                      ...current,
                      surfaceOpacity: Number(event.target.value),
                      mode: current.mode === 'dark' || current.mode === 'light' ? current.mode : 'custom',
                    }))
                  }
                />
              </label>
              <label className="settings-field">
                <span>Font</span>
                <select
                  className="input"
                  disabled={!canCustomizeAppearance}
                  value={appearance.fontFamily}
                  onChange={(event) =>
                    onSetAppearance((current) => ({
                      ...current,
                      fontFamily: event.target.value || DEFAULT_APPEARANCE.fontFamily,
                    }))
                  }
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Accent color</span>
                <div className="color-row">
                  <input
                    className="color-picker"
                    type="color"
                    disabled={!canCustomizeAppearance}
                    value={appearance.accent}
                    onChange={(event) => onSetAppearance((current) => ({ ...current, accent: event.target.value, mode: 'custom' }))}
                  />
                  <input
                    className="input"
                    disabled={!canCustomizeAppearance}
                    value={appearance.accent}
                    onChange={(event) => onSetAppearance((current) => ({ ...current, accent: event.target.value || '#41b883', mode: 'custom' }))}
                  />
                </div>
              </label>
              <label className="settings-field">
                <span>Element background color</span>
                <div className="color-row">
                  <input
                    className="color-picker"
                    type="color"
                    disabled={!canCustomizeAppearance}
                    value={appearance.secondaryBackground}
                    onChange={(event) => onSetAppearance((current) => ({ ...current, secondaryBackground: event.target.value, mode: 'custom' }))}
                  />
                  <input
                    className="input"
                    disabled={!canCustomizeAppearance}
                    value={appearance.secondaryBackground}
                    onChange={(event) =>
                      onSetAppearance((current) => ({
                        ...current,
                        secondaryBackground: event.target.value || DEFAULT_APPEARANCE.secondaryBackground,
                        mode: 'custom',
                      }))
                    }
                  />
                </div>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  disabled={!canCustomizeAppearance}
                  checked={appearance.disableGradients}
                  onChange={(event) =>
                    onSetAppearance((current) => ({
                      ...current,
                      disableGradients: event.target.checked,
                      mode: current.mode === 'custom' ? 'custom' : current.mode,
                    }))
                  }
                />
                <span>Disable gradients</span>
              </label>
              {appearance.mode === 'custom' ? (
                <>
                  <label className="settings-field">
                    <span>Background color</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.background}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, background: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.background}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            background: event.target.value || DEFAULT_APPEARANCE.background,
                            mode: 'custom',
                          }))
                        }
                      />
                    </div>
                  </label>
                  <label className="settings-field">
                    <span>Background photo</span>
                    <div className="button-row">
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={!canCustomizeAppearance}
                        onClick={() => backgroundImageInputRef.current?.click()}
                      >
                        Upload photo
                      </button>
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={!canCustomizeAppearance || !appearance.backgroundImage}
                        onClick={() =>
                          onSetAppearance((current) => ({
                            ...current,
                            backgroundImage: '',
                            mode: 'custom',
                          }))
                        }
                      >
                        Clear photo
                      </button>
                    </div>
                    <input
                      ref={backgroundImageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.currentTarget.value = ''
                        if (!file) return
                        void readFileAsDataUrl(file).then((dataUrl) =>
                          onSetAppearance((current) => ({
                            ...current,
                            backgroundImage: dataUrl,
                            mode: 'custom',
                          })),
                        )
                      }}
                    />
                    {appearance.backgroundImage ? <span className="muted">Background photo enabled.</span> : null}
                  </label>
                  <label className="settings-field">
                    <span>Gradient top left</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientTopLeft}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, gradientTopLeft: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientTopLeft}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            gradientTopLeft: event.target.value || DEFAULT_APPEARANCE.gradientTopLeft,
                            mode: 'custom',
                          }))
                        }
                      />
                      <label className="settings-toggle-inline">
                        <input
                          type="checkbox"
                          checked={appearance.gradientTopLeftEnabled}
                          onChange={(event) =>
                            onSetAppearance((current) => ({
                              ...current,
                              gradientTopLeftEnabled: event.target.checked,
                              mode: 'custom',
                            }))
                          }
                        />
                        <span>On</span>
                      </label>
                    </div>
                  </label>
                  <label className="settings-field">
                    <span>Gradient top right</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientTopRight}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, gradientTopRight: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientTopRight}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            gradientTopRight: event.target.value || DEFAULT_APPEARANCE.gradientTopRight,
                            mode: 'custom',
                          }))
                        }
                      />
                      <label className="settings-toggle-inline">
                        <input
                          type="checkbox"
                          checked={appearance.gradientTopRightEnabled}
                          onChange={(event) =>
                            onSetAppearance((current) => ({
                              ...current,
                              gradientTopRightEnabled: event.target.checked,
                              mode: 'custom',
                            }))
                          }
                        />
                        <span>On</span>
                      </label>
                    </div>
                  </label>
                  <label className="settings-field">
                    <span>Gradient bottom left</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientBottomLeft}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, gradientBottomLeft: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientBottomLeft}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            gradientBottomLeft: event.target.value || DEFAULT_APPEARANCE.gradientBottomLeft,
                            mode: 'custom',
                          }))
                        }
                      />
                      <label className="settings-toggle-inline">
                        <input
                          type="checkbox"
                          checked={appearance.gradientBottomLeftEnabled}
                          onChange={(event) =>
                            onSetAppearance((current) => ({
                              ...current,
                              gradientBottomLeftEnabled: event.target.checked,
                              mode: 'custom',
                            }))
                          }
                        />
                        <span>On</span>
                      </label>
                    </div>
                  </label>
                  <label className="settings-field">
                    <span>Gradient bottom right</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientBottomRight}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, gradientBottomRight: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientBottomRight}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            gradientBottomRight: event.target.value || DEFAULT_APPEARANCE.gradientBottomRight,
                            mode: 'custom',
                          }))
                        }
                      />
                      <label className="settings-toggle-inline">
                        <input
                          type="checkbox"
                          checked={appearance.gradientBottomRightEnabled}
                          onChange={(event) =>
                            onSetAppearance((current) => ({
                              ...current,
                              gradientBottomRightEnabled: event.target.checked,
                              mode: 'custom',
                            }))
                          }
                        />
                        <span>On</span>
                      </label>
                    </div>
                  </label>
                  <label className="settings-field">
                    <span>Gradient strength: {appearance.gradientStrength}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      disabled={!canCustomizeAppearance}
                      value={appearance.gradientStrength}
                      onChange={(event) =>
                        onSetAppearance((current) => ({
                          ...current,
                          gradientStrength: Number(event.target.value),
                          mode: 'custom',
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}
              <div className="settings-card" style={{ marginTop: 12 }}>
                <h3>Navigation Order</h3>
                <div className="settings-list">
                  {orderedNavItems.map((item, index) => (
                    <div className="settings-list-row" key={item.path}>
                      <span>{item.label}</span>
                      <div className="button-row">
                        <button
                          className="button-secondary nav-order-button"
                          disabled={index === 0}
                          onClick={() =>
                            onSetNavOrder((current) => {
                              const next = [...current]
                              const currentIndex = next.indexOf(item.path)
                              if (currentIndex <= 0) return current
                              ;[next[currentIndex - 1], next[currentIndex]] = [next[currentIndex], next[currentIndex - 1]]
                              return next
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          className="button-secondary nav-order-button"
                          disabled={index === orderedNavItems.length - 1}
                          onClick={() =>
                            onSetNavOrder((current) => {
                              const next = [...current]
                              const currentIndex = next.indexOf(item.path)
                              if (currentIndex === -1 || currentIndex >= next.length - 1) return current
                              ;[next[currentIndex], next[currentIndex + 1]] = [next[currentIndex + 1], next[currentIndex]]
                              return next
                            })
                          }
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button className="button-secondary" onClick={() => onSetNavOrder(DEFAULT_NAV_ORDER)}>
                    Reset order
                  </button>
                </div>
              </div>
              {!canCustomizeAppearance ? <p className="muted">Your role cannot change personal appearance settings.</p> : null}
            </div>
          ) : null}

          {activeCategory === 'shortcuts' ? (
            <div className="settings-card">
              <div className="button-row" style={{ marginBottom: 12 }}>
                <button className="button-secondary" onClick={() => onSetShortcuts(DEFAULT_SHORTCUTS)}>
                  Reset defaults
                </button>
              </div>
              {(
                [
                  ['previousSection', 'Previous section'],
                  ['nextSection', 'Next section'],
                  ['notesJump', 'Jump to Notes'],
                  ['filesJump', 'Jump to Files'],
                  ['diagramsJump', 'Jump to Diagrams'],
                  ['voiceJump', 'Jump to Voice'],
                  ['chatJump', 'Jump to Coms'],
                  ['callsJump', 'Alternate jump to Coms'],
                  ['settingsJump', 'Jump to Settings'],
                  ['focusNext', 'Focus next control'],
                  ['focusPrev', 'Focus previous control'],
                  ['routeLeft', 'Arrow-style previous section'],
                  ['routeRight', 'Arrow-style next section'],
                  ['notesNew', 'Notes: new'],
                  ['notesSave', 'Notes: save'],
                  ['notesHideLibrary', 'Notes: toggle library'],
                  ['notesShowLibrary', 'Notes: alternate toggle'],
                  ['diagramsNew', 'Diagrams: new'],
                  ['diagramsSave', 'Diagrams: save'],
                  ['voiceRecord', 'Voice: record'],
                  ['chatCreateRoom', 'Coms: create thread'],
                ] as const
              ).map(([key, label]) => (
                <label className="settings-field" key={key}>
                  <span>{label}</span>
                  <input
                    className="input"
                    value={shortcuts[key]}
                    onChange={(event) =>
                      onSetShortcuts((current) => ({
                        ...current,
                        [key]: normalizeShortcutBinding(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
              <p className="muted">
                Use forms like <code>j</code>, <code>Shift+H</code>, <code>ArrowRight</code>, or two-step sequences like <code>g n</code>.
              </p>
            </div>
          ) : null}

          {activeCategory === 'account' ? (
            <div className="settings-card">
              {session?.user ? (
                <div className="account-avatar-panel">
                  <div className="account-avatar-frame">
                    <UserAvatar user={session.user} className="user-avatar-large" />
                    <button
                      className="account-avatar-upload-button"
                      type="button"
                      aria-label={avatarUploading ? 'Uploading icon' : 'Upload icon'}
                      title={avatarUploading ? 'Uploading…' : 'Upload icon'}
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <UploadIcon />
                    </button>
                  </div>
                  <div className="account-avatar-copy">
                    <strong>{session.user.display_name || session.user.username}</strong>
                    <span className="muted">@{session.user.username}</span>
                    <span className="muted">{session.user.email}</span>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.currentTarget.value = ''
                      if (!file) return
                      setAvatarError(null)
                      setAvatarUploading(true)
                      void onUploadAvatar(file)
                        .catch((error) => {
                          setAvatarError(error instanceof Error ? error.message : 'Avatar upload failed')
                        })
                        .finally(() => setAvatarUploading(false))
                    }}
                  />
                </div>
              ) : null}
              {avatarError ? <div className="muted" style={{ color: '#ff8b8b', marginBottom: 12 }}>{avatarError}</div> : null}
              <div
                className="auth-form"
                style={{ marginBottom: 12 }}
              >
                <div className="settings-list-row">
                  <span>{usernameDraft || 'No username set'}</span>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => {
                      setUsernameDraft(session?.user.username ?? '')
                      setUsernameError(null)
                      setUsernameModalOpen(true)
                    }}
                  >
                    Change Username
                  </button>
                </div>
                <div className="settings-list-row">
                  <span>{emailDraft || 'No email set'}</span>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => {
                      setEmailDraft(isGeneratedLocalEmail(session?.user.email) ? '' : session?.user.email ?? '')
                      setEmailError(null)
                      setEmailModalOpen(true)
                    }}
                  >
                    Change Email
                  </button>
                </div>
                <div className="button-row">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => {
                      setPasswordError(null)
                      setPasswordModalOpen(true)
                    }}
                  >
                    Change Password
                  </button>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={onLogout}
                  >
                    Logout
                  </button>
                </div>
                {credentialsMessage ? <div className="muted">{credentialsMessage}</div> : null}
              </div>
              {usernameModalOpen ? (
                <div className="modal-backdrop" onClick={() => !usernameSaving && setUsernameModalOpen(false)}>
                  <form
                    className="modal-card"
                    onClick={(event) => event.stopPropagation()}
                    onSubmit={async (event) => {
                      event.preventDefault()
                      setUsernameError(null)
                      setCredentialsMessage(null)
                      setUsernameSaving(true)
                      try {
                        const currentVisibleEmail = isGeneratedLocalEmail(session?.user.email) ? '' : session?.user.email ?? ''
                        const message = await onUpdateCredentials({
                          username: usernameDraft,
                          email: currentVisibleEmail,
                        })
                        setCredentialsMessage(message ?? 'Account updated')
                        setUsernameModalOpen(false)
                      } catch (error) {
                        setUsernameError(error instanceof Error ? error.message : 'Failed to update username')
                      } finally {
                        setUsernameSaving(false)
                      }
                    }}
                  >
                    <h3>Change Username</h3>
                    <input
                      className="input"
                      placeholder="Username"
                      value={usernameDraft}
                      onChange={(event) => setUsernameDraft(event.target.value)}
                    />
                    {usernameError ? <div className="muted" style={{ color: '#ff8b8b' }}>{usernameError}</div> : null}
                    <div className="button-row">
                      <button className="button" type="submit" disabled={usernameSaving || !usernameDraft.trim()}>
                        {usernameSaving ? (allowDirectCredentialChanges ? 'Confirming…' : 'Requesting…') : allowDirectCredentialChanges ? 'Confirm' : 'Request'}
                      </button>
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={usernameSaving}
                        onClick={() => {
                          setUsernameModalOpen(false)
                          setUsernameError(null)
                          setUsernameDraft(session?.user.username ?? '')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
              {passwordModalOpen ? (
                <div className="modal-backdrop" onClick={() => !passwordSaving && setPasswordModalOpen(false)}>
                  <form
                    className="modal-card"
                    onClick={(event) => event.stopPropagation()}
                    onSubmit={async (event) => {
                      event.preventDefault()
                      setPasswordError(null)
                      setPasswordSaving(true)
                      try {
                        await onChangePassword({
                          current_password: currentPassword,
                          new_password: newPassword,
                          new_password_confirm: confirmPassword,
                        })
                        setCurrentPassword('')
                        setNewPassword('')
                        setConfirmPassword('')
                        setPasswordModalOpen(false)
                      } catch (error) {
                        setPasswordError(error instanceof Error ? error.message : 'Failed to update password')
                      } finally {
                        setPasswordSaving(false)
                      }
                    }}
                  >
                    <h3>Change Password</h3>
                    <input className="input" type="password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                    <input className="input" type="password" placeholder="New password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    <input className="input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                    {passwordError ? <div className="muted" style={{ color: '#ff8b8b' }}>{passwordError}</div> : null}
                    <div className="button-row">
                      <button className="button" type="submit" disabled={passwordSaving || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()}>
                        {passwordSaving ? 'Updating…' : 'Change password'}
                      </button>
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={passwordSaving}
                        onClick={() => {
                          setPasswordModalOpen(false)
                          setPasswordError(null)
                          setCurrentPassword('')
                          setNewPassword('')
                          setConfirmPassword('')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
              {emailModalOpen ? (
                <div className="modal-backdrop" onClick={() => !emailSaving && setEmailModalOpen(false)}>
                  <form
                    className="modal-card"
                    onClick={(event) => event.stopPropagation()}
                    onSubmit={async (event) => {
                      event.preventDefault()
                      setEmailError(null)
                      setCredentialsMessage(null)
                      setEmailSaving(true)
                      try {
                        const message = await onUpdateCredentials({
                          username: session?.user.username ?? usernameDraft,
                          email: emailDraft,
                        })
                        setCredentialsMessage(message ?? 'Account updated')
                        setEmailModalOpen(false)
                      } catch (error) {
                        setEmailError(error instanceof Error ? error.message : 'Failed to update email')
                      } finally {
                        setEmailSaving(false)
                      }
                    }}
                  >
                    <h3>Change Email</h3>
                    <input
                      className="input"
                      type="email"
                      placeholder="Email"
                      value={emailDraft}
                      onChange={(event) => setEmailDraft(event.target.value)}
                    />
                    {emailError ? <div className="muted" style={{ color: '#ff8b8b' }}>{emailError}</div> : null}
                    <div className="button-row">
                      <button className="button" type="submit" disabled={emailSaving || !emailDraft.trim()}>
                        {emailSaving ? (allowDirectCredentialChanges ? 'Confirming…' : 'Requesting…') : allowDirectCredentialChanges ? 'Confirm' : 'Request'}
                      </button>
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={emailSaving}
                        onClick={() => {
                          setEmailModalOpen(false)
                          setEmailError(null)
                          setEmailDraft(isGeneratedLocalEmail(session?.user.email) ? '' : session?.user.email ?? '')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
