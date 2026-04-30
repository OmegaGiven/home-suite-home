import { useEffect, useMemo, useRef } from 'react'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { screenColors } from '../theme/tokens'

type Props = {
  markdown: string
  onMarkdownChange: (markdown: string) => void
  onCursorChange: (offset: number | null) => void
  command?: RichEditorCommand | null
  onLayout?: (event: LayoutChangeEvent) => void
  style?: StyleProp<ViewStyle>
}

export type RichEditorCommand =
  | { id: string; type: 'undo' | 'redo' | 'bold' | 'italic' | 'underline' | 'strike' | 'quote' | 'code' | 'table' }
  | { id: string; type: 'heading'; level: '1' | '2' | '3' }
  | { id: string; type: 'list'; style: 'bullet' | 'dash' | 'checkbox' }
  | { id: string; type: 'link'; url: string }

type EditorMessage =
  | { type: 'ready' }
  | { type: 'change'; markdown: string }
  | { type: 'selection'; offset: number | null }
  | { type: 'error'; message: string }

function escapeForInjection(value: string) {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function normalizedSourceLine(line: string) {
  return line.replace(/\u00a0/g, ' ').replace(/\u200b/g, '').trimStart()
}

function renderInlineHtml(value: string) {
  let html = escapeHtml(value)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*(.+?)\*/g, '$1<em>$2</em>')
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')
  html = html.replace(/<u>(.+?)<\/u>/g, '<u>$1</u>')
  html = html.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
  return html
}

