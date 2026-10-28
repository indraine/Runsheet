#![cfg_attr(not(any(windows, test)), allow(dead_code))]

use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::{Notify, mpsc};

use crate::ingress::CleanTick;
use crate::ipc::LinkState;

const CAPACITY: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PushResult {
    Fresh,
    Coalesced,
}

#[derive(Debug)]
pub(crate) enum PipeBody {
    Tick(CleanTick),
    Resync(CleanTick),
    Absent,
}

#[derive(Debug)]
pub(crate) struct Envelope {
    pub link: LinkState,
    pub game_running: bool,
    pub body: PipeBody,
}

struct Inner {
    tx: mpsc::Sender<Envelope>,
    rx: Mutex<mpsc::Receiver<Envelope>>,
    notify: Notify,
    coalesced: AtomicU64,
    link: AtomicU8,
    game_running: AtomicBool,
}

#[derive(Clone)]
pub(crate) struct TelemetryRing {
    inner: Arc<Inner>,
}

impl TelemetryRing {
    pub(crate) fn new() -> Self {
        let (tx, rx) = mpsc::channel(CAPACITY);
        Self {
            inner: Arc::new(Inner {
                tx,
                rx: Mutex::new(rx),
                notify: Notify::new(),
                coalesced: AtomicU64::new(0),
                link: AtomicU8::new(link_code(LinkState::Unavailable)),
                game_running: AtomicBool::new(false),
            }),
        }
    }

    pub(crate) fn bind(&self, link: LinkState) {
        self.inner.link.store(link_code(link), Ordering::Relaxed);
    }

    pub(crate) fn note_game_running(&self, running: bool) {
        self.inner.game_running.store(running, Ordering::Relaxed);
    }

    pub(crate) fn try_push(&self, tick: CleanTick) -> PushResult {
        self.enqueue(PipeBody::Tick(tick))
    }

    pub(crate) fn try_push_resync(&self, tick: CleanTick) -> PushResult {
        self.enqueue(PipeBody::Resync(tick))
    }

    pub(crate) fn push_absent(&self) -> PushResult {
        self.enqueue(PipeBody::Absent)
    }

    pub(crate) async fn recv(&self) -> Option<Envelope> {
        loop {
            {
                let mut rx = self.inner.rx.lock().expect("очередь кадров");
                match rx.try_recv() {
                    Ok(envelope) => return Some(envelope),
                    Err(mpsc::error::TryRecvError::Disconnected) => return None,
                    Err(mpsc::error::TryRecvError::Empty) => {}
                }
            }
            self.inner.notify.notified().await;
        }
    }

    fn enqueue(&self, body: PipeBody) -> PushResult {
        let envelope = Envelope {
            link: link_from(self.inner.link.load(Ordering::Relaxed)),
            game_running: self.inner.game_running.load(Ordering::Relaxed),
            body,
        };
        let result = {
            let mut rx = self.inner.rx.lock().expect("очередь кадров");
            match self.inner.tx.try_send(envelope) {
                Ok(()) => PushResult::Fresh,
                Err(mpsc::error::TrySendError::Closed(_)) => PushResult::Coalesced,
                Err(mpsc::error::TrySendError::Full(envelope)) => {
                    let _ = rx.try_recv();
                    self.inner.coalesced.fetch_add(1, Ordering::Relaxed);
                    let _ = self.inner.tx.try_send(envelope);
                    PushResult::Coalesced
                }
            }
        };
        self.inner.notify.notify_one();
        result
    }
}

fn link_code(link: LinkState) -> u8 {
    match link {
        LinkState::Unavailable => 0,
        LinkState::Linked => 1,
        LinkState::Lost => 2,
    }
}

fn link_from(code: u8) -> LinkState {
    match code {
        1 => LinkState::Linked,
        2 => LinkState::Lost,
        _ => LinkState::Unavailable,
    }
}
