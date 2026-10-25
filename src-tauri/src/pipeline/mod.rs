
mod broadcast;
mod reader;
mod ring;
mod sequencer;

use std::time::Instant;

use crate::domain::SessionPlace;
use crate::ipc::{self, Capture, LinkState};
use crate::platform::game;

pub(crate) use ring::TelemetryRing;

use ring::{Envelope, PipeBody};
use sequencer::{Moment, Outcome, Sequencer};

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) async fn run_consumer(ring: TelemetryRing, outbox: ipc::Outbox) {
    let mut sequencer = Sequencer::default();
    let mut last_presence = None;
    let mut last_place = SessionPlace::Menu;
    let clock = HostClock::start();
    while let Some(envelope) = ring.recv().await {
        let link = envelope.link;
        let game_running = envelope.game_running;
        let moment = Moment {
            mono_ms: clock.mono_ms(),
            wall_ms: wall_ms(),
        };
        let outcome = step(&mut sequencer, envelope, moment);
        if outcome.stale {
            publish_status(
                &outbox,
                link,
                game_running,
                last_place,
                None,
                &mut last_presence,
                true,
            );
            continue;
        }
        last_place = outcome.snap.place;
        publish(
            &outbox,
            link,
            game_running,
            &outcome,
            &mut last_presence,
        );
    }
}

fn step(sequencer: &mut Sequencer, envelope: Envelope, moment: Moment) -> Outcome {
    match envelope.body {
        PipeBody::Tick(tick) => sequencer.on_tick(tick, false, moment),
        PipeBody::Resync(tick) => sequencer.on_tick(tick, true, moment),
        PipeBody::Absent => sequencer.on_absent(moment),
    }
}

fn publish(
    outbox: &ipc::Outbox,
    link: LinkState,
    game_running: bool,
    outcome: &Outcome,
    last_presence: &mut Option<game::Presence>,
) {
    publish_status(
        outbox,
        link,
        game_running,
        outcome.snap.place,
        Some(outcome),
        last_presence,
        outcome.emit_status,
    );
    if outcome.laps.is_empty() {
        outbox.drain();
    } else {
        for bytes in &outcome.laps {
            outbox.send_lap(bytes.clone());
        }
    }
}

fn publish_status(
    outbox: &ipc::Outbox,
    link: LinkState,
    game_running: bool,
    place: SessionPlace,
    outcome: Option<&Outcome>,
    last_presence: &mut Option<game::Presence>,
    periodic: bool,
) {
    let presence = game::presence(game_running, place);
    let changed = last_presence.is_none_or(|previous| previous != presence);
    if !changed && !periodic {
        return;
    }
    *last_presence = Some(presence);
    let snap = outcome.map(|outcome| &outcome.snap);
    outbox.emit_status(&ipc::Status::capture(Capture {
        link,
        presence,
        packet_id: snap.and_then(|snap| snap.packet_id),
        outing_id: snap.and_then(|snap| snap.outing_id),
        session: snap.and_then(|snap| snap.session.as_ref()),
        lap_number: snap.and_then(|snap| snap.lap_number),
        sector: snap.and_then(|snap| snap.sector),
        speed: snap.and_then(|snap| snap.speed),
        air_temp: snap.and_then(|snap| snap.air_c),
        road_temp: snap.and_then(|snap| snap.road_c),
        events: outcome
            .map(|outcome| outcome.outing_events.as_slice())
            .unwrap_or(&[]),
    }));
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

pub(crate) fn spawn_reader(outbox: ipc::Outbox) {
    #[cfg(windows)]
    {
        let ring = TelemetryRing::new();
        let incoming = ring.clone();
        let probed = ring.clone();
        tauri::async_runtime::spawn(async move {
            run_consumer(incoming, outbox).await;
        });
        std::thread::spawn(move || reader::probe_game(probed));
        std::thread::spawn(move || reader::run(ring));
    }
    #[cfg(not(windows))]
    {
        std::thread::spawn(move || reader::run_without_acc(outbox));
    }
}
