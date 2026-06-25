'use client'

import { useState, useCallback } from 'react'
import {
  Globe,
  Shield,
  Key,
  Radio,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Cloud,
} from 'lucide-react'
import { PolicyEditor } from './PolicyEditor'
import { ConnectionTestResults } from './ConnectionTestResults'
import type { CloudPolicy, CloudSiteRegister, CloudTestResult } from '@/lib/cloudTypes'

interface CloudSetupWizardProps {
  saveConfig: (gatewayUrl: string) => Promise<boolean>
  register: (data: CloudSiteRegister) => Promise<{ id: string } | null>
  issueCertificates: () => Promise<boolean>
  savePolicies: (policies: CloudPolicy[]) => Promise<boolean>
  testConnection: () => Promise<CloudTestResult | null>
  activate: () => Promise<boolean>
}

const STEPS = [
  { id: 0, label: 'Gateway URL', icon: Globe },
  { id: 1, label: 'Register Site', icon: Cloud },
  { id: 2, label: 'Certificates', icon: Key },
  { id: 3, label: 'Routing Policies', icon: Radio },
  { id: 4, label: 'Test & Activate', icon: Shield },
]

const REGIONS = [
  { value: 'us-east', label: 'US East' },
  { value: 'us-west', label: 'US West' },
  { value: 'eu-west', label: 'EU West' },
  { value: 'eu-central', label: 'EU Central' },
  { value: 'apac', label: 'Asia Pacific' },
]

