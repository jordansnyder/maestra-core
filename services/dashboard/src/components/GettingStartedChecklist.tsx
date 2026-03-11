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
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-750 transition-colors"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">Getting Started</h3>
            <span className="text-xs text-slate-500">
              {progress.completed} of {progress.total}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* Progress bar */}
        <div className="px-5">
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
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
            <div className="pt-3 border-t border-slate-700 mt-3">
              <button
                onClick={hideChecklist}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors group">
      {/* Checkbox */}
      <div className="shrink-0">
        {completed ? (
          <CheckCircle2 className="w-5 h-5 text-purple-400" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-slate-500" />
        )}
      </div>

      {/* Label and description */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            completed ? 'text-slate-500 line-through' : 'text-slate-200'
          }`}
        >
          {step.label}
        </p>
        <p className="text-xs text-slate-500">{step.description}</p>
      </div>

      {/* Arrow / external icon */}
      {hasExternal && (
        <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
      )}
      {hasPath && (
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
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
