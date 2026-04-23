import { useMemo, useState } from 'react'
import { DEFAULT_APPEARANCE, DEFAULT_NAV_ORDER, DEFAULT_SHORTCUTS, FONT_OPTIONS, type AppearanceSettings, type NavItemPath, type ShortcutSettings } from '../lib/app-config'
import type { OidcConfig, RtcConfig, SessionResponse } from '../lib/types'
import { normalizeShortcutBinding } from '../lib/shortcuts'

type NavItem = {
  path: NavItemPath
  label: string
}

type SettingsCategory = 'appearance' | 'shortcuts' | 'navigation' | 'account'

type Props = {
  appearance: AppearanceSettings
  shortcuts: ShortcutSettings
  orderedNavItems: NavItem[]
  session: SessionResponse | null
  status: string
  oidc: OidcConfig | null
  rtcConfig: RtcConfig | null
  clientId: string
  canCustomizeAppearance: boolean
  onSetAppearance: React.Dispatch<React.SetStateAction<AppearanceSettings>>
  onSetShortcuts: React.Dispatch<React.SetStateAction<ShortcutSettings>>
  onSetNavOrder: React.Dispatch<React.SetStateAction<NavItemPath[]>>
}

const CATEGORY_LABELS: Array<{ key: SettingsCategory; label: string }> = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'shortcuts', label: 'Shortcuts' },
  { key: 'navigation', label: 'Navigation' },
  { key: 'account', label: 'Account' },
]

export function SettingsPage({
  appearance,
  shortcuts,
  orderedNavItems,
  session,
  status,
  oidc,
  rtcConfig,
  clientId,
  canCustomizeAppearance,
  onSetAppearance,
  onSetShortcuts,
  onSetNavOrder,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')

  const accountDebug = useMemo(
    () =>
      JSON.stringify(
        {
          user: session?.user.email,
          displayName: session?.user.display_name,
          status,
          oidcIssuer: oidc?.issuer || 'not configured',
          rtcTurn: rtcConfig?.turn_urls ?? [],
        },
        null,
        2,
      ),
    [oidc?.issuer, rtcConfig?.turn_urls, session?.user.display_name, session?.user.email, status],
  )

  return (
    <section className="panel settings-panel">
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-list">
            {CATEGORY_LABELS.map((category) => (
              <button
                key={category.key}
                className={`settings-sidebar-link ${activeCategory === category.key ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.key)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </aside>
        <div className="settings-content">
          {activeCategory === 'appearance' ? (
            <div className="settings-card">
              <h3>Appearance</h3>
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
              <p className="muted">
                {appearance.mode === 'custom'
                  ? 'Custom keeps your own accent, margins, and rounding live.'
                  : `Using the ${appearance.mode} preset with your current margin controls.`}
              </p>
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
                    <span>Gradient start</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientStart}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, gradientStart: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientStart}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            gradientStart: event.target.value || DEFAULT_APPEARANCE.gradientStart,
                            mode: 'custom',
                          }))
                        }
                      />
                    </div>
                  </label>
                  <label className="settings-field">
                    <span>Gradient end</span>
                    <div className="color-row">
                      <input
                        className="color-picker"
                        type="color"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientEnd}
                        onChange={(event) => onSetAppearance((current) => ({ ...current, gradientEnd: event.target.value, mode: 'custom' }))}
                      />
                      <input
                        className="input"
                        disabled={!canCustomizeAppearance}
                        value={appearance.gradientEnd}
                        onChange={(event) =>
                          onSetAppearance((current) => ({
                            ...current,
                            gradientEnd: event.target.value || DEFAULT_APPEARANCE.gradientEnd,
                            mode: 'custom',
                          }))
                        }
                      />
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
                  <p className="muted">
                    Nav, panels, and fields are derived automatically from your background color.
                  </p>
                </>
              ) : null}
              {!canCustomizeAppearance ? <p className="muted">Your role cannot change personal appearance settings.</p> : null}
            </div>
          ) : null}

          {activeCategory === 'shortcuts' ? (
            <div className="settings-card">
              <h3>Shortcuts</h3>
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

          {activeCategory === 'navigation' ? (
            <div className="settings-card">
              <h3>Navigation</h3>
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
          ) : null}

          {activeCategory === 'account' ? (
            <div className="settings-card">
              <h3>Account</h3>
              <div className="code-block" style={{ marginBottom: 12 }}>
                {accountDebug}
              </div>
              {oidc?.authorization_url ? (
                <a
                  className="button-secondary"
                  href={`${oidc.authorization_url}?client_id=${encodeURIComponent(oidc.client_id)}&response_type=code&redirect_uri=${encodeURIComponent(oidc.redirect_url)}&scope=openid%20profile%20email&state=${encodeURIComponent(clientId)}`}
                  style={{ display: 'inline-flex', textDecoration: 'none' }}
                >
                  Start Authentik SSO
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
