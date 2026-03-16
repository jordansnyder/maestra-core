use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerInfo {
    pub available: bool,
    pub version: String,
    pub compose_available: bool,
    pub compose_version: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServiceInfo {
    #[serde(alias = "Name")]
    pub name: String,
    #[serde(alias = "State")]
    pub state: String,
    #[serde(alias = "Status")]
    pub status: String,
    #[serde(alias = "Service")]
    pub service: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogLine {
    pub service: String,
    pub message: String,
}

fn get_project_dir(app: &AppHandle) -> PathBuf {
    crate::paths::project_dir(app)
}

fn compose_args(project_dir: &PathBuf, profile: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "compose".to_string(),
        "-f".to_string(),
        project_dir
            .join("docker-compose.yml")
            .to_string_lossy()
            .to_string(),
    ];

    // Add desktop override if it exists
    let desktop_compose = project_dir.join("docker-compose.desktop.yml");
    if desktop_compose.exists() {
        args.push("-f".to_string());
        args.push(desktop_compose.to_string_lossy().to_string());
    }

    if let Some(p) = profile {
        if p == "full" {
            args.push("--profile".to_string());
            args.push("full".to_string());
        }
    }

    args
}

#[tauri::command]
pub async fn check_docker() -> Result<DockerInfo, String> {
    // Check docker
    let docker_output = Command::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
        .await
        .map_err(|e| format!("Docker not found: {}", e))?;

    let docker_available = docker_output.status.success();
    let docker_version = String::from_utf8_lossy(&docker_output.stdout)
        .trim()
        .to_string();

    // Check docker compose
    let compose_output = Command::new("docker")
        .args(["compose", "version", "--short"])
        .output()
        .await
        .map_err(|e| format!("Docker Compose not found: {}", e))?;

    let compose_available = compose_output.status.success();
    let compose_version = String::from_utf8_lossy(&compose_output.stdout)
        .trim()
        .to_string();

    Ok(DockerInfo {
        available: docker_available,
        version: docker_version,
        compose_available,
        compose_version,
    })
}

#[tauri::command]
pub async fn start_services(app: AppHandle, profile: String) -> Result<(), String> {
    let project_dir = get_project_dir(&app);
    let profile_opt = if profile == "starter" {
        None
    } else {
        Some(profile.as_str())
    };

    let mut args = compose_args(&project_dir, profile_opt);
    args.push("up".to_string());
    args.push("-d".to_string());

    let output = Command::new("docker")
        .args(&args)
        .current_dir(&project_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to start services: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to start services: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_services(app: AppHandle) -> Result<(), String> {
    let project_dir = get_project_dir(&app);
    let mut args = compose_args(&project_dir, Some("full"));
    args.push("down".to_string());

    let output = Command::new("docker")
        .args(&args)
        .current_dir(&project_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to stop services: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to stop services: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_service_status(app: AppHandle) -> Result<Vec<ServiceInfo>, String> {
    let project_dir = get_project_dir(&app);
    let mut args = compose_args(&project_dir, Some("full"));
    args.push("ps".to_string());
    args.push("--format".to_string());
    args.push("json".to_string());
    args.push("-a".to_string());

    let output = Command::new("docker")
        .args(&args)
        .current_dir(&project_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to get status: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // docker compose ps --format json outputs one JSON object per line
    let services: Vec<ServiceInfo> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    Ok(services)
}

#[tauri::command]
pub async fn stream_logs(
    app: AppHandle,
    services: Vec<String>,
    tail: Option<u32>,
) -> Result<(), String> {
    let project_dir = get_project_dir(&app);
    let mut args = compose_args(&project_dir, Some("full"));
    args.push("logs".to_string());
    args.push("-f".to_string());
    args.push("--tail".to_string());
    args.push(tail.unwrap_or(200).to_string());

    if !services.is_empty() {
        args.extend(services);
    }

    let mut child = Command::new("docker")
        .args(&args)
        .current_dir(&project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to stream logs: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            // Docker compose log lines are formatted as "service  | message"
            let (service, message) = if let Some(idx) = line.find(" | ") {
                (
                    line[..idx].trim().to_string(),
                    line[idx + 3..].to_string(),
                )
            } else {
                ("system".to_string(), line)
            };

            let log_line = LogLine { service, message };
            let _ = app_clone.emit("log-line", &log_line);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn pull_images(app: AppHandle, profile: String) -> Result<(), String> {
    let project_dir = get_project_dir(&app);
    let profile_opt = if profile == "starter" {
        None
    } else {
        Some(profile.as_str())
    };

    let mut args = compose_args(&project_dir, profile_opt);
    args.push("pull".to_string());

    let mut child = Command::new("docker")
        .args(&args)
        .current_dir(&project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to pull images: {}", e))?;

    let stderr = child.stderr.take().unwrap();
    let reader = BufReader::new(stderr);
    let mut lines = reader.lines();

    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit("pull-progress", &line);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to pull images: {}", e))?;

    if !status.success() {
        return Err("Some images failed to pull".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn run_migrations(app: AppHandle) -> Result<String, String> {
    let project_dir = get_project_dir(&app);

    let output = Command::new("docker")
        .args([
            "compose",
            "-f",
            &project_dir
                .join("docker-compose.yml")
                .to_string_lossy(),
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "maestra",
            "-d",
            "maestra",
            "-c",
            "SELECT 1",
        ])
        .current_dir(&project_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run migrations: {}", e))?;

    if output.status.success() {
        Ok("Migrations complete".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Migration failed: {}", stderr))
    }
}
