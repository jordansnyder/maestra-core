import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  checkSetup,
  checkPorts,
  initEnv,
  SetupStatus,
  PortConflict,
} from "../lib/invoke";

interface Props {
  onComplete: () => void;
  onPullImages: (profile: string) => void;
  isPulling: boolean;
  pullProgress: string[];
}

type Step = "checking" | "docker" | "ports" | "env" | "pull" | "ready";

const STEP_ORDER: Step[] = ["checking", "docker", "ports", "env", "pull", "ready"];

function stepIndex(s: Step): number {
  return STEP_ORDER.indexOf(s);
}

export function SetupWizard({
  onComplete,
  onPullImages,
  isPulling,
  pullProgress,
}: Props) {
  const [step, setStep] = useState<Step>("checking");
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [ports, setPorts] = useState<PortConflict[]>([]);
  const [wasPulling, setWasPulling] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setStep("checking");
    try {
      const status = await checkSetup();
      setSetup(status);

      if (!status.docker_available) {
        setStep("docker");
        return;
      }

      const portResults = await checkPorts();
      setPorts(portResults);
      const conflicts = portResults.filter((p) => p.in_use);
      if (conflicts.length > 0) {
        setStep("ports");
        return;
      }

      if (!status.env_exists) {
        setStep("env");
        return;
      }

      setStep("pull");
    } catch {
      setStep("docker");
    }
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Auto-advance to "ready" when pull completes
  useEffect(() => {
    if (isPulling) {
      setWasPulling(true);
    } else if (wasPulling && step === "pull") {
      setStep("ready");
      setWasPulling(false);
    }
  }, [isPulling, wasPulling, step]);

  const handleInitEnv = async () => {
    setEnvError(null);
    try {
      await initEnv();
      setStep("pull");
    } catch (e) {
      setEnvError(String(e));
    }
  };

  // Progress dots
  const progressSteps = ["Docker", "Ports", "Config", "Images", "Ready"];
  const currentProgress = Math.max(0, stepIndex(step) - 1);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-surface-0 bg-grid noise">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-maestra-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-8 p-8 max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-maestra-500 to-accent-violet flex items-center justify-center shadow-glow-lg">
            <span className="text-white text-2xl font-bold">M</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-100 tracking-tight">
            Welcome to Maestra
          </h1>
          <p className="text-gray-500 text-center text-sm">
            Let's get everything set up so you can start creating.
          </p>
        </div>

        {/* Progress indicator */}
        {step !== "checking" && (
          <div className="flex items-center gap-1 animate-fade-in">
            {progressSteps.map((label, i) => (
              <div key={label} className="flex items-center">
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                    i <= currentProgress
                      ? "bg-maestra-500 shadow-[0_0_4px_rgba(99,102,241,0.5)]"
                      : "bg-surface-4"
                  }`}
                />
                {i < progressSteps.length - 1 && (
                  <div
                    className={`w-8 h-px mx-0.5 transition-all duration-500 ${
                      i < currentProgress ? "bg-maestra-500/50" : "bg-surface-4"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step content */}
        {step === "checking" && (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 border-2 border-maestra-500/30 border-t-maestra-500 rounded-full animate-spin" />
            <span className="text-sm text-gray-500">
              Checking your system...
            </span>
          </div>
        )}

        {step === "docker" && (
          <div className="glass rounded-2xl p-6 text-center space-y-4 animate-slide-up w-full">
            <div className="w-10 h-10 mx-auto rounded-xl bg-accent-rose/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent-rose" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100">
                {setup?.docker_installed ? "Docker Is Not Running" : "Docker Not Found"}
              </h3>
              <p className="text-gray-500 text-sm mt-1">
                {setup?.docker_installed
                  ? "Docker is installed but the engine isn't running. Open Docker Desktop and wait for it to start."
                  : "Maestra requires Docker Desktop. Install it and make sure it's running."}
              </p>
            </div>
            <div className="flex gap-2 justify-center pt-1">
              {setup?.docker_installed ? (
                <button
                  onClick={runChecks}
                  className="px-4 py-2.5 bg-gradient-to-r from-maestra-600 to-maestra-700 text-white rounded-lg hover:from-maestra-500 hover:to-maestra-600 text-sm font-medium shadow-glow transition-all"
                >
                  Check Again
                </button>
              ) : (
                <>
                  <button
                    onClick={() => open("https://www.docker.com/products/docker-desktop/")}
                    className="px-4 py-2.5 bg-gradient-to-r from-maestra-600 to-maestra-700 text-white rounded-lg hover:from-maestra-500 hover:to-maestra-600 text-sm font-medium shadow-glow transition-all"
                  >
                    Download Docker
                  </button>
                  <button
                    onClick={runChecks}
                    className="px-4 py-2.5 glass text-gray-300 rounded-lg hover:bg-surface-3 text-sm font-medium transition-all"
                  >
                    Check Again
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "ports" && (
          <div className="glass rounded-2xl p-6 space-y-4 animate-slide-up w-full">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-xl bg-accent-amber/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-accent-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-100">Port Conflicts</h3>
              <p className="text-gray-500 text-sm mt-1">
                Some ports are already in use. Close conflicting apps to continue.
              </p>
            </div>
            <div className="space-y-1.5">
              {ports
                .filter((p) => p.in_use)
                .map((p) => (
                  <div
                    key={p.port}
                    className="flex justify-between text-sm bg-surface-0/50 rounded-lg px-3 py-2"
                  >
                    <span className="text-gray-400">{p.service}</span>
                    <span className="text-accent-amber font-mono text-xs">:{p.port}</span>
                  </div>
                ))}
            </div>
            <div className="flex gap-2 justify-center pt-1">
              <button
                onClick={runChecks}
                className="px-4 py-2.5 glass text-gray-300 rounded-lg hover:bg-surface-3 text-sm font-medium transition-all"
              >
                Check Again
              </button>
              <button
                onClick={() => setStep("env")}
                className="px-4 py-2.5 text-gray-500 hover:text-gray-300 text-sm transition-all"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        )}

        {step === "env" && (
          <div className="glass rounded-2xl p-6 text-center space-y-4 animate-slide-up w-full">
            <div className="w-10 h-10 mx-auto rounded-xl bg-maestra-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-maestra-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100">Initialize Configuration</h3>
              <p className="text-gray-500 text-sm mt-1">
                We'll create a default config with sensible defaults. Customize later in Settings.
              </p>
            </div>
            {envError && (
              <p className="text-xs text-accent-rose bg-accent-rose/5 rounded-lg px-3 py-2">{envError}</p>
            )}
            <div className="flex gap-2 justify-center pt-1">
              <button
                onClick={handleInitEnv}
                className="px-4 py-2.5 bg-gradient-to-r from-maestra-600 to-maestra-700 text-white rounded-lg hover:from-maestra-500 hover:to-maestra-600 text-sm font-medium shadow-glow transition-all"
              >
                Create .env File
              </button>
              <button
                onClick={() => setStep("pull")}
                className="px-4 py-2.5 text-gray-500 hover:text-gray-300 text-sm transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === "pull" && (
          <div className="glass rounded-2xl p-6 text-center space-y-4 animate-slide-up w-full">
            <div className="w-10 h-10 mx-auto rounded-xl bg-maestra-500/10 flex items-center justify-center">
              {isPulling ? (
                <div className="w-5 h-5 border-2 border-maestra-500/30 border-t-maestra-400 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 text-maestra-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100">
                {isPulling ? "Downloading Services..." : "Download Service Images"}
              </h3>
              <p className="text-gray-500 text-sm mt-1">
                {isPulling
                  ? "This may take a few minutes on the first run."
                  : "Download the Docker images for Maestra's services. This only happens once."}
              </p>
            </div>

            {isPulling && (
              <>
                <div className="bg-surface-0/50 rounded-lg p-3 max-h-28 overflow-y-auto text-left">
                  {pullProgress.map((line, i) => (
                    <div key={i} className="text-[11px] text-gray-500 font-mono leading-relaxed">
                      {line}
                    </div>
                  ))}
                </div>
                <div className="w-full bg-surface-3 rounded-full h-1 overflow-hidden">
                  <div className="bg-gradient-to-r from-maestra-600 to-accent-violet h-1 rounded-full animate-shimmer bg-[length:200%_100%] w-2/3" />
                </div>
              </>
            )}

            {!isPulling && (
              <div className="flex gap-2 justify-center pt-1">
                <button
                  onClick={() => onPullImages("starter")}
                  className="px-4 py-2.5 bg-gradient-to-r from-maestra-600 to-maestra-700 text-white rounded-lg hover:from-maestra-500 hover:to-maestra-600 text-sm font-medium shadow-glow transition-all"
                >
                  Download Images
                </button>
                <button
                  onClick={() => setStep("ready")}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-300 text-sm transition-all"
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        )}

        {step === "ready" && (
          <div className="glass rounded-2xl p-8 text-center space-y-5 animate-slide-up w-full">
            <div className="w-12 h-12 mx-auto rounded-xl bg-accent-emerald/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">Ready to Go</h3>
              <p className="text-gray-500 text-sm mt-1">
                Everything is set up. Start creating with Maestra.
              </p>
            </div>
            {setup && (
              <p className="text-[11px] text-gray-600 font-mono">{setup.docker_version}</p>
            )}
            <button
              onClick={onComplete}
              className="px-8 py-3 bg-gradient-to-r from-maestra-600 to-accent-violet text-white rounded-xl hover:from-maestra-500 hover:to-accent-violet/90 text-sm font-semibold shadow-glow-lg transition-all"
            >
              Get Started
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
