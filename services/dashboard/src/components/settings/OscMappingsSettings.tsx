'use client'

import { useState, useRef } from 'react'
import { useOscMappings } from '@/hooks/useOscMappings'
import type { OscMapping } from '@/lib/types'
import { EntityPicker } from './EntityPicker'
import { LiveOscPreview } from './LiveOscPreview'
import { Plus, Pencil, Trash2, X, RefreshCw } from '@/components/icons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KeyMode = 'single' | 'multiple'

interface MappingFormData {
  osc_address: string
  entity_slug: string
  keyMode: KeyMode
  state_key: string
  state_keys: string
  operation: 'update' | 'set'
  description: string
  enabled: boolean
}

const emptyForm: MappingFormData = {
  osc_address: '',
  entity_slug: '',
  keyMode: 'single',
  state_key: '',
  state_keys: '',
  operation: 'update',
  description: '',
  enabled: true,
}

function formFromMapping(m: OscMapping): MappingFormData {
  const hasMultiple = Array.isArray(m.state_keys) && m.state_keys.length > 0
  return {
    osc_address: m.osc_address,
    entity_slug: m.entity_slug,
    keyMode: hasMultiple ? 'multiple' : 'single',
    state_key: m.state_key ?? '',
    state_keys: hasMultiple ? m.state_keys!.join(', ') : '',
    operation: m.operation,
    description: m.description ?? '',
    enabled: m.enabled,
  }
}

