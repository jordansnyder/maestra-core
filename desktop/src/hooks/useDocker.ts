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
  DockerInfo,
  ServiceInfo,
  LogLine,
} from "../lib/invoke";

export type AppState = "idle" | "starting" | "running" | "stopping" | "error";

export function useDocker() {
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [appState, setAppState] = useState<AppState>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<string[]>([]);
  const [isPulling, setIsPulling] = useState(false);

  const statusInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const logUnlisten = useRef<UnlistenFn | null>(null);
  const maxLogs = 2000;

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
      // Silently fail — services probably not running
      return [];
    }
  }, []);

  const startPolling = useCallback(
    (intervalMs = 5000) => {
      if (statusInterval.current) {
        clearInterval(statusInterval.current);
      }
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

  const start = useCallback(
    async (profile: string) => {
      setError(null);
      setAppState("starting");

      // Poll fast (every 2s) so we see containers as they come online
      startPolling(2000);

      try {
        await startServices(profile);
        setAppState("running");
        // Switch back to normal polling rate
        startPolling(5000);
        await refreshStatus();
        // Run database migrations in the background after services are up
        runMigrations().catch((e) => {
          console.warn("Migration warning:", e);
        });
      } catch (e) {
        setError(String(e));
        setAppState("error");
        stopPolling();
      }
    },
    [startPolling, stopPolling, refreshStatus]
  );

  const stop = useCallback(async () => {
    setError(null);
    setAppState("stopping");

    // Poll fast during shutdown too
    startPolling(2000);

    try {
      await stopServices();
      stopPolling();
      setServices([]);
      setAppState("idle");
    } catch (e) {
      setError(String(e));
      setAppState("error");
      stopPolling();
    }
  }, [startPolling, stopPolling]);

  const startLogStream = useCallback(
    async (serviceFilter: string[]) => {
      // Clean up previous listener
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

  const pull = useCallback(
    async (profile: string) => {
      setIsPulling(true);
      setPullProgress([]);

      const unlisten = await listen<string>("pull-progress", (event) => {
        setPullProgress((prev) => [...prev, event.payload]);
      });

      try {
        await pullImages(profile);
      } catch (e) {
        setError(String(e));
      } finally {
        unlisten();
        setIsPulling(false);
      }
    },
    []
  );

  // On mount, check Docker and current service status
  useEffect(() => {
    refreshDocker();
    refreshStatus().then((status) => {
      // Detect if services are already running
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
  }, [refreshDocker, refreshStatus, startPolling, stopPolling]);

  return {
    dockerInfo,
    services,
    appState,
    logs,
    error,
    pullProgress,
    isPulling,
    refreshDocker,
    refreshStatus,
    start,
    stop,
    startLogStream,
    pull,
    setError,
  };
}
