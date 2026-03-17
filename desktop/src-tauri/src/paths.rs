use std::path::PathBuf;
use tauri::AppHandle;

/// Return the project directory where docker-compose.yml, config/, .env, etc. live.
/// This is the bootstrapped app data directory — fully self-contained.
pub fn project_dir(app: &AppHandle) -> PathBuf {
    crate::bootstrap::project_dir(app)
}
