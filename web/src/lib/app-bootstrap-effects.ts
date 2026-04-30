import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { isNativePlatform, serverBaseStore, subscribeToConnectivity } from './platform'

type UseAppBootstrapEffectsContext = {
  bootstrap: () => Promise<void>
  refreshQueuedSyncConflicts: () => Promise<unknown>
  setRoute: Dispatch<SetStateAction<string>>
  setLocationSearch: Dispatch<SetStateAction<string>>
  setServerUrl: Dispatch<SetStateAction<string>>
  showSyncNotice: (tone: 'offline' | 'error', message: string, timeoutMs?: number) => void
  syncNoticeTimeoutRef: MutableRefObject<number | null>
  normalizeRoute: (pathname: string) => string
}

export function useAppBootstrapEffects(context: UseAppBootstrapEffectsContext) {
  useEffect(() => {
    const handlePopState = () => {
      setTimeout(() => {
        context.setRoute(context.normalizeRoute(window.location.pathname))
        context.setLocationSearch(window.location.search)
      }, 0)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [context])

  useEffect(() => {
    void context.refreshQueuedSyncConflicts()
  }, [context])

  useEffect(() => {
    void context.bootstrap()
  }, [context])

  useEffect(() => {
    if (!isNativePlatform()) return
    void serverBaseStore.get().then((storedUrl) => {
      if (storedUrl) {
        context.setServerUrl(storedUrl)
      }
    })
  }, [context])

  useEffect(
    () =>
      subscribeToConnectivity((online) => {
        if (!online) {
          context.showSyncNotice('offline', 'Offline mode. Changes will sync when your connection returns.')
        }
      }),
    [context],
  )

  useEffect(
    () => () => {
      if (context.syncNoticeTimeoutRef.current != null) {
        window.clearTimeout(context.syncNoticeTimeoutRef.current)
      }
    },
    [context],
  )
}
