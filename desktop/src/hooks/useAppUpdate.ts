import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppUpdateState =
  | "idle" // no check done yet / nothing to do
  | "checking" // querying the update endpoint
  | "available" // an update is available, waiting for the user
  | "downloading" // download + install in progress
  | "ready" // installed, awaiting relaunch
  | "error"; // check or download failed

export interface AppUpdateInfo {
  state: AppUpdateState;
  /** Version string of the available update (e.g. "0.2.0"). */
  version: string | null;
  /** Release notes / changelog body, if provided in latest.json. */
  notes: string | null;
  /** Download progress 0–100, or null when indeterminate. */
  progress: number | null;
  error: string | null;
  /** Manually trigger a check (also runs once automatically on mount). */
  checkForUpdate: () => Promise<void>;
  /** Download + install the pending update, then relaunch the app. */
  downloadAndRestart: () => Promise<void>;
  /** Dismiss an available-update prompt for this session. */
  dismiss: () => void;
}

/**
 * Drives the Tauri auto-updater. Checks once on mount and exposes actions for a
 * banner UI. In dev builds (where no updater is installed) `check()` throws —
 * we swallow that and stay idle so the dev experience is unaffected.
 */
export function useAppUpdate(): AppUpdateInfo {
  const [state, setState] = useState<AppUpdateState>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      const update = await check();
      if (update) {
        setPending(update);
        setVersion(update.version);
        setNotes(update.body ?? null);
        setState("available");
      } else {
        setState("idle");
      }
    } catch (e) {
      // In dev / unpackaged builds there is no updater target — treat as a no-op
      // rather than surfacing a scary error. Only show errors once packaged.
      const msg = e instanceof Error ? e.message : String(e);
      if (/no(t)?.*(installed|updater|target)/i.test(msg)) {
        setState("idle");
      } else {
        setError(msg);
        setState("error");
      }
    }
  }, []);

  const downloadAndRestart = useCallback(async () => {
    if (!pending) return;
    setState("downloading");
    setError(null);
    let downloaded = 0;
    let total = 0;
    try {
      await pending.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setProgress(total > 0 ? 0 : null);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (total > 0) {
              setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      setState("ready");
      await relaunch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [pending]);

  const dismiss = useCallback(() => {
    setState("idle");
  }, []);

  // Check once on mount.
  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  return {
    state,
    version,
    notes,
    progress,
    error,
    checkForUpdate,
    downloadAndRestart,
    dismiss,
  };
}
