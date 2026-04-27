export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

export function editableInlineText(text: string) {
  if (!text) return '<br>'
  return escapeHtml(text)
}

function renderInlineMarkdown(text: string) {
  if (!text) return '<br>'
  const tokenPattern =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|<u>(.*?)<\/u>|\*([^*]+)\*/g
  let output = ''
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  while ((match = tokenPattern.exec(text)) !== null) {
    output += escapeHtml(text.slice(lastIndex, match.index))
    if (match[1] !== undefined && match[2] !== undefined) {
      output += `<img alt="${escapeHtmlAttribute(match[1])}" src="${escapeHtmlAttribute(match[2])}">`
    } else if (match[3] !== undefined && match[4] !== undefined) {
      output += `<a href="${escapeHtmlAttribute(match[4])}">${renderInlineMarkdown(match[3])}</a>`
    } else if (match[5] !== undefined) {
      output += `<strong>${renderInlineMarkdown(match[5])}</strong>`
    } else if (match[6] !== undefined) {
      output += `<s>${renderInlineMarkdown(match[6])}</s>`
    } else if (match[7] !== undefined) {
      output += `<code>${escapeHtml(match[7])}</code>`
    } else if (match[8] !== undefined) {
      output += `<u>${renderInlineMarkdown(match[8])}</u>`
    } else if (match[9] !== undefined) {
      output += `<em>${renderInlineMarkdown(match[9])}</em>`
    }
    lastIndex = tokenPattern.lastIndex
  }

  output += escapeHtml(text.slice(lastIndex))
  return output || '<br>'
}

function blockHtml(tag: string, text: string) {
  return `<${tag}>${renderInlineMarkdown(text || '')}</${tag}>`
}

function alignmentStyle(cell: string) {
  const trimmed = cell.trim()
  if (/^:-+:$/.test(trimmed)) return 'center'
  if (/^-+:$/.test(trimmed)) return 'right'
  if (/^:-+$/.test(trimmed)) return 'left'
  return null
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
}

function tableHtml(headerLine: string, separatorLine: string, bodyLines: string[]) {
  const headers = splitTableRow(headerLine)
  const alignments = splitTableRow(separatorLine).map(alignmentStyle)
  const body = bodyLines.map(splitTableRow)

  const headHtml = headers
    .map((cell, index) => {
      const align = alignments[index]
      const style = align ? ` style="text-align:${align}"` : ''
      return `<th${style}>${renderInlineMarkdown(cell)}</th>`
    })
    .join('')

  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => {
            const align = alignments[index]
            const style = align ? ` style="text-align:${align}"` : ''
            return `<td${style}>${renderInlineMarkdown(cell)}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')

  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

function listHtml(kind: 'ul' | 'ol', items: string[], options?: { start?: number; taskStates?: boolean[] }) {
  const attrs = kind === 'ol' && options?.start && options.start > 1 ? ` start="${options.start}"` : ''
  const body = items
    .map((item, index) => {
      if (kind === 'ul' && options?.taskStates) {
        const state = options.taskStates[index] ? 'checked' : 'unchecked'
        return taskListItemHtml(item, state === 'checked')
      }
      return `<li>${renderInlineMarkdown(item)}</li>`
    })
    .join('')
  return `<${kind}${attrs}>${body}</${kind}>`
}

function taskListItemHtml(text: string, checked: boolean) {
  const state = checked ? 'checked' : 'unchecked'
  return `<li data-task="${state}"><span class="task-checkbox" contenteditable="false" data-task-checkbox="true" aria-hidden="true"></span><span class="task-content">${renderInlineMarkdown(text)}</span></li>`
}

export function markdownToEditableHtml(markdown: string) {
  const lines = markdown.split('\n')
  const parts: string[] = []
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index]

    if (/^```/.test(rawLine.trim())) {
      const language = rawLine.trim().slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      parts.push(
        `<pre${language ? ` data-language="${escapeHtmlAttribute(language)}"` : ''}><code>${escapeHtml(
          codeLines.join('\n'),
        )}</code></pre>`,
      )
      index += 1
      continue
    }

    if (index + 1 < lines.length && rawLine.includes('|') && isTableSeparator(lines[index + 1])) {
      const separatorLine = lines[index + 1]
      const bodyLines: string[] = []
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        bodyLines.push(lines[index])
        index += 1
      }
      parts.push(tableHtml(rawLine, separatorLine, bodyLines))
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(rawLine)) {
      parts.push('<hr>')
      index += 1
      continue
    }

    if (/^-\s+\[(?: |x|X)\]\s+/.test(rawLine)) {
      const items: string[] = []
      const taskStates: boolean[] = []
      while (index < lines.length && /^-\s+\[(?: |x|X)\]\s+/.test(lines[index])) {
        taskStates.push(/^-\s+\[(?:x|X)\]\s+/.test(lines[index]))
        items.push(lines[index].replace(/^-\s+\[(?: |x|X)\]\s+/, ''))
        index += 1
      }
      parts.push(listHtml('ul', items, { taskStates }))
      continue
    }

    if (/^\d+\.\s+/.test(rawLine)) {
      const items: string[] = []
      const start = Number.parseInt(rawLine.match(/^(\d+)\./)?.[1] ?? '1', 10)
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''))
        index += 1
      }
      parts.push(listHtml('ol', items, { start }))
      continue
    }

    if (/^-\s+/.test(rawLine)) {
      const items: string[] = []
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ''))
        index += 1
      }
      parts.push(listHtml('ul', items))
      continue
    }

    if (rawLine.trim() === '') {
      parts.push('<p><br></p>')
      index += 1
      continue
    }

    const heading = rawLine.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      parts.push(blockHtml(`h${heading[1].length}`, heading[2]))
      index += 1
      continue
    }

    if (/^>\s+/.test(rawLine)) {
      parts.push(blockHtml('blockquote', rawLine.replace(/^>\s+/, '')))
      index += 1
      continue
    }

    parts.push(blockHtml('p', rawLine))
    index += 1
  }
  return parts.join('')
}

function serializeInlineNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00a0/g, ' ')
  }
  if (!(node instanceof HTMLElement)) return ''

  if (node.dataset.taskCheckbox === 'true') return ''
  if (node.classList.contains('task-content')) {
    return Array.from(node.childNodes).map(serializeInlineNode).join('')
  }

  const tag = node.tagName.toLowerCase()
  const content = Array.from(node.childNodes).map(serializeInlineNode).join('')

  if (tag === 'strong' || tag === 'b') return `**${content}**`
  if (tag === 'em' || tag === 'i') return `*${content}*`
  if (tag === 's' || tag === 'del') return `~~${content}~~`
  if (tag === 'code') return `\`${node.textContent ?? ''}\``
  if (tag === 'a') return `[${content}](${node.getAttribute('href') ?? ''})`
  if (tag === 'img') return `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src') ?? ''})`
  if (tag === 'br') return '\n'
  return content
}

function serializeInlineChildren(node: HTMLElement) {
  return Array.from(node.childNodes)
    .map(serializeInlineNode)
    .join('')
    .replace(/\u00a0/g, ' ')
    .trimEnd()
}

export function editableHtmlToMarkdown(root: HTMLElement) {
  const blocks = Array.from(root.childNodes)
  const markdown: string[] = []

  for (const node of blocks) {
    if (!(node instanceof HTMLElement)) continue
    const tag = node.tagName.toLowerCase()

    if (tag === 'ul') {
      const items = Array.from(node.children)
        .map((item) => {
          if (!(item instanceof HTMLElement)) return ''
          if (item.dataset.task) {
            const marker = item.dataset.task === 'checked' ? '[x]' : '[ ]'
            const content = item.querySelector('.task-content')
            const text = content instanceof HTMLElement ? serializeInlineChildren(content) : serializeInlineChildren(item)
            return `- ${marker} ${text}`.trimEnd()
          }
          return `- ${serializeInlineChildren(item)}`.trimEnd()
        })
        .filter(Boolean)
      markdown.push(...items)
      markdown.push('')
      continue
    }

    if (tag === 'ol') {
      const start = Number.parseInt(node.getAttribute('start') ?? '1', 10)
      const items = Array.from(node.children)
        .map((item, index) => `${start + index}. ${serializeInlineChildren(item as HTMLElement)}`.trimEnd())
        .filter(Boolean)
      markdown.push(...items)
      markdown.push('')
      continue
    }

    if (tag === 'pre') {
      const code = node.textContent?.replace(/\u00a0/g, ' ') ?? ''
      const language = node.dataset.language ?? ''
      markdown.push(`\`\`\`${language}`.trimEnd())
      markdown.push(code)
      markdown.push('```')
      markdown.push('')
      continue
    }

    if (tag === 'hr') {
      markdown.push('---')
      markdown.push('')
      continue
    }

    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'))
      if (rows.length > 0) {
        const headerCells = Array.from(rows[0].children).map((cell) => serializeInlineChildren(cell as HTMLElement))
        const alignments = Array.from(rows[0].children).map((cell) => {
          const align = (cell as HTMLElement).style.textAlign
          if (align === 'center') return ':---:'
          if (align === 'right') return '---:'
          if (align === 'left') return ':---'
          return '---'
        })
        markdown.push(`| ${headerCells.join(' | ')} |`)
        markdown.push(`| ${alignments.join(' | ')} |`)
        for (const row of rows.slice(1)) {
          const cells = Array.from(row.children).map((cell) => serializeInlineChildren(cell as HTMLElement))
          markdown.push(`| ${cells.join(' | ')} |`)
        }
        markdown.push('')
      }
      continue
    }

    const text = serializeInlineChildren(node)
    if (tag === 'h1') markdown.push(`# ${text}`)
    else if (tag === 'h2') markdown.push(`## ${text}`)
    else if (tag === 'h3') markdown.push(`### ${text}`)
    else if (tag === 'h4') markdown.push(`#### ${text}`)
    else if (tag === 'h5') markdown.push(`##### ${text}`)
    else if (tag === 'h6') markdown.push(`###### ${text}`)
    else if (tag === 'blockquote') markdown.push(`> ${text}`)
    else markdown.push(text)
  }

  while (markdown.length > 0 && markdown[markdown.length - 1] === '') {
    markdown.pop()
  }

  return markdown.join('\n')
}