function renderInitialMarkdownHtml(markdown: string) {
  const source = normalizeMarkdown(markdown || '')
  if (!source) return '<p><br></p>'
  const lines = source.split('\n')
  const chunks: string[] = []
  let inCode = false
  let inBullet = false
  let inTask = false
  let inTable = false
  let paragraphLines: string[] = []

  function flushParagraph() {
    if (paragraphLines.length === 0) return
    chunks.push(`<p>${paragraphLines.map((line) => renderInlineHtml(line)).join('<br />')}</p>`)
    paragraphLines = []
  }

  function closeLists() {
    flushParagraph()
    if (inBullet) {
      chunks.push('</ul>')
      inBullet = false
    }
    if (inTask) {
      chunks.push('</ul>')
      inTask = false
    }
  }

  function closeTable() {
    flushParagraph()
    if (inTable) {
      chunks.push('</tbody></table>')
      inTable = false
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const parsedLine = normalizedSourceLine(line)
    if (parsedLine.startsWith('```')) {
      closeLists()
      closeTable()
      chunks.push(inCode ? '</code></pre>' : '<pre><code>')
      inCode = !inCode
      continue
    }
    if (inCode) {
      chunks.push(`${escapeHtml(line)}\n`)
      continue
    }
    const heading = parsedLine.match(/^(#{1,6})\s(.*)$/)
    if (heading) {
      closeLists()
      closeTable()
      const level = heading[1].length
      chunks.push(`<h${level}>${renderInlineHtml((heading[2] || '').trim())}</h${level}>`)
      continue
    }
    const task = parsedLine.match(/^-\s\[( |x)\]\s?(.*)$/i)
    if (task) {
      if (!inTask) {
        closeLists()
        closeTable()
        chunks.push('<ul data-type="taskList">')
        inTask = true
      }
      chunks.push(
        `<li data-type="taskItem"><label><input type="checkbox" ${task[1].toLowerCase() === 'x' ? 'checked' : ''} /></label><div><p>${renderInlineHtml(task[2])}</p></div></li>`,
      )
      continue
    }
    if (inTask) {
      chunks.push('</ul>')
      inTask = false
    }
    const bullet = parsedLine.match(/^[-*]\s(.*)$/)
    if (bullet) {
      if (!inBullet) {
        closeTable()
        chunks.push('<ul>')
        inBullet = true
      }
      chunks.push(`<li><p>${renderInlineHtml(bullet[1])}</p></li>`)
      continue
    }
    if (inBullet) {
      chunks.push('</ul>')
      inBullet = false
    }
    const quote = parsedLine.match(/^>\s(.*)$/)
    if (quote) {
      closeTable()
      chunks.push(`<blockquote><p>${renderInlineHtml(quote[1])}</p></blockquote>`)
      continue
    }
    if (/^\|.+\|$/.test(parsedLine)) {
      if (!inTable) {
        chunks.push('<table><tbody>')
        inTable = true
      }
      if (index + 1 < lines.length && /^\|?\s*[-: ]+\|/.test(normalizedSourceLine(lines[index + 1]))) {
        const cells = parsedLine.split('|').slice(1, -1).map((cell) => cell.trim())
        chunks.push(`<tr>${cells.map((cell) => `<th>${renderInlineHtml(cell)}</th>`).join('')}</tr>`)
        index += 1
        continue
      }
      const cells = parsedLine.split('|').slice(1, -1).map((cell) => cell.trim())
      chunks.push(`<tr>${cells.map((cell) => `<td>${renderInlineHtml(cell)}</td>`).join('')}</tr>`)
      continue
    }
    closeTable()
    if (parsedLine.trim() === '---') {
      chunks.push('<hr />')
      continue
    }
    if (!parsedLine.trim()) {
      flushParagraph()
      continue
    }
    paragraphLines.push(line.replace(/\u00a0/g, ' ').replace(/\u200b/g, ''))
  }

  closeLists()
  closeTable()
  flushParagraph()
  if (inCode) chunks.push('</code></pre>')
  return chunks.join('') || '<p><br></p>'
}

function buildEditorHtml(initialMarkdown: string) {
  const background = screenColors.background
  const surface = screenColors.card
  const text = screenColors.text
  const accent = screenColors.accent
  const muted = screenColors.muted
  const border = screenColors.border
  const initialHtml = renderInitialMarkdownHtml(initialMarkdown)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <style>
      :root {
        color-scheme: light;
        --background: ${background};
        --surface: ${surface};
        --text: ${text};
        --accent: ${accent};
        --muted: ${muted};
        --border: ${border};
      }
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: var(--background);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #editor {
        min-height: 100vh;
        box-sizing: border-box;
        padding: 18px;
        background: var(--background);
      }
      #editor {
        min-height: 100vh;
        outline: none;
        color: var(--text);
        font-size: 17px;
        line-height: 1.55;
        white-space: pre-wrap;
      }
      #editor p.is-editor-empty:first-child::before {
        content: "Start writing";
        color: var(--muted);
        pointer-events: none;
        float: left;
        height: 0;
      }
      #editor a {
        color: var(--accent);
      }
      #editor blockquote {
        border-left: 3px solid var(--accent);
        background: rgba(255,255,255,0.03);
        margin: 1rem 0;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        color: #d7e7fb;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      }
      #editor blockquote p {
        margin: 0;
      }
      #editor pre {
        background: var(--surface);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        padding: 14px 16px;
        overflow-x: auto;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      }
      #editor code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #f4f7fb;
      }
      #editor pre code {
        display: block;
        white-space: pre-wrap;
      }
      #editor table {
        border-collapse: collapse;
        margin: 1rem 0;
        overflow: hidden;
        table-layout: fixed;
        width: 100%;
      }
      #editor td,
      #editor th {
        border: 1px solid var(--border);
        min-width: 1em;
        padding: 8px 10px;
        vertical-align: top;
      }
      #editor th {
        background: var(--surface);
      }
      #editor ul[data-type="taskList"] {
        list-style: none;
        margin-left: 0;
        padding-left: 0;
      }
      #editor ul[data-type="taskList"] li {
        display: flex;
        gap: 0.55rem;
        align-items: flex-start;
        list-style: none;
      }
      #editor ul[data-type="taskList"] li::marker {
        content: "";
      }
      #editor ul[data-type="taskList"] li > label {
        margin-top: 0.2rem;
      }
      #editor hr {
        border: none;
        border-top: 1px solid var(--border);
        margin: 1.25rem 0;
      }
    </style>
  </head>
  <body>
    <div id="editor" contenteditable="true" spellcheck="true" autocapitalize="sentences">${initialHtml}</div>
    <script>
      const post = (payload) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify(payload))
      }
      const INITIAL_MARKDOWN = ${escapeForInjection(initialMarkdown)}
      window.onerror = function(message, source, lineno, colno) {
        post({ type: 'error', message: String(message) + ' @' + String(lineno || 0) + ':' + String(colno || 0) })
      }
      window.onunhandledrejection = function(event) {
        post({ type: 'error', message: 'unhandledrejection: ' + String(event?.reason || '') })
      }

      const normalizeMarkdown = (markdown) =>
        markdown
          .replace(/\\r\\n/g, '\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trimEnd()

      const normalizeSourceLine = (line) =>
        (line || '')
          .replace(/\\u00a0/g, ' ')
          .replace(/\\u200b/g, '')
          .trimStart()

      const escapeHtml = (value) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

      const renderInline = (value) => {
        let html = escapeHtml(value)
        html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        html = html.replace(/(^|[^*])\\*(.+?)\\*/g, '$1<em>$2</em>')
        html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')
        html = html.replace(/<u>(.+?)<\\/u>/g, '<u>$1</u>')
        html = html.replace(/\\[(.+?)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2">$1</a>')
        return html
      }

      const markdownToHtml = (markdown) => {
        const source = normalizeMarkdown(markdown || '')
        if (!source) return '<p><br></p>'
        const lines = source.split('\\n')
        let html = ''
        let inCode = false
        let inBullet = false
        let inTask = false
        let inTable = false
        let paragraphLines = []
        const flushParagraph = () => {
          if (paragraphLines.length === 0) return
          html += '<p>' + paragraphLines.map((line) => renderInline(line)).join('<br />') + '</p>'
          paragraphLines = []
        }
        const closeLists = () => {
          flushParagraph()
          if (inBullet) {
            html += '</ul>'
            inBullet = false
          }
          if (inTask) {
            html += '</ul>'
            inTask = false
          }
        }
        const closeTable = () => {
          flushParagraph()
          if (inTable) {
            html += '</tbody></table>'
            inTable = false
          }
        }
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index]
          const parsedLine = normalizeSourceLine(line)
          if (parsedLine.startsWith('\`\`\`')) {
            closeLists()
            closeTable()
            if (inCode) {
              html += '</code></pre>'
            } else {
              html += '<pre><code>'
            }
            inCode = !inCode
            continue
          }
          if (inCode) {
            html += escapeHtml(line) + '\\n'
            continue
          }
          const heading = parsedLine.match(/^(#{1,6})\\s(.*)$/)
          if (heading) {
            closeLists()
            closeTable()
            const level = heading[1].length
            html += '<h' + level + '>' + renderInline((heading[2] || '').trim()) + '</h' + level + '>'
            continue
          }
          const task = parsedLine.match(/^-\\s\\[( |x)\\]\\s?(.*)$/i)
          if (task) {
            if (!inTask) {
              closeLists()
              closeTable()
              html += '<ul data-type="taskList">'
              inTask = true
            }
            html += '<li data-type="taskItem"><label><input type="checkbox" ' + (task[1].toLowerCase() === 'x' ? 'checked' : '') + ' /></label><div><p>' + renderInline(task[2]) + '</p></div></li>'
            continue
          }
          if (inTask) {
            html += '</ul>'
            inTask = false
          }
          const bullet = parsedLine.match(/^[-*]\\s(.*)$/)
          if (bullet) {
            if (!inBullet) {
              closeTable()
              html += '<ul>'
              inBullet = true
            }
            html += '<li><p>' + renderInline(bullet[1]) + '</p></li>'
            continue
          }
          if (inBullet) {
            html += '</ul>'
            inBullet = false
          }
          const quote = parsedLine.match(/^>\\s(.*)$/)
          if (quote) {
            closeTable()
            html += '<blockquote><p>' + renderInline(quote[1]) + '</p></blockquote>'
            continue
          }
          if (/^\\|.+\\|$/.test(parsedLine)) {
            if (!inTable) {
              html += '<table><tbody>'
              inTable = true
            }
            if (index + 1 < lines.length && /^\\|?\\s*[-: ]+\\|/.test(normalizeSourceLine(lines[index + 1]))) {
              const cells = parsedLine.split('|').slice(1, -1).map((cell) => cell.trim())
              html += '<tr>' + cells.map((cell) => '<th>' + renderInline(cell) + '</th>').join('') + '</tr>'
              index += 1
              continue
            }
            const cells = parsedLine.split('|').slice(1, -1).map((cell) => cell.trim())
            html += '<tr>' + cells.map((cell) => '<td>' + renderInline(cell) + '</td>').join('') + '</tr>'
            continue
          }
          closeTable()
          if (parsedLine.trim() === '---') {
            html += '<hr />'
            continue
          }
          if (!parsedLine.trim()) {
            flushParagraph()
            continue
          }
          paragraphLines.push(line.replace(/\\u00a0/g, ' ').replace(/\\u200b/g, ''))
        }
        closeLists()
        closeTable()
        flushParagraph()
        if (inCode) html += '</code></pre>'
        return html || '<p><br></p>'
      }

      const htmlToMarkdown = (html) => {
        const container = document.createElement('div')
        container.innerHTML = html
        const inlineText = (node) => {
          if (!node) return ''
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || ''
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return ''
          const tag = node.tagName.toLowerCase()
          const childText = () => Array.from(node.childNodes).map((child) => inlineText(child)).join('')
          if (tag === 'strong' || tag === 'b') return '**' + childText() + '**'
          if (tag === 'em' || tag === 'i') return '*' + childText() + '*'
          if (tag === 'u') return '<u>' + childText() + '</u>'
          if (tag === 's' || tag === 'strike') return '~~' + childText() + '~~'
          if (tag === 'a') return '[' + childText() + '](' + (node.getAttribute('href') || 'https://') + ')'
          if (tag === 'br') return '\\n'
          if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return childText()
          if (tag === 'label' && node.querySelector('input[type="checkbox"]')) return ''
          return childText()
        }

        const blocks = []
        Array.from(container.childNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = (node.textContent || '').trim()
            if (text) blocks.push(text)
            return
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return
          const tag = node.tagName.toLowerCase()
          if (tag === 'h1') {
            blocks.push('# ' + inlineText(node).trim())
            return
          }
          if (tag === 'h2') {
            blocks.push('## ' + inlineText(node).trim())
            return
          }
          if (tag === 'h3') {
            blocks.push('### ' + inlineText(node).trim())
            return
          }
          if (tag === 'h4') {
            blocks.push('#### ' + inlineText(node).trim())
            return
          }
          if (tag === 'h5') {
            blocks.push('##### ' + inlineText(node).trim())
            return
          }
          if (tag === 'h6') {
            blocks.push('###### ' + inlineText(node).trim())
            return
          }
          if (tag === 'blockquote') {
            const text = inlineText(node)
              .split('\\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => '> ' + line)
              .join('\\n')
            if (text) blocks.push(text)
            return
          }
          if (tag === 'pre') {
            blocks.push('\`\`\`\\n' + (node.textContent || '').replace(/\\n$/, '') + '\\n\`\`\`')
            return
          }
          if (tag === 'hr') {
            blocks.push('---')
            return
          }
          if (tag === 'ul' && node.getAttribute('data-type') === 'taskList') {
            const items = Array.from(node.children)
              .map((child) => {
                const checked = child.querySelector('input[type="checkbox"]')?.checked
                const text = inlineText(child.querySelector('div') || child).trim()
                return text ? '- [' + (checked ? 'x' : ' ') + '] ' + text : ''
              })
              .filter(Boolean)
            if (items.length > 0) blocks.push(items.join('\\n'))
            return
          }
          if (tag === 'ul') {
            const items = Array.from(node.children)
              .map((child) => {
                const text = inlineText(child).trim()
                return text ? '- ' + text : ''
              })
              .filter(Boolean)
            if (items.length > 0) blocks.push(items.join('\\n'))
            return
          }
          if (tag === 'ol') {
            const items = Array.from(node.children)
              .map((child, index) => {
                const text = inlineText(child).trim()
                return text ? String(index + 1) + '. ' + text : ''
              })
              .filter(Boolean)
            if (items.length > 0) blocks.push(items.join('\\n'))
            return
          }
          if (tag === 'table') {
            const rows = Array.from(node.querySelectorAll('tr'))
            const tableMarkdown = rows
              .map((row, rowIndex) => {
                const cells = Array.from(row.children).map((cell) => inlineText(cell).trim())
                const line = '| ' + cells.join(' | ') + ' |'
                if (rowIndex === 0 && row.querySelector('th')) {
                  return line + '\\n| ' + cells.map(() => '---').join(' | ') + ' |'
                }
                return line
              })
              .join('\\n')
            if (tableMarkdown) blocks.push(tableMarkdown)
            return
          }
          const text = inlineText(node).trim()
          if (text) blocks.push(text)
        })
        return normalizeMarkdown(blocks.join('\\n\\n'))
      }

      const selectionMarkdownOffset = () => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          return null
        }
        const root = document.querySelector('#editor')
        const range = selection.getRangeAt(0)
        if (!root.contains(range.endContainer)) {
          return null
        }
        const prefixRange = document.createRange()
        prefixRange.selectNodeContents(root)
        prefixRange.setEnd(range.endContainer, range.endOffset)
        return prefixRange.toString().length
      }

      const textBeforeCaretInBlock = (block) => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return ''
        const range = selection.getRangeAt(0)
        const prefixRange = document.createRange()
        prefixRange.selectNodeContents(block)
        prefixRange.setEnd(range.endContainer, range.endOffset)
        return prefixRange.toString().replace(/\\u00a0/g, ' ')
      }

      const caretAtEndOfBlock = (block) => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return false
        const range = selection.getRangeAt(0)
        const suffixRange = document.createRange()
        suffixRange.selectNodeContents(block)
        suffixRange.setStart(range.endContainer, range.endOffset)
        return suffixRange.toString().replace(/\\u00a0/g, '') === ''
      }

      const applySelectionOffset = (offset) => {
        const root = document.querySelector('#editor')
        if (!root || offset === null || offset === undefined) return
        const selection = window.getSelection()
        if (!selection) return
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let remaining = Math.max(0, offset)
        let currentNode = null
        while ((currentNode = walker.nextNode())) {
          const length = currentNode.textContent?.length || 0
          if (remaining <= length) {
            const range = document.createRange()
            range.setStart(currentNode, Math.min(remaining, length))
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
            return
          }
          remaining -= length
        }
        const range = document.createRange()
        range.selectNodeContents(root)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }

      const editor = document.querySelector('#editor')
      let renderedMarkdown = ''

      const ensureSelectionInEditor = () => {
        const selection = window.getSelection()
        if (!selection) return null
        if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
          return selection
        }
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
        return selection
      }

      const closestBlock = (node) => {
        let current = node
        while (current && current !== editor) {
          if (
            current.nodeType === Node.ELEMENT_NODE &&
            ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI'].includes(current.tagName)
          ) {
            return current
          }
          current = current.parentNode
        }
        return editor
      }

      const closestListItem = (node) => {
        let current = node
        while (current && current !== editor) {
          if (current.nodeType === Node.ELEMENT_NODE && current.tagName === 'LI') {
            return current
          }
          current = current.parentNode
        }
        return null
      }

      const createParagraph = () => {
        const paragraph = document.createElement('p')
        paragraph.innerHTML = '<br>'
        return paragraph
      }

      const createEmptyListItem = () => {
        const item = document.createElement('li')
        item.innerHTML = '<br>'
        return item
      }

      const replaceCurrentBlock = (builder) => {
        const selection = ensureSelectionInEditor()
        if (!selection || selection.rangeCount === 0) return null
        const block = closestBlock(selection.anchorNode)
        if (!block || !block.parentNode || block === editor) return null
        const nextBlock = builder(block)
        block.parentNode.replaceChild(nextBlock, block)
        placeCaretAtStart(nextBlock.tagName === 'BLOCKQUOTE' ? nextBlock.firstChild : nextBlock)
        return nextBlock
      }

      const placeCaretAtStart = (element) => {
        const selection = window.getSelection()
        if (!selection) return
        const range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }

      const normalizeBlockContents = (block) => {
        if (!block || block === editor) return
        if (block.tagName === 'LI') {
          const text = block.textContent || ''
          block.innerHTML = text ? renderInline(text) : '<br>'
          return
        }
        if (block.tagName === 'BLOCKQUOTE') {
          const paragraph = document.createElement('p')
          const text = block.textContent || ''
          paragraph.innerHTML = text ? renderInline(text) : '<br>'
          block.innerHTML = ''
          block.appendChild(paragraph)
          return
        }
        const text = block.textContent || ''
        block.innerHTML = text ? renderInline(text) : '<br>'
      }

      const applyMarkdownShortcut = (shortcut) => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return false
        const block = closestBlock(selection.anchorNode)
        if (!block) return false
        const parent = block.parentNode
        if (!parent) return false
        let replacement = null
        switch (shortcut) {
          case '#':
            replacement = document.createElement('h1')
            break
          case '##':
            replacement = document.createElement('h2')
            break
          case '###':
            replacement = document.createElement('h3')
            break
          case '>':
            replacement = document.createElement('blockquote')
            replacement.appendChild(createParagraph())
            break
          case '-':
          case '*':
            replacement = document.createElement('ul')
            replacement.appendChild(createEmptyListItem())
            break
          case '1.':
            replacement = document.createElement('ol')
            replacement.appendChild(createEmptyListItem())
            break
          default:
            return false
        }
        if (replacement.tagName !== 'BLOCKQUOTE' && replacement.tagName !== 'UL' && replacement.tagName !== 'OL') {
          replacement.innerHTML = '<br>'
        }
        parent.replaceChild(replacement, block)
        if (replacement.tagName === 'BLOCKQUOTE') {
          placeCaretAtStart(replacement.firstChild)
        } else if (replacement.tagName === 'UL' || replacement.tagName === 'OL') {
          placeCaretAtStart(replacement.firstChild)
        } else {
          placeCaretAtStart(replacement)
        }
        return true
      }

      const handleListEnter = () => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return false
        const item = closestListItem(selection.anchorNode)
        if (!item) return false
        const list = item.parentNode
        if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return false
        const text = (item.textContent || '').replace(/\\u00a0/g, ' ').trim()
        if (!text) {
          const paragraph = createParagraph()
          if (list.nextSibling) {
            list.parentNode.insertBefore(paragraph, list.nextSibling)
          } else {
            list.parentNode.appendChild(paragraph)
          }
          item.remove()
          if (!list.children.length) {
            list.remove()
          }
          placeCaretAtStart(paragraph)
          return true
        }
        const nextItem = createEmptyListItem()
        if (item.nextSibling) {
          list.insertBefore(nextItem, item.nextSibling)
        } else {
          list.appendChild(nextItem)
        }
        placeCaretAtStart(nextItem)
        return true
      }

      const handleBlockExitEnter = () => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return false
        const block = closestBlock(selection.anchorNode)
        if (!block || block === editor) return false
        if (block.tagName === 'LI') return false
        if (['BLOCKQUOTE', 'PRE'].includes(block.tagName)) {
          const beforeCaret = textBeforeCaretInBlock(block)
          if (caretAtEndOfBlock(block) && /\n\s*\n\s*\n$/.test(beforeCaret)) {
            const paragraph = createParagraph()
            if (block.tagName === 'BLOCKQUOTE') {
              const paragraphNode = block.querySelector('p')
              if (paragraphNode) {
                paragraphNode.innerHTML = renderInline(beforeCaret.replace(/\n\s*\n\s*\n$/, '').trim())
              }
            } else {
              const codeNode = block.querySelector('code')
              if (codeNode) {
                codeNode.textContent = beforeCaret.replace(/\n\s*\n\s*\n$/, '')
              }
            }
            if (block.nextSibling) {
              block.parentNode.insertBefore(paragraph, block.nextSibling)
            } else {
              block.parentNode.appendChild(paragraph)
            }
            placeCaretAtStart(paragraph)
            return true
          }
          return false
        }
        if (!['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'].includes(block.tagName)) {
          return false
        }
        const paragraph = createParagraph()
        if (block.nextSibling) {
          block.parentNode.insertBefore(paragraph, block.nextSibling)
        } else {
          block.parentNode.appendChild(paragraph)
        }
        placeCaretAtStart(paragraph)
        return true
      }

      const renderMarkdown = (markdown, offset) => {
        const nextMarkdown = normalizeMarkdown(markdown || '')
        if (nextMarkdown === renderedMarkdown) {
          if (offset !== null && offset !== undefined) {
            applySelectionOffset(offset)
          }
          return
        }
        renderedMarkdown = nextMarkdown
        editor.innerHTML = markdownToHtml(renderedMarkdown)
        applySelectionOffset(offset)
        if (offset === null || offset === undefined) {
          window.scrollTo(0, 0)
        }
      }

      let renderTimeout = null
      const scheduleRenderedRefresh = () => {
        if (renderTimeout !== null) {
          clearTimeout(renderTimeout)
        }
        renderTimeout = setTimeout(() => {
          renderTimeout = null
          const offset = selectionMarkdownOffset()
          const nextMarkdown = htmlToMarkdown(editor.innerHTML)
          const nextHtml = markdownToHtml(nextMarkdown)
          if (editor.innerHTML !== nextHtml) {
            renderedMarkdown = nextMarkdown
            editor.innerHTML = nextHtml
            applySelectionOffset(offset)
          }
        }, 80)
      }

      const emitChange = () => {
        const offset = selectionMarkdownOffset()
        const nextMarkdown = htmlToMarkdown(editor.innerHTML)
        renderedMarkdown = nextMarkdown
        post({ type: 'change', markdown: nextMarkdown })
        post({ type: 'selection', offset })
        scheduleRenderedRefresh()
      }

      let changeEmitTimeout = null
      const scheduleEmitChange = () => {
        if (changeEmitTimeout !== null) {
          clearTimeout(changeEmitTimeout)
        }
        changeEmitTimeout = setTimeout(() => {
          changeEmitTimeout = null
          emitChange()
        }, 0)
      }

      const applyMarkdownShortcutFromCurrentBlock = () => {
        const selection = ensureSelectionInEditor()
        if (!selection || selection.rangeCount === 0) return false
        const block = closestBlock(selection.anchorNode)
        if (!block || block === editor) return false
        const blockText = (block.textContent || '').replace(/\\u00a0/g, ' ')
        const shortcut = blockText.match(/^(\#{1,3}|>|\-|\*|1\.)\s$/)?.[1]
        if (!shortcut) return false
        if (!applyMarkdownShortcut(shortcut)) return false
        return true
      }

      editor.addEventListener('input', emitChange)
      editor.addEventListener('beforeinput', (event) => {
        if (event.inputType === 'insertParagraph') {
          const block = closestBlock(window.getSelection()?.anchorNode || null)
          if (handleListEnter()) {
            event.preventDefault()
            emitChange()
            return
          }
          if (handleBlockExitEnter()) {
            event.preventDefault()
            emitChange()
            return
          }
          if (block && block.tagName === 'PRE') {
            event.preventDefault()
            document.execCommand('insertLineBreak')
            emitChange()
            return
          }
          if (block && block.tagName === 'BLOCKQUOTE') {
            event.preventDefault()
            document.execCommand('insertLineBreak')
            emitChange()
            return
          }
          if (block && block !== editor && block.tagName !== 'PRE') {
            event.preventDefault()
            document.execCommand('insertLineBreak')
            emitChange()
            return
          }
        }
        if (event.inputType === 'insertText' && event.data === ' ') {
          setTimeout(() => {
            if (applyMarkdownShortcutFromCurrentBlock()) {
              emitChange()
              return
            }
            scheduleEmitChange()
          }, 0)
        }
      })
      editor.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const block = closestBlock(window.getSelection()?.anchorNode || null)
          if (handleListEnter()) {
            event.preventDefault()
            emitChange()
            return
          }
          if (handleBlockExitEnter()) {
            event.preventDefault()
            emitChange()
            return
          }
          if (block && block.tagName === 'PRE') {
            event.preventDefault()
            document.execCommand('insertLineBreak')
            emitChange()
            return
          }
          if (block && block.tagName === 'BLOCKQUOTE') {
            event.preventDefault()
            document.execCommand('insertLineBreak')
            emitChange()
            return
          }
          if (block && block !== editor && block.tagName !== 'PRE') {
            event.preventDefault()
            document.execCommand('insertLineBreak')
            emitChange()
            return
          }
        }
        if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey) {
          return
        }
        const selection = ensureSelectionInEditor()
        if (!selection || selection.rangeCount === 0) return
        const block = closestBlock(selection.anchorNode)
        const blockText = (block?.textContent || '').replace(/\\u00a0/g, ' ').trim()
        if (!blockText) return
        if (applyMarkdownShortcut(blockText)) {
          event.preventDefault()
          emitChange()
        }
      })
      editor.addEventListener('keyup', scheduleEmitChange)
      editor.addEventListener('blur', scheduleEmitChange)
      editor.addEventListener('paste', scheduleEmitChange)
      editor.addEventListener('compositionend', scheduleEmitChange)
      new MutationObserver(() => {
        scheduleEmitChange()
      }).observe(editor, {
        childList: true,
        subtree: true,
        characterData: true,
      })
      document.addEventListener('selectionchange', () => {
        post({ type: 'selection', offset: selectionMarkdownOffset() })
      })

      window.__notesEditor = {
        setMarkdown(markdown) {
          renderMarkdown(markdown, null)
        },
        focus() {
          editor.focus()
        },
        applyCommand(command) {
          if (!command || !command.type) return
          editor.focus()
          ensureSelectionInEditor()
          switch (command.type) {
            case 'undo':
              document.execCommand('undo')
              break
            case 'redo':
              document.execCommand('redo')
              break
            case 'bold':
              document.execCommand('bold')
              break
            case 'italic':
              document.execCommand('italic')
              break
            case 'underline':
              document.execCommand('underline')
              break
            case 'strike':
              document.execCommand('strikeThrough')
              break
            case 'quote':
              replaceCurrentBlock((block) => {
                const wrapper = document.createElement('blockquote')
                const paragraph = document.createElement('p')
                const text = (block.textContent || '').trim()
                paragraph.innerHTML = text ? renderInline(text) : '<br>'
                wrapper.appendChild(paragraph)
                return wrapper
              })
              break
            case 'code':
              replaceCurrentBlock((block) => {
                const pre = document.createElement('pre')
                const code = document.createElement('code')
                const text = block.textContent || ''
                code.textContent = text
                if (!text) {
                  code.innerHTML = '<br>'
                }
                pre.appendChild(code)
                return pre
              })
              break
            case 'table':
              document.execCommand('insertHTML', false, '<table><tbody><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Value</td><td>Value</td></tr></tbody></table><p><br></p>')
              break
            case 'heading':
              replaceCurrentBlock((block) => {
                const heading = document.createElement('h' + command.level)
                const text = (block.textContent || '').trim()
                heading.innerHTML = text ? renderInline(text) : '<br>'
                return heading
              })
              break
            case 'list':
              if (command.style === 'checkbox') {
                replaceCurrentBlock(() => {
                  const list = document.createElement('ul')
                  list.setAttribute('data-type', 'taskList')
                  const item = document.createElement('li')
                  item.setAttribute('data-type', 'taskItem')
                  const label = document.createElement('label')
                  label.setAttribute('contenteditable', 'false')
                  const input = document.createElement('input')
                  input.type = 'checkbox'
                  label.appendChild(input)
                  const wrapper = document.createElement('div')
                  const paragraph = document.createElement('p')
                  paragraph.textContent = 'Task'
                  wrapper.appendChild(paragraph)
                  item.appendChild(label)
                  item.appendChild(wrapper)
                  list.appendChild(item)
                  return list
                })
              } else if (command.style === 'dash' || command.style === 'bullet') {
                replaceCurrentBlock((block) => {
                  const list = document.createElement('ul')
                  const item = createEmptyListItem()
                  const text = (block.textContent || '').trim()
                  item.innerHTML = text ? renderInline(text) : '<br>'
                  list.appendChild(item)
                  return list
                })
              } else {
                document.execCommand('insertUnorderedList')
              }
              break
            case 'link':
              document.execCommand('createLink', false, command.url)
              break
          }
          emitChange()
        },
      }

      renderedMarkdown = normalizeMarkdown(INITIAL_MARKDOWN || '')
      post({ type: 'ready' })
    </script>
  </body>
