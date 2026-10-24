//! Поток чтения shared memory ACC.
//!
//! На Windows опрос каждые 3 мс. Поток не пишет на диск и не шлёт события:
//! свежий кадр уходит в кольцо через `try_send`. На не-Windows памяти нет,
//! статус «недоступна» уходит не чаще 30 Гц, круги не пишутся.

use std::time::Duration;

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

/// Пауза между попытками открыть память, пока ACC не запущена.
#[cfg(windows)]
const RETRY_AFTER: Duration = Duration::from_millis(500);

/// Пауза между снимками. Верхние ~333 Гц. Повтор пакета отсекает `decode`.
#[cfg(windows)]
const SAMPLE_EVERY: Duration = Duration::from_millis(3);

/// Что сказать в лог при смене связи. Повтор того же состояния молчит.
#[derive(Debug, PartialEq, Eq)]
enum LinkNotice {
    Unavailable,
    /// На этой системе память не открывается, поэтому ветка есть только в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Linked,
    Lost,
}

impl LinkNotice {
    const fn line(self) -> &'static str {
        match self {
            Self::Unavailable => "ACC недоступна",
            Self::Linked => "ACC на связи",
            Self::Lost => "связь с ACC потеряна",
        }
    }
}

/// Край связи. Пока состояние не меняется, новых строк нет.
#[derive(Debug, Default)]
struct Link {
    phase: LinkState,
    told_down: bool,
}

impl Link {
    /// На этой системе память не открывается, поэтому переход есть только в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    fn note_up(&mut self) -> Option<LinkNotice> {
        if self.phase == LinkState::Linked {
            return None;
        }
        self.phase = LinkState::Linked;
        self.told_down = false;
        Some(LinkNotice::Linked)
    }

    fn note_down(&mut self) -> Option<LinkNotice> {
        if self.phase == LinkState::Linked {
            self.phase = LinkState::Lost;
            self.told_down = true;
            return Some(LinkNotice::Lost);
        }
        if self.told_down {
            return None;
        }
        self.told_down = true;
        Some(LinkNotice::Unavailable)
    }

    fn state(&self) -> LinkState {
        self.phase
    }
}

fn report(notice: Option<LinkNotice>) {
    if let Some(notice) = notice {
        eprintln!("{}", notice.line());
    }
}

/// Память ACC есть только на Windows.
#[cfg(windows)]
pub(crate) fn run(ring: TelemetryRing) -> ! {
    poll(ring);
}

/// Памяти нет, поэтому круг не пишется. Статус «недоступна» всё равно уходит,
/// не чаще 30 Гц: страница может подписаться уже после старта потока.
#[cfg(not(windows))]
pub(crate) fn run_without_acc(outbox: ipc::Outbox) -> ! {
    let mut link = Link::default();
    report(link.note_down());
    let mut clock = UiClock::default();
    let start = std::time::Instant::now();
    loop {
        let now_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
        if clock.status_due(now_ms, false) {
            outbox.emit_status(&Status::capture(Capture {
                link: link.state(),
                presence: game::Presence::Menu,
                packet_id: None,
                outing_id: None,
                session: None,
                lap_number: None,
                sector: None,
                speed: None,
                in_pit: false,
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
                report(link.note_down());
                note_absent(&ring, &link, &mut seen_packet);
                std::thread::sleep(RETRY_AFTER);
                continue;
            }
        };

        report(link.note_up());

        loop {
            match acc.read_shared_memory() {
                Ok(Some(map)) => {
                    push_map(&ring, &link, &mut seen_packet, &map, false);
                    std::thread::sleep(SAMPLE_EVERY);
                }
                Ok(None) => {
                    // Физика замерла (пауза, меню), а статус живёт в другом сегменте.
                    acc.reset();
                    if let Ok(Some(map)) = acc.read_shared_memory() {
                        // Идентификатор физики тот же, а пауза и меню живут в графике.
                        // Иначе decode вернёт Stale и выезд не увидит Off.
                        seen_packet = None;
                        push_map(&ring, &link, &mut seen_packet, &map, true);
                    }
                    std::thread::sleep(SAMPLE_EVERY);
                }
                Err(_) => {
                    report(link.note_down());
                    note_absent(&ring, &link, &mut seen_packet);
                    break;
                }
            }
        }
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
) {
    let previous = if resync { None } else { *seen_packet };
    match decode(previous, map) {
        Ok(PageOutcome::Stale) => {}
        Ok(PageOutcome::Fresh(tick)) => {
            *seen_packet = Some(tick.physics.packet_id);
            ring.bind(link.state());
            if resync {
                ring.try_push_resync(tick);
            } else {
                ring.try_push(tick);
            }
        }
        Err(error) => eprintln!("кадр ACC отвергнут: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_remembers_a_drop_after_it_was_up() {
        let mut link = Link::default();
        assert_eq!(link.state(), LinkState::Unavailable);
        assert_eq!(link.note_down(), Some(LinkNotice::Unavailable));
        assert_eq!(link.note_down(), None);
        assert_eq!(link.state(), LinkState::Unavailable);

        assert_eq!(link.note_up(), Some(LinkNotice::Linked));
        assert_eq!(link.note_up(), None);
        assert_eq!(link.state(), LinkState::Linked);

        assert_eq!(link.note_down(), Some(LinkNotice::Lost));
        assert_eq!(link.note_down(), None);
        assert_eq!(link.state(), LinkState::Lost);

        assert_eq!(link.note_up(), Some(LinkNotice::Linked));
        assert_eq!(link.state(), LinkState::Linked);
    }
}
