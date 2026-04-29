import type { Note, NoteBlock, NoteBlockKind, NoteDocument, NoteDocumentOperationBatch } from './types'

type ParsedBlock = {
  kind: NoteBlockKind
  text: string
  attrs: Record<string, string>
}

function parseMarkdownBlock(rawText: string): ParsedBlock {
  const text = rawText.replace(/\u00a0/g, ' ')
  const headingMatch = text.match(/^(#{1,6})\s+(.*)$/)
  if (headingMatch) {
    return {
      kind: 'heading',
      text: headingMatch[2],
      attrs: { level: headingMatch[1] },
    }
  }
  if (/^>\s?/.test(text)) {
    return {
      kind: 'quote',
      text: text.replace(/^>\s?/, ''),
      attrs: {},
    }
  }
  if (/^- \[ \]\s?/.test(text)) {
    return {
      kind: 'checklist',
      text: text.replace(/^- \[ \]\s?/, ''),
      attrs: {},
    }
  }
  if (/^[-*]\s+/.test(text)) {
    return {
      kind: 'bullet_list',
      text: text.replace(/^[-*]\s+/, ''),
      attrs: {},
    }
  }
  if (/^\d+\.\s+/.test(text)) {
    return {
      kind: 'numbered_list',
      text: text.replace(/^\d+\.\s+/, ''),
      attrs: {},
    }
  }
  if (text.startsWith('```') && text.endsWith('```')) {
    return {
      kind: 'code',
      text: text.replace(/^```[\r\n]?/, '').replace(/[\r\n]?```$/, ''),
      attrs: {},
    }
  }
  if (/^\|/.test(text)) {
    return {
      kind: 'table',
      text,
      attrs: {},
    }
  }
  return {
    kind: 'paragraph',
    text,
    attrs: {},
  }
}

function nextActorCounter(previous: NoteDocument | null | undefined, actorId: string) {
  return (previous?.clock?.[actorId] ?? 0) + 1
}

function splitMarkdownBlocks(markdown: string) {
  return markdown
    .split('\n\n')
    .map((raw) => raw.trimEnd())
    .filter((text, index, all) => text.length > 0 || all.length === 1 || index === 0)
}

export function noteDocumentFromMarkdown(
  noteId: string,
  markdown: string,
  actorId: string,
  previous?: NoteDocument | null,
): NoteDocument {
  const nextCounter = nextActorCounter(previous, actorId)
  const blocks = splitMarkdownBlocks(markdown)

  const materializedBlocks: NoteBlock[] =
    blocks.length > 0
      ? blocks.map((rawText, index) => {
          const parsed = parseMarkdownBlock(rawText)
          return {
          id: previous?.blocks[index]?.id ?? `${noteId}:block:${index + 1}`,
          kind: parsed.kind,
          text: parsed.text,
          attrs: Object.keys(parsed.attrs).length > 0 ? parsed.attrs : (previous?.blocks[index]?.attrs ?? {}),
          order: index,
          deleted: false,
          last_modified_by: actorId,
          last_modified_counter: nextCounter,
        }
      })
      : [
          {
            id: previous?.blocks[0]?.id ?? `${noteId}:block:1`,
            kind: 'paragraph',
            text: '',
            attrs: previous?.blocks[0]?.attrs ?? {},
            order: 0,
            deleted: false,
            last_modified_by: actorId,
            last_modified_counter: nextCounter,
          },
        ]

  return {
    blocks: materializedBlocks,
    clock: {
      ...(previous?.clock ?? {}),
      [actorId]: nextCounter,
    },
    last_operation_id: `replace:${noteId}:${actorId}:${nextCounter}`,
  }
}

function sortBlocks(blocks: NoteBlock[]) {
  return [...blocks].sort((left, right) => left.order - right.order)
}

function renumberBlocks(blocks: NoteBlock[]) {
  return blocks.map((block, index) => ({
    ...block,
    order: index,
  }))
}

export function markdownFromNoteDocument(document: NoteDocument) {
  return sortBlocks(document.blocks)
    .filter((block) => !block.deleted)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
          return `${block.attrs.level ?? '#'} ${block.text}`.trim()
        case 'quote':
          return `> ${block.text}`.trim()
        case 'bullet_list':
          return `- ${block.text}`.trim()
        case 'checklist':
          return `- [ ] ${block.text}`.trim()
        case 'numbered_list':
          return `1. ${block.text}`.trim()
        case 'code':
          return `\`\`\`\n${block.text}\n\`\`\``
        default:
          return block.text
      }
    })
    .join('\n\n')
}

function visibleBlocks(document: NoteDocument | null | undefined) {
  return sortBlocks(document?.blocks ?? []).filter((block) => !block.deleted)
}

type TargetBlockDraft = {
  text: string
  kind: NoteBlockKind
  attrs: Record<string, string>
}

function buildTargetBlocks(markdown: string): TargetBlockDraft[] {
  return splitMarkdownBlocks(markdown).map((text) => parseMarkdownBlock(text))
}

