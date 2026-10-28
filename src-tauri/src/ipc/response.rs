use serde::Serialize;

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
