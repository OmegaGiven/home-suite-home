import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { createEmptyDrawioDiagramXml, parseDrawioDiagramXml } from './drawio-diagram'
import type { DiagramEditorMode } from './app-config'
import type { Diagram } from './types'
import type { DrawioDiagramEditorHandle } from '../components/DrawioDiagramEditor'

type CreateDiagramActionsContext = {
  diagrams: Diagram[]
  selectedDiagram: Diagram | null
  diagramDraft: string
  diagramEditorMode: DiagramEditorMode
  drawioEditorRef: MutableRefObject<DrawioDiagramEditorHandle | null>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setSelectedDiagramId: Dispatch<SetStateAction<string | null>>
  setDiagramSourceFormat: Dispatch<SetStateAction<'drawio' | 'legacy' | 'empty'>>
  setDiagramDraft: Dispatch<SetStateAction<string>>
  setDiagramLoadVersion: Dispatch<SetStateAction<number>>
  setDiagramEditorMode: Dispatch<SetStateAction<DiagramEditorMode>>
  createDiagramRecord: (title: string, xml?: string) => Promise<Diagram>
  updateDiagramRecord: (diagram: Diagram, xml: string) => Promise<Diagram>
  showActionNotice: (message: string) => void
}

export function createDiagramActions(context: CreateDiagramActionsContext) {
  async function createDiagram() {
    const nextXml = createEmptyDrawioDiagramXml()
    const diagram = await context.createDiagramRecord(`Diagram ${context.diagrams.length + 1}`, nextXml)
    context.setDiagrams((current) => [diagram, ...current])
    context.setSelectedDiagramId(diagram.id)
    context.setDiagramSourceFormat('empty')
    context.setDiagramDraft(nextXml)
    context.setDiagramLoadVersion((current) => current + 1)
  }

  async function persistDiagramXml(xml: string) {
    if (!context.selectedDiagram) return
    context.setDiagramDraft(xml)
    const updated = await context.updateDiagramRecord(context.selectedDiagram, xml)
    context.setDiagrams((current) => current.map((diagram) => (diagram.id === updated.id ? updated : diagram)))
    context.setDiagramSourceFormat('drawio')
    context.showActionNotice(`Saved diagram: ${updated.title}`)
  }

  async function saveDiagram() {
    if (!context.selectedDiagram) return
    if (context.diagramEditorMode === 'diagram') {
      context.drawioEditorRef.current?.requestSave()
      return
    }
    await persistDiagramXml(context.diagramDraft)
  }

  function setDiagramMode(mode: DiagramEditorMode) {
    if (mode === 'xml') {
      context.setDiagramEditorMode(mode)
      return
    }
    const parsed = parseDrawioDiagramXml(context.diagramDraft)
    context.setDiagramDraft(parsed.xml)
    context.setDiagramSourceFormat(parsed.sourceFormat)
    context.setDiagramLoadVersion((current) => current + 1)
    context.setDiagramEditorMode(mode)
  }

  return {
    createDiagram,
    persistDiagramXml,
    saveDiagram,
    setDiagramMode,
  }
}
