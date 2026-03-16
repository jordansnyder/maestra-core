mod docker;
mod env_editor;
mod health;
mod paths;
mod setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Docker management
            docker::check_docker,
            docker::start_services,
            docker::stop_services,
            docker::get_service_status,
            docker::stream_logs,
            docker::pull_images,
            docker::run_migrations,
            // Health checking
            health::check_service_health,
            // Environment file management
            env_editor::read_env,
            env_editor::write_env,
            env_editor::init_env,
            env_editor::get_env_path,
            // Setup & port checking
            setup::check_setup,
            setup::check_ports,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Maestra Desktop");
}
