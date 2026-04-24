import type { RefObject } from 'react'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { FileNode } from '../../lib/types'

type Props = {
  creatingDriveFolder: boolean
  newDriveFolderName: string
  pendingDeletePaths: string[]
  pendingDeleteNodes: FileNode[]
  renamingFilePath: string | null
  renameFileName: string
  convertingFilePath: string | null
  fileHelpOpen: boolean
  renameInputRef: RefObject<HTMLInputElement | null>
  deleteConfirmButtonRef: RefObject<HTMLButtonElement | null>
  deleteCancelButtonRef: RefObject<HTMLButtonElement | null>
  onSetCreatingDriveFolder: (value: boolean) => void
  onSetNewDriveFolderName: (value: string) => void
  onCreateDriveFolderFromSelection: () => void
  onSetPendingDeletePaths: (paths: string[]) => void
  onDeleteManagedPaths: (paths: string[]) => void
  onSetRenamingFilePath: (path: string | null) => void
  onSetRenameFileName: (value: string) => void
  onRenameManagedPath: (path: string | null, name: string) => void
  onSetConvertingFilePath: (path: string | null) => void
  onConvertManagedTextFile: (path: string | null) => void
  onSetFileHelpOpen: (open: boolean) => void
}

export function FilesModals({
  creatingDriveFolder,
  newDriveFolderName,
  pendingDeletePaths,
  pendingDeleteNodes,
  renamingFilePath,
  renameFileName,
  convertingFilePath,
  fileHelpOpen,
  renameInputRef,
  deleteConfirmButtonRef,
  deleteCancelButtonRef,
  onSetCreatingDriveFolder,
  onSetNewDriveFolderName,
  onCreateDriveFolderFromSelection,
  onSetPendingDeletePaths,
  onDeleteManagedPaths,
  onSetRenamingFilePath,
  onSetRenameFileName,
  onRenameManagedPath,
  onSetConvertingFilePath,
  onConvertManagedTextFile,
  onSetFileHelpOpen,
}: Props) {
  return (
    <>
      {creatingDriveFolder ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            onSetCreatingDriveFolder(false)
            onSetNewDriveFolderName('')
          }}
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Create folder</h3>
            <input
              className="input"
              value={newDriveFolderName}
              placeholder="Folder name"
              autoFocus
              onChange={(event) => onSetNewDriveFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onCreateDriveFolderFromSelection()
                if (event.key === 'Escape') {
                  onSetCreatingDriveFolder(false)
                  onSetNewDriveFolderName('')
                }
              }}
            />
            <div className="button-row">
              <button className="button" onClick={onCreateDriveFolderFromSelection}>
                Confirm
              </button>
              <button
                className="button-secondary"
                onClick={() => {
                  onSetCreatingDriveFolder(false)
                  onSetNewDriveFolderName('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeletePaths.length > 0 ? (
        <ConfirmModal
          title={`Delete ${pendingDeletePaths.length === 1 ? 'item' : `${pendingDeletePaths.length} items`}?`}
          onClose={() => onSetPendingDeletePaths([])}
          onConfirm={() => onDeleteManagedPaths(pendingDeletePaths)}
          confirmRef={deleteConfirmButtonRef}
          cancelRef={deleteCancelButtonRef}
        >
          <p className="muted">This will permanently delete:</p>
          <div className="code-block file-delete-list">{pendingDeleteNodes.map((node) => node.path).join('\n')}</div>
        </ConfirmModal>
      ) : null}
      {renamingFilePath ? (
        <div className="modal-backdrop" onClick={() => onSetRenamingFilePath(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Rename item</h3>
            <input
              ref={renameInputRef}
              className="input"
              value={renameFileName}
              onChange={(event) => onSetRenameFileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onSetRenamingFilePath(null)
                  return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onRenameManagedPath(renamingFilePath, renameFileName)
                }
              }}
            />
            <div className="button-row">
              <button className="button" onClick={() => onRenameManagedPath(renamingFilePath, renameFileName)}>
                Rename
              </button>
              <button className="button-secondary" onClick={() => onSetRenamingFilePath(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {convertingFilePath ? (
        <ConfirmModal
          title={`Convert to .${convertingFilePath.split('.').pop()?.toLowerCase() === 'txt' ? 'md' : 'txt'}`}
          onClose={() => onSetConvertingFilePath(null)}
          onConfirm={() => onConvertManagedTextFile(convertingFilePath)}
          confirmLabel="Convert"
        >
          <p className="muted">This rewrites the file as plain text with the new extension and removes the old file.</p>
        </ConfirmModal>
      ) : null}
      {fileHelpOpen ? (
        <div className="modal-backdrop" onClick={() => onSetFileHelpOpen(false)}>
          <div className="modal-card file-help-card" onClick={(event) => event.stopPropagation()}>
            <h3>Yazi-style keys</h3>
            <div className="help-grid">
              <div><code>j</code> <code>k</code> or arrows</div>
              <div>Move cursor</div>
              <div><code>h</code></div>
              <div>Go to parent directory</div>
              <div><code>l</code> or <code>Enter</code></div>
              <div>Open directory or file</div>
              <div><code>gg</code> / <code>G</code></div>
              <div>Jump to first / last item</div>
              <div><code>Space</code></div>
              <div>Mark or unmark item</div>
              <div><code>Delete</code></div>
              <div>Delete marked or active item</div>
              <div><code>y</code></div>
              <div>Copy marked path(s)</div>
              <div><code>?</code></div>
              <div>Toggle help</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
