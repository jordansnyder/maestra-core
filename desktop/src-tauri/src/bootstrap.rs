//! First-run bootstrap: extract embedded project files to the app data directory.
//!
//! The desktop app is self-contained — all config files, compose definitions,
//! and SQL migrations are compiled into the binary at build time. On first
//! launch (or when the app is updated), they are extracted to a writable
//! project directory under the OS-standard app data path.

use include_dir::{include_dir, Dir};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// ---------------------------------------------------------------------------
// Embedded assets (resolved at compile time relative to CARGO_MANIFEST_DIR)
// ---------------------------------------------------------------------------

/// All files under repo-root/config/
static CONFIG_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../config");

/// All files under repo-root/flows/
static FLOWS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../flows");

/// Desktop-specific standalone compose file (no source-code volume mounts)
const COMPOSE_YML: &str = include_str!("../resources/compose.yml");

/// Default environment config template
const ENV_EXAMPLE: &str = include_str!("../../../.env.example");

/// Sentinel written after a successful bootstrap so we can detect app updates
const BOOTSTRAP_VERSION: &str = env!("CARGO_PKG_VERSION");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Return the project directory, bootstrapping it if necessary.
/// Called once during app startup from `lib.rs`.
pub fn ensure_project(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
    let project_dir = data_dir.join("project");

    if needs_bootstrap(&project_dir) {
        bootstrap(&project_dir)?;
    }

    Ok(project_dir)
}

/// Return the project directory path (already bootstrapped).
pub fn project_dir(app: &AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("project")
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/// Check whether we need to (re-)extract files.
fn needs_bootstrap(project_dir: &Path) -> bool {
    let sentinel = project_dir.join(".maestra_version");
    match std::fs::read_to_string(&sentinel) {
        Ok(v) => v.trim() != BOOTSTRAP_VERSION,
        Err(_) => true,
    }
}

/// Extract all embedded files into `project_dir`.
fn bootstrap(project_dir: &Path) -> Result<(), String> {
    // Create the project directory tree
    std::fs::create_dir_all(project_dir)
        .map_err(|e| format!("Cannot create project dir: {}", e))?;

    // 1. docker-compose.yml (always overwrite — may have been updated)
    std::fs::write(project_dir.join("docker-compose.yml"), COMPOSE_YML)
        .map_err(|e| format!("Cannot write docker-compose.yml: {}", e))?;

    // 2. .env.example (always overwrite — template may have new vars)
    std::fs::write(project_dir.join(".env.example"), ENV_EXAMPLE)
        .map_err(|e| format!("Cannot write .env.example: {}", e))?;

    // 3. .env — create from template only if it doesn't already exist
    //    (preserve user customizations across updates)
    let env_path = project_dir.join(".env");
    if !env_path.exists() {
        std::fs::write(&env_path, ENV_EXAMPLE)
            .map_err(|e| format!("Cannot write .env: {}", e))?;
    }

    // 4. config/ directory (always overwrite — dashboards, SQL, etc. may change)
    let config_target = project_dir.join("config");
    extract_dir(&CONFIG_DIR, &config_target)?;

    // 5. flows/ directory (only write if directory is empty / doesn't exist —
    //    user may have customized Node-RED flows)
    let flows_target = project_dir.join("flows");
    if !flows_target.join("flows.json").exists() {
        extract_dir(&FLOWS_DIR, &flows_target)?;
    }

    // 6. Write version sentinel
    std::fs::write(
        project_dir.join(".maestra_version"),
        BOOTSTRAP_VERSION,
    )
    .map_err(|e| format!("Cannot write version sentinel: {}", e))?;

    Ok(())
}

/// Recursively extract an embedded Dir to a filesystem path.
fn extract_dir(dir: &Dir<'_>, target: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target)
        .map_err(|e| format!("Cannot create {}: {}", target.display(), e))?;

    for file in dir.files() {
        let dest = target.join(file.path());
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create {}: {}", parent.display(), e))?;
        }
        std::fs::write(&dest, file.contents())
            .map_err(|e| format!("Cannot write {}: {}", dest.display(), e))?;
    }

    for sub in dir.dirs() {
        extract_dir(sub, target)?;
    }

    Ok(())
}
