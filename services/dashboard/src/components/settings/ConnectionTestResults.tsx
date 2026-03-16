'use client'

import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { CloudTestResult } from '@/lib/cloudTypes'

interface ConnectionTestResultsProps {
  result: CloudTestResult | null
  loading?: boolean
}

const CHECK_LABELS: Record<string, string> = {
  gateway_reachable: 'Gateway Reachable',
  site_registered: 'Site Registered',
  certificates_valid: 'Certificates Valid',
  agent_connected: 'Agent Connected',
}

function getCheckLabel(key: string): string {
  return CHECK_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ConnectionTestResults({ result, loading = false }: ConnectionTestResultsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-400 py-4">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        <span className="text-sm">Testing connection...</span>
      </div>
    )
  }

  if (!result) {
    return null
  }

  const checks = Object.entries(result.checks)
  const failedCount = checks.filter(([, passed]) => !passed).length

  return (
    <div className="space-y-3">
      {/* Check list */}
      <div className="space-y-2">
        {checks.map(([key, passed]) => (
          <div key={key} className="flex items-center gap-3">
            {passed ? (
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span className={`text-sm ${passed ? 'text-slate-300' : 'text-slate-400'}`}>
              {getCheckLabel(key)}
            </span>
          </div>
        ))}
      </div>

      {/* Latency */}
      {result.latency_ms !== null && (
        <div className="text-xs text-slate-500 pt-1">
          Round-trip: <span className="text-slate-400 font-mono">{result.latency_ms}ms</span>
        </div>
      )}

      {/* Overall result */}
      <div
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm mt-2 ${
          result.success
            ? 'bg-green-900/30 border border-green-700/40 text-green-300'
            : 'bg-red-900/30 border border-red-700/40 text-red-300'
        }`}
      >
        {result.success ? (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>All checks passed</span>
          </>
        ) : (
          <>
            <XCircle className="w-4 h-4 shrink-0" />
            <span>
              {failedCount} check{failedCount !== 1 ? 's' : ''} failed
              {result.error ? ` — ${result.error}` : ''}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
