import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import type { ResourceShare, ResourceVisibility, SessionResponse } from './types'

export type ShareTarget = {
  resourceKey: string
  label: string
}

type CreateShareActionsContext = {
  session: SessionResponse | null
  shareTarget: ShareTarget | null
  shareDraft: ResourceShare | null
  setShareTarget: Dispatch<SetStateAction<ShareTarget | null>>
  setShareUserQuery: Dispatch<SetStateAction<string>>
  setShareDraft: Dispatch<SetStateAction<ResourceShare | null>>
  setShareSaving: Dispatch<SetStateAction<boolean>>
  showActionNotice: (message: string) => void
}

export function createShareActions(context: CreateShareActionsContext) {
  function resourceKeyForFilePath(path: string) {
    return `file:${path}`
  }

  function resourceKeyForNote(noteId: string) {
    return `note:${noteId}`
  }

  function resourceKeyForCalendar(connectionId: string) {
    return `calendar:${connectionId}`
  }

  async function openShareDialog(target: ShareTarget) {
    context.setShareTarget(target)
    context.setShareUserQuery('')
    context.setShareDraft({
      resource_key: target.resourceKey,
      visibility: 'private',
      user_ids: [],
      updated_at: new Date().toISOString(),
      updated_by: context.session?.user.id ?? '',
    })
    try {
      const share = await api.getResourceShare(target.resourceKey)
      context.setShareDraft(share)
    } catch (error) {
      console.error(error)
      context.showActionNotice('Could not load visibility settings.')
    }
  }

  function setShareVisibility(visibility: ResourceVisibility) {
    context.setShareDraft((current) =>
      current
        ? {
            ...current,
            visibility,
            user_ids: visibility === 'users' ? current.user_ids : [],
          }
        : current,
    )
  }

  function toggleShareUser(userId: string) {
    context.setShareDraft((current) => {
      if (!current) return current
      const user_ids = current.user_ids.includes(userId)
        ? current.user_ids.filter((id) => id !== userId)
        : [...current.user_ids, userId]
      return { ...current, visibility: 'users', user_ids }
    })
  }

  async function saveShareSettings() {
    if (!context.shareTarget || !context.shareDraft) return
    context.setShareSaving(true)
    try {
      const saved = await api.updateResourceShare(
        context.shareTarget.resourceKey,
        context.shareDraft.visibility,
        context.shareDraft.visibility === 'users' ? context.shareDraft.user_ids : [],
      )
      context.setShareDraft(saved)
      context.setShareTarget(null)
      context.showActionNotice(
        saved.visibility === 'org'
          ? `Shared ${context.shareTarget.label} with the org.`
          : saved.visibility === 'users'
            ? `Shared ${context.shareTarget.label} with selected people.`
            : `${context.shareTarget.label} is private.`,
      )
    } catch (error) {
      console.error(error)
      context.showActionNotice('Could not save visibility settings.')
    } finally {
      context.setShareSaving(false)
    }
  }

  return {
    resourceKeyForFilePath,
    resourceKeyForNote,
    resourceKeyForCalendar,
    openShareDialog,
    setShareVisibility,
    toggleShareUser,
    saveShareSettings,
  }
}
