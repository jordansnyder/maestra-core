use std::path::PathBuf;
use tauri::AppHandle;

fn env_path(app: &AppHandle) -> PathBuf {
    crate::paths::project_dir(app).join(".env")
}

fn env_example_path(app: &AppHandle) -> PathBuf {
    crate::paths::project_dir(app).join(".env.example")
}

#[tauri::command]
pub async fn read_env(app: AppHandle) -> Result<String, String> {
    let path = env_path(&app);
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read .env at {}: {}", path.display(), e))
}

#[tauri::command]
pub async fn write_env(app: AppHandle, content: String) -> Result<(), String> {
    let path = env_path(&app);
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write .env at {}: {}", path.display(), e))
}

#[tauri::command]
pub async fn init_env(app: AppHandle) -> Result<bool, String> {
    let env = env_path(&app);
    if env.exists() {
        return Ok(false); // Already exists
    }

    let example = env_example_path(&app);
    if !example.exists() {
        return Err(format!(".env.example not found at {}", example.display()));
    }

    // Ensure parent directory exists
    if let Some(parent) = env.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::copy(&example, &env)
        .map_err(|e| format!("Failed to copy .env.example to .env: {}", e))?;

    Ok(true) // Created new .env
}

#[tauri::command]
pub async fn get_env_path(app: AppHandle) -> Result<String, String> {
    Ok(env_path(&app).to_string_lossy().to_string())
}
