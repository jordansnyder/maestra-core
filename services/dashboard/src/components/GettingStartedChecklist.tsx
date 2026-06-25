'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useOnboarding, type ChecklistStep } from '@/hooks/useOnboarding'
import { ChevronDown, ChevronRight, ExternalLink } from '@/components/icons'
import { CheckCircle2 } from '@/components/icons'

export function GettingStartedChecklist() {
  const { state, steps, completeStep, hideChecklist, progress } = useOnboarding()
  const [expanded, setExpanded] = useState(true)

  if (state.checklistHidden) return null

  const progressPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0

  return (
    <div id="getting-started" className="mb-6">
      <div className="bg-surface-1 border border-edge rounded-xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">Getting Started</h3>
            <span className="text-xs text-fg-subtle">
              {progress.completed} of {progress.total}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-fg-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-fg-muted" />
          )}
        </button>

        {/* Progress bar */}
        <div className="px-5">
          <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Steps list */}
        {expanded && (
          <div className="px-5 py-3 space-y-1">
            {steps.map((step) => {
              const isCompleted = state.completedSteps.includes(step.id)
              return (
                <StepRow
                  key={step.id}
                  step={step}
                  completed={isCompleted}
                  onComplete={() => completeStep(step.id)}
                />
              )
            })}

            {/* Hide checklist */}
            <div className="pt-3 border-t border-edge mt-3">
              <button
                onClick={hideChecklist}
                className="text-xs text-fg-subtle hover:text-fg transition-colors"
              >
                Hide checklist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepRow({
  step,
  completed,
  onComplete,
}: {
  step: ChecklistStep
  completed: boolean
  onComplete: () => void
}) {
  const hasExternal = 'external' in step && step.external
  const hasPath = 'path' in step && step.path

  const content = (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-2/50 transition-colors group">
      {/* Checkbox */}
      <div className="shrink-0">
        {completed ? (
          <CheckCircle2 className="w-5 h-5 text-purple-400" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-edge-strong group-hover:border-edge-strong" />
        )}
      </div>

      {/* Label and description */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            completed ? 'text-fg-subtle line-through' : 'text-fg'
          }`}
        >
          {step.label}
        </p>
        <p className="text-xs text-fg-subtle">{step.description}</p>
      </div>

      {/* Arrow / external icon */}
      {hasExternal && (
        <ExternalLink className="w-3.5 h-3.5 text-fg-subtle group-hover:text-fg-muted shrink-0" />
      )}
      {hasPath && (
        <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-fg-muted shrink-0" />
      )}
    </div>
  )

  if (hasExternal) {
    return (
      <a
        href={(step as { external: string }).external}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onComplete}
      >
        {content}
      </a>
    )
  }

  if (hasPath) {
    return (
      <Link href={(step as { path: string }).path} onClick={onComplete}>
        {content}
      </Link>
    )
  }

  return <div>{content}</div>
}
