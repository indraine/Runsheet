// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use acc_shared_memory_rs::ACCSharedMemory;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = handle;

                let mut acc = match ACCSharedMemory::new() {
                    Ok(acc) => acc,
                    Err(error) => {
                        eprintln!("ACC shared memory: {error}");
                        return;
                    }
                };

                loop {
                    if let Ok(Some(data)) = acc.read_shared_memory() {
                        println!(
                            "Speed: {:.2} km/h, RPM: {}",
                            data.physics.speed_kmh, data.physics.rpm
                        );
                    }

                    std::thread::sleep(std::time::Duration::from_millis(16));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
