
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

    #[cfg(test)]
    pub(crate) fn coalesced(&self) -> u64 {
        self.inner.coalesced.load(Ordering::Relaxed)
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

    #[cfg(test)]
    pub(crate) fn try_recv(&self) -> Option<Envelope> {
        self.inner
            .rx
            .lock()
            .expect("очередь кадров")
            .try_recv()
            .ok()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::fixture::TickDraft;

    fn tick(packet_id: i32) -> CleanTick {
        TickDraft {
            packet_id,
            ..TickDraft::default()
        }
        .build()
    }

    fn packet_of(envelope: &Envelope) -> Option<i32> {
        match &envelope.body {
            PipeBody::Tick(tick) | PipeBody::Resync(tick) => Some(tick.physics.packet_id),
            PipeBody::Absent => None,
        }
    }

    #[test]
    fn full_ring_drops_the_oldest_and_keeps_the_newest() {
        let ring = TelemetryRing::new();
        for id in 0..CAPACITY as i32 {
            assert_eq!(ring.try_push(tick(id)), PushResult::Fresh);
        }
        assert_eq!(ring.try_push(tick(CAPACITY as i32)), PushResult::Coalesced);
        assert_eq!(ring.coalesced(), 1);

        let first = packet_of(&ring.try_recv().expect("oldest kept")).expect("tick");
        assert_eq!(first, 1);
        let mut last = first;
        let mut count = 1;
        while let Some(envelope) = ring.try_recv() {
            last = packet_of(&envelope).expect("tick");
            count += 1;
        }
        assert_eq!(count, CAPACITY);
        assert_eq!(last, CAPACITY as i32);
    }

    #[test]
    fn absent_and_resync_keep_the_link_they_were_bound_with() {
        let ring = TelemetryRing::new();
        ring.bind(LinkState::Lost);
        assert_eq!(ring.push_absent(), PushResult::Fresh);
        ring.bind(LinkState::Linked);
        ring.note_game_running(true);
        assert_eq!(ring.try_push_resync(tick(7)), PushResult::Fresh);

        let absent = ring.try_recv().expect("absent");
        assert!(matches!(absent.body, PipeBody::Absent));
        assert_eq!(absent.link, LinkState::Lost);
        assert!(!absent.game_running);

        let resync = ring.try_recv().expect("resync");
        assert!(matches!(resync.body, PipeBody::Resync(_)));
        assert_eq!(resync.link, LinkState::Linked);
        assert!(resync.game_running);
        assert_eq!(packet_of(&resync), Some(7));
    }

    #[tokio::test]
    async fn recv_waits_until_a_tick_arrives() {
        let ring = TelemetryRing::new();
        ring.bind(LinkState::Linked);
        assert_eq!(ring.try_push(tick(3)), PushResult::Fresh);
        let envelope = ring.recv().await.expect("tick");
        assert_eq!(packet_of(&envelope), Some(3));
        assert_eq!(envelope.link, LinkState::Linked);
    }
}
