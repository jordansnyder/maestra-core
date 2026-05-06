import type { DockerErrorKind } from "./invoke";

/**
 * Translate Docker error kinds into artist-friendly messages.
 * No raw Docker output ever reaches the user.
 */
const ERROR_MESSAGES: Record<DockerErrorKind, string> = {
  DockerNotInstalled:
    "Docker Desktop is not installed. Download it at docker.com",
  DockerNotRunning:
    "Docker isn't running. Open Docker Desktop and try again.",
  ComposeNotFound:
    "Docker Compose is not available. Please update Docker Desktop.",
  NetworkTimeout: "Connection slow, retrying...",
  NetworkOffline: "No internet connection. Using cached services.",
  RegistryAuthFailed:
    "Docker credential issue. Try running: docker logout ghcr.io",
  ImageNotFound:
    "Service image not available. Check your internet and try again.",
  DiskSpaceLow: "Not enough disk space. Free up some room and try again.",
  PortConflict: "A port is being used by another app.",
  StartFailed: "Failed to start services. Check the logs for details.",
  PullFailed: "Image download failed. Try again when your connection is stable.",
  CommandFailed: "An unexpected error occurred.",
};

export function friendlyMessage(kind: DockerErrorKind): string {
  return ERROR_MESSAGES[kind] ?? "An unexpected error occurred.";
}

/**
 * Parse a Tauri invoke error into a structured DockerError if possible.
 * Tauri serializes Rust error types as JSON strings.
 */
export function parseDockerError(
  err: unknown
): { kind: DockerErrorKind; message: string; detail?: string } | null {
  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err);
      if (parsed.kind && parsed.message) return parsed;
    } catch {
      // Not JSON — raw string error from old code paths
    }
  }
  if (typeof err === "object" && err !== null && "kind" in err) {
    return err as { kind: DockerErrorKind; message: string; detail?: string };
  }
  return null;
}

/**
 * Get a user-facing message from any error (structured or string).
 */
export function toFriendlyError(err: unknown): string {
  const parsed = parseDockerError(err);
  if (parsed) return parsed.message;
  if (typeof err === "string") return err;
  return "An unexpected error occurred.";
}
