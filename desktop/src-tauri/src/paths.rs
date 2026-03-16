use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Find the Maestra project root by walking up from cwd looking for docker-compose.yml.
/// In dev mode this finds the repo root. In production, falls back to the bundled resource dir.
pub fn project_dir(app: &AppHandle) -> PathBuf {
    // Walk up from current directory looking for docker-compose.yml
    if let Ok(mut dir) = std::env::current_dir() {
        for _ in 0..5 {
            if dir.join("docker-compose.yml").exists() {
                return dir;
            }
            if !dir.pop() {
                break;
            }
        }
    }

    // Production fallback: app data directory (where we extract bundled resources)
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}
