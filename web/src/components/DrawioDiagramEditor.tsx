import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

export type DrawioDiagramEditorHandle = {
  requestSave: () => void
}

type Props = {
  xml: string
  title: string
  loadKey: string
  sourceFormat: 'drawio' | 'legacy' | 'empty'
  disabled?: boolean
  onChange: (xml: string) => void
  onSave: (xml: string) => void
}

type DrawioMessage =
  | { event: 'init' }
  | { event: 'autosave'; xml: string }
  | { event: 'save'; xml: string; exit?: boolean }
  | { event: 'exit'; modified?: boolean }

function resolveRuntimeBaseUrl(configuredUrl: string | undefined, fallbackPort: number) {
  if (typeof window === 'undefined') {
    return configuredUrl ?? `http://localhost:${fallbackPort}`
  }

  const fallback = `${window.location.origin}/drawio`
  const raw = configuredUrl?.trim() || fallback

  try {
    const url = new URL(raw, window.location.origin)
    const currentHost = window.location.hostname
    const targetHost = url.hostname
    const isLoopback =
      targetHost === 'localhost' ||
      targetHost === '127.0.0.1' ||
      targetHost === '0.0.0.0' ||
      targetHost === '::1'

    if (isLoopback && currentHost && currentHost !== targetHost) {
      url.hostname = currentHost
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    return raw.replace(/\/$/, '')
  }
}

export function getDrawioBaseUrl() {
  return resolveRuntimeBaseUrl(import.meta.env.VITE_DRAWIO_URL, 18083)
}

function getDrawioOrigin() {
  return new URL(
    getDrawioBaseUrl(),
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:18083',
  ).origin
}

export function getStandaloneDrawioUrl() {
  const url = new URL(getDrawioBaseUrl())
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  url.searchParams.set('spin', '1')
  url.searchParams.set('libraries', '1')
  url.searchParams.set('saveAndExit', '1')
  return url.toString()
}

function getDrawioEmbedUrl() {
  const url = new URL(getDrawioBaseUrl())
  url.searchParams.set('offline', '1')
  url.searchParams.set('https', '0')
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  url.searchParams.set('spin', '1')
  url.searchParams.set('ui', 'min')
  url.searchParams.set('libraries', '1')
  url.searchParams.set('saveAndExit', '0')
  return url.toString()
}

export const DrawioDiagramEditor = forwardRef<DrawioDiagramEditorHandle, Props>(function DrawioDiagramEditor(
  { xml, title, loadKey, sourceFormat, disabled, onChange, onSave },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const latestXmlRef = useRef(xml)
  const [ready, setReady] = useState(false)
  const embedUrl = useMemo(() => getDrawioEmbedUrl(), [])

  useEffect(() => {
    latestXmlRef.current = xml
  }, [xml])

  function postMessage(message: object) {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(message), getDrawioOrigin())
  }

  useImperativeHandle(
    ref,
    () => ({
      requestSave() {
        if (!ready || disabled) return
        postMessage({ action: 'save' })
      },
    }),
    [disabled, ready],
  )

  useEffect(() => {
    setReady(false)
  }, [loadKey])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== getDrawioOrigin()) return
      if (event.source !== frameRef.current?.contentWindow) return
      if (typeof event.data !== 'string') return

      let payload: DrawioMessage | null = null
      try {
        payload = JSON.parse(event.data) as DrawioMessage
      } catch {
        return
      }
      if (!payload) return

      if (payload.event === 'init') {
        setReady(true)
        postMessage({
          action: 'load',
          autosave: 1,
          saveAndExit: 0,
          xml: latestXmlRef.current,
          title,
        })
        return
      }

      if (payload.event === 'autosave') {
        latestXmlRef.current = payload.xml
        onChange(payload.xml)
        return
      }

      if (payload.event === 'save') {
        latestXmlRef.current = payload.xml
        onChange(payload.xml)
        onSave(payload.xml)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onChange, onSave, title])

  return (
    <div className="drawio-diagram-shell">
      {sourceFormat === 'legacy' ? (
        <div className="drawio-diagram-banner">
          Legacy non-draw.io diagram content was detected. Diagram mode now uses self-hosted diagrams.net. XML mode preserves the original content until you save a replacement.
        </div>
      ) : null}
      <div className="drawio-diagram-surface">
        <iframe
          key={loadKey}
          ref={frameRef}
          className="diagram-frame drawio-diagram-frame"
          src={embedUrl}
          title="Diagrams.net editor"
        />
        {disabled ? <div className="drawio-diagram-disabled" /> : null}
      </div>
    </div>
  )
})
