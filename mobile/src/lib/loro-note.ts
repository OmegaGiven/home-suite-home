export type LoroMarkdownBinding = {
  markdown: string
}

export function createMarkdownBinding(
  _snapshotB64: string | null | undefined,
  fallbackMarkdown: string,
  _updatesB64?: string[] | null,
) {
  return {
    markdown: fallbackMarkdown,
  } satisfies LoroMarkdownBinding
}

export function replaceMarkdownContent(binding: LoroMarkdownBinding, nextMarkdown: string) {
  binding.markdown = nextMarkdown
}

export function encodeStableTextCursor(binding: LoroMarkdownBinding, offset: number) {
  const boundedOffset = Math.max(0, Math.min(offset, binding.markdown.length))
  return JSON.stringify({ offset: boundedOffset, length: binding.markdown.length })
}