export function getCurrentBlock(selection: Selection | null): HTMLElement | null {
  if (!selection?.anchorNode) return null
  let node: Node | null = selection.anchorNode
  while (node && node instanceof HTMLElement === false) {
    node = node.parentNode
  }
  while (node instanceof HTMLElement) {
    if (node.dataset.editorRoot === 'true') return null
    const tag = node.tagName.toLowerCase()
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'pre', 'td', 'th'].includes(tag)) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function normalizedBlockText(block: HTMLElement) {
  return (block.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n/g, '')
}

export function moveCaretToEnd(element: HTMLElement) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function isSelectionAtEndOfElement(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const activeRange = selection.getRangeAt(0).cloneRange()
  const endRange = document.createRange()
  endRange.selectNodeContents(element)
  endRange.collapse(false)
  return (
    activeRange.compareBoundaryPoints(Range.START_TO_START, endRange) === 0 &&
    activeRange.compareBoundaryPoints(Range.END_TO_END, endRange) === 0
  )
}

export function createParagraphElement(text = '') {
  const element = document.createElement('p')
  element.innerHTML = text ? editableInlineText(text) : '<br>'
  return element
}

export function createTableElement() {
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  const headA = document.createElement('th')
  const headB = document.createElement('th')
  headA.textContent = 'Column 1'
  headB.textContent = 'Column 2'
  headerRow.append(headA, headB)
  thead.appendChild(headerRow)

  const tbody = document.createElement('tbody')
  const bodyRow = document.createElement('tr')
  const cellA = document.createElement('td')
  const cellB = document.createElement('td')
  cellA.innerHTML = '<br>'
  cellB.innerHTML = '<br>'
  bodyRow.append(cellA, cellB)
  tbody.appendChild(bodyRow)

  table.append(thead, tbody)
  return { table, focusTarget: cellA }
}

export function rangeFromViewportPoint(x: number, y: number) {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y)
  }
  const position = doc.caretPositionFromPoint?.(x, y)
  if (!position) return null
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

