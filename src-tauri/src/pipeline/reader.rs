
use std::time::Duration;
#[cfg(windows)]
use std::time::Instant;

#[cfg(windows)]
use acc_shared_memory_rs::ACCSharedMemory;
#[cfg(windows)]
use acc_shared_memory_rs::maps::ACCMap;

#[cfg(windows)]
use crate::ingress::{PageOutcome, decode};
use crate::ipc::LinkState;
#[cfg(not(windows))]
use crate::ipc::{self, Capture, Status};
use crate::platform::game;

#[cfg(not(windows))]
use super::broadcast::{STATUS_PERIOD_MS, UiClock};
#[cfg(windows)]
use super::ring::TelemetryRing;

#[cfg(windows)]
const RETRY_AFTER: Duration = Duration::from_millis(500);

#[cfg(windows)]
const SAMPLE_EVERY: Duration = Duration::from_millis(3);

#[cfg(windows)]
const READ_ERRORS_BEFORE_DROP: u32 = 50;

#[cfg(windows)]
const FROZEN_AFTER: Duration = Duration::from_millis(1_000);

#[derive(Debug, Default)]
struct Link {
    phase: LinkState,
    told_down: bool,
}

impl Link {
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    fn note_up(&mut self) {
        if self.phase == LinkState::Linked {
            return;
        }
        self.phase = LinkState::Linked;
        self.told_down = false;
    }

    fn note_down(&mut self) {
        if self.phase == LinkState::Linked {
            self.phase = LinkState::Lost;
            self.told_down = true;
            return;
        }
        if self.told_down {
            return;
        }
        self.told_down = true;
    }

    fn state(&self) -> LinkState {
        self.phase
    }
}

#[cfg(windows)]
pub(crate) fn run(ring: TelemetryRing) -> ! {
    poll(ring);
}

#[cfg(not(windows))]
pub(crate) fn run_without_acc(outbox: ipc::Outbox) -> ! {
    let mut link = Link::default();
    link.note_down();
    let mut clock = UiClock::default();
    let start = std::time::Instant::now();
    loop {
        let now_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
        if clock.status_due(now_ms, false) {
            outbox.emit_status(&Status::capture(Capture {
                link: link.state(),
                presence: game::Presence::Off,
                packet_id: None,
                outing_id: None,
                session: None,
                lap_number: None,
                sector: None,
                speed: None,
                air_temp: None,
                road_temp: None,
                events: &[],
            }));
        }
        outbox.drain();
        std::thread::sleep(Duration::from_millis(STATUS_PERIOD_MS));
    }
}

#[cfg(windows)]
fn poll(ring: TelemetryRing) -> ! {
    let mut link = Link::default();
    let mut seen_packet = None;

    loop {
        let mut acc = match ACCSharedMemory::new() {
            Ok(acc) => acc,
            Err(_) => {
                link.note_down();
                note_absent(&ring, &link, &mut seen_packet);
                std::thread::sleep(RETRY_AFTER);
                continue;
            }
        };

        link.note_up();
        let mut last_push = Instant::now();
        let mut last_fresh = Instant::now();
        let mut read_errors = 0u32;

        loop {
            match acc.read_shared_memory() {
                Ok(Some(map)) => {
                    read_errors = 0;
                    if push_map(&ring, &link, &mut seen_packet, &map, false) {
                        last_fresh = Instant::now();
                        last_push = Instant::now();
                    } else if last_fresh.elapsed() >= FROZEN_AFTER
                        && push_map(&ring, &link, &mut seen_packet, &map, true)
                    {
                        last_push = Instant::now();
                    }
                    std::thread::sleep(SAMPLE_EVERY);
                }
                Ok(None) => {
                    read_errors = 0;
                    acc.reset();
                    if let Ok(Some(map)) = acc.read_shared_memory() {
                        seen_packet = None;
                        if push_map(&ring, &link, &mut seen_packet, &map, true) {
                            last_push = Instant::now();
                        }
                    } else if last_push.elapsed() >= RETRY_AFTER {
                        note_absent(&ring, &link, &mut seen_packet);
                        last_push = Instant::now();
                    }
                    std::thread::sleep(SAMPLE_EVERY);
                }
                Err(_error) => {
                    read_errors += 1;
                    if read_errors < READ_ERRORS_BEFORE_DROP {
                        std::thread::sleep(SAMPLE_EVERY);
                        continue;
                    }
                    link.note_down();
                    note_absent(&ring, &link, &mut seen_packet);
                    std::thread::sleep(RETRY_AFTER);
                    break;
                }
            }
        }
    }
}

#[cfg(windows)]
const PROBE_EVERY: Duration = Duration::from_secs(2);

#[cfg(windows)]
pub(crate) fn probe_game(ring: TelemetryRing) -> ! {
    let mut was_running = None;
    loop {
        if let Some(running) = game::is_game_running() {
            ring.note_game_running(running);
            if was_running == Some(true) && !running {
                ring.push_absent();
            }
            was_running = Some(running);
        }
        std::thread::sleep(PROBE_EVERY);
    }
}

#[cfg(windows)]
fn note_absent(ring: &TelemetryRing, link: &Link, seen_packet: &mut Option<i32>) {
    *seen_packet = None;
    ring.bind(link.state());
    ring.push_absent();
}

#[cfg(windows)]
fn push_map(
    ring: &TelemetryRing,
    link: &Link,
    seen_packet: &mut Option<i32>,
    map: &ACCMap,
    resync: bool,
) -> bool {
    let previous = if resync { None } else { *seen_packet };
    match decode(previous, map) {
        Ok(PageOutcome::Stale) => false,
        Ok(PageOutcome::Fresh(tick)) => {
            *seen_packet = Some(tick.physics.packet_id);
            ring.bind(link.state());
            if resync {
                ring.try_push_resync(tick);
            } else {
                ring.try_push(tick);
            }
            true
        }
        Err(_error) => false,
    }
}
