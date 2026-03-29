import { useState, useCallback, useRef, useEffect } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  checkDocker,
  startServices,
  stopServices,
  getServiceStatus,
  streamLogs,
  pullImages,
  runMigrations,
  startupReadinessCheck,
  getSavedProfile,
  saveProfile as saveProfileCmd,
  exportDiagnostics as exportDiagnosticsCmd,
  DockerInfo,
  ServiceInfo,
  LogLine,
  ReadinessReport,
  PullResult,
} from "../lib/invoke";
import { toFriendlyError } from "../lib/errors";

export type AppState = "idle" | "starting" | "running" | "stopping" | "error";
export type ReadinessState =
  | "unchecked"
  | "checking"
  | "auto_healing"
  | "ready"
  | "needs_human";

export function useDocker() {
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [appState, setAppState] = useState<AppState>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<string[]>([]);
  const [isPulling, setIsPulling] = useState(false);

  // Readiness state
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessState, setReadinessState] = useState<ReadinessState>("unchecked");
  const [profile, setProfileState] = useState("starter");
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);

  const statusInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const logUnlisten = useRef<UnlistenFn | null>(null);
  const maxLogs = 2000;

  // ─── Profile Persistence ────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    try {
      const saved = await getSavedProfile();
      setProfileState(saved);
      return saved;
    } catch {
      return "starter";
    }
  }, []);

  const saveProfile = useCallback(async (p: string) => {
    setProfileState(p);
    try {
      await saveProfileCmd(p);
    } catch {
      // Non-critical: profile will default to starter next launch
    }
  }, []);

  // ─── Status Polling ─────────────────────────────────────────────────────

  const refreshDocker = useCallback(async () => {
    try {
      const info = await checkDocker();
      setDockerInfo(info);
      return info;
    } catch {
      setDockerInfo(null);
      return null;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getServiceStatus();
      setServices(status);
      return status;
    } catch {
      return [];
    }
  }, []);

  const startPolling = useCallback(
    (intervalMs = 5000) => {
      if (statusInterval.current) clearInterval(statusInterval.current);
      statusInterval.current = setInterval(refreshStatus, intervalMs);
    },
    [refreshStatus]
  );

  const stopPolling = useCallback(() => {
    if (statusInterval.current) {
      clearInterval(statusInterval.current);
      statusInterval.current = null;
    }
  }, []);

  // ─── Readiness Check ───────────────────────────────────────────────────

  const readinessCheck = useCallback(
    async (profileOverride?: string) => {
      const p = profileOverride ?? profile;
      setReadinessState("checking");
      setError(null);

      try {
        const report = await startupReadinessCheck(p);
        setReadiness(report);

        if (report.ready_to_launch) {
          // Check if there are auto-fixable issues (like missing images)
          const hasAutoFix = report.issues.some((i) => i.auto_fixable);
          if (hasAutoFix) {
            setReadinessState("auto_healing");
          } else {
            setReadinessState("ready");
          }
        } else {
          setReadinessState("needs_human");
        }

        return report;
      } catch (e) {
        setError(toFriendlyError(e));
        setReadinessState("needs_human");
        return null;
      }
    },
    [profile]
  );

  // ─── Service Lifecycle ──────────────────────────────────────────────────

  const start = useCallback(
    async (p: string) => {
      setError(null);
      setAppState("starting");
      startPolling(2000);

      try {
        await startServices(p);
        setAppState("running");
        startPolling(5000);
        await refreshStatus();

        // Run migrations with status tracking (not fire-and-forget)
        setMigrationStatus("running");
        try {
          const result = await runMigrations();
          setMigrationStatus(result);
        } catch (e) {
          setMigrationStatus(`Warning: ${toFriendlyError(e)}`);
          console.warn("Migration warning:", e);
        }
      } catch (e) {
        setError(toFriendlyError(e));
        setAppState("error");
        stopPolling();
      }
    },
    [startPolling, stopPolling, refreshStatus]
  );

  const stop = useCallback(async () => {
    setError(null);
    setAppState("stopping");
    startPolling(2000);

    try {
      await stopServices();
      stopPolling();
      setServices([]);
      setAppState("idle");
      setMigrationStatus(null);
    } catch (e) {
      setError(toFriendlyError(e));
      setAppState("error");
      stopPolling();
    }
  }, [startPolling, stopPolling]);

  // ─── Log Streaming ──────────────────────────────────────────────────────

  const startLogStream = useCallback(
    async (serviceFilter: string[]) => {
      if (logUnlisten.current) {
        logUnlisten.current();
        logUnlisten.current = null;
      }
      setLogs([]);

      logUnlisten.current = await listen<LogLine>("log-line", (event) => {
        setLogs((prev) => {
          const next = [...prev, event.payload];
          return next.length > maxLogs ? next.slice(-maxLogs) : next;
        });
      });

      await streamLogs(serviceFilter, 200);
    },
    []
  );

  // ─── Image Pull with Retry ─────────────────────────────────────────────

  const pull = useCallback(
    async (p: string): Promise<PullResult | null> => {
      setIsPulling(true);
      setPullProgress([]);
      setError(null);

      const unlisten = await listen<string>("pull-progress", (event) => {
        setPullProgress((prev) => [...prev, event.payload]);
      });

      try {
        const result = await pullImages(p);
        return result;
      } catch (e) {
        setError(toFriendlyError(e));
        return null;
      } finally {
        unlisten();
        setIsPulling(false);
      }
    },
    []
  );

  // ─── Diagnostic Export ──────────────────────────────────────────────────

  const exportDiagnostics = useCallback(async (): Promise<string | null> => {
    try {
      const path = await exportDiagnosticsCmd();
      return path;
    } catch (e) {
      setError(toFriendlyError(e));
      return null;
    }
  }, []);

  // ─── Mount ──────────────────────────────────────────────────────────────

  useEffect(() => {
    refreshDocker();
    loadProfile();
    refreshStatus().then((status) => {
      const running = status.some((s) => s.state === "running");
      if (running) {
        setAppState("running");
      }
      startPolling(5000);
    });
    return () => {
      stopPolling();
      if (logUnlisten.current) logUnlisten.current();
    };
  }, [refreshDocker, refreshStatus, startPolling, stopPolling, loadProfile]);

  return {
    dockerInfo,
    services,
    appState,
    logs,
    error,
    pullProgress,
    isPulling,
    readiness,
    readinessState,
    profile,
    migrationStatus,
    refreshDocker,
    refreshStatus,
    readinessCheck,
    start,
    stop,
    startLogStream,
    pull,
    saveProfile,
    exportDiagnostics,
    setError,
  };
}
