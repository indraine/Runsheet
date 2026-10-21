//! Пачка круга. Страница получает `ArrayBuffer`, не JSON-массив чисел.

use std::sync::{Arc, Mutex};

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};

use super::status::{ACC_STATUS, Status};

struct LapGate {
    channel: Option<Channel<InvokeResponseBody>>,
    /// Последняя пачка, если страница ещё не вызвала `listen_laps`.
    pending: Option<Vec<u8>>,
}

/// Куда поток чтения кладёт статус и пачки.
#[derive(Clone)]
pub(crate) struct Outbox {
    app: AppHandle,
    laps: Arc<Mutex<LapGate>>,
}

impl Outbox {
    pub(crate) fn new(app: AppHandle) -> Self {
        Self {
            app,
            laps: Arc::new(Mutex::new(LapGate {
                channel: None,
                pending: None,
            })),
        }
    }

    pub(crate) fn emit_status(&self, status: &Status) {
        let _ = self.app.emit(ACC_STATUS, status);
    }

    /// Кладёт пачку. Если канал уже есть, байты уходят сразу, иначе заменяют предыдущие.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub(crate) fn send_lap(&self, bytes: Vec<u8>) {
        self.laps.lock().expect("канал пачек круга").pending = Some(bytes);
        self.drain();
    }

    /// Отдаёт последнюю пачку, когда подписка появилась между тиками.
    pub(crate) fn drain(&self) {
        let ready = {
            let mut gate = self.laps.lock().expect("канал пачек круга");
            let channel = gate.channel.clone();
            let bytes = if channel.is_some() {
                gate.pending.take()
            } else {
                None
            };
            channel.zip(bytes)
        };
        let Some((channel, bytes)) = ready else {
            return;
        };
        // `Raw`, чтобы страница получила ArrayBuffer, а не JSON-массив чисел.
        if channel.send(InvokeResponseBody::Raw(bytes)).is_err() {
            self.laps.lock().expect("канал пачек круга").channel = None;
        }
    }

    fn listen(&self, channel: Channel<InvokeResponseBody>) {
        self.laps.lock().expect("канал пачек круга").channel = Some(channel);
        self.drain();
    }
}

/// Подписка на пачки круга. Аргумент `channel` — `Channel` с фронта.
#[tauri::command]
pub(crate) fn listen_laps(outbox: State<'_, Outbox>, channel: Channel<InvokeResponseBody>) {
    outbox.listen(channel);
}
