'use client'

import { useState } from 'react'
import { Cloud, Settings } from '@/components/icons'
import { getServiceLinks } from '@/lib/hosts'
import { useCloudGateway } from '@/hooks/useCloudGateway'
import { CloudStatusCard } from './CloudStatusCard'
import { CloudSetupWizard } from './CloudSetupWizard'
import { PolicyEditor } from './PolicyEditor'

type Tab = 'general' | 'cloud'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('cloud')
  const cloud = useCloudGateway(true, 15000)

  const isConnected = cloud.config?.gateway_url && cloud.config.status !== 'disconnected'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-700">
        <TabButton
          active={tab === 'general'}
          onClick={() => setTab('general')}
          icon={<Settings className="w-4 h-4" />}
          label="General"
        />
        <TabButton
          active={tab === 'cloud'}
          onClick={() => setTab('cloud')}
          icon={<Cloud className="w-4 h-4" />}
          label="Cloud Gateway"
        />
      </div>

      {/* Tab content */}
      {tab === 'general' && <GeneralTab />}
      {tab === 'cloud' && <CloudTab cloud={cloud} isConnected={isConnected} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function GeneralTab() {
  const urls = getServiceLinks()
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Instance Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Version</span>
            <p className="text-slate-200 mt-1">0.2.0</p>
          </div>
          <div>
            <span className="text-slate-500">Fleet Manager</span>
            <p className="text-slate-200 mt-1">{urls.fleetManager}</p>
          </div>
          <div>
            <span className="text-slate-500">Message Bus</span>
            <p className="text-slate-200 mt-1">NATS ({urls.nats})</p>
          </div>
          <div>
            <span className="text-slate-500">Database</span>
            <p className="text-slate-200 mt-1">TimescaleDB ({urls.database})</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CloudTab({
  cloud,
  isConnected,
}: {
  cloud: ReturnType<typeof useCloudGateway>
  isConnected: boolean | null | undefined
}) {
  const [policiesDirty, setPoliciesDirty] = useState(false)
  const [localPolicies, setLocalPolicies] = useState(cloud.policies)
  const [saving, setSaving] = useState(false)

  // Sync local policies when cloud data refreshes (and user hasn't made local edits)
  const policiesKey = JSON.stringify(cloud.policies)
  const [lastSyncKey, setLastSyncKey] = useState(policiesKey)
  if (policiesKey !== lastSyncKey && !policiesDirty) {
    setLocalPolicies(cloud.policies)
    setLastSyncKey(policiesKey)
  }

  const handleSavePolicies = async () => {
    setSaving(true)
    const ok = await cloud.savePolicies(localPolicies)
    setSaving(false)
    if (ok) setPoliciesDirty(false)
  }

  if (cloud.loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading cloud configuration...
      </div>
    )
  }

  if (!isConnected) {
    return (
      <CloudSetupWizard
        saveConfig={cloud.saveConfig}
        register={cloud.register}
        issueCertificates={cloud.issueCertificates}
        savePolicies={cloud.savePolicies}
        testConnection={cloud.testConnection}
        activate={cloud.activate}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      {cloud.status && cloud.config && (
        <CloudStatusCard
          status={cloud.status}
          config={cloud.config}
          onRefresh={cloud.refresh}
        />
      )}

      {/* Routing policies */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Routing Policies</h2>
          {policiesDirty && (
            <button
              onClick={handleSavePolicies}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Policies'}
            </button>
          )}
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Control which NATS messages are forwarded to the cloud gateway.
        </p>
        <PolicyEditor
          policies={localPolicies}
          onChange={(p) => {
            setLocalPolicies(p)
            setPoliciesDirty(true)
          }}
          showPresets
        />
      </div>

      {/* Disconnect */}
      <div className="bg-slate-800 rounded-lg border border-red-900/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Disconnect</h2>
        <p className="text-sm text-slate-400 mb-4">
          Remove the cloud gateway configuration from this Maestra instance.
        </p>
        <button
          onClick={cloud.disconnect}
          className="px-4 py-2 text-sm font-medium rounded-md bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/40 transition-colors"
        >
          Disconnect from Cloud Gateway
        </button>
      </div>

      {/* Error */}
      {cloud.error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
          {cloud.error}
        </div>
      )}
    </div>
  )
}
