//! Тонкие обработчики команд: найти ACC, запустить её, сохранить файл, который UI уже собрал.

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
pub(crate) fn save_file(request: tauri::ipc::Request<'_>) -> IpcResponse<bool> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return IpcResponse::failure("the file arrived without a body", "");
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned()
    };
    let name = header("x-file-name");
    let label = header("x-file-label");
    let extension = header("x-file-extension");
    let Some(path) = rfd::FileDialog::new()
        .set_file_name(&name)
        .add_filter(&label, &[extension.as_str()])
        .save_file()
    else {
        return IpcResponse::success(false);
    };
    match std::fs::write(&path, bytes) {
        Ok(()) => IpcResponse::success(true),
        Err(error) => IpcResponse::failure(error.to_string(), path.display().to_string()),
    }
}
