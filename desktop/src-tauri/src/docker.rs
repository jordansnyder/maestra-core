use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ─── Structured Error Types ─────────────────────────────────────────────────
//
//   DockerErrorKind → DockerError
//        │
//        ├── DockerNotInstalled   (docker CLI binary not found)
//        ├── DockerNotRunning     (CLI found but daemon not responding)
//        ├── ComposeNotFound      (compose plugin missing)
//        ├── NetworkTimeout       (retryable: connection timed out)
//        ├── NetworkOffline       (no internet at all)
//        ├── RegistryAuthFailed   (permanent: credential issue)
//        ├── ImageNotFound        (permanent: image doesn't exist in registry)
//        ├── DiskSpaceLow         (host disk below threshold)
//        ├── PortConflict         (port in use by non-Maestra process)
//        ├── StartFailed          (docker compose up failed)
//        ├── PullFailed           (all retries exhausted)
//        └── CommandFailed        (generic fallback)
//

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum DockerErrorKind {
    DockerNotInstalled,
    DockerNotRunning,
    ComposeNotFound,
    NetworkTimeout,
    NetworkOffline,
    RegistryAuthFailed,
    ImageNotFound,
    DiskSpaceLow,
    PortConflict,
    StartFailed,
    PullFailed,
    CommandFailed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerError {
    pub kind: DockerErrorKind,
    pub message: String,
    pub detail: Option<String>,
}

impl std::fmt::Display for DockerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl DockerError {
    pub fn new(kind: DockerErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into(), detail: None }
    }

    pub fn with_detail(kind: DockerErrorKind, message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self { kind, message: message.into(), detail: Some(detail.into()) }
    }
}

/// Classify a Docker pull stderr line into an error kind.
/// Returns None if the line doesn't indicate a classifiable error.
pub fn classify_pull_error(stderr: &str) -> Option<DockerErrorKind> {
    let lower = stderr.to_lowercase();
    if lower.contains("manifest unknown") || lower.contains("not found") {
        Some(DockerErrorKind::ImageNotFound)
    } else if lower.contains("unauthorized") || lower.contains("403") || lower.contains("denied") {
        Some(DockerErrorKind::RegistryAuthFailed)
    } else if lower.contains("timeout") || lower.contains("timed out") || lower.contains("connection refused") {
        Some(DockerErrorKind::NetworkTimeout)
    } else if lower.contains("no space left") || lower.contains("disk full") {
        Some(DockerErrorKind::DiskSpaceLow)
    } else {
        None
    }
}

/// Whether a given error kind is worth retrying.
pub fn should_retry(kind: &DockerErrorKind) -> bool {
    matches!(kind, DockerErrorKind::NetworkTimeout | DockerErrorKind::CommandFailed)
}

