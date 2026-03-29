import { invoke } from "@tauri-apps/api/core";

// ─── Docker Types ───────────────────────────────────────────────────────────

export interface DockerInfo {
  available: boolean;
  installed: boolean;
  version: string;
  compose_available: boolean;
  compose_version: string;
}

export interface ServiceInfo {
  name: string;
  state: string;
  status: string;
  service: string;
}

export interface LogLine {
  service: string;
  message: string;
}

// ─── Structured Error Types ─────────────────────────────────────────────────

export type DockerErrorKind =
  | "DockerNotInstalled"
  | "DockerNotRunning"
  | "ComposeNotFound"
  | "NetworkTimeout"
  | "NetworkOffline"
  | "RegistryAuthFailed"
  | "ImageNotFound"
  | "DiskSpaceLow"
  | "PortConflict"
  | "StartFailed"
  | "PullFailed"
  | "CommandFailed";

export interface DockerError {
  kind: DockerErrorKind;
  message: string;
  detail?: string;
}

export interface PullFailure {
  service: string;
  error: string;
  retries_attempted: number;
}

export interface PullResult {
  success: boolean;
  pulled: string[];
  failed: PullFailure[];
  retries_used: number;
}

// ─── Health Types ───────────────────────────────────────────────────────────

export interface ServiceHealth {
  name: string;
  healthy: boolean;
  url: string;
  detail: string;
}

export interface HealthReport {
  services: ServiceHealth[];
  all_healthy: boolean;
}

// ─── Setup & Readiness Types ────────────────────────────────────────────────

export interface SetupStatus {
  docker_available: boolean;
  docker_installed: boolean;
  docker_version: string;
  env_exists: boolean;
  images_pulled: boolean;
  project_dir: string;
}

export interface PortConflict {
  port: number;
  service: string;
  in_use: boolean;
}

export interface ImageStatus {
  all_present: boolean;
  missing: string[];
  available: string[];
}

export interface NetworkStatus {
  online: boolean;
  registry_reachable: boolean;
}

export interface DiskStatus {
  available_gb: number;
  sufficient: boolean;
}

export interface ReadinessIssue {
  kind: DockerErrorKind;
  message: string;
  auto_fixable: boolean;
}

export interface ReadinessReport {
  docker_available: boolean;
  docker_version: string | null;
  images_status: ImageStatus;
  port_conflicts: PortConflict[];
  network_status: NetworkStatus;
  disk_status: DiskStatus;
  env_exists: boolean;
  project_bootstrapped: boolean;
  ready_to_launch: boolean;
  issues: ReadinessIssue[];
}

// ─── Docker Commands ────────────────────────────────────────────────────────

export const checkDocker = () => invoke<DockerInfo>("check_docker");
export const startServices = (profile: string) =>
  invoke<void>("start_services", { profile });
export const stopServices = () => invoke<void>("stop_services");
export const getServiceStatus = () =>
  invoke<ServiceInfo[]>("get_service_status");
export const streamLogs = (services: string[], tail?: number) =>
  invoke<void>("stream_logs", { services, tail });
export const pullImages = (profile: string) =>
  invoke<PullResult>("pull_images", { profile });
export const runMigrations = () => invoke<string>("run_migrations");
export const exportDiagnostics = () =>
  invoke<string>("export_diagnostics");

// ─── Health Commands ────────────────────────────────────────────────────────

export const checkServiceHealth = () =>
  invoke<HealthReport>("check_service_health");

// ─── Env Commands ───────────────────────────────────────────────────────────

export const readEnv = () => invoke<string>("read_env");
export const writeEnv = (content: string) =>
  invoke<void>("write_env", { content });
export const initEnv = () => invoke<boolean>("init_env");
export const getEnvPath = () => invoke<string>("get_env_path");

// ─── Setup & Readiness Commands ─────────────────────────────────────────────

export const checkSetup = () => invoke<SetupStatus>("check_setup");
export const checkPorts = (profile: string) =>
  invoke<PortConflict[]>("check_ports", { profile });
export const getProjectPath = () => invoke<string>("get_project_path");
export const checkImagesPresent = (profile: string) =>
  invoke<ImageStatus>("check_images_present", { profile });
export const checkNetwork = () => invoke<NetworkStatus>("check_network");
export const checkDiskSpace = () => invoke<DiskStatus>("check_disk_space");
export const getSavedProfile = () => invoke<string>("get_saved_profile");
export const saveProfile = (profile: string) =>
  invoke<void>("save_profile", { profile });
export const startupReadinessCheck = (profile: string) =>
  invoke<ReadinessReport>("startup_readiness_check", { profile });
