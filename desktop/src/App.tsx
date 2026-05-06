import { useState, useCallback, useEffect, useRef } from "react";
import { useDocker } from "./hooks/useDocker";
import { StartStop } from "./components/StartStop";
import { ServiceStatus } from "./components/ServiceStatus";
import { LogViewer } from "./components/LogViewer";
import { QuickLinks } from "./components/QuickLinks";
import { EnvEditor } from "./components/EnvEditor";
import { ProfileSelector } from "./components/ProfileSelector";
import {
  ReadinessStatus,
  FirstRunWelcome,
} from "./components/ReadinessStatus";

type View = "main" | "logs";

export default function App() {
  const {
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
    readinessCheck,
    start,
    stop,
    startLogStream,
    pull,
    saveProfile,
    exportDiagnostics,
    setError,
  } = useDocker();

  const [view, setView] = useState<View>("main");
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [diagnosticPath, setDiagnosticPath] = useState<string | null>(null);

  // Detect first run: check if project was just bootstrapped
  useEffect(() => {
    const hasLaunched = localStorage.getItem("maestra-has-launched");
    setIsFirstRun(!hasLaunched);
  }, []);

  // Run readiness check on mount (every launch)
  useEffect(() => {
    if (isFirstRun === null) return; // Still loading
    readinessCheck(profile);
  }, [isFirstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pull when readiness shows missing images (first run or returning user)
  const pullAttempted = useRef(false);
  useEffect(() => {
    if (
      readinessState === "auto_healing" &&
      readiness?.images_status.missing.length &&
      !isPulling &&
      !pullAttempted.current
    ) {
      pullAttempted.current = true;
      pull(profile).then((result) => {
        if (result?.success) {
          // Re-check readiness after successful pull
          readinessCheck(profile);
        }
        // On failure: error is already set by pull(), readiness stays at auto_healing
        // but pullAttempted prevents infinite retry. User can click "Try Again".
      });
    }
  }, [readinessState, readiness, isPulling]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset pull attempt flag when user triggers a manual retry
  const handleRetryReadiness = useCallback(() => {
    pullAttempted.current = false;
    setError(null);
    readinessCheck(profile);
  }, [readinessCheck, profile, setError]);

  // Mark first run complete when readiness passes
  useEffect(() => {
    if (isFirstRun && readinessState === "ready") {
      localStorage.setItem("maestra-has-launched", "true");
      setIsFirstRun(false);
    }
  }, [isFirstRun, readinessState]);

  const handleSaveAndRestart = useCallback(async () => {
    setShowEnvEditor(false);
    if (appState === "running") {
      await stop();
      await start(profile);
    }
  }, [appState, stop, start, profile]);

  const handleStart = useCallback(
    async (p: string) => {
      setError(null);
      await start(p);
      startLogStream([]);
    },
    [start, startLogStream, setError]
  );

  const handleProfileChange = useCallback(
    (p: string) => {
      saveProfile(p);
      // Re-run readiness check with new profile
      readinessCheck(p);
    },
    [saveProfile, readinessCheck]
  );

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateStatus("checking");
    const result = await pull(profile);
    if (result?.success) {
      setUpdateStatus("Services are up to date");
    } else if (result) {
      setUpdateStatus(`Updated ${result.pulled.length} services`);
    } else {
      setUpdateStatus(null); // Error already shown via setError
    }
    // Clear status after 3 seconds
    setTimeout(() => setUpdateStatus(null), 3000);
  }, [pull, profile]);

  const handleExportDiagnostics = useCallback(async () => {
    const path = await exportDiagnostics();
    if (path) {
      setDiagnosticPath(path);
      setTimeout(() => setDiagnosticPath(null), 5000);
    }
  }, [exportDiagnostics]);

  const availableServiceNames = [
    ...new Set(services.map((s) => s.service)),
  ].sort();

  // Is Launch allowed?
  const canLaunch = readinessState === "ready" && appState === "idle";

  // First-run full-screen welcome (only while actively checking/pulling, not when stuck on error)
  if (isFirstRun === null) return null; // Loading
  const showFirstRunScreen =
    isFirstRun &&
    !error &&
    (readinessState === "unchecked" ||
      readinessState === "checking" ||
      readinessState === "auto_healing" ||
      isPulling);

  if (showFirstRunScreen) {
    return (
      <FirstRunWelcome
        pullProgress={pullProgress}
        isPulling={isPulling}
        total={
          readiness
            ? readiness.images_status.available.length +
              readiness.images_status.missing.length
            : 0
        }
        done={readiness ? readiness.images_status.available.length : 0}
      />
    );
  }

  // If first run hit an error, fall through to main UI so user can see the error,
  // access settings, and click Try Again
  if (isFirstRun && (error || readinessState === "needs_human")) {
    // Don't block — show the main UI with the error visible in ReadinessStatus
  }

  return (
    <div className="flex flex-col h-screen bg-surface-0 bg-grid noise">
      {/* Header */}
      <header className="relative flex items-center justify-between px-5 py-3 glass z-10">
        {/* Accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-maestra-500/40 to-transparent" />

        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-maestra-500 to-accent-violet flex items-center justify-center shadow-glow">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <h1 className="text-base font-semibold text-gray-100 tracking-tight">
            Maestra
          </h1>
          {appState === "running" && (
            <span className="flex items-center gap-1.5 text-xs text-accent-emerald font-medium ml-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald" />
              </span>
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex bg-surface-2 rounded-lg p-0.5 mr-1">
            <button
              onClick={() => setView("main")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === "main"
                  ? "bg-surface-4 text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Home
            </button>
            <button
              onClick={() => {
                setView("logs");
                if (appState === "running") startLogStream([]);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === "logs"
                  ? "bg-surface-4 text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Logs
            </button>
          </div>

          {/* Check for Updates button */}
          <button
            onClick={handleCheckForUpdates}
            disabled={isPulling}
            className="p-2 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-surface-3 transition-all disabled:opacity-50"
            title="Check for Updates"
          >
            {updateStatus === "checking" ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
          </button>

          {/* Export Diagnostics button */}
          <button
            onClick={handleExportDiagnostics}
            className="p-2 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-surface-3 transition-all"
            title="Export Diagnostics"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </button>

          {/* Settings button */}
          <button
            onClick={() => setShowEnvEditor(true)}
            className="p-2 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-surface-3 transition-all"
            title="Environment Settings"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Toast notifications */}
      {updateStatus && updateStatus !== "checking" && (
        <div className="absolute top-14 right-5 z-20 animate-fade-in bg-surface-2 border border-surface-3/50 rounded-lg px-3 py-2 text-xs text-accent-emerald shadow-lg">
          {updateStatus}
        </div>
      )}
      {diagnosticPath && (
        <div className="absolute top-14 right-5 z-20 animate-fade-in bg-surface-2 border border-surface-3/50 rounded-lg px-3 py-2 text-xs text-accent-emerald shadow-lg max-w-xs">
          Saved to {diagnosticPath.split("/").pop()}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-hidden p-5">
        {view === "main" ? (
          <div className="flex flex-col items-center gap-4 h-full overflow-y-auto pb-4">
            {/* Readiness status (inline, not full-screen) */}
            <div className="w-full max-w-md pt-2">
              <ReadinessStatus
                readiness={readiness}
                readinessState={readinessState}
                isPulling={isPulling}
                pullProgress={pullProgress}
                error={error}
                onRetry={handleRetryReadiness}
              />
            </div>

            {/* Launch control area */}
            <div className="w-full max-w-md">
              <StartStop
                appState={appState}
                profile={profile}
                onStart={handleStart}
                onStop={stop}
                error={error}
                services={services}
                canLaunch={canLaunch}
              />
            </div>

            {/* Migration status */}
            {migrationStatus && migrationStatus !== "running" && (
              <div className="w-full max-w-md">
                <p className={`text-[10px] text-center ${
                  migrationStatus.startsWith("Warning")
                    ? "text-accent-amber"
                    : "text-gray-500"
                }`}>
                  {migrationStatus}
                </p>
              </div>
            )}

            {/* Profile selector */}
            <ProfileSelector
              profile={profile}
              onChange={handleProfileChange}
              disabled={appState === "running" || appState === "starting"}
            />

            {/* Quick links */}
            <QuickLinks services={services} profile={profile} />

            {/* Service status grid */}
            <ServiceStatus services={services} />
          </div>
        ) : (
          <LogViewer
            logs={logs}
            onFilterChange={(svcFilter) => startLogStream(svcFilter)}
            availableServices={availableServiceNames}
          />
        )}
      </main>

      {/* Env editor modal */}
      <EnvEditor
        visible={showEnvEditor}
        onClose={() => setShowEnvEditor(false)}
        onSaveAndRestart={handleSaveAndRestart}
      />
    </div>
  );
}
