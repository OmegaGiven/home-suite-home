import { Cursor, LoroDoc, type VersionVector } from 'loro-crdt'

export type LoroMarkdownBinding = {
  doc: LoroDoc
  lastSyncedVersion: VersionVector | null
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function encodeBytesBase64(bytes: Uint8Array) {
  return bytesToBase64(bytes)
}

export function decodeBase64Bytes(value: string) {
  return base64ToBytes(value)
}

function importBase64Payload(doc: LoroDoc, payloadB64: string | null | undefined) {
  if (!payloadB64?.trim()) return
  doc.import(base64ToBytes(payloadB64.trim()))
}

export function markdownFromLoroDoc(doc: LoroDoc) {
  const json = doc.toJSON() as Record<string, unknown>
  return typeof json.content === 'string' ? json.content : ''
}

export function createMarkdownBinding(
  snapshotB64: string | null | undefined,
  fallbackMarkdown: string,
  updatesB64?: string[] | null,
) {
  const doc = new LoroDoc()
  if (snapshotB64?.trim()) {
    importBase64Payload(doc, snapshotB64)
  } else if (fallbackMarkdown) {
    doc.getText('content').insert(0, fallbackMarkdown)
    doc.commit()
  } else {
    doc.getText('content')
    doc.commit()
  }
  for (const update of updatesB64 ?? []) {
    importBase64Payload(doc, update)
  }

  return {
    doc,
    lastSyncedVersion: doc.version(),
  } satisfies LoroMarkdownBinding
}

export function buildMarkdownReplica(markdown: string) {
  const doc = new LoroDoc()
  const text = doc.getText('content')
  if (markdown.length > 0) {
    text.insert(0, markdown)
  }
  doc.commit()
  return {
    snapshotB64: bytesToBase64(doc.export({ mode: 'snapshot' })),
    updatesB64: [] as string[],
    version: 1,
  }
}

export function replaceMarkdownContent(binding: LoroMarkdownBinding, nextMarkdown: string) {
  const text = binding.doc.getText('content')
  const current = markdownFromLoroDoc(binding.doc)
  if (current === nextMarkdown) {
    return null
  }
  if (current.length > 0) {
    text.delete(0, current.length)
  }
  if (nextMarkdown.length > 0) {
    text.insert(0, nextMarkdown)
  }
  binding.doc.commit()
  const update = binding.doc.export({
    mode: 'update',
    from: binding.lastSyncedVersion ?? undefined,
  })
  const snapshot = binding.doc.export({ mode: 'snapshot' })
  binding.lastSyncedVersion = binding.doc.version()
  return {
    updateB64: bytesToBase64(update),
    snapshotB64: bytesToBase64(snapshot),
  }
}

export function encodeStableTextCursor(binding: LoroMarkdownBinding, offset: number) {
  const text = binding.doc.getText('content')
  const boundedOffset = Math.max(0, Math.min(offset, markdownFromLoroDoc(binding.doc).length))
  const cursor = text.getCursor(boundedOffset, 0)
  return cursor ? bytesToBase64(cursor.encode()) : null
}

export function resolveStableTextCursorOffset(binding: LoroMarkdownBinding, cursorB64: string | null | undefined) {
  if (!cursorB64?.trim()) return null
  try {
    const cursor = Cursor.decode(base64ToBytes(cursorB64.trim()))
    const result = binding.doc.getCursorPos(cursor)
    return result?.offset ?? null
  } catch {
    return null
  }
}