/// Exponential backoff delay for pull retries.
/// Attempt 0 = 0s, 1 = 2s, 2 = 4s, 3 = 8s, 4 = 16s.
pub fn backoff_delay(attempt: u32) -> std::time::Duration {
    if attempt == 0 {
        std::time::Duration::from_secs(0)
    } else {
        std::time::Duration::from_secs(2u64.pow(attempt))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PullFailure {
    pub service: String,
    pub error: String,
    pub retries_attempted: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PullResult {
    pub success: bool,
    pub pulled: Vec<String>,
    pub failed: Vec<PullFailure>,
    pub retries_used: u32,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Detect the LAN IP by opening a UDP socket to a public address.
/// The socket isn't actually sent — we just read the local address the OS picks.
fn detect_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

/// Find the `docker` binary.
///
/// When launched as a bundled .app on macOS (e.g., from Finder), the process
/// inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that does NOT
/// include /usr/local/bin where Docker Desktop installs its CLI symlinks.
/// We probe well-known locations so the app works outside a terminal.
fn find_docker() -> String {
    // If `docker` is already on PATH, use it (dev mode / terminal launch)
    if let Ok(output) = std::process::Command::new("which")
        .arg("docker")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    // Well-known Docker Desktop install paths (macOS, Linux, Windows)
    let candidates = [
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/usr/bin/docker",
        // Docker Desktop macOS app bundle
        "/Applications/Docker.app/Contents/Resources/bin/docker",
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }

    // Last resort — hope it's on PATH at runtime
    "docker".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerInfo {
    pub available: bool,
    pub installed: bool,
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

/// Public accessors for setup.rs to call without duplicating logic.
pub fn find_docker_pub() -> String { find_docker() }
pub fn docker_cmd_pub() -> Command { docker_cmd() }
pub fn compose_args_pub(project_dir: &PathBuf, profile: Option<&str>) -> Vec<String> {
    compose_args(project_dir, profile)
}

/// Create a `docker` Command with HOST_IP set so docker-compose.yml
/// can resolve ${HOST_IP:-localhost} to the real LAN address.
///
/// Also ensures PATH includes /usr/local/bin so that Docker Compose
/// plugins and other tools are found even in a bundled .app context.
fn docker_cmd() -> Command {
    let docker_bin = find_docker();
    let mut cmd = Command::new(&docker_bin);

    // Ensure PATH is broad enough for the docker CLI to find its
    // compose plugin and other helpers.
    let extra_paths = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    let path = match std::env::var("PATH") {
        Ok(existing) => format!("{}:{}", extra_paths, existing),
        Err(_) => extra_paths.to_string(),
    };
    cmd.env("PATH", path);

    if std::env::var("HOST_IP").is_err() {
        if let Some(ip) = detect_lan_ip() {
            cmd.env("HOST_IP", ip);
        }
    }
    cmd
}

fn compose_args(project_dir: &PathBuf, profile: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "compose".to_string(),
        "-p".to_string(),
        "maestra-core".to_string(), // Match the repo's project name so we reuse existing containers/volumes/networks
        "-f".to_string(),
        project_dir
            .join("docker-compose.yml")
            .to_string_lossy()
            .to_string(),
    ];

    if let Some(p) = profile {
        if p == "full" {
            args.push("--profile".to_string());
            args.push("full".to_string());
        }
    }

    args
}

#[tauri::command]
pub async fn check_docker() -> Result<DockerInfo, DockerError> {
    let docker_bin = find_docker();

    // Broad PATH so docker can find its compose plugin and other helpers
    let extra_paths = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    let path_env = match std::env::var("PATH") {
        Ok(existing) => format!("{}:{}", extra_paths, existing),
        Err(_) => extra_paths.to_string(),
    };

    // Step 1: Check if docker CLI is installed (works without daemon)
    let cli_output = Command::new(&docker_bin)
        .env("PATH", &path_env)
        .args(["--version"])
        .output()
        .await;

    let installed = cli_output.map(|o| o.status.success()).unwrap_or(false);

    if !installed {
        return Ok(DockerInfo {
            available: false,
            installed: false,
            version: String::new(),
            compose_available: false,
            compose_version: String::new(),
        });
    }

    // Step 2: Check if daemon is running (requires Docker Desktop to be started)
    let docker_output = Command::new(&docker_bin)
        .env("PATH", &path_env)
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
        .await
        .map_err(|e| DockerError::with_detail(
            DockerErrorKind::CommandFailed,
            "Failed to check Docker version",
            e.to_string(),
        ))?;

    let docker_available = docker_output.status.success();
    let docker_version = String::from_utf8_lossy(&docker_output.stdout)
        .trim()
        .to_string();

    // Check docker compose
    let compose_output = Command::new(&docker_bin)
        .env("PATH", &path_env)
        .args(["compose", "version", "--short"])
        .output()
        .await
        .map_err(|e| DockerError::with_detail(
            DockerErrorKind::ComposeNotFound,
            "Docker Compose not found",
            e.to_string(),
        ))?;

    let compose_available = compose_output.status.success();
    let compose_version = String::from_utf8_lossy(&compose_output.stdout)
        .trim()
        .to_string();

    Ok(DockerInfo {
        available: docker_available,
        installed: true,
        version: docker_version,
        compose_available,
        compose_version,
    })
}

#[tauri::command]
pub async fn start_services(app: AppHandle, profile: String) -> Result<(), DockerError> {
    let project_dir = get_project_dir(&app);
    let profile_opt = if profile == "starter" {
        None
    } else {
        Some(profile.as_str())
    };

    // Pre-flight: check if images are present
    let image_status = crate::setup::check_images_present_inner(&app, &profile).await;
    if let Ok(ref status) = image_status {
        if !status.all_present && !status.missing.is_empty() {
            // Auto-pull missing images before starting
            let _ = app.emit("start-progress", "Downloading missing services...");
            let pull_result = pull_images_inner(&app, &profile, 5).await;
            if let Err(e) = pull_result {
                return Err(e);
            }
        }
    }

    let mut args = compose_args(&project_dir, profile_opt);
    args.push("up".to_string());
    args.push("-d".to_string());

    // Stream stderr as progress events
    let mut child = docker_cmd()
        .args(&args)
        .current_dir(&project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| DockerError::with_detail(
            DockerErrorKind::StartFailed,
            "Failed to start services",
            e.to_string(),
        ))?;

    let stderr = child.stderr.take().unwrap();
    let reader = BufReader::new(stderr);
    let mut lines = reader.lines();
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit("start-progress", &line);
        }
    });

    let status = child.wait().await.map_err(|e| DockerError::with_detail(
        DockerErrorKind::StartFailed,
        "Failed to start services",
        e.to_string(),
    ))?;

    if !status.success() {
        return Err(DockerError::new(
            DockerErrorKind::StartFailed,
            "Failed to start services. Check the logs for details.",
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_services(app: AppHandle) -> Result<(), DockerError> {
    let project_dir = get_project_dir(&app);
    let mut args = compose_args(&project_dir, Some("full"));
    args.push("down".to_string());

    let output = docker_cmd()
        .args(&args)
        .current_dir(&project_dir)
        .output()
        .await
        .map_err(|e| DockerError::with_detail(
            DockerErrorKind::CommandFailed,
            "Failed to stop services",
            e.to_string(),
        ))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(DockerError::with_detail(
            DockerErrorKind::CommandFailed,
            "Failed to stop services",
            stderr.to_string(),
        ));
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

    let output = docker_cmd()
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

    let mut child = docker_cmd()
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
            // Docker compose log lines are formatted as "container_name  | message"
            // e.g. "maestra-discovery-1  | Starting discovery..."
            // Normalize to compose service name by stripping "maestra-" prefix
            // and "-N" replica suffix.
            let (service, message) = if let Some(idx) = line.find(" | ") {
                let raw = line[..idx].trim();
                let normalized = raw
                    .strip_prefix("maestra-")
                    .unwrap_or(raw);
                // Strip trailing "-N" replica suffix (e.g. "-1", "-2")
                let normalized = if let Some(dash_pos) = normalized.rfind('-') {
                    if normalized[dash_pos + 1..].chars().all(|c| c.is_ascii_digit()) {
                        &normalized[..dash_pos]
                    } else {
                        normalized
                    }
                } else {
                    normalized
                };
                (
                    normalized.to_string(),
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

/// Internal pull logic with retry, used by both the Tauri command and start_services pre-flight.
async fn pull_images_inner(app: &AppHandle, profile: &str, max_attempts: u32) -> Result<PullResult, DockerError> {
    let project_dir = get_project_dir(app);
    let profile_opt = if profile == "starter" { None } else { Some(profile) };

    let mut last_error_kind: Option<DockerErrorKind> = None;

    for attempt in 0..max_attempts {
        if attempt > 0 {
            let delay = backoff_delay(attempt);
            let _ = app.emit("pull-progress", format!("Retry {}/{}: waiting {}s...", attempt, max_attempts - 1, delay.as_secs()));
            tokio::time::sleep(delay).await;
        }

        let mut args = compose_args(&project_dir, profile_opt);
        args.push("pull".to_string());

        let mut child = docker_cmd()
            .args(&args)
            .current_dir(&project_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| DockerError::with_detail(
                DockerErrorKind::PullFailed,
                "Failed to start image download",
                e.to_string(),
            ))?;

        let stderr = child.stderr.take().unwrap();
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        // Collect stderr for error classification while also streaming progress
        let app_clone = app.clone();
        let stderr_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let stderr_clone = stderr_lines.clone();
        tokio::spawn(async move {
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit("pull-progress", &line);
                stderr_clone.lock().await.push(line);
            }
        });

        let status = child.wait().await.map_err(|e| DockerError::with_detail(
            DockerErrorKind::PullFailed,
            "Image download process failed",
            e.to_string(),
        ))?;

        if status.success() {
            return Ok(PullResult {
                success: true,
                pulled: vec![], // compose pull doesn't give per-image detail
                failed: vec![],
                retries_used: attempt,
            });
        }

        // Classify the error from stderr
        let collected = stderr_lines.lock().await;
        let all_stderr = collected.join("\n");
        let error_kind = classify_pull_error(&all_stderr)
            .unwrap_or(DockerErrorKind::PullFailed);

        // If it's a permanent error, stop retrying immediately
        if !should_retry(&error_kind) {
            let message = match &error_kind {
                DockerErrorKind::ImageNotFound => "Service image not available in registry.",
                DockerErrorKind::RegistryAuthFailed => "Docker credential issue. Try: docker logout ghcr.io",
                DockerErrorKind::DiskSpaceLow => "Not enough disk space for download.",
                _ => "Image download failed.",
            };
            return Err(DockerError::with_detail(error_kind, message, all_stderr));
        }

        last_error_kind = Some(error_kind);
    }

    // All retries exhausted
    Err(DockerError::new(
        last_error_kind.unwrap_or(DockerErrorKind::PullFailed),
        format!("Image download failed after {} attempts. Try again when your connection is stable.", max_attempts),
    ))
}

#[tauri::command]
pub async fn pull_images(app: AppHandle, profile: String) -> Result<PullResult, DockerError> {
    pull_images_inner(&app, &profile, 5).await
}

// ─── Diagnostic Export ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn export_diagnostics(app: AppHandle) -> Result<String, DockerError> {
    let project_dir = get_project_dir(&app);
    let mut report = String::new();

    report.push_str("=== Maestra Desktop Diagnostics ===\n");
    report.push_str(&format!("Generated: {}\n", chrono_now()));
    report.push_str(&format!("OS: {} {}\n", std::env::consts::OS, std::env::consts::ARCH));
    report.push_str(&format!("Project dir: {}\n\n", project_dir.display()));

    // Docker info
    report.push_str("--- Docker ---\n");
    match check_docker().await {
        Ok(info) => {
            report.push_str(&format!("Installed: {}\n", info.installed));
            report.push_str(&format!("Available: {}\n", info.available));
            report.push_str(&format!("Version: {}\n", info.version));
            report.push_str(&format!("Compose: {} ({})\n\n", info.compose_available, info.compose_version));
        }
        Err(e) => {
            report.push_str(&format!("Error: {:?} - {}\n\n", e.kind, e.message));
        }
    }

    // Image status
    report.push_str("--- Images ---\n");
    let mut args = compose_args(&project_dir, Some("full"));
    args.extend(["config".to_string(), "--images".to_string()]);
    if let Ok(output) = docker_cmd().args(&args).current_dir(&project_dir).output().await {
        let images = String::from_utf8_lossy(&output.stdout);
        for img in images.lines().filter(|l| !l.trim().is_empty()) {
            // Check if image exists locally
            let inspect = docker_cmd()
                .args(["image", "inspect", "--format", "{{.Id}}", img])
                .output()
                .await;
            let present = inspect.map(|o| o.status.success()).unwrap_or(false);
            report.push_str(&format!("  {} {}\n", if present { "✓" } else { "✗" }, img));
        }
    } else {
        report.push_str("  (could not list images)\n");
    }
    report.push('\n');

    // Port status
    report.push_str("--- Ports ---\n");
    let ports = vec![
        (8080, "Fleet Manager"), (3001, "Dashboard"), (4222, "NATS"),
        (5432, "PostgreSQL"), (6379, "Redis"), (1883, "MQTT"),
        (1880, "Node-RED"), (3000, "Grafana"), (8765, "WebSocket"),
    ];
    for (port, name) in &ports {
        let in_use = std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], *port)),
            std::time::Duration::from_millis(200),
        ).is_ok();
        report.push_str(&format!("  {} :{} ({})\n", if in_use { "●" } else { "○" }, port, name));
    }
    report.push('\n');

    // Service status
    report.push_str("--- Services ---\n");
    match get_service_status(app.clone()).await {
        Ok(services) => {
            for svc in &services {
                report.push_str(&format!("  {} [{}] {}\n", svc.service, svc.state, svc.status));
            }
            if services.is_empty() {
                report.push_str("  (no services running)\n");
            }
        }
        Err(_) => report.push_str("  (could not query services)\n"),
    }
    report.push('\n');

    // NOTE: .env is intentionally excluded to prevent leaking secrets
    report.push_str("--- Note ---\n");
    report.push_str(".env file excluded from diagnostics for security.\n\n");

    // Write to Downloads
    let downloads = dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let filename = format!("maestra-diagnostic-{}.txt", chrono_now().replace(':', "-").replace(' ', "_"));
    let filepath = downloads.join(&filename);

    std::fs::write(&filepath, &report).map_err(|e| DockerError::with_detail(
        DockerErrorKind::CommandFailed,
        "Failed to save diagnostics",
        e.to_string(),
    ))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Simple timestamp without pulling in chrono crate.
fn chrono_now() -> String {
    let output = std::process::Command::new("date")
        .args(["+%Y-%m-%d %H:%M:%S"])
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "unknown".to_string(),
    }
}

// ─── Database Migrations ────────────────────────────────────────────────────

/// Run a SQL command against the database via docker compose exec.
async fn psql_exec(project_dir: &PathBuf, sql: &str) -> Result<String, String> {
    let mut args = compose_args(project_dir, None);
    args.extend([
        "exec".to_string(), "-T".to_string(), "postgres".to_string(),
        "psql".to_string(), "-U".to_string(), "maestra".to_string(),
        "-d".to_string(), "maestra".to_string(),
        "-v".to_string(), "ON_ERROR_STOP=1".to_string(),
        "-t".to_string(), "-A".to_string(),
        "-c".to_string(), sql.to_string(),
    ]);

    let output = docker_cmd()
        .args(&args)
        .current_dir(project_dir)
        .output()
        .await
        .map_err(|e| format!("psql exec failed: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("psql error: {}", stderr))
    }
}

/// Run a SQL file against the database via docker compose exec, piping via stdin.
/// When `strict` is true, ON_ERROR_STOP is set so any SQL error is fatal.
/// When `strict` is false, errors are ignored (useful for idempotent init scripts).
async fn psql_file(project_dir: &PathBuf, sql_content: &str, strict: bool) -> Result<(), String> {
    let mut args = compose_args(project_dir, None);
    args.extend([
        "exec".to_string(), "-T".to_string(), "postgres".to_string(),
        "psql".to_string(), "-U".to_string(), "maestra".to_string(),
        "-d".to_string(), "maestra".to_string(),
    ]);
    if strict {
        args.extend(["-v".to_string(), "ON_ERROR_STOP=1".to_string()]);
    }

    let mut child = docker_cmd()
        .args(&args)
        .current_dir(project_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn psql: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(sql_content.as_bytes()).await.map_err(|e| format!("stdin write failed: {}", e))?;
        drop(stdin);
    }

    let output = child.wait_with_output().await.map_err(|e| format!("psql failed: {}", e))?;
    if strict && !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Migration SQL failed: {}", stderr))
    } else {
        Ok(())
    }
}

/// Wait for Postgres to accept connections, up to ~30 seconds.
async fn wait_for_postgres(project_dir: &PathBuf) -> Result<(), String> {
    for i in 0..15 {
        if i > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
        let mut args = compose_args(project_dir, None);
        args.extend([
            "exec".to_string(), "-T".to_string(), "postgres".to_string(),
            "pg_isready".to_string(), "-U".to_string(), "maestra".to_string(),
        ]);
        let output = docker_cmd()
            .args(&args)
            .current_dir(project_dir)
            .output()
            .await;

        if let Ok(o) = output {
            if o.status.success() {
                return Ok(());
            }
        }
    }
    Err("Postgres did not become ready within 30 seconds".to_string())
}

#[tauri::command]
pub async fn run_migrations(app: AppHandle) -> Result<String, String> {
    let project_dir = get_project_dir(&app);

    // Wait for postgres to be ready
    wait_for_postgres(&project_dir).await?;

    // Run init scripts first — these are idempotent (IF NOT EXISTS, ON CONFLICT
    // DO NOTHING) so they're safe to re-run. This ensures tables like stream_types
    // exist even if the Postgres volume was created before the init script was added.
    let init_dir = project_dir.join("config").join("postgres").join("init");
    if init_dir.exists() {
        let mut init_entries: Vec<_> = std::fs::read_dir(&init_dir)
            .map_err(|e| format!("Cannot read init dir: {}", e))?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "sql").unwrap_or(false))
            .collect();
        init_entries.sort_by_key(|e| e.file_name());

        for entry in init_entries {
            let sql_content = std::fs::read_to_string(entry.path())
                .unwrap_or_default();
            if !sql_content.is_empty() {
                // Non-strict: ignore errors from IF NOT EXISTS / already-exists notices
                let _ = psql_file(&project_dir, &sql_content, false).await;
            }
        }
    }

    // Ensure schema_migrations table exists
    psql_exec(&project_dir,
        "CREATE TABLE IF NOT EXISTS schema_migrations (\
         version VARCHAR(255) PRIMARY KEY, \
         filename VARCHAR(255) NOT NULL, \
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    ).await?;

    // Read migration files from disk
    let migrations_dir = project_dir.join("config").join("postgres").join("migrations");
    if !migrations_dir.exists() {
        return Ok("No migrations directory found — skipping.".to_string());
    }

    let mut entries: Vec<_> = std::fs::read_dir(&migrations_dir)
        .map_err(|e| format!("Cannot read migrations dir: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|ext| ext == "sql").unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    let mut applied = 0;
    let mut skipped = 0;

    for entry in entries {
        let filename = entry.file_name().to_string_lossy().to_string();
        let version = filename.split('_').next().unwrap_or("").to_string();

        // Check if already applied
        let count = psql_exec(&project_dir,
            &format!("SELECT COUNT(*) FROM schema_migrations WHERE version = '{}'", version)
        ).await.unwrap_or_else(|_| "0".to_string());

        if count.trim() != "0" {
            skipped += 1;
            continue;
        }

        // Read and apply the migration
        let sql_content = std::fs::read_to_string(entry.path())
            .map_err(|e| format!("Cannot read {}: {}", filename, e))?;

        psql_file(&project_dir, &sql_content, true).await
            .map_err(|e| format!("Migration {} failed: {}", filename, e))?;

        // Record it
        psql_exec(&project_dir,
            &format!("INSERT INTO schema_migrations (version, filename) VALUES ('{}', '{}')", version, filename)
        ).await.map_err(|e| format!("Failed to record migration {}: {}", filename, e))?;

        applied += 1;
    }

    if applied > 0 {
        Ok(format!("{} migration(s) applied, {} already up to date.", applied, skipped))
    } else {
        Ok(format!("Database is up to date. {} migration(s) already applied.", skipped))
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_pull_error_manifest_unknown() {
        assert_eq!(
            classify_pull_error("Error: manifest unknown: repository name not found"),
            Some(DockerErrorKind::ImageNotFound)
        );
    }

    #[test]
    fn classify_pull_error_not_found() {
        assert_eq!(
            classify_pull_error("error pulling image: not found"),
            Some(DockerErrorKind::ImageNotFound)
        );
    }

    #[test]
    fn classify_pull_error_unauthorized() {
        assert_eq!(
            classify_pull_error("Error response from daemon: unauthorized: authentication required"),
            Some(DockerErrorKind::RegistryAuthFailed)
        );
    }

    #[test]
    fn classify_pull_error_403() {
        assert_eq!(
            classify_pull_error("Error response from daemon: 403 Forbidden"),
            Some(DockerErrorKind::RegistryAuthFailed)
        );
    }

    #[test]
    fn classify_pull_error_denied() {
        assert_eq!(
            classify_pull_error("denied: requested access to the resource is denied"),
            Some(DockerErrorKind::RegistryAuthFailed)
        );
    }

    #[test]
    fn classify_pull_error_timeout() {
        assert_eq!(
            classify_pull_error("net/http: TLS handshake timeout"),
            Some(DockerErrorKind::NetworkTimeout)
        );
    }

    #[test]
    fn classify_pull_error_connection_refused() {
        assert_eq!(
            classify_pull_error("dial tcp: connection refused"),
            Some(DockerErrorKind::NetworkTimeout)
        );
    }

    #[test]
    fn classify_pull_error_disk_full() {
        assert_eq!(
            classify_pull_error("write /var/lib/docker/overlay2: no space left on device"),
            Some(DockerErrorKind::DiskSpaceLow)
        );
    }

    #[test]
    fn classify_pull_error_unknown() {
        assert_eq!(
            classify_pull_error("some random docker error message"),
            None
        );
    }

    #[test]
    fn classify_pull_error_empty() {
        assert_eq!(classify_pull_error(""), None);
    }

    #[test]
    fn should_retry_network_timeout() {
        assert!(should_retry(&DockerErrorKind::NetworkTimeout));
    }

    #[test]
    fn should_retry_command_failed() {
        assert!(should_retry(&DockerErrorKind::CommandFailed));
    }

    #[test]
    fn should_not_retry_image_not_found() {
        assert!(!should_retry(&DockerErrorKind::ImageNotFound));
    }

    #[test]
    fn should_not_retry_auth_failed() {
        assert!(!should_retry(&DockerErrorKind::RegistryAuthFailed));
    }

    #[test]
    fn should_not_retry_disk_space_low() {
        assert!(!should_retry(&DockerErrorKind::DiskSpaceLow));
    }

    #[test]
    fn backoff_delay_attempt_0() {
        assert_eq!(backoff_delay(0), std::time::Duration::from_secs(0));
    }

    #[test]
    fn backoff_delay_attempt_1() {
        assert_eq!(backoff_delay(1), std::time::Duration::from_secs(2));
    }

    #[test]
    fn backoff_delay_attempt_2() {
        assert_eq!(backoff_delay(2), std::time::Duration::from_secs(4));
    }

    #[test]
    fn backoff_delay_attempt_3() {
        assert_eq!(backoff_delay(3), std::time::Duration::from_secs(8));
    }

    #[test]
    fn backoff_delay_attempt_4() {
        assert_eq!(backoff_delay(4), std::time::Duration::from_secs(16));
    }

    #[test]
    fn docker_error_display() {
        let err = DockerError::new(DockerErrorKind::DockerNotRunning, "Docker isn't running");
        assert_eq!(err.to_string(), "Docker isn't running");
    }

    #[test]
    fn docker_error_with_detail() {
        let err = DockerError::with_detail(
            DockerErrorKind::PullFailed,
            "Pull failed",
            "raw stderr output",
        );
        assert_eq!(err.kind, DockerErrorKind::PullFailed);
        assert_eq!(err.message, "Pull failed");
        assert_eq!(err.detail.unwrap(), "raw stderr output");
    }
}