const POLICY_PRESETS: { label: string; policy: CloudPolicy }[] = [
  {
    label: 'Entity State',
    policy: { subject_pattern: 'maestra.entity.state.>', direction: 'outbound', enabled: true },
  },
  {
    label: 'Device Events',
    policy: { subject_pattern: 'maestra.device.>', direction: 'outbound', enabled: true },
  },
  {
    label: 'All Messages',
    policy: { subject_pattern: 'maestra.>', direction: 'outbound', enabled: true },
  },
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function StepIndicator({
  currentStep,
  completedSteps,
}: {
  currentStep: number
  completedSteps: Set<number>
}) {
  return (
    <div className="flex items-center w-full mb-8">
      {STEPS.map((step, index) => {
        const isCompleted = completedSteps.has(step.id)
        const isCurrent = step.id === currentStep
        const isLast = index === STEPS.length - 1

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isCompleted
                    ? 'bg-green-500 text-fg'
                    : isCurrent
                    ? 'bg-accent text-fg'
                    : 'bg-surface-2 text-fg-muted'
                }`}
              >
                {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : step.id + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap hidden sm:block ${
                  isCurrent ? 'text-fg' : 'text-fg-subtle'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`h-px flex-1 mx-2 mb-4 transition-colors ${
                  completedSteps.has(step.id) ? 'bg-green-600' : 'bg-surface-2'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function CloudSetupWizard({
  saveConfig,
  register,
  issueCertificates,
  savePolicies,
  testConnection,
  activate,
}: CloudSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0: Gateway URL
  const [gatewayUrl, setGatewayUrl] = useState('')

  // Step 1: Register site
  const [siteName, setSiteName] = useState('')
  const [siteSlug, setSiteSlug] = useState('')
  const [siteRegion, setSiteRegion] = useState('us-east')
  const [siteDescription, setSiteDescription] = useState('')

  // Step 2: Certificates — just track success
  const [certsIssued, setCertsIssued] = useState(false)

  // Step 3: Policies
  const [policies, setPolicies] = useState<CloudPolicy[]>([])

  // Step 4: Test results
  const [testResult, setTestResult] = useState<CloudTestResult | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const markCompleted = (step: number) =>
    setCompletedSteps((prev) => new Set([...prev, step]))

  const handleSiteNameChange = (name: string) => {
    setSiteName(name)
    setSiteSlug(slugify(name))
  }

  const addPresetPolicy = useCallback(
    (policy: CloudPolicy) => {
      const exists = policies.some(
        (p) => p.subject_pattern === policy.subject_pattern && p.direction === policy.direction
      )
      if (!exists) setPolicies((prev) => [...prev, { ...policy }])
    },
    [policies]
  )

  // Step actions
  const handleStep0 = async () => {
    if (!gatewayUrl.trim()) { setError('Gateway URL is required'); return }
    setLoading(true); setError(null)
    try {
      const ok = await saveConfig(gatewayUrl.trim())
      if (ok) { markCompleted(0); setCurrentStep(1) }
      else setError('Failed to save gateway URL')
    } finally {
      setLoading(false)
    }
  }

  const handleStep1 = async () => {
    if (!siteName.trim()) { setError('Site name is required'); return }
    if (!siteSlug.trim()) { setError('Site slug is required'); return }
    setLoading(true); setError(null)
    try {
      const result = await register({
        gateway_url: gatewayUrl,
        name: siteName,
        slug: siteSlug,
        region: siteRegion,
        description: siteDescription || undefined,
      })
      if (result) { markCompleted(1); setCurrentStep(2) }
      else setError('Failed to register site')
    } finally {
      setLoading(false)
    }
  }

  const handleStep2 = async () => {
    setLoading(true); setError(null)
    try {
      const ok = await issueCertificates()
      if (ok) { setCertsIssued(true); markCompleted(2); setCurrentStep(3) }
      else setError('Failed to issue certificates')
    } finally {
      setLoading(false)
    }
  }

  const handleStep3 = async () => {
    setLoading(true); setError(null)
    try {
      const ok = await savePolicies(policies)
      if (ok) { markCompleted(3); setCurrentStep(4) }
      else setError('Failed to save policies')
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setTestLoading(true); setError(null)
    try {
      const result = await testConnection()
      setTestResult(result)
    } finally {
      setTestLoading(false)
    }
  }

  const handleActivate = async () => {
    setLoading(true); setError(null)
    try {
      const ok = await activate()
      if (ok) markCompleted(4)
      else setError('Failed to activate')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface-1 rounded-lg border border-edge p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-fg">Cloud Gateway Setup</h2>
        <p className="text-sm text-fg-muted mt-1">
          Connect this Maestra instance to a cloud gateway for remote access and multi-site
          orchestration.
        </p>
      </div>

      <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />

      {/* Error */}
      {error && (
        <div className="mb-4 px-3 py-2 rounded bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="min-h-[180px]">
        {/* Step 0: Gateway URL */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg mb-1">
                Gateway URL
              </label>
              <input
                type="url"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="https://gateway.maestra.cloud"
                className="w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-fg-subtle">
                Enter the URL of your Maestra cloud gateway instance.
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Register site */}
        {currentStep === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-fg mb-1">Site Name</label>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => handleSiteNameChange(e.target.value)}
                  placeholder="My Studio"
                  className="w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">Slug</label>
                <input
                  type="text"
                  value={siteSlug}
                  onChange={(e) => setSiteSlug(e.target.value)}
                  placeholder="my-studio"
                  className="w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 font-mono text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg mb-1">Region</label>
              <select
                value={siteRegion}
                onChange={(e) => setSiteRegion(e.target.value)}
                className="w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg mb-1">
                Description{' '}
                <span className="text-fg-subtle font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={siteDescription}
                onChange={(e) => setSiteDescription(e.target.value)}
                placeholder="Main performance studio"
                className="w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
        )}

        {/* Step 2: Certificates */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="bg-surface-0 rounded-lg border border-edge p-4 text-sm text-fg-muted space-y-2">
              <p>
                Maestra uses mutual TLS (mTLS) to authenticate both the gateway and this site. Issuing
                certificates will generate a client certificate and private key for secure communication.
              </p>
              <p>Certificates are stored locally and never leave this instance.</p>
            </div>
            {certsIssued && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Certificates issued successfully
              </div>
            )}
          </div>
        )}

        {/* Step 3: Routing Policies */}
        {currentStep === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              Configure which NATS subjects are routed to/from the cloud gateway.
            </p>
            {/* Quick preset buttons */}
            <div className="flex flex-wrap gap-2">
              {POLICY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => addPresetPolicy(preset.policy)}
                  className="px-3 py-1.5 text-xs rounded-md bg-surface-2 hover:bg-surface-2 text-fg border border-edge-strong transition-colors"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
            <PolicyEditor policies={policies} onChange={setPolicies} />
          </div>
        )}

        {/* Step 4: Test & Activate */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              Run a connection test to verify everything is configured correctly, then activate the
              gateway agent.
            </p>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-surface-2 hover:bg-surface-2 text-fg rounded-lg transition-colors disabled:opacity-50"
            >
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Run Test
            </button>
            {(testResult || testLoading) && (
              <ConnectionTestResults result={testResult} loading={testLoading} />
            )}
            {completedSteps.has(4) && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Gateway activated
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-4 border-t border-edge">
        <button
          type="button"
          onClick={() => { setCurrentStep((s) => Math.max(0, s - 1)); setError(null) }}
          disabled={currentStep === 0 || loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:text-fg disabled:opacity-40 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div>
          {currentStep === 0 && (
            <button
              type="button"
              onClick={handleStep0}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-fg rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Connect
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {currentStep === 1 && (
            <button
              type="button"
              onClick={handleStep1}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-fg rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Register
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {currentStep === 2 && (
            <button
              type="button"
              onClick={handleStep2}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-fg rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Issue Certificates
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {currentStep === 3 && (
            <button
              type="button"
              onClick={handleStep3}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-fg rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Policies
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {currentStep === 4 && !completedSteps.has(4) && (
            <button
              type="button"
              onClick={handleActivate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-fg rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Activate
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