type DiffStep =
  | { type: 'keep'; currentIndex: number; targetIndex: number }
  | { type: 'update'; currentIndex: number; targetIndex: number }
  | { type: 'delete'; currentIndex: number }
  | { type: 'insert'; targetIndex: number }

function buildBlockDiffSteps(currentBlocks: NoteBlock[], targetBlocks: TargetBlockDraft[]): DiffStep[] | null {
  const rows = currentBlocks.length + 1
  const cols = targetBlocks.length + 1
  const costs = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i += 1) costs[i][0] = i
  for (let j = 0; j < cols; j += 1) costs[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const current = currentBlocks[i - 1]
      const target = targetBlocks[j - 1]
      const sameKind = current.kind === target.kind
      const sameAttrs = JSON.stringify(current.attrs ?? {}) === JSON.stringify(target.attrs ?? {})
      const exact = sameKind && sameAttrs && current.text === target.text
      const updateCost = sameKind ? (sameAttrs ? 1 : 2) : Number.POSITIVE_INFINITY
      costs[i][j] = Math.min(
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + (exact ? 0 : updateCost),
      )
    }
  }

  const steps: DiffStep[] = []
  let i = currentBlocks.length
  let j = targetBlocks.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const current = currentBlocks[i - 1]
      const target = targetBlocks[j - 1]
      const sameKind = current.kind === target.kind
      const sameAttrs = JSON.stringify(current.attrs ?? {}) === JSON.stringify(target.attrs ?? {})
      const exact = sameKind && sameAttrs && current.text === target.text
      const updateCost = sameKind ? (sameAttrs ? 1 : 2) : Number.POSITIVE_INFINITY
      if (costs[i][j] === costs[i - 1][j - 1] + (exact ? 0 : updateCost)) {
        steps.push({
          type: exact ? 'keep' : 'update',
          currentIndex: i - 1,
          targetIndex: j - 1,
        })
        i -= 1
        j -= 1
        continue
      }
    }
    if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      steps.push({ type: 'delete', currentIndex: i - 1 })
      i -= 1
      continue
    }
    if (j > 0 && costs[i][j] === costs[i][j - 1] + 1) {
      steps.push({ type: 'insert', targetIndex: j - 1 })
      j -= 1
      continue
    }
    return null
  }

  return steps.reverse()
}

function buildGranularOperations(
  noteId: string,
  currentBlocks: NoteBlock[],
  targetBlocks: TargetBlockDraft[],
  actorId: string,
  nextCounterStart: number,
): NoteDocumentOperationBatch['operations'] | null {
  const steps = buildBlockDiffSteps(currentBlocks, targetBlocks)
  if (!steps) return null
  const operations: NoteDocumentOperationBatch['operations'] = []
  const simulated = currentBlocks.map((block) => ({ ...block }))
  let simulatedIndex = 0
  let nextCounter = nextCounterStart

  for (const step of steps) {
    if (step.type === 'keep') {
      simulatedIndex += 1
      continue
    }
    if (step.type === 'update') {
      const target = targetBlocks[step.targetIndex]
      const current = simulated[simulatedIndex]
      if (!current || current.kind !== target.kind) return null
      if (JSON.stringify(current.attrs ?? {}) !== JSON.stringify(target.attrs ?? {})) {
        operations.push({
          type: 'update_block_attrs',
          block_id: current.id,
          attrs: target.attrs,
        })
      }
      if (current.text !== target.text) {
        operations.push({
          type: 'update_block_text',
          block_id: current.id,
          text: target.text,
        })
      }
      simulatedIndex += 1
      continue
    }
    if (step.type === 'delete') {
      const current = simulated[simulatedIndex]
      if (!current) return null
      operations.push({
        type: 'delete_block',
        block_id: current.id,
      })
      simulated.splice(simulatedIndex, 1)
      continue
    }
    const target = targetBlocks[step.targetIndex]
    const insertedId = `${noteId}:block:${Date.now().toString(36)}:${step.targetIndex}`
    operations.push({
      type: 'insert_block',
      after_block_id: simulatedIndex > 0 ? simulated[simulatedIndex - 1]?.id ?? null : null,
      block: {
        id: insertedId,
        kind: target.kind,
        text: target.text,
        attrs: target.attrs,
        order: simulatedIndex,
        deleted: false,
        last_modified_by: actorId,
        last_modified_counter: nextCounter,
      },
    })
    simulated.splice(simulatedIndex, 0, {
      id: insertedId,
      kind: target.kind,
      text: target.text,
      attrs: target.attrs,
      order: simulatedIndex,
      deleted: false,
      last_modified_by: actorId,
      last_modified_counter: nextCounter,
    })
    simulatedIndex += 1
    nextCounter += 1
  }

  return operations
}

