import { AppState } from "../hooks/useDocker";
import { ServiceInfo } from "../lib/invoke";

interface Props {
  appState: AppState;
  profile: string;
  onStart: (profile: string) => void;
  onStop: () => void;
  error: string | null;
  services: ServiceInfo[];
  canLaunch?: boolean;
}

export function StartStop({
  appState,
  profile,
  onStart,
  onStop,
  error,
  services,
  canLaunch = true,
}: Props) {
  const isRunning = appState === "running";
  const isStarting = appState === "starting";
  const isStopping = appState === "stopping";
  const isTransitioning = isStarting || isStopping;

  const runningCount = services.filter((s) => s.state === "running").length;
  const totalCount = services.length;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Action button */}
      <button
        onClick={() => (isRunning ? onStop() : onStart(profile))}
        disabled={isTransitioning || (!isRunning && !canLaunch)}
        className={`
          group relative w-full h-11 rounded-xl text-sm font-semibold
          flex items-center justify-center gap-2.5
          transition-all duration-300 overflow-hidden
          ${
            isStarting
              ? "bg-surface-2 text-gray-300 cursor-wait border border-maestra-500/20"
              : isStopping
                ? "bg-surface-2 text-gray-400 cursor-wait border border-accent-rose/20"
                : isRunning
                  ? "bg-surface-2 text-gray-400 border border-surface-4 hover:border-accent-rose/30 hover:text-accent-rose"
                  : canLaunch
                    ? "bg-gradient-to-r from-maestra-600 via-maestra-500 to-accent-violet text-white shadow-glow hover:shadow-glow-lg hover:brightness-110 active:brightness-95"
                    : "bg-surface-2 text-gray-500 border border-surface-4 cursor-not-allowed opacity-60"
          }
        `}
      >
        {/* Shimmer on idle */}
        {!isTransitioning && !isRunning && (
          <div className="absolute inset-0 opacity-[0.07] bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer bg-[length:200%_100%]" />
        )}

        <span className="relative z-10 flex items-center gap-2">
          {isStarting && (
            <>
              <Spinner className="w-3.5 h-3.5" />
              <span>Starting…</span>
            </>
          )}
          {isStopping && (
            <>
              <Spinner className="w-3.5 h-3.5" />
              <span>Stopping…</span>
            </>
          )}
          {isRunning && (
            <>
              <StopIcon />
              <span>Stop Services</span>
            </>
          )}
          {(appState === "idle" || appState === "error") && (
            <>
              <PowerIcon />
              <span>Launch Maestra</span>
            </>
          )}
        </span>
      </button>

      {/* Status area — fixed height so layout doesn't shift */}
      <div className="h-10 flex items-center justify-center">
        {error ? (
          <div className="animate-fade-in bg-accent-rose/10 border border-accent-rose/20 rounded-lg px-3 py-1.5 text-accent-rose text-xs text-center w-full truncate">
            {error}
          </div>
        ) : isStarting && totalCount > 0 ? (
          <StartingStatus running={runningCount} total={totalCount} />
        ) : isStarting && totalCount === 0 ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Spinner className="w-3 h-3 text-maestra-400" />
            <span>Creating containers…</span>
          </div>
        ) : isStopping ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Spinner className="w-3 h-3 text-gray-500" />
            <span>
              {totalCount > 0
                ? `Stopping ${totalCount} service${totalCount !== 1 ? "s" : ""}…`
                : "Shutting down…"}
            </span>
          </div>
        ) : isRunning && totalCount > 0 ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-emerald" />
            </span>
            <span>
              {runningCount}/{totalCount} services running
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Real progress indicator based on actual service counts */
function StartingStatus({
  running,
  total,
}: {
  running: number;
  total: number;
}) {
  const pct = total > 0 ? (running / total) * 100 : 0;

  return (
    <div className="w-full flex flex-col gap-1.5 animate-fade-in">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 flex items-center gap-1.5">
          <Spinner className="w-3 h-3 text-maestra-400" />
          Starting services…
        </span>
        <span className="text-gray-500 tabular-nums">
          {running}/{total}
        </span>
      </div>
      <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-maestra-500 to-accent-violet rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// --- Icons ---

function PowerIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
