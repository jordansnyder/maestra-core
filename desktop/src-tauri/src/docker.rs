use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

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
pub async fn check_docker() -> Result<DockerInfo, String> {
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
        .map_err(|e| format!("Docker not found: {}", e))?;

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
        .map_err(|e| format!("Docker Compose not found: {}", e))?;

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

    let output = docker_cmd()
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

    let output = docker_cmd()
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

    let mut child = docker_cmd()
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

/// Run a SQL command against the database via docker compose exec.
async fn psql_exec(project_dir: &PathBuf, sql: &str) -> Result<String, String> {
    let compose_file = project_dir.join("docker-compose.yml").to_string_lossy().to_string();
    let output = docker_cmd()
        .args([
            "compose", "-f", &compose_file,
            "exec", "-T", "postgres",
            "psql", "-U", "maestra", "-d", "maestra",
            "-v", "ON_ERROR_STOP=1", "-t", "-A",
            "-c", sql,
        ])
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
async fn psql_file(project_dir: &PathBuf, sql_content: &str) -> Result<(), String> {
    let compose_file = project_dir.join("docker-compose.yml").to_string_lossy().to_string();
    let mut child = docker_cmd()
        .args([
            "compose", "-f", &compose_file,
            "exec", "-T", "postgres",
            "psql", "-U", "maestra", "-d", "maestra",
            "-v", "ON_ERROR_STOP=1",
        ])
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
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Migration SQL failed: {}", stderr))
    }
}

/// Wait for Postgres to accept connections, up to ~30 seconds.
async fn wait_for_postgres(project_dir: &PathBuf) -> Result<(), String> {
    for i in 0..15 {
        if i > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
        let compose_file = project_dir.join("docker-compose.yml").to_string_lossy().to_string();
        let output = docker_cmd()
            .args([
                "compose", "-f", &compose_file,
                "exec", "-T", "postgres",
                "pg_isready", "-U", "maestra",
            ])
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

        psql_file(&project_dir, &sql_content).await
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
