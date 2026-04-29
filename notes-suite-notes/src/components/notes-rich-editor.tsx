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

type EditorMessage =
  | { type: 'change'; markdown: string; offset: number | null }
  | { type: 'cursor'; offset: number | null }
  | { type: 'ready' }

export type RichEditorCommand =
  | { id: string; type: 'undo' | 'redo' | 'bold' | 'italic' | 'underline' | 'strike' | 'quote' | 'code' | 'table' }
  | { id: string; type: 'heading'; level: '1' | '2' | '3' }
  | { id: string; type: 'list'; style: 'bullet' | 'dash' | 'checkbox' }
  | { id: string; type: 'link'; url: string }

function buildHtml(markdown: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <style>
      :root {
        color-scheme: dark;
        --bg: ${screenColors.background};
        --surface: #0f1c2d;
        --border: #1a2d41;
        --text: ${screenColors.text};
        --muted: ${screenColors.muted};
        --accent: ${screenColors.accent};
        --accent-soft: ${screenColors.accentSoft};
      }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 100%;
      }
      #root {
        min-height: 100vh;
        box-sizing: border-box;
        padding: 18px 18px 44px;
      }
      .block {
        position: relative;
        outline: none;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--text);
        padding: 0;
        margin: 0 0 14px;
      }
      .block[data-kind="paragraph"] {
        font-size: 17px;
        line-height: 1.45;
      }
      .block[data-kind="heading"][data-level="1"] {
        font-size: 30px;
        line-height: 1.15;
        font-weight: 800;
        margin-top: 4px;
      }
      .block[data-kind="heading"][data-level="2"] {
        font-size: 26px;
        line-height: 1.18;
        font-weight: 800;
      }
      .block[data-kind="heading"][data-level="3"] {
        font-size: 22px;
        line-height: 1.22;
        font-weight: 700;
      }
      .block[data-kind="quote"] {
        font-size: 17px;
        line-height: 1.45;
        padding-left: 14px;
        border-left: 3px solid var(--accent-soft);
        opacity: 0.94;
      }
      .block[data-kind="bullet_list"],
      .block[data-kind="checklist"],
      .block[data-kind="numbered_list"] {
        font-size: 17px;
        line-height: 1.45;
        padding-left: 24px;
      }
      .block[data-kind="bullet_list"]::before {
        content: "•";
        position: absolute;
        left: 6px;
        top: 0;
        color: var(--accent-soft);
      }
      .block[data-kind="checklist"]::before {
        content: "☐";
        position: absolute;
        left: 0;
        top: 0;
        color: var(--accent-soft);
      }
      .block[data-kind="numbered_list"]::before {
        content: attr(data-marker);
        position: absolute;
        left: 0;
        top: 0;
        color: var(--accent-soft);
      }
      .block[data-kind="code"] {
        font-family: "SFMono-Regular", "SF Mono", "IBM Plex Mono", ui-monospace, monospace;
        font-size: 14px;
        line-height: 1.5;
        background: #112338;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 14px;
        padding: 12px 14px;
      }
      .block[data-kind="table"] {
        font-family: "SFMono-Regular", "SF Mono", "IBM Plex Mono", ui-monospace, monospace;
        font-size: 15px;
        line-height: 1.45;
        background: rgba(17, 35, 56, 0.55);
        border-radius: 12px;
        padding: 10px 12px;
      }
      .block:focus {
        box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.18);
        border-radius: 10px;
      }
    </style>
  </head>
  <body>
    <div id="root" role="textbox" aria-multiline="true"></div>
    <script>
      const root = document.getElementById('root')
      const initialMarkdown = ${JSON.stringify(markdown)}
      const FENCE = String.fromCharCode(96).repeat(3)
      let lastMarkdown = ''
      let suppressInput = false
      let savedRange = null
      let lastFocusedBlock = null

      function escapeHtml(value) {
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      }

      function splitMarkdownBlocks(markdown) {
        const blocks = markdown.split(/\\n{2,}/).map((raw) => raw.trimEnd())
        if (blocks.length === 0) return ['']
        return blocks.filter((text, index, all) => text.length > 0 || all.length === 1 || index === 0)
      }

      function renderInlineMarkdown(text) {
        const escaped = escapeHtml(text)
        return escaped
          .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
          .replace(/~~([^~]+)~~/g, '<del>$1</del>')
          .replace(/<u>(.*?)<\\/u>/g, '<u>$1</u>')
          .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>')
      }

      function inlineHtmlToMarkdown(node) {
        if (!node) return ''
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || ''
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return ''
        }
        const element = node
        const children = Array.from(element.childNodes).map(inlineHtmlToMarkdown).join('')
        const tag = element.tagName
        if (tag === 'STRONG' || tag === 'B') return '**' + children + '**'
        if (tag === 'EM' || tag === 'I') return '*' + children + '*'
        if (tag === 'U') return '<u>' + children + '</u>'
        if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return '~~' + children + '~~'
        if (tag === 'A') return '[' + children + '](' + (element.getAttribute('href') || '') + ')'
        if (tag === 'BR') return '\\n'
        return children
      }

      function parseBlock(raw, index) {
        const text = raw.replace(/\\u00a0/g, ' ')
        const headingMatch = text.match(/^(#{1,6})\\s+(.*)$/)
        if (headingMatch) {
          return { kind: 'heading', level: String(headingMatch[1].length), text: headingMatch[2], marker: '' }
        }
        if (/^>\\s?/.test(text)) {
          return { kind: 'quote', level: '', text: text.replace(/^>\\s?/, ''), marker: '' }
        }
        if (/^- \\[ \\]\\s?/.test(text)) {
          return { kind: 'checklist', level: '', text: text.replace(/^- \\[ \\]\\s?/, ''), marker: '' }
        }
        if (/^[-*]\\s+/.test(text)) {
          return { kind: 'bullet_list', level: '', text: text.replace(/^[-*]\\s+/, ''), marker: '' }
        }
        if (/^\\d+\\.\\s+/.test(text)) {
          const match = text.match(/^(\\d+\\.)\\s+(.*)$/)
          return { kind: 'numbered_list', level: '', text: match ? match[2] : text, marker: match ? match[1] : String(index + 1) + '.' }
        }
        if (text.startsWith(FENCE) && text.endsWith(FENCE)) {
          return {
            kind: 'code',
            level: '',
            text: text.replace(new RegExp('^' + FENCE + '[\\\\r\\\\n]?'), '').replace(new RegExp('[\\\\r\\\\n]?' + FENCE + '$'), ''),
            marker: '',
          }
        }
        if (/^\\|/.test(text)) {
          return { kind: 'table', level: '', text, marker: '' }
        }
        return { kind: 'paragraph', level: '', text, marker: '' }
      }

      function blockToMarkdown(element) {
        const kind = element.dataset.kind || 'paragraph'
        const text =
          kind === 'code' || kind === 'table'
            ? (element.innerText || '').replace(/\\u00a0/g, ' ').replace(/\\n$/, '')
            : Array.from(element.childNodes).map(inlineHtmlToMarkdown).join('').replace(/\\u00a0/g, ' ').replace(/\\n$/, '')
        if (kind === 'heading') {
          const level = element.dataset.level || '1'
          return '#'.repeat(Number(level)) + ' ' + text
        }
        if (kind === 'quote') return '> ' + text
        if (kind === 'bullet_list') return '- ' + text
        if (kind === 'checklist') return '- [ ] ' + text
        if (kind === 'numbered_list') return '1. ' + text
        if (kind === 'code') return FENCE + '\\n' + text + '\\n' + FENCE
        return text
      }

      function serializeDocument() {
        const blocks = Array.from(root.querySelectorAll('.block'))
        if (blocks.length === 0) return ''
        return blocks.map(blockToMarkdown).join('\\n\\n')
      }

      function buildBlockElement(raw, index) {
        const block = parseBlock(raw, index)
        const element = document.createElement(block.kind === 'code' ? 'pre' : 'div')
        element.className = 'block'
        element.dataset.kind = block.kind
        if (block.level) element.dataset.level = block.level
        if (block.marker) element.dataset.marker = block.marker
        element.contentEditable = 'true'
        element.spellcheck = true
        if (block.kind === 'code' || block.kind === 'table') {
          element.innerText = block.text
        } else {
          element.innerHTML = renderInlineMarkdown(block.text)
        }
        return element
      }

      function setMarkdown(markdown) {
        suppressInput = true
        root.innerHTML = ''
        const fragments = splitMarkdownBlocks(markdown)
        fragments.forEach((raw, index) => root.appendChild(buildBlockElement(raw, index)))
        if (root.children.length === 0) {
          root.appendChild(buildBlockElement('', 0))
        }
        suppressInput = false
        lastMarkdown = serializeDocument()
      }

      function message(type, payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }))
      }

      function captureSelectionState() {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        savedRange = selection.getRangeAt(0).cloneRange()
        const block = findBlock(savedRange.endContainer)
        if (block) {
          lastFocusedBlock = block
        }
      }

      function restoreSelectionState() {
        if (!savedRange) return
        const selection = window.getSelection()
        if (!selection) return
        selection.removeAllRanges()
        selection.addRange(savedRange)
      }

      function currentBlock() {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return lastFocusedBlock
        return findBlock(selection.getRangeAt(0).endContainer) || lastFocusedBlock
      }

      function findBlock(node) {
        if (!node) return null
        if (node.nodeType === Node.ELEMENT_NODE) {
          return node.closest('.block')
        }
        return node.parentElement ? node.parentElement.closest('.block') : null
      }

      function getSelectionOffset() {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return null
        const range = selection.getRangeAt(0)
        const block = findBlock(range.endContainer)
        if (!block) return null
        const blocks = Array.from(root.querySelectorAll('.block'))
        let offset = 0
        for (const current of blocks) {
          if (current === block) break
          offset += blockToMarkdown(current).length + 2
        }
        const prefix =
          block.dataset.kind === 'heading'
            ? Number(block.dataset.level || '1') + 1
            : block.dataset.kind === 'quote'
              ? 2
              : block.dataset.kind === 'bullet_list'
                ? 2
                : block.dataset.kind === 'checklist'
                  ? 6
                  : block.dataset.kind === 'numbered_list'
                    ? 3
                    : block.dataset.kind === 'code'
                      ? 4
                      : 0
        const caretRange = range.cloneRange()
        caretRange.selectNodeContents(block)
        caretRange.setEnd(range.endContainer, range.endOffset)
        const visibleOffset = caretRange.toString().length
        return offset + prefix + visibleOffset
      }

      function caretOffsetWithinBlock(block) {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return 0
        const range = selection.getRangeAt(0)
        const currentBlock = findBlock(range.endContainer)
        if (currentBlock !== block) {
          return (block.innerText || '').length
        }
        const caretRange = range.cloneRange()
        caretRange.selectNodeContents(block)
        caretRange.setEnd(range.endContainer, range.endOffset)
        return caretRange.toString().length
      }

      function placeCaretAtOffset(element, offset) {
        const selection = window.getSelection()
        if (!selection) return
        const range = document.createRange()
        let remaining = Math.max(0, offset)
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node) {
          const length = node.textContent ? node.textContent.length : 0
          if (remaining <= length) {
            range.setStart(node, remaining)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
            return
          }
          remaining -= length
          node = walker.nextNode()
        }
        placeCaretAtEnd(element)
      }

      function placeCaretAtEnd(element) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }

      function insertBlockAfter(currentBlock, kind, text) {
        const blocks = Array.from(root.querySelectorAll('.block'))
        const index = blocks.indexOf(currentBlock)
        const nextBlock = buildBlockElement(text, index + 1)
        nextBlock.dataset.kind = kind
        if (kind === 'heading') delete nextBlock.dataset.level
        currentBlock.insertAdjacentElement('afterend', nextBlock)
        placeCaretAtEnd(nextBlock)
        normalizeNumberedMarkers()
        emitChange()
      }

      function normalizeNumberedMarkers() {
        let current = 1
        Array.from(root.querySelectorAll('.block')).forEach((block) => {
          if (block.dataset.kind === 'numbered_list') {
            block.dataset.marker = String(current) + '.'
            current += 1
          } else {
            current = 1
          }
        })
      }

      function emitChange() {
        if (suppressInput) return
        normalizeNumberedMarkers()
        const markdown = serializeDocument()
        lastMarkdown = markdown
        captureSelectionState()
        message('change', { markdown, offset: getSelectionOffset() })
      }

      function normalizeTypedBlock(block) {
        if (!block) return
        const currentKind = block.dataset.kind || 'paragraph'
        if (currentKind === 'code' || currentKind === 'table') {
          return
        }
        const rawText = (block.innerText || '').replace(/\\u00a0/g, ' ')
        const detected = parseBlock(rawText, 0)
        const canPromote = currentKind === 'paragraph'
        const shouldDemote = currentKind !== 'paragraph' && rawText.trim() === ''
        if (!canPromote && !shouldDemote) {
          return
        }
        const nextKind = shouldDemote ? 'paragraph' : detected.kind
        const nextLevel = shouldDemote ? '' : detected.level
        const nextMarker = shouldDemote ? '' : detected.marker
        const nextText = shouldDemote ? '' : detected.text
        const visualOffset = caretOffsetWithinBlock(block)
        const markerTrim = shouldDemote ? 0 : Math.max(0, rawText.length - nextText.length)
        const adjustedOffset = Math.max(0, visualOffset - markerTrim)
        if (
          nextKind === currentKind &&
          (!nextLevel || nextLevel === (block.dataset.level || '')) &&
          (!nextMarker || nextMarker === (block.dataset.marker || ''))
        ) {
          return
        }
        suppressInput = true
        block.dataset.kind = nextKind
        if (nextLevel) {
          block.dataset.level = nextLevel
        } else {
          delete block.dataset.level
        }
        if (nextMarker) {
          block.dataset.marker = nextMarker
        } else {
          delete block.dataset.marker
        }
        block.innerHTML = renderInlineMarkdown(nextText)
        suppressInput = false
        placeCaretAtOffset(block, adjustedOffset)
        captureSelectionState()
      }

      function setBlockKind(kind, extra = {}) {
        const block = currentBlock()
        if (!block) return
        block.dataset.kind = kind
        delete block.dataset.level
        delete block.dataset.marker
        Object.entries(extra).forEach(([key, value]) => {
          if (value == null) return
          block.dataset[key] = String(value)
        })
        if (kind === 'code' || kind === 'table') {
          block.innerText = block.innerText
        } else if (block.querySelector('*') == null) {
          block.innerHTML = renderInlineMarkdown(block.innerText || '')
        }
        normalizeNumberedMarkers()
        emitChange()
      }

      function applyCommand(command) {
        if (!command) return
        restoreSelectionState()
        if (command.type === 'undo' || command.type === 'redo') {
          document.execCommand(command.type)
          setTimeout(() => emitChange(), 0)
          return
        }
        if (command.type === 'bold' || command.type === 'italic' || command.type === 'underline' || command.type === 'strike') {
          const mapping = {
            bold: 'bold',
            italic: 'italic',
            underline: 'underline',
            strike: 'strikeThrough',
          }
          document.execCommand(mapping[command.type], false)
          emitChange()
          return
        }
        if (command.type === 'heading') {
          setBlockKind('heading', { level: command.level })
          return
        }
        if (command.type === 'quote') {
          setBlockKind('quote')
          return
        }
        if (command.type === 'code') {
          setBlockKind('code')
          return
        }
        if (command.type === 'table') {
          const block = currentBlock()
          if (!block) return
          block.dataset.kind = 'table'
          block.innerText = '| Column 1 | Column 2 |\\n| --- | --- |\\n| Value | Value |'
          placeCaretAtEnd(block)
          emitChange()
          return
        }
        if (command.type === 'list') {
          const kind = command.style === 'checkbox' ? 'checklist' : command.style === 'bullet' || command.style === 'dash' ? 'bullet_list' : 'paragraph'
          setBlockKind(kind)
          return
        }
        if (command.type === 'link') {
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) return
          if (selection.isCollapsed) {
            document.execCommand('insertHTML', false, '<a href="' + command.url + '">' + command.url + '</a>')
          } else {
            document.execCommand('createLink', false, command.url)
          }
          emitChange()
        }
      }

      root.addEventListener('input', (event) => {
        const block = findBlock(event.target)
        if (block) {
          lastFocusedBlock = block
          normalizeTypedBlock(block)
        }
        emitChange()
      })

      root.addEventListener('click', () => {
        captureSelectionState()
      })

      root.addEventListener('keydown', (event) => {
        const block = findBlock(event.target)
        if (!block) return
        lastFocusedBlock = block
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) return
          const range = selection.getRangeAt(0)
          const text = block.innerText || ''
          const beforeRange = range.cloneRange()
          beforeRange.selectNodeContents(block)
          beforeRange.setEnd(range.endContainer, range.endOffset)
          const splitOffset = beforeRange.toString().length
          const before = text.slice(0, splitOffset)
          const after = text.slice(splitOffset)
          block.innerText = before
          const kind = block.dataset.kind === 'heading' ? 'paragraph' : (block.dataset.kind || 'paragraph')
          insertBlockAfter(block, kind, after)
          return
        }
        if (event.key === 'Backspace' && !(block.innerText || '')) {
          const previous = block.previousElementSibling
          if (previous && previous.classList.contains('block')) {
            event.preventDefault()
            block.remove()
            placeCaretAtEnd(previous)
            normalizeNumberedMarkers()
            emitChange()
          }
        }
      })

      document.addEventListener('selectionchange', () => {
        captureSelectionState()
        message('cursor', { offset: getSelectionOffset() })
      })

      window.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'setMarkdown') {
            const nextMarkdown = payload.markdown || ''
            if (nextMarkdown !== lastMarkdown) {
              setMarkdown(nextMarkdown)
            }
            return
          }
          if (payload.type === 'command') {
            applyCommand(payload.command)
          }
        } catch {}
      })

      setMarkdown(initialMarkdown)
      setTimeout(() => {
        const firstBlock = root.querySelector('.block')
        if (firstBlock) {
          placeCaretAtEnd(firstBlock)
        }
        message('ready', {})
      }, 0)
    </script>
  </body>
