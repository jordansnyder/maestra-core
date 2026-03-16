import { useState, useCallback, useEffect } from "react";
import { useDocker } from "./hooks/useDocker";
import { StartStop } from "./components/StartStop";
import { ServiceStatus } from "./components/ServiceStatus";
import { LogViewer } from "./components/LogViewer";
import { QuickLinks } from "./components/QuickLinks";
import { EnvEditor } from "./components/EnvEditor";
import { ProfileSelector } from "./components/ProfileSelector";
import { SetupWizard } from "./components/SetupWizard";

type View = "main" | "logs";

export default function App() {
  const {
    dockerInfo,
    services,
    appState,
    logs,
    error,
    pullProgress,
    isPulling,
    start,
    stop,
    startLogStream,
    pull,
    setError,
  } = useDocker();

  const [profile, setProfile] = useState("starter");
  const [view, setView] = useState<View>("main");
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  // Check if setup has been done
  useEffect(() => {
    const done = localStorage.getItem("maestra-setup-complete");
    setSetupComplete(done === "true");
  }, []);

  const handleSetupComplete = useCallback(() => {
    localStorage.setItem("maestra-setup-complete", "true");
    setSetupComplete(true);
  }, []);

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
      // Start streaming logs after services are up
      startLogStream([]);
    },
    [start, startLogStream, setError]
  );

  const availableServiceNames = [
    ...new Set(services.map((s) => s.service)),
  ].sort();

  // Show setup wizard on first run
  if (setupComplete === null) return null; // Loading
  if (!setupComplete || !dockerInfo?.available) {
    return (
      <SetupWizard
        onComplete={handleSetupComplete}
        onPullImages={pull}
        isPulling={isPulling}
        pullProgress={pullProgress}
      />
    );
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
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-surface-2 rounded-lg p-0.5">
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

      {/* Content */}
      <main className="flex-1 overflow-hidden p-5">
        {view === "main" ? (
          <div className="flex flex-col items-center gap-8 h-full overflow-y-auto pb-4">
            {/* Start/Stop button */}
            <div className="pt-2 pb-2">
              <StartStop
                appState={appState}
                profile={profile}
                onStart={handleStart}
                onStop={stop}
                error={error}
              />
            </div>

            {/* Profile selector */}
            <ProfileSelector
              profile={profile}
              onChange={setProfile}
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
