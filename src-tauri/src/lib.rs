mod domain;
mod game;
mod ingress;
mod ipc;
mod lap;
mod reader;
mod session;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Путь к exe ACC, если установка нашлась. Нет файла — `null`.
#[tauri::command]
fn acc_install() -> Option<String> {
    game::find_executable().map(|path| path.to_string_lossy().into_owned())
}

/// Запускает найденную ACC. Ошибка, если файла нет или процесс не стартовал.
#[tauri::command]
fn launch_acc() -> Result<(), String> {
    game::launch()
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
            let outbox = ipc::Outbox::new(app.handle().clone());
            app.manage(outbox.clone());
            std::thread::spawn(move || reader::run(outbox));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
