//! Бэкенд: читает shared memory ACC, собирает выезды и круги, отдаёт их в UI.
//!
//! Сырые страницы ACC остаются в `ingress`. `domain` — чистые типы. `pipeline` сэмплирует и ведёт последовательность.
//! `services` держит состояние выезда и круга. `ipc` — тонкий мост Tauri. `platform` находит и
//! запускает игру. `startup` отказывается стартовать, если раскладка shared memory не совпала.

mod domain;
mod ingress;
mod ipc;
mod pipeline;
mod platform;
mod services;
pub mod startup;

use tauri::Manager;

use ipc::{acc_install, launch_acc, listen_laps, listen_status, save_file};
use startup::StartupProbes;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            listen_laps,
            listen_status,
            acc_install,
            launch_acc,
            save_file
        ])
        .setup(|app| {
            StartupProbes::verify_memory_layout()?;
            let outbox = ipc::Outbox::new();
            app.manage(outbox.clone());
            pipeline::spawn_reader(outbox);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
