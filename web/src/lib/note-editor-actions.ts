import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { insertTextAtSelection } from './ui-helpers'
import type { NoteContextMenuState, NoteContextSubmenu } from './app-config'
import type { Note } from './types'

type CreateNoteEditorActionsContext = {
  selectedNote: Note | null
  noteEditorMode: 'rich' | 'raw'
  noteEditorRef: RefObject<HTMLDivElement | null>
  noteContextRangeRef: MutableRefObject<Range | null>
  noteContextTableRef: MutableRefObject<HTMLTableElement | null>
  noteContextCellRef: MutableRefObject<HTMLTableCellElement | null>
  noteClipboardText: string
  setStatus: Dispatch<SetStateAction<string>>
  setNoteClipboardText: Dispatch<SetStateAction<string>>
  setNoteContextMenu: Dispatch<SetStateAction<NoteContextMenuState>>
  setNoteContextSubmenu: Dispatch<SetStateAction<NoteContextSubmenu>>
}

export function createNoteEditorActions(context: CreateNoteEditorActionsContext) {
  function restoreNoteContextRange() {
    if (!context.noteContextRangeRef.current) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(context.noteContextRangeRef.current)
  }

  async function copyNoteSelection() {
    const selectedText = window.getSelection()?.toString().trim()
    if (!selectedText) return
    try {
      await navigator.clipboard.writeText(selectedText)
      context.setStatus('Copied selection')
    } catch {
      context.setStatus('Clipboard copy failed')
    }
  }

  async function pasteIntoNoteFromClipboard() {
    const text = context.noteClipboardText.trim()
    if (!text || !context.noteEditorRef.current) return
    context.noteEditorRef.current.focus()
    restoreNoteContextRange()
    insertTextAtSelection(text)
  }

  function openNoteContextMenu(event: MouseEvent | React.MouseEvent<HTMLDivElement>) {
    if (!context.selectedNote || context.noteEditorMode !== 'rich') return
    event.preventDefault()
    context.noteEditorRef.current?.focus()
    const range =
      document.caretRangeFromPoint?.(event.clientX, event.clientY) ??
      (() => {
        const position = document.caretPositionFromPoint?.(event.clientX, event.clientY)
        if (!position) return null
        const nextRange = document.createRange()
        nextRange.setStart(position.offsetNode, position.offset)
        nextRange.collapse(true)
        return nextRange
      })()

    if (range) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      context.noteContextRangeRef.current = range.cloneRange()
    } else if (window.getSelection()?.rangeCount) {
      context.noteContextRangeRef.current = window.getSelection()?.getRangeAt(0).cloneRange() ?? null
    }

    const eventTarget = event.target as HTMLElement | null
    context.noteContextCellRef.current = eventTarget?.closest('td, th') as HTMLTableCellElement | null
    context.noteContextTableRef.current = eventTarget?.closest('table') as HTMLTableElement | null
    context.setNoteContextSubmenu(null)
    void navigator.clipboard
      .readText()
      .then((text) => context.setNoteClipboardText(text))
      .catch(() => context.setNoteClipboardText(''))
    context.setNoteContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: context.noteContextTableRef.current ? 'table' : 'default',
    })
  }

  return {
    copyNoteSelection,
    pasteIntoNoteFromClipboard,
    openNoteContextMenu,
  }
}
