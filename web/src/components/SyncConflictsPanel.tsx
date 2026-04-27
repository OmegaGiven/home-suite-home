import type { QueuedSyncConflict } from '../lib/types'

type Props = {
  conflicts: QueuedSyncConflict[]
  open: boolean
  onToggleOpen: () => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  onRetryAll: () => void
  onDiscardAll: () => void
  onOpenTarget: (id: string) => void
}

function leafName(path: string) {
  return path.split('/').filter(Boolean).pop() || path
}

function labelForConflict(conflict: QueuedSyncConflict) {
  const operation = conflict.queued_operation.operation
  switch (operation.kind) {
    case 'create_note':
      return `Create note: ${operation.title}`
    case 'update_note':
      return `Update note: ${operation.title?.trim() || operation.id}`
    case 'delete_note':
      return `Delete note: ${operation.id}`
    case 'create_diagram':
      return `Create diagram: ${operation.title}`
    case 'update_diagram':
      return `Update diagram: ${operation.title?.trim() || operation.id}`
    case 'create_task':
      return `Create task: ${operation.title}`
    case 'update_task':
      return `Update task: ${operation.title.trim() || operation.id}`
    case 'delete_task':
      return `Delete task: ${operation.id}`
    case 'create_local_calendar':
      return `Create calendar: ${operation.title}`
    case 'rename_calendar':
      return `Rename calendar: ${operation.title}`
    case 'delete_calendar':
      return `Delete calendar: ${operation.id}`
    case 'create_calendar_event':
      return `Create event: ${operation.title}`
    case 'update_calendar_event':
      return `Update event: ${operation.title}`
    case 'delete_calendar_event':
      return `Delete event: ${operation.event_id}`
    case 'create_message':
      return `Send message: ${operation.body.slice(0, 48)}`
    case 'create_managed_folder':
      return `Create folder: ${leafName(operation.path)}`
    case 'move_managed_path':
      return `Move path: ${leafName(operation.source_path)}`
    case 'rename_managed_path':
      return `Rename path: ${leafName(operation.path)}`
    case 'delete_managed_path':
      return `Delete path: ${leafName(operation.path)}`
    case 'toggle_message_reaction':
      return `Toggle reaction: ${operation.emoji}`
  }
}

function canOpenTarget(conflict: QueuedSyncConflict) {
  switch (conflict.queued_operation.operation.kind) {
    case 'create_local_calendar':
    case 'rename_calendar':
    case 'delete_calendar':
    case 'create_calendar_event':
    case 'update_calendar_event':
    case 'delete_calendar_event':
    case 'create_note':
    case 'update_note':
    case 'delete_note':
    case 'create_diagram':
    case 'update_diagram':
    case 'create_task':
    case 'update_task':
    case 'delete_task':
    case 'create_message':
    case 'toggle_message_reaction':
    case 'create_managed_folder':
    case 'move_managed_path':
    case 'rename_managed_path':
    case 'delete_managed_path':
      return true
  }
}

function detailRows(conflict: QueuedSyncConflict) {
  const rows: Array<{ label: string; value: string }> = []
  if (conflict.conflict.field.trim()) {
    rows.push({ label: 'Field', value: conflict.conflict.field })
  }
  if (conflict.conflict.local_value.trim()) {
    rows.push({ label: 'Local', value: conflict.conflict.local_value })
  }
  if (conflict.conflict.remote_value.trim()) {
    rows.push({ label: 'Remote', value: conflict.conflict.remote_value })
  }
  return rows
}

export function SyncConflictsPanel({
  conflicts,
  open,
  onToggleOpen,
  onRetry,
  onDiscard,
  onRetryAll,
  onDiscardAll,
  onOpenTarget,
}: Props) {
  if (conflicts.length === 0) return null

  return (
    <div className={`sync-conflicts-wrap ${open ? 'open' : ''}`} aria-live="polite">
      <button className="sync-conflicts-toggle" type="button" onClick={onToggleOpen}>
        {conflicts.length} offline conflict{conflicts.length === 1 ? '' : 's'}
      </button>
      {open ? (
        <div className="sync-conflicts-panel">
          <div className="sync-conflicts-header">
            <strong>Offline conflicts</strong>
            <div className="sync-conflicts-header-actions">
              <button className="button-secondary" type="button" onClick={onRetryAll}>
                Retry all
              </button>
              <button className="button-secondary" type="button" onClick={onDiscardAll}>
                Discard all
              </button>
              <button className="button-secondary files-toolbar-icon-button" type="button" onClick={onToggleOpen}>
                Close
              </button>
            </div>
          </div>
          <div className="sync-conflicts-list">
            {conflicts.map((entry) => (
              <div className="sync-conflicts-item" key={entry.id}>
                <div className="sync-conflicts-item-title">{labelForConflict(entry)}</div>
                <div className="sync-conflicts-item-reason">{entry.conflict.reason}</div>
                {detailRows(entry).length > 0 ? (
                  <div className="sync-conflicts-item-details">
                    {detailRows(entry).map((detail) => (
                      <div className="sync-conflicts-item-detail" key={`${entry.id}-${detail.label}`}>
                        <span className="sync-conflicts-item-detail-label">{detail.label}</span>
                        <span className="sync-conflicts-item-detail-value">{detail.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="sync-conflicts-item-actions">
                  {canOpenTarget(entry) ? (
                    <button className="button-secondary" type="button" onClick={() => onOpenTarget(entry.id)}>
                      Open
                    </button>
                  ) : null}
                  <button className="button-primary" type="button" onClick={() => onRetry(entry.id)}>
                    Retry
                  </button>
                  <button className="button-secondary" type="button" onClick={() => onDiscard(entry.id)}>
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
