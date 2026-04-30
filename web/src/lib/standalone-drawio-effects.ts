import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { getDrawioBaseUrl } from '../components/DrawioDiagramEditor'
import type { Diagram } from './types'

type UseStandaloneDrawioEffectsContext = {
  diagramsRef: MutableRefObject<Diagram[]>
  standaloneDrawioWindowRef: MutableRefObject<Window | null>
  standaloneDrawioEditingIdRef: MutableRefObject<string | null>
  updateDiagramLocalFirst: (diagram: Diagram, xml: string) => Promise<Diagram>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  showActionNotice: (message: string) => void
  diagramDisplayName: (title: string) => string
}

export function useStandaloneDrawioEffects(context: UseStandaloneDrawioEffectsContext) {
  useEffect(() => {
    async function persistStandaloneDrawioSave(xml: string) {
      const diagramId = context.standaloneDrawioEditingIdRef.current
      if (!diagramId) return
      const currentDiagram = context.diagramsRef.current.find((entry) => entry.id === diagramId)
      if (!currentDiagram) return
      try {
        const updated = await context.updateDiagramLocalFirst(currentDiagram, xml)
        context.setDiagrams((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      } catch (error) {
        console.error('Failed to save standalone draw.io diagram', error)
        context.showActionNotice('Unable to save diagram from draw.io')
      }
    }

    function clearStandaloneDrawioSession(source?: MessageEventSource | null) {
      if (!source || source === context.standaloneDrawioWindowRef.current) {
        context.standaloneDrawioWindowRef.current = null
        context.standaloneDrawioEditingIdRef.current = null
      }
    }

    function onStandaloneDrawioMessage(event: MessageEvent) {
      if (event.origin !== getDrawioBaseUrl()) return
      if (event.source !== context.standaloneDrawioWindowRef.current) return

      let payload: { event?: string; xml?: string; exit?: boolean } | null = null
      if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data) as typeof payload
        } catch {
          payload = event.data === 'ready' ? { event: 'ready' } : null
        }
      } else if (typeof event.data === 'object' && event.data) {
        payload = event.data as typeof payload
      }

      if (!payload?.event) return

      if (payload.event === 'init' || payload.event === 'ready') {
        const diagramId = context.standaloneDrawioEditingIdRef.current
        if (!diagramId) return
        const diagram = context.diagramsRef.current.find((entry) => entry.id === diagramId)
        if (!diagram) return
        event.source?.postMessage(
          JSON.stringify({
            action: 'load',
            autosave: 1,
            saveAndExit: 1,
            xml: diagram.xml,
            title: context.diagramDisplayName(diagram.title),
          }),
          getDrawioBaseUrl(),
        )
        return
      }

      if (payload.event === 'save' && typeof payload.xml === 'string') {
        void persistStandaloneDrawioSave(payload.xml)
        if (payload.exit) {
          clearStandaloneDrawioSession(event.source)
        }
        return
      }

      if (payload.event === 'exit') {
        clearStandaloneDrawioSession(event.source)
      }
    }

    window.addEventListener('message', onStandaloneDrawioMessage)
    return () => window.removeEventListener('message', onStandaloneDrawioMessage)
  }, [
    context.diagramsRef,
    context.standaloneDrawioWindowRef,
    context.standaloneDrawioEditingIdRef,
    context.updateDiagramLocalFirst,
    context.setDiagrams,
    context.showActionNotice,
    context.diagramDisplayName,
  ])
}
