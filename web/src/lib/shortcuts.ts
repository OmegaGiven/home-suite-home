export type SpeechRecognitionAlternativeLike = { transcript: string }
export type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
export type SpeechRecognitionEventLike = {
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}
export type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function normalizeShortcutStroke(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parts = trimmed.split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  const base = parts.pop() ?? ''
  const modifiers = parts.map((part) => {
    const lower = part.toLowerCase()
    if (lower === 'shift') return 'Shift'
    if (lower === 'ctrl' || lower === 'control') return 'Ctrl'
    if (lower === 'alt' || lower === 'option') return 'Alt'
    if (lower === 'meta' || lower === 'cmd' || lower === 'command') return 'Meta'
    return part
  })
  const normalizedBase = (() => {
    const lower = base.toLowerCase()
    if (lower === 'arrowleft') return 'ArrowLeft'
    if (lower === 'arrowright') return 'ArrowRight'
    if (lower === 'arrowup') return 'ArrowUp'
    if (lower === 'arrowdown') return 'ArrowDown'
    if (lower === 'space') return 'Space'
    if (base.length === 1) return modifiers.includes('Shift') ? base.toUpperCase() : base.toLowerCase()
    return base
  })()
  return [...modifiers, normalizedBase].join('+')
}

export function normalizeShortcutBinding(value: string) {
  return value
    .split(' ')
    .map((part) => normalizeShortcutStroke(part))
    .filter(Boolean)
    .join(' ')
}

export function eventShortcutStroke(event: KeyboardEvent) {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.metaKey) modifiers.push('Meta')
  if (event.shiftKey && event.key.length !== 1) modifiers.push('Shift')
  if (event.shiftKey && event.key.length === 1 && /[A-Z]/.test(event.key)) modifiers.push('Shift')

  const base = (() => {
    if (event.key === ' ') return 'Space'
    if (event.key.length === 1) return event.shiftKey ? event.key.toUpperCase() : event.key.toLowerCase()
    return event.key
  })()

  return [...modifiers, base].join('+')
}

export function createBrowserSpeechRecognition(): BrowserSpeechRecognition | null {
  const SpeechRecognitionCtor = (
    window as Window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition
    }
  ).SpeechRecognition ??
    (
      window as Window & {
        SpeechRecognition?: new () => BrowserSpeechRecognition
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition
      }
    ).webkitSpeechRecognition

  return SpeechRecognitionCtor ? new SpeechRecognitionCtor() : null
}
