import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { FileColumnKey } from './file-browser'

type WidthHeight = { width: number; height: number }

type UsePaneLayoutEffectsContext = {
  activeSplitter: 'left' | 'right' | null
  filePaneHeights: { top: number; middle: number }
  filePreviewOpen: boolean
  activeFileColumnSplitter: FileColumnKey | null
  activeNoteSplitter: boolean
  noteDrawerOpen: boolean
  activeDiagramSplitter: boolean
  diagramDrawerOpen: boolean
  activeVoiceSplitter: boolean
  voiceDrawerOpen: boolean
  activeChatSplitter: boolean
  chatDrawerOpen: boolean
  fileManagerRef: RefObject<HTMLDivElement | null>
  noteManagerRef: RefObject<HTMLDivElement | null>
  diagramManagerRef: RefObject<HTMLDivElement | null>
  chatManagerRef: RefObject<HTMLDivElement | null>
  diagramsSectionRef: RefObject<HTMLElement | null>
  filePreviewWidthRef: MutableRefObject<number>
  fileColumnResizeRef: MutableRefObject<{
    splitter: FileColumnKey
    startX: number
    startWidths: Record<FileColumnKey, number>
  } | null>
  setFilePaneHeights: Dispatch<SetStateAction<{ top: number; middle: number }>>
  setFilePaneWidths: Dispatch<SetStateAction<{ left: number; right: number }>>
  setFilePreviewOpen: Dispatch<SetStateAction<boolean>>
  setActiveSplitter: Dispatch<SetStateAction<'left' | 'right' | null>>
  setFileColumnWidths: Dispatch<SetStateAction<Record<FileColumnKey, number>>>
  setActiveFileColumnSplitter: Dispatch<SetStateAction<FileColumnKey | null>>
  setNotePaneSize: Dispatch<SetStateAction<WidthHeight>>
  setActiveNoteSplitter: Dispatch<SetStateAction<boolean>>
  setDiagramPaneSize: Dispatch<SetStateAction<WidthHeight>>
  setActiveDiagramSplitter: Dispatch<SetStateAction<boolean>>
  setDiagramFullscreen: Dispatch<SetStateAction<boolean>>
  setVoicePaneSize: Dispatch<SetStateAction<WidthHeight>>
  setActiveVoiceSplitter: Dispatch<SetStateAction<boolean>>
  setChatPaneSize: Dispatch<SetStateAction<WidthHeight>>
  setActiveChatSplitter: Dispatch<SetStateAction<boolean>>
}

function eventPoint(event: MouseEvent | TouchEvent) {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
  }
  return { clientX: event.clientX, clientY: event.clientY }
}

