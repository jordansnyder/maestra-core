import { invoke } from "@tauri-apps/api/core";

// Docker types
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

// Health types
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

// Setup types
export interface SetupStatus {
  docker_available: boolean;
  docker_installed: boolean;
  docker_version: string;
  env_exists: boolean;
  images_pulled: boolean;
}

export interface PortConflict {
  port: number;
  service: string;
  in_use: boolean;
}

// Docker commands
export const checkDocker = () => invoke<DockerInfo>("check_docker");
export const startServices = (profile: string) =>
  invoke<void>("start_services", { profile });
export const stopServices = () => invoke<void>("stop_services");
export const getServiceStatus = () =>
  invoke<ServiceInfo[]>("get_service_status");
export const streamLogs = (services: string[], tail?: number) =>
  invoke<void>("stream_logs", { services, tail });
export const pullImages = (profile: string) =>
  invoke<void>("pull_images", { profile });
export const runMigrations = () => invoke<string>("run_migrations");

// Health commands
export const checkServiceHealth = () =>
  invoke<HealthReport>("check_service_health");

// Env commands
export const readEnv = () => invoke<string>("read_env");
export const writeEnv = (content: string) =>
  invoke<void>("write_env", { content });
export const initEnv = () => invoke<boolean>("init_env");
export const getEnvPath = () => invoke<string>("get_env_path");

// Setup commands
export const checkSetup = () => invoke<SetupStatus>("check_setup");
export const checkPorts = () => invoke<PortConflict[]>("check_ports");
