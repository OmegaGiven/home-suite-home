import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import { filterVisibleNotes } from './notes-runtime'
import type { AdminDeletedItem, Diagram, Note, VoiceMemo } from './types'

type CreateDeletedItemActionsContext = {
  authMode: 'boot' | 'connect' | 'setup' | 'login' | 'change-password' | 'ready'
  session: import('./types').SessionResponse | null
  setDeletedItems: Dispatch<SetStateAction<AdminDeletedItem[]>>
  setNotes: Dispatch<SetStateAction<Note[]>>
  setDiagrams: Dispatch<SetStateAction<Diagram[]>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setCustomFolders: Dispatch<SetStateAction<string[]>>
  rememberPersistedNotes: (nextNotes: Note[]) => void
  normalizeFolderPath: (path: string) => string
  refreshFilesTree: () => Promise<void>
}

export function createDeletedItemActions(context: CreateDeletedItemActionsContext) {
  function isMissingDeletedItemsEndpoint(error: unknown) {
    if (!(error instanceof Error)) return false
    const message = error.message.toLowerCase()
    return message.includes('404') || message.includes('not found')
  }

  async function refreshUserDeletedItems() {
    if (context.authMode !== 'ready' || !context.session) {
      context.setDeletedItems([])
      return
    }
    try {
      context.setDeletedItems(await api.getDeletedItems())
    } catch (error) {
      if (isMissingDeletedItemsEndpoint(error)) {
        context.setDeletedItems([])
        return
      }
      console.error(error)
    }
  }

  async function restoreUserDeletedItem(id: string) {
    await api.restoreDeletedItem(id)
    if (id.startsWith('note:')) {
      const nextNotes = filterVisibleNotes(await api.listNotes())
      context.rememberPersistedNotes(nextNotes)
      context.setNotes(nextNotes)
      context.setCustomFolders(
        Array.from(new Set(nextNotes.map((note) => context.normalizeFolderPath(note.folder || 'Inbox')))).sort((left, right) =>
          left.localeCompare(right),
        ),
      )
    } else if (id.startsWith('diagram:')) {
      const nextDiagrams = await api.listDiagrams()
      context.setDiagrams(nextDiagrams)
    } else if (id.startsWith('voice:')) {
      const nextMemos = await api.listVoiceMemos()
      context.setMemos(nextMemos)
    }
    await context.refreshFilesTree()
    await refreshUserDeletedItems()
  }

  return {
    refreshUserDeletedItems,
    restoreUserDeletedItem,
  }
}
