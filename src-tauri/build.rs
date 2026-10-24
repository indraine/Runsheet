/// tauri-build вшивает `icon.ico` в ресурс exe, но сам следит только за `tauri.conf.json`.
const WINDOWS_ICON: &str = "icons/icon.ico";

fn main() {
    println!("cargo:rerun-if-changed={WINDOWS_ICON}");
    tauri_build::build()
}
