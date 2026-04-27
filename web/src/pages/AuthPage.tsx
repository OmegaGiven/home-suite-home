import { useEffect, useState } from 'react'
import { getNativePlatform, isNativePlatform, openExternalUrl } from '../lib/platform'
import type { ChangePasswordRequest, SetupAdminRequest } from '../lib/types'

type ApkReleaseInfo = {
  title: string
  publishedAt: string
  downloadUrl: string
  releaseUrl: string
  assetName: string
}

type Props = {
  mode: 'connect' | 'setup' | 'login' | 'change-password'
  status: string
  ssoConfigured: boolean
  serverUrl: string
  onSaveServerUrl: (url: string) => Promise<void>
  onEditServerUrl?: () => void
  onLogin: (identifier: string, password: string) => Promise<void>
  onSetupAdmin: (payload: SetupAdminRequest) => Promise<void>
  onChangePassword: (payload: ChangePasswordRequest) => Promise<void>
}

export function AuthPage({ mode, status, ssoConfigured, serverUrl, onSaveServerUrl, onEditServerUrl, onLogin, onSetupAdmin, onChangePassword }: Props) {
  const [serverDraft, setServerDraft] = useState(serverUrl)
  const [apkReleaseInfo, setApkReleaseInfo] = useState<ApkReleaseInfo | null>(null)
  const [apkReleaseLoading, setApkReleaseLoading] = useState(false)
  const [apkReleaseError, setApkReleaseError] = useState<string | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [changePassword, setChangePassword] = useState<ChangePasswordRequest>({
    identifier: '',
    current_password: '',
    new_password: '',
    new_password_confirm: '',
  })
  const [form, setForm] = useState<SetupAdminRequest>({
    username: '',
    email: '',
    display_name: '',
    password: '',
    password_confirm: '',
  })

  useEffect(() => {
    setServerDraft(serverUrl)
  }, [serverUrl])

  const isAndroidNative = isNativePlatform() && getNativePlatform() === 'android'

  async function loadApkReleaseInfo() {
    setApkReleaseLoading(true)
    setApkReleaseError(null)
    try {
      const response = await fetch('https://api.github.com/repos/OmegaGiven/home-suite-home/releases/tags/android-latest')
      if (!response.ok) {
        throw new Error(`GitHub release lookup failed (${response.status})`)
      }
      const payload = (await response.json()) as {
        name?: string
        html_url?: string
        published_at?: string
        assets?: Array<{ name?: string; browser_download_url?: string }>
      }
      const apkAsset = payload.assets?.find((asset) => asset.name?.toLowerCase().endsWith('.apk') && asset.browser_download_url)
      if (!apkAsset?.browser_download_url) {
        throw new Error('No APK asset is published yet.')
      }
      setApkReleaseInfo({
        title: payload.name?.trim() || 'Latest Android build',
        publishedAt: payload.published_at || '',
        downloadUrl: apkAsset.browser_download_url,
        releaseUrl: payload.html_url || apkAsset.browser_download_url,
        assetName: apkAsset.name || 'sweet-android-latest.apk',
      })
    } catch (error) {
      setApkReleaseInfo(null)
      setApkReleaseError(error instanceof Error ? error.message : 'Could not check for Android updates')
    } finally {
      setApkReleaseLoading(false)
    }
  }

  useEffect(() => {
    if (!isAndroidNative) return
    void loadApkReleaseInfo()
  }, [isAndroidNative])

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>{mode === 'connect' ? 'Connect to Server' : mode === 'setup' ? 'Create Admin Account' : 'Sign In'}</h1>
        <p className="muted">
          {mode === 'connect'
            ? 'Enter the Home Suite Home server URL you want this app to use.'
            : mode === 'setup'
            ? 'This instance has not been initialized yet. Create the first admin account to finish setup.'
            : mode === 'change-password'
              ? 'Change your password before continuing.'
              : 'Sign in with your username or email.'}
        </p>
        {mode === 'connect' ? (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onSaveServerUrl(serverDraft)
            }}
          >
            <input
              className="input"
              placeholder="https://your-server.example.com"
              value={serverDraft}
              onChange={(event) => setServerDraft(event.target.value)}
            />
            <button className="button" type="submit" disabled={!serverDraft.trim()}>
              Connect
            </button>
          </form>
        ) : mode === 'setup' ? (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onSetupAdmin(form)
            }}
          >
            <input className="input" placeholder="Username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
            <input className="input" placeholder="Email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            <input className="input" placeholder="Display name" value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} />
            <input className="input" type="password" placeholder="Password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            <input className="input" type="password" placeholder="Confirm password" value={form.password_confirm} onChange={(event) => setForm((current) => ({ ...current, password_confirm: event.target.value }))} />
            <button className="button" type="submit">Create admin account</button>
          </form>
        ) : mode === 'change-password' ? (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onChangePassword(changePassword)
            }}
          >
            <input className="input" placeholder="Username or email" value={changePassword.identifier} onChange={(event) => setChangePassword((current) => ({ ...current, identifier: event.target.value }))} />
            <input className="input" type="password" placeholder="Current password" value={changePassword.current_password} onChange={(event) => setChangePassword((current) => ({ ...current, current_password: event.target.value }))} />
            <input className="input" type="password" placeholder="New password" value={changePassword.new_password} onChange={(event) => setChangePassword((current) => ({ ...current, new_password: event.target.value }))} />
            <input className="input" type="password" placeholder="Confirm new password" value={changePassword.new_password_confirm} onChange={(event) => setChangePassword((current) => ({ ...current, new_password_confirm: event.target.value }))} />
            <button className="button" type="submit">Change password</button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onLogin(identifier, password)
            }}
          >
            <input className="input" placeholder="Username or email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            <input className="input" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="button" type="submit">Sign in</button>
          </form>
        )}
        {mode !== 'connect' && onEditServerUrl ? (
          <button className="button-secondary" type="button" onClick={onEditServerUrl}>
            Change Server
          </button>
        ) : null}
        {isAndroidNative ? (
          <div className="settings-card">
            <h3>Android app updates</h3>
            <p className="muted">
              If this app is too old to connect cleanly, download the latest APK directly from GitHub Releases.
            </p>
            {apkReleaseInfo ? (
              <div className="settings-list" style={{ marginBottom: 12 }}>
                <div className="settings-list-row">
                  <span>Release</span>
                  <strong>{apkReleaseInfo.title}</strong>
                </div>
                <div className="settings-list-row">
                  <span>Package</span>
                  <strong>{apkReleaseInfo.assetName}</strong>
                </div>
                <div className="settings-list-row">
                  <span>Published</span>
                  <strong>{apkReleaseInfo.publishedAt ? new Date(apkReleaseInfo.publishedAt).toLocaleString() : 'Unknown'}</strong>
                </div>
              </div>
            ) : null}
            {apkReleaseError ? <div className="muted" style={{ color: '#ff8b8b', marginBottom: 12 }}>{apkReleaseError}</div> : null}
            <div className="button-row">
              <button className="button-secondary" type="button" disabled={apkReleaseLoading} onClick={() => void loadApkReleaseInfo()}>
                {apkReleaseLoading ? 'Checking…' : 'Check update'}
              </button>
              <button
                className="button"
                type="button"
                disabled={!apkReleaseInfo}
                onClick={() => {
                  if (!apkReleaseInfo) return
                  void openExternalUrl(apkReleaseInfo.downloadUrl)
                }}
              >
                Update to latest
              </button>
            </div>
          </div>
        ) : null}
        <div className="muted">{status}</div>
        {ssoConfigured ? <div className="muted">SSO is configured and can be linked to accounts in a later pass.</div> : null}
      </div>
    </section>
  )
}
