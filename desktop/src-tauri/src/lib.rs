mod bootstrap;
pub mod docker;
mod env_editor;
mod health;
mod paths;
pub mod setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Extract bundled project files to app data dir on first run
            // (or when the app version changes).
            if let Err(e) = bootstrap::ensure_project(&app.handle()) {
                eprintln!("Bootstrap error: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Docker management
            docker::check_docker,
            docker::start_services,
            docker::stop_services,
            docker::get_service_status,
            docker::stream_logs,
            docker::pull_images,
            docker::run_migrations,
            docker::export_diagnostics,
            // Health checking
            health::check_service_health,
            // Environment file management
            env_editor::read_env,
            env_editor::write_env,
            env_editor::init_env,
            env_editor::get_env_path,
            // Setup, readiness & port checking
            setup::check_setup,
            setup::check_ports,
            setup::get_project_path,
            setup::check_images_present,
            setup::check_network,
            setup::check_disk_space,
            setup::get_saved_profile,
            setup::save_profile,
            setup::startup_readiness_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Maestra Desktop");
}
