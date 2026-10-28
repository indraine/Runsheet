use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tauri::State;
use tauri::ipc::{Channel, InvokeResponseBody};

use super::status::Status;

struct LapGate {
    channel: Option<Channel<InvokeResponseBody>>,
    queue: VecDeque<Vec<u8>>,
}

struct StatusGate {
    channel: Option<Channel<Status>>,
    last: Option<Status>,
    queue: VecDeque<Status>,
}

#[derive(Clone)]
pub(crate) struct Outbox {
    laps: Arc<Mutex<LapGate>>,
    status: Arc<Mutex<StatusGate>>,
}

impl Outbox {
    pub(crate) fn new() -> Self {
        Self {
            laps: Arc::new(Mutex::new(LapGate {
                channel: None,
                queue: VecDeque::new(),
            })),
            status: Arc::new(Mutex::new(StatusGate {
                channel: None,
                last: None,
                queue: VecDeque::new(),
            })),
        }
    }

    pub(crate) fn emit_status(&self, status: &Status) {
        {
            let mut gate = self.status.lock().expect("канал статуса ACC");
            gate.last = Some(status.clone());
            gate.queue.push_back(status.clone());
        }
        self.drain_status();
    }

    fn drain_status(&self) {
        loop {
            let ready = {
                let mut gate = self.status.lock().expect("канал статуса ACC");
                let Some(channel) = gate.channel.clone() else {
                    return;
                };
                let Some(status) = gate.queue.pop_front() else {
                    return;
                };
                gate.last = Some(status.clone());
                (channel, status)
            };
            let (channel, status) = ready;
            if channel.send(status).is_err() {
                self.status.lock().expect("канал статуса ACC").channel = None;
                return;
            }
        }
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    pub(crate) fn send_lap(&self, bytes: Vec<u8>) {
        self.laps
            .lock()
            .expect("канал пачек круга")
            .queue
            .push_back(bytes);
        self.drain();
    }

    pub(crate) fn drain(&self) {
        loop {
            let ready = {
                let mut gate = self.laps.lock().expect("канал пачек круга");
                let Some(channel) = gate.channel.clone() else {
                    return;
                };
                let Some(bytes) = gate.queue.pop_front() else {
                    return;
                };
                (channel, bytes)
            };
            let (channel, bytes) = ready;
            if channel.send(InvokeResponseBody::Raw(bytes)).is_err() {
                self.laps.lock().expect("канал пачек круга").channel = None;
                return;
            }
        }
    }

    fn listen_laps(&self, channel: Channel<InvokeResponseBody>) {
        self.laps.lock().expect("канал пачек круга").channel = Some(channel);
        self.drain();
    }

    fn listen_status(&self, channel: Channel<Status>) {
        {
            let mut gate = self.status.lock().expect("канал статуса ACC");
            gate.channel = Some(channel);
            if gate.queue.is_empty() {
                if let Some(last) = gate.last.clone() {
                    gate.queue.push_back(last);
                }
            }
        }
        self.drain_status();
    }
}

#[tauri::command]
pub(crate) fn listen_laps(outbox: State<'_, Outbox>, channel: Channel<InvokeResponseBody>) {
    outbox.listen_laps(channel);
}

#[tauri::command]
pub(crate) fn listen_status(outbox: State<'_, Outbox>, channel: Channel<Status>) {
    outbox.listen_status(channel);
}
