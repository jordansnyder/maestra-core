'use client'

import { useState } from 'react'
import { DMXFixture } from '@/lib/types'
import { Trash2, X } from '@/components/icons'

interface DeleteFixtureDialogProps {
  fixture: DMXFixture
  onConfirm: (deleteEntity: boolean) => Promise<void>
  onCancel: () => void
}

export function DeleteFixtureDialog({ fixture, onConfirm, onCancel }: DeleteFixtureDialogProps) {
  const [deleteEntity, setDeleteEntity] = useState(!!fixture.entity_id)
  const [deleting, setDeleting] = useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm(deleteEntity)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Delete Fixture</h2>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300">
            Delete <span className="font-medium text-white">{fixture.name}</span>? This removes it
            from the canvas and DMX patch.
          </p>

          {fixture.entity_id && (
            <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-slate-700 px-3 py-2.5 hover:border-slate-600 transition-colors">
              <input
                type="checkbox"
                checked={deleteEntity}
                onChange={(e) => setDeleteEntity(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-red-500 shrink-0"
              />
              <div>
                <div className="text-sm text-slate-200">Also delete the linked entity</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                  {fixture.entity_id.slice(0, 8)}…
                </div>
              </div>
            </label>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg text-sm text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={deleting}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
