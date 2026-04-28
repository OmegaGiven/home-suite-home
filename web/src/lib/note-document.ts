import type { Note, NoteBlock, NoteBlockKind, NoteDocument, NoteDocumentOperationBatch } from './types'

function inferBlockKind(text: string): NoteBlockKind {
  if (text.startsWith('```')) return 'code'
  if (text.startsWith('>')) return 'quote'
  if (text.startsWith('- [')) return 'checklist'
  if (text.startsWith('- ') || text.startsWith('* ')) return 'bullet_list'
  if (/^\d+\.\s/.test(text)) return 'numbered_list'
  if (text.startsWith('|')) return 'table'
  if (text.startsWith('#')) return 'heading'
  return 'paragraph'
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
      ? blocks.map((text, index) => ({
          id: previous?.blocks[index]?.id ?? `${noteId}:block:${index + 1}`,
          kind: inferBlockKind(text),
          text,
          attrs: previous?.blocks[index]?.attrs ?? {},
          order: index,
          deleted: false,
          last_modified_by: actorId,
          last_modified_counter: nextCounter,
        }))
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
    .map((block) => block.text)
    .join('\n\n')
}

function visibleBlocks(document: NoteDocument | null | undefined) {
  return sortBlocks(document?.blocks ?? []).filter((block) => !block.deleted)
}

