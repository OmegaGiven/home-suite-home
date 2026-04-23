import type { ShortcutSettings } from '../lib/app-config'

type Props = {
  shortcuts: ShortcutSettings
}

export function ShortcutsPopover({ shortcuts }: Props) {
  return (
    <div className="shortcuts-popover">
      <h3>Shortcuts</h3>
      <div className="help-grid">
        <div><code>{shortcuts.previousSection}</code> / <code>{shortcuts.nextSection}</code></div>
        <div>Previous / next app section</div>
        <div><code>{shortcuts.notesJump}</code>, <code>{shortcuts.filesJump}</code>, <code>{shortcuts.diagramsJump}</code>, <code>{shortcuts.voiceJump}</code>, <code>{shortcuts.chatJump}</code>, <code>{shortcuts.callsJump}</code>, <code>{shortcuts.settingsJump}</code></div>
        <div>Jump to Notes / Files / Diagrams / Voice / Coms / Coms / Settings</div>
        <div><code>{shortcuts.focusNext}</code> / <code>{shortcuts.focusPrev}</code></div>
        <div>Move focus through controls on most pages</div>
        <div><code>{shortcuts.routeLeft}</code> / <code>{shortcuts.routeRight}</code></div>
        <div>Move between app sections outside Files</div>
        <div><code>Tab</code></div>
        <div>Insert a tab in note raw/rich editors and diagram XML</div>
        <div><code>Notes:</code> <code>{shortcuts.notesNew}</code> / <code>{shortcuts.notesSave}</code> / <code>{shortcuts.notesHideLibrary}</code> / <code>{shortcuts.notesShowLibrary}</code></div>
        <div>New note / save / toggle library / alternate toggle</div>
        <div><code>Files:</code> <code>j</code> <code>k</code> <code>h</code> <code>l</code> <code>gg</code> <code>G</code> <code>Space</code> <code>Delete</code> <code>y</code> <code>?</code></div>
        <div>Yazi-style navigation, mark, copy paths, help</div>
        <div><code>Diagrams:</code> <code>{shortcuts.diagramsNew}</code> / <code>{shortcuts.diagramsSave}</code></div>
        <div>New diagram / save</div>
        <div><code>Voice:</code> <code>{shortcuts.voiceRecord}</code></div>
        <div>Record or stop memo</div>
        <div><code>Coms:</code> <code>{shortcuts.chatCreateRoom}</code></div>
        <div>Create thread</div>
      </div>
    </div>
  )
}
