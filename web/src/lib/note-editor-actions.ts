import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import {
  applyMarkdownShortcut,
  createParagraphElement,
  createTableElement,
  editableHtmlToMarkdown,
  editableInlineText,
  ensureEditorBlocks,
  getCurrentBlock,
  isSelectionAtEndOfElement,
  moveCaretToEnd,
  rangeFromViewportPoint,
  transformBlockToCodeFence,
  transformBlockToListItem,
  transformBlockToOrderedListItem,
  transformBlockToTaskListItem,
} from './markdown-editor'
import { insertTextAtSelection, type NoteInsertKind, type NoteToolbarAction } from './ui-helpers'
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
  setNoteDraft: Dispatch<SetStateAction<string>>
  setStatus: Dispatch<SetStateAction<string>>
  setNoteClipboardText: Dispatch<SetStateAction<string>>
  setNoteContextMenu: Dispatch<SetStateAction<NoteContextMenuState>>
  setNoteContextSubmenu: Dispatch<SetStateAction<NoteContextSubmenu>>
  scheduleNoteDraftBroadcast: (markdown: string) => void
}

export function createNoteEditorActions(context: CreateNoteEditorActionsContext) {
  function syncNoteDraftFromEditor() {
    if (!context.noteEditorRef.current) return
    ensureEditorBlocks(context.noteEditorRef.current)
    const markdown = editableHtmlToMarkdown(context.noteEditorRef.current)
    context.setNoteDraft(markdown)
    context.scheduleNoteDraftBroadcast(markdown)
  }

  function restoreNoteContextRange() {
    if (!context.noteContextRangeRef.current) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(context.noteContextRangeRef.current)
  }

  function currentNoteBlock() {
    const selection = window.getSelection()
    return getCurrentBlock(selection)
  }

  function moveCaretToStart(element: HTMLElement) {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function ensureNoteBlockForInsert() {
    const root = context.noteEditorRef.current
    if (!root) return null
    ensureEditorBlocks(root)
    restoreNoteContextRange()
    const existing = currentNoteBlock()
    if (existing) return existing
    const paragraph = createParagraphElement()
    root.appendChild(paragraph)
    moveCaretToEnd(paragraph)
    return paragraph
  }

  function prepareEditorSelection() {
    const root = context.noteEditorRef.current
    if (!root) return null
    root.focus()
    ensureEditorBlocks(root)
    restoreNoteContextRange()
    return root
  }

  function replaceNoteBlock(block: HTMLElement, nextTag: keyof HTMLElementTagNameMap) {
    const replacement = document.createElement(nextTag)
    const text = (block.textContent ?? '').replace(/\u00a0/g, ' ').trim()
    replacement.innerHTML = text ? editableInlineText(text) : '<br>'
    block.replaceWith(replacement)
    moveCaretToEnd(replacement)
    return replacement
  }

  function splitBlockIntoParagraphAtSelection(block: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) return null

    const beforeRange = range.cloneRange()
    beforeRange.selectNodeContents(block)
    beforeRange.setEnd(range.startContainer, range.startOffset)

    const afterRange = range.cloneRange()
    afterRange.selectNodeContents(block)
    afterRange.setStart(range.endContainer, range.endOffset)

    const beforeText = beforeRange.toString().replace(/\u00a0/g, ' ')
    const afterText = afterRange.toString().replace(/\u00a0/g, ' ')

    block.innerHTML = beforeText ? editableInlineText(beforeText) : '<br>'
    const paragraph = createParagraphElement()
    paragraph.innerHTML = afterText ? editableInlineText(afterText) : '<br>'
    block.parentElement?.insertBefore(paragraph, block.nextSibling)
    moveCaretToStart(paragraph)
    return paragraph
  }

  function insertNoteElement(kind: NoteInsertKind) {
    const root = context.noteEditorRef.current
    if (!root) return
    root.focus()
    const block = ensureNoteBlockForInsert()
    if (!block) return

    if (kind === 'paragraph') {
      replaceNoteBlock(block, 'p')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'heading-1') {
      replaceNoteBlock(block, 'h1')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'heading-2') {
      replaceNoteBlock(block, 'h2')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'heading-3') {
      replaceNoteBlock(block, 'h3')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'quote') {
      replaceNoteBlock(block, 'blockquote')
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'bullet-list') {
      if (block.tagName.toLowerCase() !== 'li') {
        transformBlockToListItem(block)
      }
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'numbered-list') {
      if (block.tagName.toLowerCase() !== 'li') {
        transformBlockToOrderedListItem(block, 1)
      }
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'task-list') {
      if (block.tagName.toLowerCase() !== 'li' || !block.dataset.task) {
        transformBlockToTaskListItem(block, false)
      }
      syncNoteDraftFromEditor()
      return
    }
    if (kind === 'code-block') {
      transformBlockToCodeFence(block)
      syncNoteDraftFromEditor()
      return
    }

    const parent = block.parentElement
    if (!parent) return

    if (kind === 'divider') {
      const hr = document.createElement('hr')
      const paragraph = createParagraphElement()
      parent.insertBefore(hr, block.nextSibling)
      parent.insertBefore(paragraph, hr.nextSibling)
      moveCaretToEnd(paragraph)
      syncNoteDraftFromEditor()
      return
    }

    if (kind === 'table') {
      const { table, focusTarget } = createTableElement()
      const paragraph = createParagraphElement()
      parent.insertBefore(table, block.nextSibling)
      parent.insertBefore(paragraph, table.nextSibling)
      moveCaretToEnd(focusTarget)
      syncNoteDraftFromEditor()
    }
  }

  function runToolbarAction(action: NoteToolbarAction) {
    if (context.noteEditorMode !== 'rich') return
    const root = prepareEditorSelection()
    if (!root) return

    if (action === 'undo' || action === 'redo') {
      document.execCommand(action)
      syncNoteDraftFromEditor()
      return
    }

    if (action === 'bold' || action === 'italic' || action === 'underline') {
      document.execCommand(action)
      syncNoteDraftFromEditor()
      return
    }

    if (action === 'link') {
      const selection = window.getSelection()
      const selectedText = selection?.toString().trim() ?? ''
      const url = window.prompt('Enter link URL', 'https://')
      if (!url?.trim()) return
      if (selectedText) {
        document.execCommand('createLink', false, url.trim())
      } else {
        insertTextAtSelection(`[link](${url.trim()})`)
      }
      syncNoteDraftFromEditor()
      return
    }

    if (action === 'heading-1') {
      insertNoteElement('heading-1')
      return
    }
    if (action === 'heading-2') {
      insertNoteElement('heading-2')
      return
    }
    if (action === 'heading-3') {
      insertNoteElement('heading-3')
      return
    }
    if (action === 'divider') {
      insertNoteElement('divider')
      return
    }
    if (action === 'bullet-list') {
      insertNoteElement('bullet-list')
      return
    }
    if (action === 'code-block') {
      insertNoteElement('code-block')
      return
    }
    if (action === 'table') {
      insertNoteElement('table')
      return
    }
    if (action === 'quote') {
      insertNoteElement('quote')
    }
  }

  function addTableRowFromContext(position: 'before' | 'after') {
    const table = context.noteContextTableRef.current
    if (!table) return
    const cell = context.noteContextCellRef.current
    const referenceRow = (cell?.closest('tr') as HTMLTableRowElement | null) ?? table.querySelector('tbody tr') ?? table.querySelector('tr')
    if (!referenceRow) return
    const nextRow = document.createElement('tr')
    const cells = Array.from(referenceRow.children)
    cells.forEach((sourceCell) => {
      const nextCell = document.createElement(sourceCell.tagName.toLowerCase())
      nextCell.innerHTML = '<br>'
      nextRow.appendChild(nextCell)
    })

    const tbody = table.querySelector('tbody')
    if (tbody) {
      const rowParent = referenceRow.parentElement
      if (rowParent === tbody) {
        tbody.insertBefore(nextRow, position === 'before' ? referenceRow : referenceRow.nextSibling)
      } else {
        tbody.insertBefore(nextRow, position === 'before' ? tbody.firstChild : null)
      }
    } else {
      referenceRow.parentElement?.insertBefore(nextRow, position === 'before' ? referenceRow : referenceRow.nextSibling)
    }

    const focusTarget = nextRow.children[0]
    if (focusTarget instanceof HTMLElement) {
      moveCaretToEnd(focusTarget)
    }
    syncNoteDraftFromEditor()
  }

  function addTableColumnFromContext(position: 'before' | 'after') {
    const table = context.noteContextTableRef.current
    if (!table) return
    const cell = context.noteContextCellRef.current
    const columnIndex = cell?.cellIndex ?? ((table.querySelector('tr')?.children.length ?? 1) - 1)
    const rows = Array.from(table.querySelectorAll('tr'))
    rows.forEach((row) => {
      const rowCells = Array.from(row.children)
      const sourceCell = rowCells[Math.min(columnIndex, rowCells.length - 1)]
      const nextCell = document.createElement(sourceCell?.tagName?.toLowerCase() === 'th' ? 'th' : 'td')
      nextCell.innerHTML = nextCell.tagName.toLowerCase() === 'th' ? `Column ${rowCells.length + 1}` : '<br>'
      row.insertBefore(nextCell, position === 'before' ? sourceCell ?? null : sourceCell?.nextSibling ?? null)
    })

    const targetRow =
      (cell?.closest('tr') as HTMLTableRowElement | null) ??
      (table.querySelector('tbody tr') as HTMLTableRowElement | null) ??
      (table.querySelector('tr') as HTMLTableRowElement | null)
    const focusIndex = position === 'before' ? columnIndex : Math.min(columnIndex + 1, (targetRow?.children.length ?? 1) - 1)
    const focusTarget = targetRow?.children[focusIndex]
    if (focusTarget instanceof HTMLElement) {
      moveCaretToEnd(focusTarget)
    }
    syncNoteDraftFromEditor()
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
    syncNoteDraftFromEditor()
  }

  function openNoteContextMenu(event: MouseEvent | React.MouseEvent<HTMLDivElement>) {
    if (!context.selectedNote || context.noteEditorMode !== 'rich') return
    event.preventDefault()
    context.noteEditorRef.current?.focus()
    const range = rangeFromViewportPoint(event.clientX, event.clientY)
    if (range) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      context.noteContextRangeRef.current = range.cloneRange()
    } else if (window.getSelection()?.rangeCount) {
      context.noteContextRangeRef.current = window.getSelection()?.getRangeAt(0).cloneRange() ?? null
    }
    const eventTarget = event.target as HTMLElement | null
    const tableCell = eventTarget?.closest('td, th') as HTMLTableCellElement | null
    const table = eventTarget?.closest('table') as HTMLTableElement | null
    context.noteContextCellRef.current = tableCell
    context.noteContextTableRef.current = table
    context.setNoteContextSubmenu(null)
    void navigator.clipboard
      .readText()
      .then((text) => context.setNoteClipboardText(text))
      .catch(() => context.setNoteClipboardText(''))
    context.setNoteContextMenu({ x: event.clientX, y: event.clientY, kind: table ? 'table' : 'default' })
  }

  function handleNoteEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (context.noteEditorRef.current) {
      ensureEditorBlocks(context.noteEditorRef.current)
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      insertTextAtSelection('\t')
      syncNoteDraftFromEditor()
      return
    }
    const selection = window.getSelection()
    const block = getCurrentBlock(selection)
    if (!block) return

    if (event.key === 'Enter') {
      const tag = block.tagName.toLowerCase()

      if (tag === 'li') {
        event.preventDefault()
        const list = block.parentElement
        if (!list) return
        const isTaskItem = Boolean(block.dataset.task)

        if ((block.textContent ?? '').trim() === '') {
          const paragraph = createParagraphElement()
          if (list.children.length === 1) {
            list.replaceWith(paragraph)
          } else {
            list.parentElement?.insertBefore(paragraph, list.nextSibling)
            block.remove()
          }
          moveCaretToEnd(paragraph)
          syncNoteDraftFromEditor()
          return
        }

        const nextItem = document.createElement('li')
        if (isTaskItem) {
          nextItem.dataset.task = 'unchecked'
          nextItem.innerHTML =
            '<span class=\"task-checkbox\" contenteditable=\"false\" data-task-checkbox=\"true\" aria-hidden=\"true\"></span><span class=\"task-content\"><br></span>'
        } else {
          nextItem.innerHTML = '<br>'
        }
        list.insertBefore(nextItem, block.nextSibling)
        const focusTarget = nextItem.querySelector('.task-content')
        moveCaretToEnd(focusTarget instanceof HTMLElement ? focusTarget : nextItem)
        syncNoteDraftFromEditor()
        return
      }

      if (tag === 'pre') {
        const code = block.querySelector('code')
        const text = code?.textContent?.replace(/\u00a0/g, ' ') ?? ''
        if (isSelectionAtEndOfElement(code instanceof HTMLElement ? code : block) && (text === '' || text.endsWith('\n'))) {
          event.preventDefault()
          const paragraph = createParagraphElement()
          block.parentElement?.insertBefore(paragraph, block.nextSibling)
          moveCaretToEnd(paragraph)
          syncNoteDraftFromEditor()
          return
        }
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag)) {
        event.preventDefault()
        splitBlockIntoParagraphAtSelection(block)
        syncNoteDraftFromEditor()
      }
    }
  }

  function handleNoteEditorInput() {
    if (context.noteEditorRef.current) {
      ensureEditorBlocks(context.noteEditorRef.current)
    }
    const selection = window.getSelection()
    const block = getCurrentBlock(selection)
    if (!block) {
      syncNoteDraftFromEditor()
      return
    }

    const transformed = applyMarkdownShortcut(block)
    void transformed
    syncNoteDraftFromEditor()
  }

  function handleNoteEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    if (!target) return
    const checkbox = target.closest('[data-task-checkbox=\"true\"]')
    if (!checkbox) return
    event.preventDefault()
    const item = checkbox.closest('li[data-task]') as HTMLElement | null
    if (!item) return
    item.dataset.task = item.dataset.task === 'checked' ? 'unchecked' : 'checked'
    syncNoteDraftFromEditor()
  }

  return {
    syncNoteDraftFromEditor,
    restoreNoteContextRange,
    insertNoteElement,
    addTableRowFromContext,
    addTableColumnFromContext,
    copyNoteSelection,
    pasteIntoNoteFromClipboard,
    runToolbarAction,
    openNoteContextMenu,
    handleNoteEditorKeyDown,
    handleNoteEditorInput,
    handleNoteEditorClick,
  }
}