function formToPayload(form: MappingFormData): Partial<OscMapping> {
  return {
    osc_address: form.osc_address,
    entity_slug: form.entity_slug,
    state_key: form.keyMode === 'single' && form.state_key ? form.state_key : null,
    state_keys:
      form.keyMode === 'multiple' && form.state_keys
        ? form.state_keys.split(',').map((k) => k.trim()).filter(Boolean)
        : null,
    operation: form.operation,
    description: form.description || null,
    enabled: form.enabled,
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OscMappingsSettings() {
  const {
    mappings,
    loading,
    error,
    fetchMappings,
    createMapping,
    updateMapping,
    patchMapping,
    deleteMapping,
    importMappings,
    exportMappings,
  } = useOscMappings(true, 10000)

  const [editingId, setEditingId] = useState<string | null>(null) // null = new
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<MappingFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ------ form helpers ------

  function openNewForm() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEditForm(mapping: OscMapping) {
    setEditingId(mapping.id)
    setForm(formFromMapping(mapping))
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = formToPayload(form)
      if (editingId) {
        await updateMapping(editingId, payload)
      } else {
        await createMapping(payload)
      }
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleEnabled(mapping: OscMapping) {
    await patchMapping(mapping.id, { enabled: !mapping.enabled })
  }

  async function handleDelete(id: string) {
    await deleteMapping(id)
    if (editingId === id) closeForm()
  }

  // ------ import / export ------

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Partial<OscMapping>[]
      const result = await importMappings(data)
      if (result) {
        setImportResult(
          `Imported: ${result.created} created, ${result.updated} updated, ${result.failed} failed`
        )
        setTimeout(() => setImportResult(null), 5000)
      }
    } catch {
      setImportResult('Failed to parse import file')
      setTimeout(() => setImportResult(null), 5000)
    }
    // Reset file input
    e.target.value = ''
  }

  // ------ rendering ------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-fg-subtle">
        Loading OSC mappings...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-fg">OSC Mappings</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchMappings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-2 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
            <button
              onClick={exportMappings}
              disabled={mappings.length === 0}
              className="px-3 py-1 rounded text-xs text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-2 disabled:opacity-40 transition-colors"
            >
              Export
            </button>
            <button
              onClick={handleImportClick}
              className="px-3 py-1 rounded text-xs text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-2 transition-colors"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              onClick={openNewForm}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-fg bg-accent hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Mapping
            </button>
          </div>
        </div>
        <p className="text-sm text-fg-muted">
          Map incoming OSC messages to entity state updates.
        </p>
        {importResult && (
          <div className="mt-3 px-3 py-2 rounded bg-surface-0 border border-edge text-xs text-fg">
            {importResult}
          </div>
        )}
      </div>

      {/* Inline edit/create form */}
      {showForm && (
        <div className="bg-surface-1 rounded-lg border border-accent/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-fg">
              {editingId ? 'Edit Mapping' : 'New Mapping'}
            </h3>
            <button onClick={closeForm} className="text-fg-subtle hover:text-fg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* OSC Address */}
            <div>
              <label className="block text-xs text-fg-subtle mb-1.5">OSC Address</label>
              <input
                type="text"
                value={form.osc_address}
                onChange={(e) => setForm({ ...form, osc_address: e.target.value })}
                placeholder="/sensor/temperature"
                className="w-full bg-surface-0 border border-edge-strong focus:border-accent rounded px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent transition-colors font-mono"
              />
            </div>

            {/* Entity */}
            <div>
              <label className="block text-xs text-fg-subtle mb-1.5">Entity</label>
              <EntityPicker
                value={form.entity_slug}
                onChange={(slug) => setForm({ ...form, entity_slug: slug })}
              />
            </div>

            {/* Key mode toggle */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-fg-subtle mb-1.5">State Key</label>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                  <input
                    type="radio"
                    name="keyMode"
                    checked={form.keyMode === 'single'}
                    onChange={() => setForm({ ...form, keyMode: 'single' })}
                    className="accent-blue-500"
                  />
                  Single key
                </label>
                <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                  <input
                    type="radio"
                    name="keyMode"
                    checked={form.keyMode === 'multiple'}
                    onChange={() => setForm({ ...form, keyMode: 'multiple' })}
                    className="accent-blue-500"
                  />
                  Multiple keys
                </label>
              </div>
              {form.keyMode === 'single' ? (
                <input
                  type="text"
                  value={form.state_key}
                  onChange={(e) => setForm({ ...form, state_key: e.target.value })}
                  placeholder="temperature"
                  className="w-full bg-surface-0 border border-edge-strong focus:border-accent rounded px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent transition-colors font-mono"
                />
              ) : (
                <input
                  type="text"
                  value={form.state_keys}
                  onChange={(e) => setForm({ ...form, state_keys: e.target.value })}
                  placeholder="x, y, z"
                  className="w-full bg-surface-0 border border-edge-strong focus:border-accent rounded px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent transition-colors font-mono"
                />
              )}
              <p className="text-[10px] text-fg-subtle mt-1">
                {form.keyMode === 'single'
                  ? 'Single state key the OSC value maps to. Leave blank to pass through (key-value pairs, JSON, or single value).'
                  : 'Comma-separated list of state keys. OSC arguments map to keys in order.'}
              </p>
            </div>

            {/* Operation */}
            <div>
              <label className="block text-xs text-fg-subtle mb-1.5">Operation</label>
              <select
                value={form.operation}
                onChange={(e) => setForm({ ...form, operation: e.target.value as 'update' | 'set' })}
                className="w-full bg-surface-0 border border-edge-strong focus:border-accent rounded px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              >
                <option value="update">update (merge)</option>
                <option value="set">set (replace)</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-fg-subtle mb-1.5">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Map sensor readings to entity state"
                rows={2}
                className="w-full bg-surface-0 border border-edge-strong focus:border-accent rounded px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent transition-colors resize-none"
              />
            </div>
          </div>

          {/* Live Preview */}
          {form.osc_address && (
            <div className="mt-4">
              <LiveOscPreview oscAddress={form.osc_address} />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-edge">
            <button
              onClick={handleSave}
              disabled={saving || !form.osc_address || !form.entity_slug}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-accent hover:bg-accent-hover text-fg disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Mapping'}
            </button>
            <button
              onClick={closeForm}
              className="px-4 py-1.5 text-sm font-medium rounded-md text-fg-muted hover:text-fg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Mappings table */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        {mappings.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-fg-subtle">
              No OSC mappings configured. Create one to map OSC messages to entity state.
            </p>
            {!showForm && (
              <button
                onClick={openNewForm}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium text-fg bg-accent hover:bg-accent-hover transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Mapping
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-subtle border-b border-edge">
                  <th className="pb-2 font-medium">OSC Address</th>
                  <th className="pb-2 font-medium">Entity</th>
                  <th className="pb-2 font-medium">Key(s)</th>
                  <th className="pb-2 font-medium text-center">Operation</th>
                  <th className="pb-2 font-medium text-center">Enabled</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="text-fg group">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs text-fg">{mapping.osc_address}</span>
                      {mapping.description && (
                        <p className="text-[10px] text-fg-subtle mt-0.5 truncate max-w-[200px]">
                          {mapping.description}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs text-fg-muted">{mapping.entity_slug}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {mapping.state_keys && mapping.state_keys.length > 0 ? (
                        <span className="font-mono text-xs text-fg-muted">
                          {mapping.state_keys.join(', ')}
                        </span>
                      ) : mapping.state_key ? (
                        <span className="font-mono text-xs text-fg-muted">{mapping.state_key}</span>
                      ) : (
                        <span className="text-xs text-fg-subtle">--</span>
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          mapping.operation === 'set'
                            ? 'bg-orange-900/40 text-orange-400 border border-orange-800/50'
                            : 'bg-accent/40 text-accent border border-accent/50'
                        }`}
                      >
                        {mapping.operation}
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        onClick={() => handleToggleEnabled(mapping)}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                        style={{
                          backgroundColor: mapping.enabled ? 'rgb(var(--accent))' : 'rgb(var(--border-strong))',
                        }}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                          style={{
                            transform: mapping.enabled ? 'translateX(18px)' : 'translateX(3px)',
                          }}
                        />
                      </button>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditForm(mapping)}
                          className="p-1.5 rounded text-fg-subtle hover:text-accent hover:bg-surface-2 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(mapping.id)}
                          className="p-1.5 rounded text-fg-subtle hover:text-red-400 hover:bg-surface-2 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
