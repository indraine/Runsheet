//! Конверт команд. Событие `acc-status` и байты пачки в него не заворачиваются.

use serde::Serialize;

/// Успех несёт `data`. Ошибка несёт `message` и `hint`.
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum IpcResponse<T> {
    Success { data: T },
    Error { message: String, hint: String },
}

impl<T> IpcResponse<T> {
    pub(crate) fn success(data: T) -> Self {
        Self::Success { data }
    }

    pub(crate) fn failure(message: impl Into<String>, hint: impl Into<String>) -> Self {
        Self::Error {
            message: message.into(),
            hint: hint.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_envelope_carries_message_and_hint() {
        let body = IpcResponse::<()>::failure("ACC не найдена", "искали в библиотеках Steam");
        let json = serde_json::to_value(&body).expect("конверт сериализуется");
        assert_eq!(
            json,
            serde_json::json!({
                "status": "error",
                "message": "ACC не найдена",
                "hint": "искали в библиотеках Steam",
            })
        );
    }

    #[test]
    fn success_envelope_carries_data() {
        let found = IpcResponse::success(Some("C:\\ACC\\AC2-Win64-Shipping.exe".to_owned()));
        let json = serde_json::to_value(&found).expect("конверт сериализуется");
        assert_eq!(json["status"], "success");
        assert_eq!(json["data"], "C:\\ACC\\AC2-Win64-Shipping.exe");

        let empty = IpcResponse::success(());
        let json = serde_json::to_value(&empty).expect("пустой успех сериализуется");
        assert_eq!(json["status"], "success");
        assert!(json["data"].is_null());
    }
}
