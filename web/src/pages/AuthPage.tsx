import { useState } from 'react'
import type { ChangePasswordRequest, SetupAdminRequest } from '../lib/types'

type Props = {
  mode: 'setup' | 'login' | 'change-password'
  status: string
  ssoConfigured: boolean
  onLogin: (identifier: string, password: string) => Promise<void>
  onSetupAdmin: (payload: SetupAdminRequest) => Promise<void>
  onChangePassword: (payload: ChangePasswordRequest) => Promise<void>
}

export function AuthPage({ mode, status, ssoConfigured, onLogin, onSetupAdmin, onChangePassword }: Props) {
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

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>{mode === 'setup' ? 'Create Admin Account' : 'Sign In'}</h1>
        <p className="muted">
          {mode === 'setup'
            ? 'This instance has not been initialized yet. Create the first admin account to finish setup.'
            : mode === 'change-password'
              ? 'Change your password before continuing.'
              : 'Sign in with your username or email.'}
        </p>
        {mode === 'setup' ? (
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
        <div className="muted">{status}</div>
        {ssoConfigured ? <div className="muted">SSO is configured and can be linked to accounts in a later pass.</div> : null}
      </div>
    </section>
  )
}
