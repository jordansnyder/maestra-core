import { useEffect, useState } from "react";
import type { ReadinessReport } from "../lib/invoke";
import type { ReadinessState } from "../hooks/useDocker";

interface ReadinessStatusProps {
  readiness: ReadinessReport | null;
  readinessState: ReadinessState;
  isPulling: boolean;
  pullProgress: string[];
  error: string | null;
  onRetry: () => void;
}

function Spinner({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-accent-emerald animate-scale-in"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-accent-rose"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

export function ReadinessStatus({
  readiness,
  readinessState,
  isPulling,
  pullProgress,
  error,
  onRetry,
}: ReadinessStatusProps) {
  const [showGlow, setShowGlow] = useState(false);

  // Brief green glow when transitioning to ready
  useEffect(() => {
    if (readinessState === "ready") {
      setShowGlow(true);
      const timer = setTimeout(() => setShowGlow(false), 600);
      return () => clearTimeout(timer);
    }
  }, [readinessState]);

  // ─── Error from pull or readiness check ─────────────────────────────
  if (error && !isPulling) {
    return (
      <div
        className="animate-fade-in bg-surface-1 border border-accent-rose/20 rounded-xl p-3"
        aria-live="polite"
      >
        <div className="flex items-start gap-2" role="alert">
          <WarningIcon />
          <p className="text-xs text-accent-rose font-medium">{error}</p>
        </div>
        <button
          onClick={onRetry}
          className="mt-3 w-full text-xs px-3 py-2 rounded-lg border border-surface-4 text-gray-300 hover:bg-surface-3 hover:text-gray-100 transition-all min-h-[44px]"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ─── Checking State ─────────────────────────────────────────────────
  if (readinessState === "unchecked" || readinessState === "checking") {
    return (
      <div
        className="animate-fade-in bg-surface-1 border border-surface-3/50 rounded-xl p-3"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <Spinner className="w-3 h-3 text-maestra-400" />
          <span className="text-xs text-gray-400">Checking Maestra...</span>
        </div>
        <div className="mt-2 h-1 bg-surface-3 rounded-full overflow-hidden">
          <div className="h-full bg-maestra-500/30 rounded-full animate-shimmer w-1/3" />
        </div>
      </div>
    );
  }

  // ─── Downloading / Auto-healing ─────────────────────────────────────
  if (readinessState === "auto_healing" || isPulling) {
    const lastLine =
      pullProgress.length > 0
        ? pullProgress[pullProgress.length - 1]
        : "Preparing download...";

    // Count images from readiness report
    const total = readiness
      ? readiness.images_status.available.length +
        readiness.images_status.missing.length
      : 0;
    const done = readiness ? readiness.images_status.available.length : 0;
    const pct = total > 0 ? (done / total) * 100 : 0;

    return (
      <div
        className="animate-fade-in bg-surface-1 border border-surface-3/50 rounded-xl p-3"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-300 flex items-center gap-1.5">
            <Spinner className="w-3 h-3 text-maestra-400" />
            Downloading services...
          </span>
          {total > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">
              {done}/{total}
            </span>
          )}
        </div>
        <div
          className="mt-2 h-1.5 bg-surface-3 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemax={total}
        >
          <div
            className="h-full bg-gradient-to-r from-maestra-500 to-accent-violet rounded-full transition-all duration-500 animate-shimmer"
            style={{ width: `${Math.max(pct, 5)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-gray-500 truncate">{lastLine}</p>
      </div>
    );
  }

  // ─── Ready State ────────────────────────────────────────────────────
  if (readinessState === "ready") {
    // Check if offline but images present
    const isOffline =
      readiness && !readiness.network_status.online;

    return (
      <div
        className={`animate-fade-in bg-surface-1 border rounded-xl p-3 transition-shadow duration-600 ${
          showGlow
            ? "border-accent-emerald/30 shadow-glow-green"
            : "border-surface-3/50"
        }`}
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <CheckIcon />
          <span className="text-xs text-accent-emerald font-medium">
            All systems ready
          </span>
        </div>
        {isOffline && (
          <p className="mt-1 text-[10px] text-accent-amber">
            No internet connection. Using cached services.
          </p>
        )}
      </div>
    );
  }

  // ─── Needs Human Attention ──────────────────────────────────────────
  if (readinessState === "needs_human" && readiness) {
    const issues = readiness.issues.filter((i) => !i.auto_fixable);

    return (
      <div
        className="animate-fade-in bg-surface-1 border border-accent-rose/20 rounded-xl p-3"
        aria-live="polite"
      >
        {issues.map((issue, i) => (
          <div key={i} className={i > 0 ? "mt-2 pt-2 border-t border-surface-3/30" : ""}>
            <div className="flex items-start gap-2" role="alert">
              <WarningIcon />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-accent-rose font-medium">
                  {issue.message}
                </p>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={onRetry}
          className="mt-3 w-full text-xs px-3 py-2 rounded-lg border border-surface-4 text-gray-300 hover:bg-surface-3 hover:text-gray-100 transition-all min-h-[44px]"
        >
          Check Again
        </button>
      </div>
    );
  }

  // ─── Fallback (error without readiness report) ──────────────────────
  return (
    <div
      className="animate-fade-in bg-surface-1 border border-accent-rose/20 rounded-xl p-3"
      aria-live="polite"
    >
      <div className="flex items-start gap-2" role="alert">
        <WarningIcon />
        <p className="text-xs text-accent-rose font-medium">
          Unable to check system status.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="mt-3 w-full text-xs px-3 py-2 rounded-lg border border-surface-4 text-gray-300 hover:bg-surface-3 hover:text-gray-100 transition-all min-h-[44px]"
      >
        Try Again
      </button>
    </div>
  );
}

// ─── First-Run Welcome Screen ───────────────────────────────────────────────

interface FirstRunProps {
  pullProgress: string[];
  isPulling: boolean;
  total: number;
  done: number;
}

export function FirstRunWelcome({
  pullProgress,
  isPulling,
  total,
  done,
}: FirstRunProps) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const lastLine =
    pullProgress.length > 0
      ? pullProgress[pullProgress.length - 1]
      : "Preparing...";

  return (
    <div className="fixed inset-0 bg-surface-0 flex flex-col items-center justify-center animate-fade-in z-50">
      {/* Logo */}
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-maestra-500 to-accent-violet flex items-center justify-center shadow-glow-lg mb-6">
        <span className="text-white text-xl font-bold">M</span>
      </div>

      <h1 className="text-2xl font-semibold text-gray-100 mb-2">
        Welcome to Maestra
      </h1>
      <p className="text-sm text-gray-400 mb-8">
        Your creative infrastructure, one click away
      </p>

      {/* Progress */}
      <div className="w-72">
        {isPulling && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-300">
                Setting up for the first time...
              </span>
              {total > 0 && (
                <span className="text-xs text-gray-500 tabular-nums">
                  {done}/{total}
                </span>
              )}
            </div>
            <div
              className="h-1.5 bg-surface-3 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemax={total}
            >
              <div
                className="h-full bg-gradient-to-r from-maestra-500 to-accent-violet rounded-full transition-all duration-500 animate-shimmer"
                style={{ width: `${Math.max(pct, 5)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-gray-500 truncate text-center">
              {lastLine}
            </p>
          </>
        )}
        {!isPulling && (
          <div className="flex items-center justify-center gap-2">
            <Spinner className="w-4 h-4 text-maestra-400" />
            <span className="text-xs text-gray-400">
              Checking your system...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
