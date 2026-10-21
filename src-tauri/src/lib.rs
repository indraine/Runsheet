mod domain;
mod ingress;
mod ipc;
mod pipeline;
mod platform;
mod services;
pub mod startup;

use tauri::Manager;

use ipc::{acc_install, launch_acc, listen_laps};
use startup::{ProbeFailure, StartupProbes};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            listen_laps,
            acc_install,
            launch_acc
        ])
        .setup(|app| {
            // Воркер не стартует, пока каталог данных и размер памяти не подтверждены.
            let dir = app.path().app_data_dir().map_err(|error| {
                ProbeFailure::new("каталог данных приложения недоступен", error.to_string())
            })?;
            StartupProbes::verify_storage_dir(&dir)?;
            StartupProbes::verify_memory_layout()?;
            let outbox = ipc::Outbox::new(app.handle().clone());
            app.manage(outbox.clone());
            let journal = dir.join("frames");
            pipeline::spawn_reader(outbox, journal);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
