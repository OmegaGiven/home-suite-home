import { useState, type ReactNode } from 'react'
import type { NoteToolbarAction } from '../../lib/ui-helpers'

type Props = {
  onRunAction: (action: NoteToolbarAction) => void
}

type ToolbarButton = {
  key: NoteToolbarAction
  label: string
  title: string
  content: ReactNode
}

const BUTTONS: ToolbarButton[] = [
  { key: 'undo', label: 'Undo', title: 'Undo', content: '↶' },
  { key: 'redo', label: 'Redo', title: 'Redo', content: '↷' },
  { key: 'bold', label: 'Bold', title: 'Bold', content: <strong>B</strong> },
  { key: 'italic', label: 'Italic', title: 'Italic', content: <em>I</em> },
  { key: 'underline', label: 'Underline', title: 'Underline', content: <span className="notes-toolbar-underline">U</span> },
  { key: 'divider', label: 'Divider', title: 'Divider', content: '─' },
  { key: 'bullet-list', label: 'Bullets', title: 'Bulleted list', content: '••' },
  { key: 'code-block', label: 'Code', title: 'Code block', content: '[ ]' },
  { key: 'table', label: 'Table', title: 'Table', content: '⊞' },
  { key: 'quote', label: 'Quote', title: 'Quote', content: '❞' },
  { key: 'link', label: 'Link', title: 'Insert link', content: '🔗' },
]

export function NotesFormatToolbar({ onRunAction }: Props) {
  const [headingValue, setHeadingValue] = useState('')

  return (
    <div className="notes-format-toolbar" role="toolbar" aria-label="Note formatting tools">
      <label className="notes-format-toolbar-select-wrap" aria-label="Heading level">
        <select
          className="notes-format-toolbar-select"
          value={headingValue}
          onChange={(event) => {
            const nextValue = event.target.value as '' | 'heading-1' | 'heading-2' | 'heading-3'
            if (!nextValue) return
            onRunAction(nextValue)
            setHeadingValue('')
          }}
        >
          <option value="">H</option>
          <option value="heading-1">H1</option>
          <option value="heading-2">H2</option>
          <option value="heading-3">H3</option>
        </select>
      </label>
      {BUTTONS.map((button) => (
        <button
          key={button.key}
          type="button"
          className={`notes-format-toolbar-button ${button.key === 'undo' || button.key === 'redo' ? 'notes-format-toolbar-button-round' : ''}`}
          aria-label={button.label}
          title={button.title}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onRunAction(button.key)}
        >
          {button.content}
        </button>
      ))}
    </div>
  )
}
