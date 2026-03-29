use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::docker::{DockerErrorKind, DockerError};

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetupStatus {
    pub docker_available: bool,
    pub docker_installed: bool,
    pub docker_version: String,
    pub env_exists: bool,
    pub images_pulled: bool,
    pub project_dir: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortConflict {
    pub port: u16,
    pub service: String,
    pub in_use: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageStatus {
    pub all_present: bool,
    pub missing: Vec<String>,
    pub available: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkStatus {
    pub online: bool,
    pub registry_reachable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskStatus {
    pub available_gb: f64,
    pub sufficient: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadinessIssue {
    pub kind: DockerErrorKind,
    pub message: String,
    pub auto_fixable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadinessReport {
    pub docker_available: bool,
    pub docker_version: Option<String>,
    pub images_status: ImageStatus,
    pub port_conflicts: Vec<PortConflict>,
    pub network_status: NetworkStatus,
    pub disk_status: DiskStatus,
    pub env_exists: bool,
    pub project_bootstrapped: bool,
    pub ready_to_launch: bool,
    pub issues: Vec<ReadinessIssue>,
}

// ─── Port Helpers ───────────────────────────────────────────────────────────

/// Check if a port has something actively listening on it.
/// Uses connect (not bind) to avoid false positives on macOS.
fn is_port_in_use(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        std::time::Duration::from_millis(200),
    )
    .is_ok()
}

/// Return port list for a given profile.
pub fn ports_for_profile(profile: &str) -> Vec<(u16, &'static str)> {
    let mut ports = vec![
        (8080, "Fleet Manager"),
        (3001, "Dashboard"),
        (4222, "NATS"),
        (5432, "PostgreSQL"),
        (6379, "Redis"),
        (1883, "MQTT"),
        (8765, "WebSocket Gateway"),
    ];

    if profile == "full" {
        ports.extend([
            (1880, "Node-RED"),
            (3000, "Grafana"),
            (80, "Traefik HTTP"),
            (443, "Traefik HTTPS"),
            (8081, "Traefik Dashboard"),
            (9000, "Portainer"),
            (9443, "Portainer HTTPS"),
        ]);
    }

    ports
}

/// Filter out ports that are in use by Maestra's own running containers.
pub fn filter_port_conflicts(
    conflicts: Vec<PortConflict>,
    running_services: &[crate::docker::ServiceInfo],
) -> Vec<PortConflict> {
    // Maestra service names that map to specific ports
    let maestra_ports: std::collections::HashSet<u16> = running_services
        .iter()
        .filter(|s| s.state.to_lowercase() == "running")
        .flat_map(|s| {
            // Map known service names to their ports
            match s.service.as_str() {
                "fleet-manager" => vec![8080],
                "dashboard" => vec![3001],
                "nats" => vec![4222],
                "postgres" => vec![5432],
                "redis" => vec![6379],
                "mosquitto" => vec![1883],
                "websocket-gateway" => vec![8765],
                "nodered" => vec![1880],
                "grafana" => vec![3000],
                "traefik" => vec![80, 443, 8081],
                "portainer" => vec![9000, 9443],
                _ => vec![],
            }
        })
        .collect();

    conflicts
        .into_iter()
        .filter(|c| c.in_use && !maestra_ports.contains(&c.port))
        .collect()
}

// ─── Profile Persistence ────────────────────────────────────────────────────

fn profile_path(app: &AppHandle) -> PathBuf {
    crate::paths::project_dir(app).join(".maestra_profile")
}

/// Parse saved profile string, defaulting to "starter" for invalid/empty content.
pub fn parse_saved_profile(content: &str) -> String {
    let trimmed = content.trim();
    match trimmed {
        "full" => "full".to_string(),
        _ => "starter".to_string(),
    }
}

#[tauri::command]
pub async fn get_saved_profile(app: AppHandle) -> Result<String, String> {
    let path = profile_path(&app);
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(parse_saved_profile(&content)),
        Err(_) => Ok("starter".to_string()),
    }
}

#[tauri::command]
pub async fn save_profile(app: AppHandle, profile: String) -> Result<(), String> {
    let path = profile_path(&app);
    std::fs::write(&path, &profile)
        .map_err(|e| format!("Failed to save profile: {}", e))
}

// ─── Image Status (Step 2) ─────────────────────────────────────────────────
//
//   1. `docker compose config --images` → list all image names
//   2. `docker image inspect <image>` per image → check local existence
//

/// Internal implementation for check_images_present, used by both the command
/// and start_services pre-flight check.
pub async fn check_images_present_inner(app: &AppHandle, profile: &str) -> Result<ImageStatus, DockerError> {
    let project_dir = crate::paths::project_dir(app);
    let profile_opt = if profile == "starter" { None } else { Some(profile) };

    let mut args = crate::docker::compose_args_pub(&project_dir, profile_opt);
    args.extend(["config".to_string(), "--images".to_string()]);

    let output = crate::docker::docker_cmd_pub()
        .args(&args)
        .current_dir(&project_dir)
        .output()
        .await
        .map_err(|e| DockerError::with_detail(
            DockerErrorKind::CommandFailed,
            "Failed to list compose images",
            e.to_string(),
        ))?;

    if !output.status.success() {
        // Fallback: if compose config --images fails, report unknown
        return Ok(ImageStatus {
            all_present: false,
            missing: vec!["(could not determine)".to_string()],
            available: vec![],
        });
    }

    let image_list: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    // Check each image in parallel
    let mut handles = vec![];
    for image in &image_list {
        let img = image.clone();
        handles.push(tokio::spawn(async move {
            let result = tokio::process::Command::new(crate::docker::find_docker_pub())
                .args(["image", "inspect", "--format", "{{.Id}}", &img])
                .output()
                .await;
            let present = result.map(|o| o.status.success()).unwrap_or(false);
            (img, present)
        }));
    }

    let mut available = vec![];
    let mut missing = vec![];
    for handle in handles {
        if let Ok((img, present)) = handle.await {
            if present {
                available.push(img);
            } else {
                missing.push(img);
            }
        }
    }

    Ok(ImageStatus {
        all_present: missing.is_empty(),
        missing,
        available,
    })
}

#[tauri::command]
pub async fn check_images_present(app: AppHandle, profile: String) -> Result<ImageStatus, DockerError> {
    check_images_present_inner(&app, &profile).await
}

// ─── Network Detection (Step 4) ────────────────────────────────────────────

#[tauri::command]
pub async fn check_network() -> Result<NetworkStatus, String> {
    // Try TCP connect to ghcr.io:443 with 3-second timeout
    let registry_reachable = tokio::task::spawn_blocking(|| {
        TcpStream::connect_timeout(
            // Use DNS resolution for ghcr.io
            &"ghcr.io:443".parse::<std::net::SocketAddr>()
                .unwrap_or_else(|_| std::net::SocketAddr::from(([140, 82, 121, 34], 443))),
            std::time::Duration::from_secs(3),
        )
        .is_ok()
    })
    .await
    .unwrap_or(false);

    // Also try a well-known host for basic connectivity
    let online = if registry_reachable {
        true
    } else {
        tokio::task::spawn_blocking(|| {
            TcpStream::connect_timeout(
                &std::net::SocketAddr::from(([1, 1, 1, 1], 443)),
                std::time::Duration::from_secs(3),
            )
            .is_ok()
        })
        .await
        .unwrap_or(false)
    };

    Ok(NetworkStatus {
        online,
        registry_reachable,
    })
}

// ─── Disk Space Check (Step 5) ──────────────────────────────────────────────

#[tauri::command]
pub async fn check_disk_space(app: AppHandle) -> Result<DiskStatus, String> {
    let project_dir = crate::paths::project_dir(&app);
    let threshold_gb: f64 = 3.0;

    // Use `df` to get available space on the volume containing the project dir
    let output = tokio::process::Command::new("df")
        .args(["-k", &project_dir.to_string_lossy()])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            // df -k output: second line, 4th column = available KB
            if let Some(line) = stdout.lines().nth(1) {
                let fields: Vec<&str> = line.split_whitespace().collect();
                if let Some(avail_kb) = fields.get(3).and_then(|s| s.parse::<f64>().ok()) {
                    let available_gb = avail_kb / 1_048_576.0; // KB to GB
                    return Ok(DiskStatus {
                        available_gb: (available_gb * 10.0).round() / 10.0, // 1 decimal
                        sufficient: available_gb >= threshold_gb,
                    });
                }
            }
            // Fallback: couldn't parse, assume sufficient
            Ok(DiskStatus { available_gb: -1.0, sufficient: true })
        }
        _ => Ok(DiskStatus { available_gb: -1.0, sufficient: true }),
    }
}

// ─── Startup Readiness Check (Step 7) ───────────────────────────────────────
//
//   Runs all checks in parallel, returns unified ReadinessReport.
//   Reuses the health.rs tokio-task pattern.
//

/// Determine readiness from a report, populating ready_to_launch and issues.
pub fn determine_readiness(
    docker_available: bool,
    docker_installed: bool,
    images: &ImageStatus,
    port_conflicts: &[PortConflict],
    network: &NetworkStatus,
    disk: &DiskStatus,
    _env_exists: bool,
    _project_bootstrapped: bool,
) -> (bool, Vec<ReadinessIssue>) {
    let mut issues = vec![];

    if !docker_installed {
        issues.push(ReadinessIssue {
            kind: DockerErrorKind::DockerNotInstalled,
            message: "Docker Desktop is not installed. Download it at docker.com".to_string(),
            auto_fixable: false,
        });
    } else if !docker_available {
        issues.push(ReadinessIssue {
            kind: DockerErrorKind::DockerNotRunning,
            message: "Docker isn't running. Open Docker Desktop and try again.".to_string(),
            auto_fixable: false,
        });
    }

    if !images.all_present && !images.missing.is_empty() {
        if network.online {
            issues.push(ReadinessIssue {
                kind: DockerErrorKind::PullFailed,
                message: format!("{} service image(s) missing. Will download automatically.", images.missing.len()),
                auto_fixable: true,
            });
        } else {
            issues.push(ReadinessIssue {
                kind: DockerErrorKind::NetworkOffline,
                message: "No internet connection and some service images are missing.".to_string(),
                auto_fixable: false,
            });
        }
    }

    if !network.online && images.all_present {
        // Not an issue per se, but worth noting
        // Don't push an issue — images are present, we can launch offline
    }

    for conflict in port_conflicts {
        if conflict.in_use {
            issues.push(ReadinessIssue {
                kind: DockerErrorKind::PortConflict,
                message: format!("Port {} ({}) is being used by another app.", conflict.port, conflict.service),
                auto_fixable: false,
            });
        }
    }

    if !disk.sufficient && disk.available_gb >= 0.0 {
        issues.push(ReadinessIssue {
            kind: DockerErrorKind::DiskSpaceLow,
            message: format!("Need ~3GB free space. You have {:.1}GB available.", disk.available_gb),
            auto_fixable: false,
        });
    }

    let ready = issues.is_empty() || issues.iter().all(|i| i.auto_fixable);
    (ready, issues)
}

#[tauri::command]
pub async fn startup_readiness_check(app: AppHandle, profile: String) -> Result<ReadinessReport, DockerError> {
    // Run checks in parallel
    let app_docker = app.clone();
    let profile_images = profile.clone();
    let app_images = app.clone();
    let app_disk = app.clone();

    let docker_handle = tokio::spawn(async move {
        crate::docker::check_docker().await
    });

    let images_handle = tokio::spawn(async move {
        check_images_present_inner(&app_images, &profile_images).await
    });

    let network_handle = tokio::spawn(async move {
        check_network().await
    });

    let disk_handle = tokio::spawn(async move {
        check_disk_space(app_disk).await
    });

    // Collect results
    let docker_info = docker_handle.await
        .unwrap_or_else(|_| Ok(crate::docker::DockerInfo {
            available: false, installed: false, version: String::new(),
            compose_available: false, compose_version: String::new(),
        }))
        .unwrap_or(crate::docker::DockerInfo {
            available: false, installed: false, version: String::new(),
            compose_available: false, compose_version: String::new(),
        });

    let images_status = images_handle.await
        .unwrap_or_else(|_| Ok(ImageStatus { all_present: false, missing: vec![], available: vec![] }))
        .unwrap_or(ImageStatus { all_present: false, missing: vec![], available: vec![] });

    let network_status = network_handle.await
        .unwrap_or_else(|_| Ok(NetworkStatus { online: false, registry_reachable: false }))
        .unwrap_or(NetworkStatus { online: false, registry_reachable: false });

    let disk_status = disk_handle.await
        .unwrap_or_else(|_| Ok(DiskStatus { available_gb: -1.0, sufficient: true }))
        .unwrap_or(DiskStatus { available_gb: -1.0, sufficient: true });

    // Port check (needs to run after docker check to filter Maestra ports)
    let running_services = crate::docker::get_service_status(app_docker.clone()).await.unwrap_or_default();
    let raw_conflicts: Vec<PortConflict> = ports_for_profile(&profile)
        .into_iter()
        .map(|(port, service)| PortConflict {
            port,
            service: service.to_string(),
            in_use: is_port_in_use(port),
        })
        .collect();
    let port_conflicts = filter_port_conflicts(raw_conflicts, &running_services);

    // Env and project status
    let proj_dir = crate::paths::project_dir(&app);
    let env_exists = proj_dir.join(".env").exists();
    let project_bootstrapped = proj_dir.join("docker-compose.yml").exists();

    let docker_available = docker_info.available && docker_info.compose_available;
    let docker_version = if docker_info.available {
        Some(format!("Docker {} / Compose {}", docker_info.version, docker_info.compose_version))
    } else {
        None
    };

    let (ready_to_launch, issues) = determine_readiness(
        docker_available,
        docker_info.installed,
        &images_status,
        &port_conflicts,
        &network_status,
        &disk_status,
        env_exists,
        project_bootstrapped,
    );

    Ok(ReadinessReport {
        docker_available,
        docker_version,
        images_status,
        port_conflicts,
        network_status,
        disk_status,
        env_exists,
        project_bootstrapped,
        ready_to_launch,
        issues,
    })
}

// ─── Legacy Commands (kept for compatibility) ───────────────────────────────

#[tauri::command]
pub async fn check_setup(app: AppHandle) -> Result<SetupStatus, String> {
    let docker_info = crate::docker::check_docker().await.unwrap_or_else(|_| {
        crate::docker::DockerInfo {
            available: false,
            installed: false,
            version: String::new(),
            compose_available: false,
            compose_version: String::new(),
        }
    });

    let proj_dir = crate::paths::project_dir(&app);
    let env_exists = proj_dir.join(".env").exists();

    // Real image check instead of hardcoded false
    let images_pulled = match check_images_present_inner(&app, "starter").await {
        Ok(status) => status.all_present,
        Err(_) => false,
    };

    Ok(SetupStatus {
        docker_available: docker_info.available && docker_info.compose_available,
        docker_installed: docker_info.installed,
        docker_version: if docker_info.available {
            format!("Docker {} / Compose {}", docker_info.version, docker_info.compose_version)
        } else {
            String::new()
        },
        env_exists,
        images_pulled,
        project_dir: proj_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn get_project_path(app: AppHandle) -> Result<String, String> {
    let dir = crate::paths::project_dir(&app);
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn check_ports(profile: String) -> Result<Vec<PortConflict>, String> {
    let conflicts: Vec<PortConflict> = ports_for_profile(&profile)
        .into_iter()
        .map(|(port, service)| PortConflict {
            port,
            service: service.to_string(),
            in_use: is_port_in_use(port),
        })
        .collect();

    Ok(conflicts)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::docker::{DockerErrorKind, ServiceInfo};

    #[test]
    fn ports_for_starter_profile() {
        let ports = ports_for_profile("starter");
        assert_eq!(ports.len(), 7);
        assert!(ports.iter().any(|(p, _)| *p == 8080));
        assert!(ports.iter().any(|(p, _)| *p == 3001));
        assert!(ports.iter().any(|(p, _)| *p == 4222));
        // Should NOT include Node-RED or Grafana
        assert!(!ports.iter().any(|(p, _)| *p == 1880));
        assert!(!ports.iter().any(|(p, _)| *p == 3000));
    }

    #[test]
    fn ports_for_full_profile() {
        let ports = ports_for_profile("full");
        assert!(ports.len() > 7);
        // Should include all starter ports
        assert!(ports.iter().any(|(p, _)| *p == 8080));
        assert!(ports.iter().any(|(p, _)| *p == 3001));
        // Plus full-only ports
        assert!(ports.iter().any(|(p, _)| *p == 1880));
        assert!(ports.iter().any(|(p, _)| *p == 3000));
        assert!(ports.iter().any(|(p, _)| *p == 80));
        assert!(ports.iter().any(|(p, _)| *p == 443));
        assert!(ports.iter().any(|(p, _)| *p == 9000));
    }

    #[test]
    fn filter_port_conflicts_excludes_maestra_ports() {
        let conflicts = vec![
            PortConflict { port: 8080, service: "Fleet Manager".to_string(), in_use: true },
            PortConflict { port: 3001, service: "Dashboard".to_string(), in_use: true },
            PortConflict { port: 9090, service: "Unknown".to_string(), in_use: true },
        ];
        let running = vec![
            ServiceInfo {
                name: "maestra-fleet-manager-1".to_string(),
                state: "running".to_string(),
                status: "Up 5 minutes".to_string(),
                service: "fleet-manager".to_string(),
            },
            ServiceInfo {
                name: "maestra-dashboard-1".to_string(),
                state: "running".to_string(),
                status: "Up 5 minutes".to_string(),
                service: "dashboard".to_string(),
            },
        ];

        let filtered = filter_port_conflicts(conflicts, &running);
        // 8080 and 3001 should be excluded (Maestra using them)
        // 9090 should remain (not a Maestra port)
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].port, 9090);
    }

    #[test]
    fn filter_port_conflicts_keeps_all_when_no_services() {
        let conflicts = vec![
            PortConflict { port: 8080, service: "Fleet Manager".to_string(), in_use: true },
        ];
        let filtered = filter_port_conflicts(conflicts, &[]);
        assert_eq!(filtered.len(), 1);
    }

    #[test]
    fn filter_port_conflicts_excludes_not_in_use() {
        let conflicts = vec![
            PortConflict { port: 8080, service: "Fleet Manager".to_string(), in_use: false },
        ];
        let filtered = filter_port_conflicts(conflicts, &[]);
        assert_eq!(filtered.len(), 0);
    }

    #[test]
    fn parse_saved_profile_valid() {
        assert_eq!(parse_saved_profile("starter"), "starter");
        assert_eq!(parse_saved_profile("full"), "full");
        assert_eq!(parse_saved_profile("  full  \n"), "full");
    }

    #[test]
    fn parse_saved_profile_invalid_defaults_to_starter() {
        assert_eq!(parse_saved_profile("invalid"), "starter");
        assert_eq!(parse_saved_profile(""), "starter");
        assert_eq!(parse_saved_profile("FULL"), "starter"); // case-sensitive
        assert_eq!(parse_saved_profile("complete"), "starter");
    }

    #[test]
    fn determine_readiness_all_green() {
        let images = ImageStatus { all_present: true, missing: vec![], available: vec!["img".to_string()] };
        let network = NetworkStatus { online: true, registry_reachable: true };
        let disk = DiskStatus { available_gb: 50.0, sufficient: true };

        let (ready, issues) = determine_readiness(true, true, &images, &[], &network, &disk, true, true);
        assert!(ready);
        assert!(issues.is_empty());
    }

    #[test]
    fn determine_readiness_docker_not_installed() {
        let images = ImageStatus { all_present: false, missing: vec![], available: vec![] };
        let network = NetworkStatus { online: true, registry_reachable: true };
        let disk = DiskStatus { available_gb: 50.0, sufficient: true };

        let (ready, issues) = determine_readiness(false, false, &images, &[], &network, &disk, true, true);
        assert!(!ready);
        assert!(issues.iter().any(|i| i.kind == DockerErrorKind::DockerNotInstalled));
    }

    #[test]
    fn determine_readiness_docker_not_running() {
        let images = ImageStatus { all_present: false, missing: vec![], available: vec![] };
        let network = NetworkStatus { online: true, registry_reachable: true };
        let disk = DiskStatus { available_gb: 50.0, sufficient: true };

        let (ready, issues) = determine_readiness(false, true, &images, &[], &network, &disk, true, true);
        assert!(!ready);
        assert!(issues.iter().any(|i| i.kind == DockerErrorKind::DockerNotRunning));
    }

    #[test]
    fn determine_readiness_images_missing_online() {
        let images = ImageStatus { all_present: false, missing: vec!["img".to_string()], available: vec![] };
        let network = NetworkStatus { online: true, registry_reachable: true };
        let disk = DiskStatus { available_gb: 50.0, sufficient: true };

        let (ready, issues) = determine_readiness(true, true, &images, &[], &network, &disk, true, true);
        // Missing images while online = auto-fixable, so ready is true
        assert!(ready);
        assert!(issues.iter().any(|i| i.auto_fixable));
    }

    #[test]
    fn determine_readiness_images_missing_offline() {
        let images = ImageStatus { all_present: false, missing: vec!["img".to_string()], available: vec![] };
        let network = NetworkStatus { online: false, registry_reachable: false };
        let disk = DiskStatus { available_gb: 50.0, sufficient: true };

        let (ready, issues) = determine_readiness(true, true, &images, &[], &network, &disk, true, true);
        assert!(!ready);
        assert!(issues.iter().any(|i| i.kind == DockerErrorKind::NetworkOffline));
    }

    #[test]
    fn determine_readiness_disk_low() {
        let images = ImageStatus { all_present: true, missing: vec![], available: vec!["img".to_string()] };
        let network = NetworkStatus { online: true, registry_reachable: true };
        let disk = DiskStatus { available_gb: 1.5, sufficient: false };

        let (ready, issues) = determine_readiness(true, true, &images, &[], &network, &disk, true, true);
        assert!(!ready);
        assert!(issues.iter().any(|i| i.kind == DockerErrorKind::DiskSpaceLow));
    }

    #[test]
    fn determine_readiness_port_conflict() {
        let images = ImageStatus { all_present: true, missing: vec![], available: vec!["img".to_string()] };
        let network = NetworkStatus { online: true, registry_reachable: true };
        let disk = DiskStatus { available_gb: 50.0, sufficient: true };
        let conflicts = vec![PortConflict { port: 8080, service: "Fleet Manager".to_string(), in_use: true }];

        let (ready, issues) = determine_readiness(true, true, &images, &conflicts, &network, &disk, true, true);
        assert!(!ready);
        assert!(issues.iter().any(|i| i.kind == DockerErrorKind::PortConflict));
    }
}