export function usePaneLayoutEffects(context: UsePaneLayoutEffectsContext) {
  useEffect(() => {
    if (!context.activeSplitter) return

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = context.fileManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 760px)').matches
      const minLeft = 120
      const minRight = 180
      const minTop = 120
      const minBottom = 160

      if (stacked) {
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        context.setFilePaneHeights((current) => ({ ...current, top: Math.round(nextTop) }))
        return
      }

      if (context.activeSplitter === 'left') {
        const nextLeft = Math.min(rect.width - minRight - splitterWidth, Math.max(minLeft, point.clientX - rect.left))
        context.setFilePaneWidths((current) => ({ ...current, left: Math.round(nextLeft) }))
        return
      }

      const nextRight = Math.min(rect.width - minLeft - splitterWidth, Math.max(minRight, rect.right - point.clientX))
      context.filePreviewWidthRef.current = Math.round(nextRight)
      if (!context.filePreviewOpen) {
        context.setFilePreviewOpen(true)
      }
      context.setFilePaneWidths((current) => ({ ...current, right: Math.round(nextRight) }))
    }

    function onPointerUp() {
      context.setActiveSplitter(null)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [context.activeSplitter, context.fileManagerRef, context.filePaneHeights.middle, context.filePaneHeights.top, context.filePreviewOpen, context.filePreviewWidthRef, context.setActiveSplitter, context.setFilePaneHeights, context.setFilePaneWidths, context.setFilePreviewOpen])

  useEffect(() => {
    if (!context.activeFileColumnSplitter) return

    function onMouseMove(event: MouseEvent) {
      const dragState = context.fileColumnResizeRef.current
      if (!dragState) return
      const deltaX = event.clientX - dragState.startX

      context.setFileColumnWidths((current) => {
        const minimums: Record<FileColumnKey, number> = {
          name: 160,
          directory: 140,
          type: 40,
          size: 44,
          modified: 120,
          created: 120,
        }
        const maximums: Record<FileColumnKey, number> = {
          name: 960,
          directory: 520,
          type: 180,
          size: 220,
          modified: 260,
          created: 260,
        }
        const nextWidth = Math.max(
          minimums[dragState.splitter],
          Math.min(maximums[dragState.splitter], Math.round(dragState.startWidths[dragState.splitter] + deltaX)),
        )
        return { ...current, [dragState.splitter]: nextWidth }
      })
    }

    function onMouseUp() {
      context.fileColumnResizeRef.current = null
      context.setActiveFileColumnSplitter(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [context.activeFileColumnSplitter, context.fileColumnResizeRef, context.setActiveFileColumnSplitter, context.setFileColumnWidths])

  useEffect(() => {
    if (!context.activeNoteSplitter || !context.noteDrawerOpen) return

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = context.noteManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        context.setNotePaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      context.setNotePaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      context.setActiveNoteSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [context.activeNoteSplitter, context.noteDrawerOpen, context.noteManagerRef, context.setActiveNoteSplitter, context.setNotePaneSize])

  useEffect(() => {
    if (!context.activeDiagramSplitter || !context.diagramDrawerOpen) return

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = context.diagramManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 340
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        context.setDiagramPaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 120
      const minRight = 420
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      context.setDiagramPaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      context.setActiveDiagramSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [context.activeDiagramSplitter, context.diagramDrawerOpen, context.diagramManagerRef, context.setActiveDiagramSplitter, context.setDiagramPaneSize])

  useEffect(() => {
    function handleFullscreenChange() {
      context.setDiagramFullscreen(document.fullscreenElement === context.diagramsSectionRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [context.diagramsSectionRef, context.setDiagramFullscreen])

  useEffect(() => {
    if (!context.activeVoiceSplitter || !context.voiceDrawerOpen) return

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = document.querySelector('.voice-manager') as HTMLElement | null
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        context.setVoicePaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      context.setVoicePaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      context.setActiveVoiceSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [context.activeVoiceSplitter, context.voiceDrawerOpen, context.setActiveVoiceSplitter, context.setVoicePaneSize])

  useEffect(() => {
    if (!context.activeChatSplitter || !context.chatDrawerOpen) return

    function onPointerMove(event: MouseEvent | TouchEvent) {
      if ('touches' in event) {
        event.preventDefault()
      }
      const point = eventPoint(event)
      if (!point) return
      const root = context.chatManagerRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const splitterWidth = 8
      const stacked = window.matchMedia('(max-width: 1024px)').matches

      if (stacked) {
        const minTop = 140
        const minBottom = 320
        const maxTop = rect.height - minBottom - splitterWidth
        const nextTop = Math.min(maxTop, Math.max(minTop, point.clientY - rect.top))
        context.setChatPaneSize((current) => ({ ...current, height: Math.round(nextTop) }))
        return
      }

      const minLeft = 96
      const minRight = 360
      const maxLeft = rect.width - minRight - splitterWidth
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, point.clientX - rect.left))
      context.setChatPaneSize((current) => ({ ...current, width: Math.round(nextLeft) }))
    }

    function onPointerUp() {
      context.setActiveChatSplitter(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [context.activeChatSplitter, context.chatDrawerOpen, context.chatManagerRef, context.setActiveChatSplitter, context.setChatPaneSize])
}
