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

function escapeForInjection(value: string) {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function buildEditorHtml() {
  const background = screenColors.background
  const surface = screenColors.card
  const text = screenColors.text
  const accent = screenColors.accent
  const muted = screenColors.muted
  const border = screenColors.border

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
      .ProseMirror {
        min-height: 100vh;
        outline: none;
        color: var(--text);
        font-size: 17px;
        line-height: 1.55;
        white-space: pre-wrap;
      }
      .ProseMirror p.is-editor-empty:first-child::before {
        content: "Start writing";
        color: var(--muted);
        pointer-events: none;
        float: left;
        height: 0;
      }
      .ProseMirror a {
        color: var(--accent);
      }
      .ProseMirror blockquote {
        border-left: 3px solid var(--border);
        margin: 1rem 0;
        padding-left: 1rem;
        color: var(--muted);
      }
      .ProseMirror pre {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px 14px;
        overflow-x: auto;
      }
      .ProseMirror code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .ProseMirror table {
        border-collapse: collapse;
        margin: 1rem 0;
        overflow: hidden;
        table-layout: fixed;
        width: 100%;
      }
      .ProseMirror td,
      .ProseMirror th {
        border: 1px solid var(--border);
        min-width: 1em;
        padding: 8px 10px;
        vertical-align: top;
      }
      .ProseMirror th {
        background: var(--surface);
      }
      .ProseMirror ul[data-type="taskList"] {
        list-style: none;
        margin-left: 0;
        padding-left: 0;
      }
      .ProseMirror ul[data-type="taskList"] li {
        display: flex;
        gap: 0.55rem;
        align-items: flex-start;
      }
      .ProseMirror ul[data-type="taskList"] li > label {
        margin-top: 0.2rem;
      }
      .ProseMirror hr {
        border: none;
        border-top: 1px solid var(--border);
        margin: 1.25rem 0;
      }
    </style>
  </head>
  <body>
    <div id="editor"></div>
    <script>
      const post = (payload) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify(payload))
      }

      const normalizeMarkdown = (markdown) =>
        markdown
          .replace(/\\r\\n/g, '\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trimEnd()

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
          if (line.startsWith('\`\`\`')) {
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
          const heading = line.match(/^(#{1,6})(?:\\s+(.*)|\\s*)$/)
          if (heading) {
            closeLists()
            closeTable()
            const level = heading[1].length
            html += '<h' + level + '>' + renderInline((heading[2] || '').trim()) + '</h' + level + '>'
            continue
          }
          const task = line.match(/^-\\s*\\[( |x)\\]\\s*(.*)$/i)
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
          const bullet = line.match(/^[-*]\\s*(.*)$/)
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
          const quote = line.match(/^>\\s*(.*)$/)
          if (quote) {
            closeTable()
            html += '<blockquote><p>' + renderInline(quote[1]) + '</p></blockquote>'
            continue
          }
          if (/^\\|.+\\|$/.test(line)) {
            if (!inTable) {
              html += '<table><tbody>'
              inTable = true
            }
            if (index + 1 < lines.length && /^\\|?\\s*[-: ]+\\|/.test(lines[index + 1])) {
              const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
              html += '<tr>' + cells.map((cell) => '<th>' + renderInline(cell) + '</th>').join('') + '</tr>'
              index += 1
              continue
            }
            const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
            html += '<tr>' + cells.map((cell) => '<td>' + renderInline(cell) + '</td>').join('') + '</tr>'
            continue
          }
          closeTable()
          if (line.trim() === '---') {
            html += '<hr />'
            continue
          }
          if (!line.trim()) {
            flushParagraph()
            continue
          }
          paragraphLines.push(line)
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
        const lines = []
        const renderNode = (node, context) => {
          if (!node) return ''
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || ''
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return ''
          const tag = node.tagName.toLowerCase()
          const childText = () => Array.from(node.childNodes).map((child) => renderNode(child, context)).join('')
          if (tag === 'strong' || tag === 'b') return '**' + childText() + '**'
          if (tag === 'em' || tag === 'i') return '*' + childText() + '*'
          if (tag === 'u') return '<u>' + childText() + '</u>'
          if (tag === 's' || tag === 'strike') return '~~' + childText() + '~~'
          if (tag === 'a') return '[' + childText() + '](' + (node.getAttribute('href') || 'https://') + ')'
          if (tag === 'br') return '\\n'
          if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return childText()
          if (tag === 'p') return childText()
          if (tag === 'h1') return '# ' + childText()
          if (tag === 'h2') return '## ' + childText()
          if (tag === 'h3') return '### ' + childText()
          if (tag === 'h4') return '#### ' + childText()
          if (tag === 'h5') return '##### ' + childText()
          if (tag === 'h6') return '###### ' + childText()
          if (tag === 'blockquote') return '> ' + childText().trim()
          if (tag === 'pre') return '\`\`\`\\n' + (node.textContent || '').replace(/\\n$/, '') + '\\n\`\`\`'
          if (tag === 'hr') return '---'
          if (tag === 'ul' && node.getAttribute('data-type') === 'taskList') {
            return Array.from(node.children)
              .map((child) => {
                const checked = child.querySelector('input[type="checkbox"]')?.checked
                const text = (child.querySelector('div')?.textContent || '').trim()
                return '- [' + (checked ? 'x' : ' ') + '] ' + text
              })
              .join('\\n')
          }
          if (tag === 'ul') {
            return Array.from(node.children)
              .map((child) => '- ' + (child.textContent || '').trim())
              .join('\\n')
          }
          if (tag === 'table') {
            const rows = Array.from(node.querySelectorAll('tr'))
            return rows
              .map((row, rowIndex) => {
                const cells = Array.from(row.children).map((cell) => (cell.textContent || '').trim())
                const line = '| ' + cells.join(' | ') + ' |'
                if (rowIndex === 0 && row.querySelector('th')) {
                  return line + '\\n| ' + cells.map(() => '---').join(' | ') + ' |'
                }
                return line
              })
              .join('\\n')
          }
          return childText()
        }
        Array.from(container.childNodes).forEach((child) => {
          const value = renderNode(child, {})
          if (value && value.trim()) {
            lines.push(value.trimEnd())
          }
        })
        return normalizeMarkdown(lines.join('\\n\\n'))
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
      editor.contentEditable = 'true'
      editor.spellcheck = true
      editor.autocapitalize = 'sentences'
      let renderedMarkdown = ''

      const closestBlock = (node) => {
        let current = node
        while (current && current !== editor) {
          if (
            current.nodeType === Node.ELEMENT_NODE &&
            ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI'].includes(current.tagName)
          ) {
            return current
          }
          current = current.parentNode
        }
        return editor
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

      const normalizeBlockAfterShortcut = () => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const block = closestBlock(selection.anchorNode)
        if (!block || block === editor) return
        if (block.tagName === 'LI') {
          const text = block.textContent || ''
          block.innerHTML = text ? renderInline(text) : '<br>'
          placeCaretAtStart(block)
          return
        }
        const text = block.textContent || ''
        block.innerHTML = text ? renderInline(text) : '<br>'
        placeCaretAtStart(block)
      }

      const applyMarkdownShortcut = (shortcut) => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return false
        const block = closestBlock(selection.anchorNode)
        if (!block) return false
        if (block !== editor) {
          block.textContent = ''
        }
        editor.focus()
        switch (shortcut) {
          case '#':
            document.execCommand('formatBlock', false, 'h1')
            break
          case '##':
            document.execCommand('formatBlock', false, 'h2')
            break
          case '###':
            document.execCommand('formatBlock', false, 'h3')
            break
          case '>':
            document.execCommand('formatBlock', false, 'blockquote')
            break
          case '-':
          case '*':
            document.execCommand('insertUnorderedList')
            break
          case '1.':
            document.execCommand('insertOrderedList')
            break
          default:
            return false
        }
        normalizeBlockAfterShortcut()
        return true
      }

      const renderMarkdown = (markdown, offset) => {
        renderedMarkdown = normalizeMarkdown(markdown || '')
        editor.innerHTML = markdownToHtml(renderedMarkdown)
        applySelectionOffset(offset)
      }

      const emitChange = () => {
        const offset = selectionMarkdownOffset()
        const nextMarkdown = htmlToMarkdown(editor.innerHTML)
        renderedMarkdown = nextMarkdown
        post({ type: 'change', markdown: nextMarkdown })
        post({ type: 'selection', offset })
      }

      editor.addEventListener('input', emitChange)
      editor.addEventListener('keydown', (event) => {
        if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey) {
          return
        }
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const block = closestBlock(selection.anchorNode)
        const blockText = (block?.textContent || '').replace(/\\u00a0/g, ' ').trim()
        if (!blockText) return
        if (applyMarkdownShortcut(blockText)) {
          event.preventDefault()
          emitChange()
        }
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
              document.execCommand('formatBlock', false, 'blockquote')
              break
            case 'code':
              document.execCommand('formatBlock', false, 'pre')
              break
            case 'table':
              document.execCommand('insertHTML', false, '<table><tbody><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Value</td><td>Value</td></tr></tbody></table><p><br></p>')
              break
            case 'heading':
              document.execCommand('formatBlock', false, 'h' + command.level)
              break
            case 'list':
              if (command.style === 'checkbox') {
                document.execCommand('insertHTML', false, '<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" /></label><div><p>Task</p></div></li></ul><p><br></p>')
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

      renderMarkdown('', null)
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
  const html = useMemo(() => buildEditorHtml(), [])

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
        inject('window.__notesEditor?.focus();')
        break
      case 'change':
        lastEditorMarkdownRef.current = payload.markdown
        onMarkdownChange(payload.markdown)
        break
      case 'selection':
        onCursorChange(payload.offset)
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
        scrollEnabled={false}
        style={{ minHeight: 420, backgroundColor: screenColors.background }}
      />
    </View>
  )
}
