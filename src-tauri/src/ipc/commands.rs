//! Команды запуска ACC. Каждая только зовёт платформу и отдаёт конверт.

use super::response::IpcResponse;
use crate::platform::game;

/// Путь к exe ACC, если установка нашлась. Нет файла — `data: null`.
#[tauri::command]
pub(crate) fn acc_install() -> IpcResponse<Option<String>> {
    let path = game::find_executable().map(|path| path.to_string_lossy().into_owned());
    IpcResponse::success(path)
}

/// Запускает найденную ACC. «Не найдена» несёт hint, где искали Steam.
#[tauri::command]
pub(crate) fn launch_acc() -> IpcResponse<()> {
    game::launch().map_or_else(
        |error| IpcResponse::failure(error.message, error.hint),
        IpcResponse::success,
    )
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