export function applyNoteOperationBatch(
  document: NoteDocument | null | undefined,
  batch: NoteDocumentOperationBatch,
): NoteDocument {
  const actorId = batch.actor_id || 'local'
  let next: NoteDocument = {
    blocks: [...(document?.blocks ?? [])],
    clock: { ...(document?.clock ?? {}) },
    last_operation_id: batch.operation_id,
  }
  let actorCounter = Math.max(next.clock[actorId] ?? 0, batch.base_clock[actorId] ?? 0)

  for (const operation of batch.operations) {
    if (operation.type === 'replace_document') {
      actorCounter += 1
      next = {
        blocks: renumberBlocks(
          operation.blocks.map((block, index) => ({
            ...block,
            order: index,
            last_modified_by: actorId,
            last_modified_counter: actorCounter,
          })),
        ),
        clock: { ...next.clock, ...batch.base_clock },
        last_operation_id: batch.operation_id,
      }
      continue
    }

    if (operation.type === 'insert_block') {
      actorCounter += 1
      const blocks = sortBlocks(next.blocks).filter((block) => !block.deleted)
      const insertIndex = operation.after_block_id
        ? blocks.findIndex((block) => block.id === operation.after_block_id) + 1
        : 0
      const normalizedIndex = insertIndex < 0 ? blocks.length : insertIndex
      blocks.splice(normalizedIndex, 0, {
        ...operation.block,
        last_modified_by: actorId,
        last_modified_counter: actorCounter,
      })
      next.blocks = renumberBlocks(blocks)
      continue
    }

    if (operation.type === 'update_block_text') {
      actorCounter += 1
      next.blocks = next.blocks.map((block) =>
        block.id === operation.block_id
          ? {
              ...block,
              text: operation.text,
              last_modified_by: actorId,
              last_modified_counter: actorCounter,
            }
          : block,
      )
      continue
    }

    if (operation.type === 'update_block_attrs') {
      actorCounter += 1
      next.blocks = next.blocks.map((block) =>
        block.id === operation.block_id
          ? {
              ...block,
              attrs: operation.attrs,
              last_modified_by: actorId,
              last_modified_counter: actorCounter,
            }
          : block,
      )
      continue
    }

    if (operation.type === 'delete_block') {
      actorCounter += 1
      next.blocks = next.blocks.map((block) =>
        block.id === operation.block_id
          ? {
              ...block,
              deleted: true,
              last_modified_by: actorId,
              last_modified_counter: actorCounter,
            }
          : block,
      )
      continue
    }

    if (operation.type === 'move_block') {
      actorCounter += 1
      const blocks = sortBlocks(next.blocks).filter((block) => !block.deleted)
      const movingIndex = blocks.findIndex((block) => block.id === operation.block_id)
      if (movingIndex === -1) continue
      const [moving] = blocks.splice(movingIndex, 1)
      const targetIndex = operation.after_block_id
        ? blocks.findIndex((block) => block.id === operation.after_block_id) + 1
        : 0
      const normalizedIndex = targetIndex < 0 ? blocks.length : targetIndex
      blocks.splice(normalizedIndex, 0, {
        ...moving,
        last_modified_by: actorId,
        last_modified_counter: actorCounter,
      })
      next.blocks = renumberBlocks(blocks)
    }
  }

  next.clock = {
    ...next.clock,
    ...batch.base_clock,
    [actorId]: actorCounter,
  }
  next.last_operation_id = batch.operation_id
  return next
}

export function buildReplaceDocumentBatch(
  previousNote: Note,
  nextNote: Note,
  markdown: string,
  actorId: string,
  clientId: string,
): NoteDocumentOperationBatch | null {
  const document = noteDocumentFromMarkdown(nextNote.id, markdown, actorId, previousNote.document)
  const currentBlocks = visibleBlocks(previousNote.document)
  const targetBlocks = buildTargetBlocks(markdown)
  const baseClock = { ...(previousNote.document?.clock ?? {}) }
  const operations: NoteDocumentOperationBatch['operations'] = []

  if (previousNote.title !== nextNote.title) {
    operations.push({
      type: 'set_title',
      title: nextNote.title,
    })
  }

  if (previousNote.folder !== nextNote.folder) {
    operations.push({
      type: 'set_folder',
      folder: nextNote.folder,
    })
  }

  const granularOperations = buildGranularOperations(
    nextNote.id,
    currentBlocks,
    targetBlocks,
    actorId,
    nextActorCounter(previousNote.document, actorId),
  )
  if (granularOperations && granularOperations.length > 0) {
    return {
      actor_id: actorId,
      client_id: clientId,
      operation_id: document.last_operation_id,
      base_clock: baseClock,
      base_markdown: previousNote.markdown,
      base_document: previousNote.document,
      operations: [...operations, ...granularOperations],
    }
  }

  if (operations.length === 0 && previousNote.markdown === markdown) {
    return null
  }

  return {
    actor_id: actorId,
    client_id: clientId,
    operation_id: document.last_operation_id,
    base_clock: baseClock,
    base_markdown: previousNote.markdown,
    base_document: previousNote.document,
    operations: [
      ...operations,
      {
        type: 'replace_document',
        blocks: document.blocks,
      },
    ],
  }
}