</html>`
}

export function NotesRichEditor({ markdown, onMarkdownChange, onCursorChange, command, onLayout, style }: Props) {
  const webViewRef = useRef<WebView>(null)
  const latestMarkdownRef = useRef(markdown)
  const lastSentMarkdownRef = useRef(markdown)
  const lastCommandIdRef = useRef<string | null>(null)

  useEffect(() => {
    latestMarkdownRef.current = markdown
    if (markdown === lastSentMarkdownRef.current) return
    webViewRef.current?.postMessage(JSON.stringify({ type: 'setMarkdown', markdown }))
  }, [markdown])

  useEffect(() => {
    if (!command || command.id === lastCommandIdRef.current) return
    lastCommandIdRef.current = command.id
    webViewRef.current?.postMessage(JSON.stringify({ type: 'command', command }))
  }, [command])

  const source = useMemo(() => ({ html: buildHtml(markdown) }), [])

  function handleMessage(event: WebViewMessageEvent) {
    let payload: EditorMessage | null = null
    try {
      payload = JSON.parse(event.nativeEvent.data) as EditorMessage
    } catch {
      payload = null
    }
    if (!payload) return
    if (payload.type === 'change') {
      lastSentMarkdownRef.current = payload.markdown
      if (payload.markdown !== latestMarkdownRef.current) {
        onMarkdownChange(payload.markdown)
      }
      onCursorChange(payload.offset)
      return
    }
    if (payload.type === 'cursor') {
      onCursorChange(payload.offset)
    }
  }

  return (
    <View style={style} onLayout={onLayout}>
      <WebView
        ref={webViewRef}
        source={source}
        originWhitelist={['*']}
        onMessage={handleMessage}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        automaticallyAdjustContentInsets={false}
        bounces={false}
        scrollEnabled
        style={{ backgroundColor: screenColors.background }}
      />
    </View>
  )
}