export function ensureEditorBlocks(root: HTMLElement) {
  const childNodes = Array.from(root.childNodes)
  if (childNodes.length === 0) {
    root.appendChild(createParagraphElement())
    return
  }

  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      const paragraph = createParagraphElement(text)
      root.replaceChild(paragraph, node)
      moveCaretToEnd(paragraph)
      continue
    }

    if (node instanceof HTMLElement) {
      const tag = node.tagName.toLowerCase()
      if (!['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'pre', 'hr', 'table'].includes(tag)) {
        const paragraph = createParagraphElement(node.textContent ?? '')
        root.replaceChild(paragraph, node)
        moveCaretToEnd(paragraph)
      }
    }
  }
}

export function transformBlockToListItem(block: HTMLElement) {
  const text = block.textContent?.replace(/^-\s+/, '') ?? ''
  const list = document.createElement('ul')
  const item = document.createElement('li')
  item.innerHTML = editableInlineText(text)
  list.appendChild(item)
  block.replaceWith(list)
  moveCaretToEnd(item)
}

export function transformBlockToOrderedListItem(block: HTMLElement, start: number) {
  const text = block.textContent?.replace(/^\d+\.\s+/, '') ?? ''
  const list = document.createElement('ol')
  if (start > 1) list.setAttribute('start', String(start))
  const item = document.createElement('li')
  item.innerHTML = editableInlineText(text)
  list.appendChild(item)
  block.replaceWith(list)
  moveCaretToEnd(item)
}

export function transformBlockToTaskListItem(block: HTMLElement, checked: boolean) {
  const text = block.textContent?.replace(/^-\s+\[(?: |x|X)\]\s+/, '') ?? ''
  const list = document.createElement('ul')
  const item = document.createElement('li')
  item.dataset.task = checked ? 'checked' : 'unchecked'
  item.innerHTML = `<span class="task-checkbox" contenteditable="false" data-task-checkbox="true" aria-hidden="true"></span><span class="task-content">${editableInlineText(text)}</span>`
  list.appendChild(item)
  block.replaceWith(list)
  const content = item.querySelector('.task-content')
  moveCaretToEnd(content instanceof HTMLElement ? content : item)
}

export function transformBlockToCodeFence(block: HTMLElement, language = '') {
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  if (language) pre.dataset.language = language
  code.innerHTML = '<br>'
  pre.appendChild(code)
  block.replaceWith(pre)
  moveCaretToEnd(code)
}

export function applyMarkdownShortcut(block: HTMLElement) {
  const text = normalizedBlockText(block)
  const shortcuts: Array<{ pattern: RegExp; tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote' }> = [
    { pattern: /^######\s+/, tag: 'h6' },
    { pattern: /^#####\s+/, tag: 'h5' },
    { pattern: /^####\s+/, tag: 'h4' },
    { pattern: /^###\s+/, tag: 'h3' },
    { pattern: /^##\s+/, tag: 'h2' },
    { pattern: /^#\s+/, tag: 'h1' },
    { pattern: /^>\s+/, tag: 'blockquote' },
  ]

  if (/^-\s+\[(?: |x|X)\]\s+/.test(text) && block.tagName.toLowerCase() !== 'li') {
    transformBlockToTaskListItem(block, /^-\s+\[(?:x|X)\]\s+/.test(text))
    return true
  }

  if (/^\d+\.\s+/.test(text) && block.tagName.toLowerCase() !== 'li') {
    const start = Number.parseInt(text.match(/^(\d+)\./)?.[1] ?? '1', 10)
    transformBlockToOrderedListItem(block, start)
    return true
  }

  if (/^-\s+/.test(text) && block.tagName.toLowerCase() !== 'li') {
    transformBlockToListItem(block)
    return true
  }

  if (/^```/.test(text)) {
    transformBlockToCodeFence(block, text.slice(3).trim())
    return true
  }

  if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) {
    const hr = document.createElement('hr')
    const paragraph = createParagraphElement()
    block.replaceWith(hr)
    hr.parentElement?.insertBefore(paragraph, hr.nextSibling)
    moveCaretToEnd(paragraph)
    return true
  }

  for (const shortcut of shortcuts) {
    if (shortcut.pattern.test(text)) {
      const replacement = document.createElement(shortcut.tag)
      const nextText = text.replace(shortcut.pattern, '')
      replacement.innerHTML = nextText ? editableInlineText(nextText) : '<br>'
      block.replaceWith(replacement)
      moveCaretToEnd(replacement)
      return true
    }
  }

  return false
}
