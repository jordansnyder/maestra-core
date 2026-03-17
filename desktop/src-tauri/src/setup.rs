use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetupStatus {
    pub docker_available: bool,
    pub docker_installed: bool,
    pub docker_version: String,
    pub env_exists: bool,
    pub images_pulled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortConflict {
    pub port: u16,
    pub service: String,
    pub in_use: bool,
}

/// Check if a port has something actively listening on it.
/// Uses connect (not bind) to avoid false positives on macOS.
fn is_port_in_use(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        std::time::Duration::from_millis(200),
    )
    .is_ok()
}

#[tauri::command]
pub async fn check_setup(app: AppHandle) -> Result<SetupStatus, String> {
    // Check Docker
    let docker_info = crate::docker::check_docker().await.unwrap_or_else(|_| {
        crate::docker::DockerInfo {
            available: false,
            installed: false,
            version: String::new(),
            compose_available: false,
            compose_version: String::new(),
        }
    });

    // Check .env
    let env_exists = crate::env_editor::get_env_path(app.clone())
        .await
        .map(|p| std::path::Path::new(&p).exists())
        .unwrap_or(false);

    Ok(SetupStatus {
        docker_available: docker_info.available && docker_info.compose_available,
        docker_installed: docker_info.installed,
        docker_version: if docker_info.available {
            format!(
                "Docker {} / Compose {}",
                docker_info.version, docker_info.compose_version
            )
        } else {
            String::new()
        },
        env_exists,
        images_pulled: false, // We can't easily check this without trying
    })
}

#[tauri::command]
pub async fn check_ports() -> Result<Vec<PortConflict>, String> {
    let ports = vec![
        (8080, "Fleet Manager"),
        (3001, "Dashboard"),
        (4222, "NATS"),
        (5432, "PostgreSQL"),
        (6379, "Redis"),
        (1883, "MQTT"),
        (1880, "Node-RED"),
        (3000, "Grafana"),
        (8765, "WebSocket Gateway"),
    ];

    let conflicts: Vec<PortConflict> = ports
        .into_iter()
        .map(|(port, service)| PortConflict {
            port,
            service: service.to_string(),
            in_use: is_port_in_use(port),
        })
        .collect();

    Ok(conflicts)
}
