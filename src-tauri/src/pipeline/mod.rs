//! Кадры от shared memory до UI и журнала.
//!
//! Производитель — отдельный поток. Потребитель — задача `tauri::async_runtime`.
//! В журнал не пишутся сессии и круги: их единственное хранилище — IndexedDB
//! после `listen_laps`.

mod broadcast;
mod reader;
mod ring;
mod sequencer;
mod storage;

#[cfg(test)]
mod fixture;

use std::path::PathBuf;
use std::time::Instant;

use crate::ipc::{self, Capture, LinkState};
use crate::platform::game;

pub(crate) use ring::TelemetryRing;

use ring::{Envelope, PipeBody};
use sequencer::{Moment, Outcome, Sequencer};
use storage::Journal;

/// Забирает кольцо: выезд, круг, журнал, `acc-status` и пачка `listen_laps`.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) async fn run_consumer(ring: TelemetryRing, outbox: ipc::Outbox, journal_dir: PathBuf) {
    let mut sequencer = Sequencer::default();
    let mut journal = Journal::new(journal_dir);
    let clock = HostClock::start();
    while let Some(envelope) = ring.recv().await {
        let link = envelope.link;
        let process_running = envelope.process_running;
        let moment = Moment {
            mono_ms: clock.mono_ms(),
            wall_ms: wall_ms(),
            write_busy: journal.busy(),
        };
        let mut outcome = step(&mut sequencer, envelope, moment);
        if outcome.stale {
            continue;
        }
        let flushes = std::mem::take(&mut outcome.flushes);
        for batch in flushes {
            if journal.busy() {
                journal.wait().await;
            }
            journal.spawn(batch);
        }
        publish(&outbox, link, process_running, &outcome);
    }
}

fn step(sequencer: &mut Sequencer, envelope: Envelope, moment: Moment) -> Outcome {
    match envelope.body {
        PipeBody::Tick(tick) => sequencer.on_tick(tick, false, moment),
        PipeBody::Resync(tick) => sequencer.on_tick(tick, true, moment),
        PipeBody::Absent => sequencer.on_absent(moment),
    }
}

fn publish(outbox: &ipc::Outbox, link: LinkState, process_running: bool, outcome: &Outcome) {
    if outcome.emit_status {
        let snap = &outcome.snap;
        outbox.emit_status(&ipc::Status::capture(Capture {
            link,
            presence: game::presence(link == LinkState::Linked, snap.in_session, process_running),
            packet_id: snap.packet_id,
            outing_id: snap.outing_id,
            session: snap.session.as_ref(),
            lap_number: snap.lap_number,
            sector: snap.sector,
            speed: snap.speed,
            air_temp: snap.air_c,
            road_temp: snap.road_c,
            events: &outcome.outing_events,
        }));
    }
    if let Some(bytes) = outcome.lap.clone() {
        outbox.send_lap(bytes);
    } else {
        outbox.drain();
    }
}

struct HostClock {
    start: Instant,
}

impl HostClock {
    fn start() -> Self {
        Self {
            start: Instant::now(),
        }
    }

    fn mono_ms(&self) -> u64 {
        u64::try_from(self.start.elapsed().as_millis()).unwrap_or(u64::MAX)
    }
}

fn wall_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// Точка входа потока чтения. На не-Windows круги не пишутся.
pub(crate) fn spawn_reader(outbox: ipc::Outbox, journal_dir: PathBuf) {
    #[cfg(windows)]
    {
        let ring = TelemetryRing::new();
        let incoming = ring.clone();
        tauri::async_runtime::spawn(async move {
            run_consumer(incoming, outbox, journal_dir).await;
        });
        std::thread::spawn(move || reader::run(ring));
    }
    #[cfg(not(windows))]
    {
        let _ = journal_dir;
        std::thread::spawn(move || reader::run_without_acc(outbox));
    }
}
