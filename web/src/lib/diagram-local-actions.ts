import { api } from './api'
import { createEmptyDrawioDiagramXml } from './drawio-diagram'
import { getConnectivityState } from './platform'
import { queueSyncOperation } from './sync-engine'
import type { Diagram, SessionResponse } from './types'

type CreateDiagramLocalActionsContext = {
  session: SessionResponse | null
  createEntityId: () => string
}

export function createDiagramLocalActions(context: CreateDiagramLocalActionsContext) {
  async function createDiagramLocalFirst(title: string, xml?: string) {
    if (getConnectivityState()) {
      return api.createDiagram(title, xml)
    }
    if (!context.session) {
      throw new Error('You must be signed in to create diagrams offline.')
    }
    const now = new Date().toISOString()
    const diagram: Diagram = {
      id: context.createEntityId(),
      title,
      xml: xml ?? createEmptyDrawioDiagramXml(),
      revision: 1,
      created_at: now,
      updated_at: now,
      author_id: context.session.user.id,
      last_editor_id: context.session.user.id,
    }
    await queueSyncOperation({
      kind: 'create_diagram',
      client_generated_id: diagram.id,
      title: diagram.title,
      xml: diagram.xml,
    })
    return diagram
  }

  async function updateDiagramLocalFirst(diagram: Diagram, xml: string) {
    if (getConnectivityState()) {
      return api.updateDiagram({ ...diagram, xml })
    }
    const updated: Diagram = {
      ...diagram,
      xml,
      revision: diagram.revision + 1,
      updated_at: new Date().toISOString(),
      last_editor_id: context.session?.user.id ?? diagram.last_editor_id,
    }
    await queueSyncOperation({
      kind: 'update_diagram',
      id: diagram.id,
      title: updated.title,
      xml: updated.xml,
      revision: diagram.revision,
    })
    return updated
  }

  return {
    createDiagramLocalFirst,
    updateDiagramLocalFirst,
  }
}
