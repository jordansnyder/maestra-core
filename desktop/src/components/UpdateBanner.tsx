import type { AppUpdateInfo } from "../hooks/useAppUpdate";

/**
 * Unobtrusive banner shown at the top of the app when a new desktop version is
 * available, or while an update is downloading. Hidden entirely when idle.
 */
export function UpdateBanner({ update }: { update: AppUpdateInfo }) {
  const { state, version, progress, error, downloadAndRestart, dismiss } =
    update;

  if (state === "idle" || state === "checking") return null;

  return (
    <div className="w-full bg-maestra-500/10 border-b border-maestra-500/30 px-5 py-2 flex items-center justify-between gap-3 text-xs">
      {state === "available" && (
        <>
          <span className="text-gray-200">
            Maestra Desktop{" "}
            <span className="font-semibold text-maestra-300">v{version}</span> is
            available.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadAndRestart}
              className="px-3 py-1 rounded-md bg-maestra-500 hover:bg-maestra-400 text-white font-medium transition-colors"
            >
              Update &amp; Restart
            </button>
            <button
              onClick={dismiss}
              className="px-2 py-1 rounded-md text-gray-400 hover:text-gray-200 transition-colors"
            >
              Later
            </button>
          </div>
        </>
      )}

      {state === "downloading" && (
        <>
          <span className="text-gray-200">
            Downloading update
            {progress !== null ? ` — ${progress}%` : "…"}
          </span>
          <div className="flex-1 max-w-[180px] h-1.5 bg-surface-3 rounded-full overflow-hidden ml-2">
            <div
              className="h-full bg-maestra-500 transition-all duration-200"
              style={{ width: `${progress ?? 30}%` }}
            />
          </div>
        </>
      )}

      {state === "ready" && (
        <span className="text-accent-emerald">
          Update installed — restarting…
        </span>
      )}

      {state === "error" && (
        <>
          <span className="text-accent-amber">
            Update failed: {error ?? "unknown error"}
          </span>
          <button
            onClick={dismiss}
            className="px-2 py-1 rounded-md text-gray-400 hover:text-gray-200 transition-colors shrink-0"
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
