mod domain;
mod ingress;
mod ipc;
mod lap;
mod platform;
mod reader;
mod session;
pub mod startup;

use tauri::Manager;

use startup::{ProbeFailure, StartupProbes};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Путь к exe ACC, если установка нашлась. Нет файла — `null`.
#[tauri::command]
fn acc_install() -> Option<String> {
    platform::game::find_executable().map(|path| path.to_string_lossy().into_owned())
}

/// Запускает найденную ACC. Ошибка, если файла нет или процесс не стартовал.
#[tauri::command]
fn launch_acc() -> Result<(), String> {
    platform::game::launch()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ipc::listen_laps,
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
            std::thread::spawn(move || reader::run(outbox));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
