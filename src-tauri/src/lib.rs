mod ipc;
mod lap;
mod reader;
mod session;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, ipc::listen_laps])
        .setup(|app| {
            let outbox = ipc::Outbox::new(app.handle().clone());
            app.manage(outbox.clone());
            std::thread::spawn(move || reader::run(outbox));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
