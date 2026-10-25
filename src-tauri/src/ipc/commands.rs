
use super::response::IpcResponse;
use crate::platform::game;

#[tauri::command]
pub(crate) fn acc_install() -> IpcResponse<Option<String>> {
    let path = game::find_executable().map(|path| path.to_string_lossy().into_owned());
    IpcResponse::success(path)
}

#[tauri::command]
pub(crate) fn launch_acc() -> IpcResponse<()> {
    game::launch().map_or_else(
        |error| IpcResponse::failure(error.message, error.hint),
        IpcResponse::success,
    )
}

#[tauri::command]
pub(crate) fn save_text_file(default_name: String, contents: String) -> IpcResponse<bool> {
    let Some(path) = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return IpcResponse::success(false);
    };
    match std::fs::write(&path, contents) {
        Ok(()) => IpcResponse::success(true),
        Err(error) => IpcResponse::failure(error.to_string(), path.display().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(not(windows))]
    fn without_windows_install_is_null_and_launch_names_steam() {
        let install = serde_json::to_value(acc_install()).expect("ответ сериализуется");
        assert_eq!(install["status"], "success");
        assert!(install["data"].is_null());

        let launch = serde_json::to_value(launch_acc()).expect("ответ сериализуется");
        assert_eq!(launch["status"], "error");
        assert_eq!(launch["message"], "ACC не найдена");
        let hint = launch["hint"].as_str().expect("hint — строка");
        assert!(hint.contains("Steam"));
        assert!(hint.contains("libraryfolders.vdf"));
    }
}