export function applyNoteOperationBatch(
  document: NoteDocument | null | undefined,
  batch: NoteDocumentOperationBatch,
): NoteDocument {
  let next: NoteDocument = {
    blocks: [...(document?.blocks ?? [])],
    clock: { ...(document?.clock ?? {}) },
    last_operation_id: batch.operation_id,
  }

  for (const operation of batch.operations) {
    if (operation.type === 'replace_document') {
      next = {
        blocks: renumberBlocks(operation.blocks.map((block, index) => ({ ...block, order: index }))),
        clock: { ...next.clock, ...batch.base_clock },
        last_operation_id: batch.operation_id,
      }
      continue
    }

    if (operation.type === 'insert_block') {
      const blocks = sortBlocks(next.blocks).filter((block) => !block.deleted)
      const insertIndex = operation.after_block_id
        ? blocks.findIndex((block) => block.id === operation.after_block_id) + 1
        : 0
      const normalizedIndex = insertIndex < 0 ? blocks.length : insertIndex
      blocks.splice(normalizedIndex, 0, { ...operation.block })
      next.blocks = renumberBlocks(blocks)
      continue
    }

    if (operation.type === 'update_block_text') {
      next.blocks = next.blocks.map((block) =>
        block.id === operation.block_id
          ? {
              ...block,
              text: operation.text,
              last_modified_by: batch.actor_id,
              last_modified_counter: (next.clock[batch.actor_id] ?? 0) + 1,
            }
          : block,
      )
      continue
    }

    if (operation.type === 'update_block_attrs') {
      next.blocks = next.blocks.map((block) =>
        block.id === operation.block_id
          ? {
              ...block,
              attrs: operation.attrs,
              last_modified_by: batch.actor_id,
              last_modified_counter: (next.clock[batch.actor_id] ?? 0) + 1,
            }
          : block,
      )
      continue
    }

    if (operation.type === 'delete_block') {
      next.blocks = next.blocks.map((block) =>
        block.id === operation.block_id
          ? {
              ...block,
              deleted: true,
              last_modified_by: batch.actor_id,
              last_modified_counter: (next.clock[batch.actor_id] ?? 0) + 1,
            }
          : block,
      )
      continue
    }

    if (operation.type === 'move_block') {
      const blocks = sortBlocks(next.blocks).filter((block) => !block.deleted)
      const movingIndex = blocks.findIndex((block) => block.id === operation.block_id)
      if (movingIndex === -1) continue
      const [moving] = blocks.splice(movingIndex, 1)
      const targetIndex = operation.after_block_id
        ? blocks.findIndex((block) => block.id === operation.after_block_id) + 1
        : 0
      const normalizedIndex = targetIndex < 0 ? blocks.length : targetIndex
      blocks.splice(normalizedIndex, 0, moving)
      next.blocks = renumberBlocks(blocks)
    }
  }

  next.clock = {
    ...next.clock,
    ...batch.base_clock,
    [batch.actor_id]: Math.max((next.clock[batch.actor_id] ?? 0), (batch.base_clock[batch.actor_id] ?? 0) + 1),
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
): NoteDocumentOperationBatch {
  const document = noteDocumentFromMarkdown(nextNote.id, markdown, actorId, previousNote.document)
  const currentBlocks = visibleBlocks(previousNote.document)
  const targetTexts = splitMarkdownBlocks(markdown)
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

  if (currentBlocks.length === targetTexts.length) {
    const metadataOperationCount = operations.length
    for (let index = 0; index < currentBlocks.length; index += 1) {
      const current = currentBlocks[index]
      const targetText = targetTexts[index] ?? ''
      const targetKind = inferBlockKind(targetText)
      if (current.kind !== targetKind || JSON.stringify(current.attrs) !== JSON.stringify({})) {
        operations.length = metadataOperationCount
        break
      }
      if (current.text !== targetText) {
        operations.push({
          type: 'update_block_text',
          block_id: current.id,
          text: targetText,
        })
      }
    }
    if (operations.length > 0 || markdownFromNoteDocument(previousNote.document) === markdown) {
      return {
        actor_id: actorId,
        client_id: clientId,
        operation_id: document.last_operation_id,
        base_clock: baseClock,
        operations,
      }
    }
  }

  if (targetTexts.length === currentBlocks.length + 1) {
    let insertIndex = -1
    for (let index = 0; index < targetTexts.length; index += 1) {
      const left = currentBlocks.slice(0, index).map((block) => block.text)
      const right = currentBlocks.slice(index).map((block) => block.text)
      if (
        JSON.stringify(left) === JSON.stringify(targetTexts.slice(0, index)) &&
        JSON.stringify(right) === JSON.stringify(targetTexts.slice(index + 1))
      ) {
        insertIndex = index
        break
      }
    }
    if (insertIndex >= 0) {
      const nextCounter = nextActorCounter(previousNote.document, actorId)
      const text = targetTexts[insertIndex] ?? ''
      return {
        actor_id: actorId,
        client_id: clientId,
        operation_id: document.last_operation_id,
        base_clock: baseClock,
        operations: [
          ...operations,
          {
            type: 'insert_block',
            after_block_id: insertIndex > 0 ? currentBlocks[insertIndex - 1]?.id ?? null : null,
            block: {
              id: `${nextNote.id}:block:${Date.now().toString(36)}`,
              kind: inferBlockKind(text),
              text,
              attrs: {},
              order: insertIndex,
              deleted: false,
              last_modified_by: actorId,
              last_modified_counter: nextCounter,
            },
          },
        ],
      }
    }
  }

  if (targetTexts.length + 1 === currentBlocks.length) {
    let deleteIndex = -1
    for (let index = 0; index < currentBlocks.length; index += 1) {
      const left = currentBlocks.slice(0, index).map((block) => block.text)
      const right = currentBlocks.slice(index + 1).map((block) => block.text)
      if (
        JSON.stringify(left) === JSON.stringify(targetTexts.slice(0, index)) &&
        JSON.stringify(right) === JSON.stringify(targetTexts.slice(index))
      ) {
        deleteIndex = index
        break
      }
    }
    if (deleteIndex >= 0) {
      return {
        actor_id: actorId,
        client_id: clientId,
        operation_id: document.last_operation_id,
        base_clock: baseClock,
        operations: [
          ...operations,
          {
            type: 'delete_block',
            block_id: currentBlocks[deleteIndex].id,
          },
        ],
      }
    }
  }

  if (targetTexts.length === currentBlocks.length && targetTexts.every((text) => currentBlocks.some((block) => block.text === text))) {
    const firstMovedIndex = targetTexts.findIndex((text, index) => currentBlocks[index]?.text !== text)
    if (firstMovedIndex >= 0) {
      const movedBlock = currentBlocks.find((block) => block.text === targetTexts[firstMovedIndex])
      if (movedBlock) {
        return {
          actor_id: actorId,
        client_id: clientId,
        operation_id: document.last_operation_id,
        base_clock: baseClock,
        operations: [
          ...operations,
          {
            type: 'move_block',
            block_id: movedBlock.id,
              after_block_id: firstMovedIndex > 0 ? currentBlocks.find((block) => block.text === targetTexts[firstMovedIndex - 1])?.id ?? null : null,
            },
          ],
        }
      }
    }
  }

  return {
    actor_id: actorId,
    client_id: clientId,
    operation_id: document.last_operation_id,
    base_clock: baseClock,
    operations: [
      ...operations,
      {
        type: 'replace_document',
        blocks: document.blocks,
      },
    ],
  }
}
