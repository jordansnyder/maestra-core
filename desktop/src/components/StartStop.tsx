import { AppState } from "../hooks/useDocker";

interface Props {
  appState: AppState;
  profile: string;
  onStart: (profile: string) => void;
  onStop: () => void;
  error: string | null;
}

export function StartStop({ appState, profile, onStart, onStop, error }: Props) {
  const isRunning = appState === "running";
  const isTransitioning = appState === "starting" || appState === "stopping";

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Outer glow ring */}
      <div className="relative">
        {/* Ambient glow */}
        <div
          className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${
            isRunning
              ? "bg-accent-rose/20 scale-110"
              : isTransitioning
                ? "bg-maestra-500/10 scale-105 animate-pulse"
                : "bg-maestra-500/15 scale-100"
          }`}
        />

        {/* Outer ring */}
        <div
          className={`relative rounded-full p-[2px] transition-all duration-500 ${
            isRunning
              ? "bg-gradient-to-br from-accent-rose/60 to-accent-rose/20"
              : isTransitioning
                ? "bg-gradient-to-br from-maestra-500/30 to-maestra-500/10"
                : "bg-gradient-to-br from-maestra-400/50 to-accent-violet/30"
          }`}
        >
          <button
            onClick={() => (isRunning ? onStop() : onStart(profile))}
            disabled={isTransitioning}
            className={`
              relative w-40 h-40 rounded-full text-lg font-semibold
              flex items-center justify-center
              transition-all duration-500 overflow-hidden
              ${
                isTransitioning
                  ? "bg-surface-3 text-gray-500 cursor-wait"
                  : isRunning
                    ? "bg-gradient-to-br from-accent-rose/90 to-accent-rose/70 text-white shadow-glow-red hover:from-accent-rose hover:to-accent-rose/80"
                    : "bg-gradient-to-br from-maestra-600 to-maestra-700 text-white shadow-glow hover:from-maestra-500 hover:to-maestra-600 hover:shadow-glow-lg"
              }
            `}
          >
            {/* Inner shimmer effect */}
            {!isTransitioning && (
              <div className="absolute inset-0 rounded-full opacity-[0.07] bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer bg-[length:200%_100%]" />
            )}

            <span className="relative z-10">
              {appState === "starting" && (
                <span className="flex flex-col items-center gap-2">
                  <Spinner />
                  <span className="text-sm">Starting...</span>
                </span>
              )}
              {appState === "stopping" && (
                <span className="flex flex-col items-center gap-2">
                  <Spinner />
                  <span className="text-sm">Stopping...</span>
                </span>
              )}
              {appState === "running" && (
                <span className="flex flex-col items-center gap-1">
                  <StopIcon />
                  <span className="text-sm mt-1">Stop</span>
                </span>
              )}
              {(appState === "idle" || appState === "error") && (
                <span className="flex flex-col items-center gap-1">
                  <PlayIcon />
                  <span className="text-sm mt-1">Start</span>
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="animate-fade-in bg-accent-rose/10 border border-accent-rose/20 rounded-xl px-4 py-2.5 text-accent-rose text-sm max-w-md text-center backdrop-blur-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-7 w-7"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
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