</html>`
}

export function NotesRichEditor({ markdown, onMarkdownChange, onCursorChange, command, onLayout, style }: Props) {
  const webViewRef = useRef<WebView>(null)
  const readyRef = useRef(false)
  const lastCommandIdRef = useRef<string | null>(null)
  const lastAppliedMarkdownRef = useRef(markdown)
  const lastEditorMarkdownRef = useRef(markdown)
  const initialMarkdownRef = useRef(markdown)
  const html = useMemo(() => buildEditorHtml(initialMarkdownRef.current), [])

  function inject(code: string) {
    webViewRef.current?.injectJavaScript(`${code}\ntrue;`)
  }

  function syncMarkdown(nextMarkdown: string) {
    if (!readyRef.current) return
    lastAppliedMarkdownRef.current = nextMarkdown
    inject(`window.__notesEditor?.setMarkdown(${escapeForInjection(nextMarkdown)});`)
  }

  useEffect(() => {
    if (markdown === lastEditorMarkdownRef.current) {
      return
    }
    syncMarkdown(markdown)
  }, [markdown])

  useEffect(() => {
    if (!command || command.id === lastCommandIdRef.current || !readyRef.current) {
      return
    }
    lastCommandIdRef.current = command.id
    inject(`window.__notesEditor?.applyCommand(${JSON.stringify(command)});`)
  }, [command])

  function handleMessage(event: WebViewMessageEvent) {
    let payload: EditorMessage | null = null
    try {
      payload = JSON.parse(event.nativeEvent.data) as EditorMessage
    } catch {
      return
    }
    if (!payload) return
    switch (payload.type) {
      case 'ready':
        readyRef.current = true
        syncMarkdown(markdown)
        break
      case 'change':
        lastEditorMarkdownRef.current = payload.markdown
        onMarkdownChange(payload.markdown)
        break
      case 'selection':
        onCursorChange(payload.offset)
        break
      case 'error':
        console.warn('NotesRichEditor WebView error', payload.message)
        break
    }
  }

  return (
    <View style={style} onLayout={onLayout}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        scrollEnabled
        style={{ minHeight: 420, backgroundColor: screenColors.background }}
      />
    </View>
  )
}
