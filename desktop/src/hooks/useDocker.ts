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
      const running = status.some((s) => s.state === "running");
      if (running) {
        setAppState("running");
      } else if (status.length === 0) {
        setAppState("idle");
      }
    } catch {
      // Silently fail — services probably not running
    }
  }, []);

  const startPolling = useCallback(() => {
    if (statusInterval.current) return;
    statusInterval.current = setInterval(refreshStatus, 5000);
  }, [refreshStatus]);

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
      try {
        await startServices(profile);
        setAppState("running");
        startPolling();
        await refreshStatus();
        // Run database migrations in the background after services are up
        runMigrations().catch((e) => {
          console.warn("Migration warning:", e);
        });
      } catch (e) {
        setError(String(e));
        setAppState("error");
      }
    },
    [startPolling, refreshStatus]
  );

  const stop = useCallback(async () => {
    setError(null);
    setAppState("stopping");
    try {
      await stopServices();
      stopPolling();
      setServices([]);
      setAppState("idle");
    } catch (e) {
      setError(String(e));
      setAppState("error");
    }
  }, [stopPolling]);

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
    refreshStatus().then(() => {
      startPolling();
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
