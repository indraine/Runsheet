//! Единственный владелец машины выезда и сборщика круга.
//!
//! На каждый свежий кадр: шаг выезда, точка только в `Live` (включая пит-лейн),
//! копилка по `SessionEvent`, кадр в журнал, если сессия есть и это не `Off`.
//! Повтор `packet_id` — `Stale`: ни точки, ни строки журнала.
//! Тот же id с `resync` обрабатывается: так пауза догоняет графику.

use crate::domain::{
    CarState, CleanSessionGraphic, Frame, GameStatus, LapTime, OutingEvent, OutingId, Session,
    SessionEvent, SessionId,
};
use crate::ingress::CleanTick;
use crate::services::analyzer::{LapAnalyzer, Reading};
use crate::services::laps::{Collector, Sample};
use crate::services::outing::{OutingMachine, Sight, Tick};

use super::broadcast::{LapSend, UiClock};
use super::storage::{FrameBatch, JournalBatch};

/// Часы и занятость записи. Секвенсор сам время не читает.
pub(crate) struct Moment {
    pub mono_ms: u64,
    pub wall_ms: u64,
    pub write_busy: bool,
}

/// Снимок для `acc-status`. Связь прикладывает потребитель.
pub(crate) struct Snap {
    pub packet_id: Option<i32>,
    pub outing_id: Option<OutingId>,
    pub session: Option<Session>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub speed: Option<f32>,
    pub air_c: Option<f32>,
    pub road_c: Option<f32>,
    pub in_session: bool,
}

impl Snap {
    fn empty() -> Self {
        Self {
            packet_id: None,
            outing_id: None,
            session: None,
            lap_number: None,
            sector: None,
            speed: None,
            air_c: None,
            road_c: None,
            in_session: false,
        }
    }
}

/// Что делать потребителю после одного тика.
pub(crate) struct Outcome {
    pub stale: bool,
    pub emit_status: bool,
    pub lap: Option<Vec<u8>>,
    pub outing_events: Vec<OutingEvent>,
    /// События круга. Потребитель их в `acc-status` не кладёт: их читает тест прогона.
    #[cfg_attr(not(test), allow(dead_code))]
    pub session_events: Vec<SessionEvent>,
    /// Кадр попал в журнал. Тоже для теста прогона.
    #[cfg_attr(not(test), allow(dead_code))]
    pub recorded: bool,
    pub flushes: Vec<JournalBatch>,
    pub snap: Snap,
}

/// Машина выезда, сборщик, копилка, журнал и часы UI.
#[derive(Default)]
pub(crate) struct Sequencer {
    machine: OutingMachine,
    laps: Collector,
    analyzer: LapAnalyzer,
    batch: FrameBatch,
    clock: UiClock,
    car: CarState,
    seen_packet: Option<i32>,
}

impl Sequencer {
    /// Свежий кадр. `resync` проводит повтор того же `packet_id`.
    pub(crate) fn on_tick(&mut self, tick: CleanTick, resync: bool, moment: Moment) -> Outcome {
        if !resync && self.seen_packet == Some(tick.physics.packet_id) {
            return self.stale();
        }
        self.seen_packet = Some(tick.physics.packet_id);

        let pit = self.step_car(&tick.graphic);
        let status = tick.graphic.status;
        let outing_events = self.machine.step(&Tick {
            mono_ms: moment.mono_ms,
            wall_ms: moment.wall_ms,
            sight: Sight::Frame(frame_from(&tick.graphic)),
        });
        let session_id = self.machine.session().map(|session| session.id);
        let packet = self.record(session_id, status, &tick, moment.mono_ms);
        let session_events = self.note_lap(pit, status, &tick);
        let snap = self.snap(Some(&tick));
        let (recorded, flushes) = self.store(session_id, status, tick, moment.write_busy);
        self.finish(
            snap,
            packet,
            outing_events,
            session_events,
            flushes,
            recorded,
            moment,
        )
    }

    /// Памяти нет. Круг не пишется. Разрыв выезда считает машина.
    pub(crate) fn on_absent(&mut self, moment: Moment) -> Outcome {
        let outing_events = self.machine.step(&Tick {
            mono_ms: moment.mono_ms,
            wall_ms: moment.wall_ms,
            sight: Sight::Absent,
        });
        let packet = release_foreign(&self.machine, &mut self.laps);
        let _ = self.laps.take_events();
        let flushes = if self.machine.session().is_none() {
            self.batch.take().into_iter().collect()
        } else {
            Vec::new()
        };
        let snap = self.snap(None);
        self.finish(
            snap,
            packet,
            outing_events,
            Vec::new(),
            flushes,
            false,
            moment,
        )
    }

    fn stale(&self) -> Outcome {
        Outcome {
            stale: true,
            emit_status: false,
            lap: None,
            outing_events: Vec::new(),
            session_events: Vec::new(),
            recorded: false,
            flushes: Vec::new(),
            snap: Snap::empty(),
        }
    }

    fn step_car(&mut self, graphic: &CleanSessionGraphic) -> Option<SessionEvent> {
        // Replay место не двигает. У ingress нет истории, поэтому его `car_state` тут врёт.
        if graphic.status == GameStatus::Replay {
            return None;
        }
        let next = graphic.car_state;
        let event = self.car.pit_edge(next);
        self.car = next;
        event
    }

    fn record(
        &mut self,
        session_id: Option<SessionId>,
        status: GameStatus,
        tick: &CleanTick,
        mono_ms: u64,
    ) -> Option<Vec<u8>> {
        let abandoned = release_foreign(&self.machine, &mut self.laps);
        let finished = match (status == GameStatus::Live, session_id) {
            (true, Some(session_id)) => {
                let sample = sample_from(tick, mono_ms, session_id);
                self.laps.push(&sample)
            }
            _ => None,
        };
        finished.or(abandoned)
    }

    fn note_lap(
        &mut self,
        pit: Option<SessionEvent>,
        status: GameStatus,
        tick: &CleanTick,
    ) -> Vec<SessionEvent> {
        let mut events = self.laps.take_events();
        if let Some(pit) = pit {
            events.push(pit);
        }
        let reading = Reading {
            speed: tick.physics.speed,
            fuel_l: tick.physics.fuel_l,
        };
        if events.is_empty() {
            if status == GameStatus::Live && self.laps.open_id().is_some() {
                self.analyzer.on_event(None, reading);
            }
        } else {
            for event in &events {
                self.analyzer.on_event(Some(*event), reading);
            }
        }
        events
    }

    fn store(
        &mut self,
        session_id: Option<SessionId>,
        status: GameStatus,
        tick: CleanTick,
        write_busy: bool,
    ) -> (bool, Vec<JournalBatch>) {
        let Some(session_id) = session_id else {
            return (false, self.batch.take().into_iter().collect());
        };
        if status == GameStatus::Off {
            return (false, self.batch.take().into_iter().collect());
        }
        let flushes = self.batch.push(session_id, tick, write_busy);
        (true, flushes)
    }

    fn snap(&self, tick: Option<&CleanTick>) -> Snap {
        Snap {
            packet_id: tick.map(|tick| tick.physics.packet_id),
            outing_id: self.machine.outing_id(),
            session: self.machine.session().cloned(),
            lap_number: self.laps.open_number(),
            sector: tick.map(|tick| tick.graphic.sector_index),
            speed: tick.map(|tick| tick.physics.speed.kmh()),
            air_c: tick.map(|tick| tick.graphic.air.celsius()),
            road_c: tick.map(|tick| tick.graphic.road.celsius()),
            in_session: tick.is_some_and(|tick| tick.graphic.status != GameStatus::Off),
        }
    }

    fn finish(
        &mut self,
        snap: Snap,
        packet: Option<Vec<u8>>,
        outing_events: Vec<OutingEvent>,
        session_events: Vec<SessionEvent>,
        flushes: Vec<JournalBatch>,
        recorded: bool,
        moment: Moment,
    ) -> Outcome {
        let emit_status = self
            .clock
            .status_due(moment.mono_ms, !outing_events.is_empty());
        let lap =
            match self
                .clock
                .preview_due(moment.mono_ms, self.laps.open_id(), packet.is_some())
            {
                LapSend::Closed => packet,
                LapSend::Preview => self.laps.preview(),
                LapSend::None => None,
            };
        Outcome {
            stale: false,
            emit_status,
            lap,
            outing_events,
            session_events,
            recorded,
            flushes,
            snap,
        }
    }
}

fn frame_from(graphic: &CleanSessionGraphic) -> Frame {
    Frame {
        status: graphic.status,
        kind: graphic.kind,
        session_index: graphic.session_index,
        track: graphic.track.clone(),
        car: graphic.car.clone(),
        online: graphic.online,
        car_count: graphic.car_count,
        setup_menu: graphic.setup_menu,
        air_c: graphic.air.celsius(),
        road_c: graphic.road.celsius(),
    }
}

fn sample_from(tick: &CleanTick, mono_ms: u64, session_id: SessionId) -> Sample {
    let physics = &tick.physics;
    let graphic = &tick.graphic;
    Sample {
        mono_ms,
        session_id,
        completed_lap: graphic.completed_lap,
        last_time_ms: lap_ms(graphic.last_time),
        last_sector_time_ms: lap_ms(graphic.last_sector_time),
        sector_index: graphic.sector_index,
        valid: graphic.valid_lap,
        distance_m: graphic.distance_m,
        fuel: physics.fuel_l,
        throttle: physics.throttle.fraction(),
        brake: physics.brake.fraction(),
        steer: physics.steer_deg,
        speed: physics.speed.kmh(),
        lap_time_ms: lap_ms(graphic.current_lap_time),
        progress: physics.progress.fraction(),
        g_long: physics.g_long,
        g_lat: physics.g_lat,
        x: physics.ground_x,
        z: physics.ground_z,
        pressure_fl: physics.pressure.front_left.psi(),
        pressure_fr: physics.pressure.front_right.psi(),
        pressure_rl: physics.pressure.rear_left.psi(),
        pressure_rr: physics.pressure.rear_right.psi(),
        brake_temp_fl: physics.brake_temp.front_left.celsius(),
        brake_temp_fr: physics.brake_temp.front_right.celsius(),
    }
}

fn lap_ms(time: Option<LapTime>) -> i32 {
    time.map(LapTime::ms).unwrap_or(-1)
}

fn release_foreign(machine: &OutingMachine, laps: &mut Collector) -> Option<Vec<u8>> {
    let current = machine.session().map(|session| session.id);
    if laps.bound_session() == current {
        return None;
    }
    laps.abandon()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::CarState;
    use crate::pipeline::broadcast::STATUS_PERIOD_MS;
    use crate::pipeline::fixture::TickDraft;

    fn moment(mono_ms: u64) -> Moment {
        Moment {
            mono_ms,
            wall_ms: mono_ms,
            write_busy: false,
        }
    }

    fn script() -> Vec<(u64, TickDraft)> {
        let mut steps = vec![
            (
                0,
                TickDraft {
                    packet_id: 1,
                    ..TickDraft::default()
                },
            ),
            (
                10,
                TickDraft {
                    packet_id: 2,
                    sector_index: 1,
                    distance_m: 250.0,
                    last_sector_ms: Some(30_000),
                    ..TickDraft::default()
                },
            ),
            (
                20,
                TickDraft {
                    packet_id: 3,
                    completed_lap: 1,
                    sector_index: 0,
                    distance_m: 400.0,
                    last_time_ms: Some(91_234),
                    lap_time_ms: Some(80),
                    progress: 0.01,
                    ..TickDraft::default()
                },
            ),
            (
                30,
                TickDraft {
                    packet_id: 4,
                    car_state: CarState::InPitLane,
                    completed_lap: 1,
                    lap_time_ms: Some(200),
                    progress: 0.2,
                    distance_m: 420.0,
                    ..TickDraft::default()
                },
            ),
            (
                40,
                TickDraft {
                    packet_id: 4,
                    car_state: CarState::InPitLane,
                    completed_lap: 1,
                    lap_time_ms: Some(200),
                    progress: 0.2,
                    distance_m: 420.0,
                    ..TickDraft::default()
                },
            ),
        ];
        for index in 0..496 {
            let packet_id = 5 + index;
            steps.push((
                50 + u64::try_from(index).unwrap_or(0) * 10,
                TickDraft {
                    packet_id,
                    car_state: CarState::InPitLane,
                    completed_lap: 1,
                    lap_time_ms: Some(200),
                    progress: 0.2,
                    distance_m: 500.0,
                    ..TickDraft::default()
                },
            ));
        }
        steps
    }

    #[test]
    fn replay_counts_one_lap_one_pit_and_flushes_on_the_500th_frame() {
        let mut sequencer = Sequencer::default();
        let mut recorded = 0usize;
        let mut marks = Vec::new();
        let mut completed = 0;
        let mut pits = 0;
        let mut flushed_at = None;
        let mut saw_stale = false;

        for (mono, draft) in script() {
            let duplicate = draft.packet_id == 4 && mono == 40;
            let outcome = sequencer.on_tick(draft.build(), false, moment(mono));
            if duplicate {
                assert!(outcome.stale);
                assert!(!outcome.recorded);
                assert!(outcome.session_events.is_empty());
                assert!(outcome.flushes.is_empty());
                assert!(!outcome.emit_status);
                saw_stale = true;
                continue;
            }
            assert!(!outcome.stale);
            if outcome.recorded {
                recorded += 1;
            }
            if outcome.emit_status {
                marks.push(mono);
            }
            for event in &outcome.session_events {
                match event {
                    SessionEvent::LapCompleted { .. } => completed += 1,
                    SessionEvent::PitEntry => pits += 1,
                    _ => {}
                }
            }
            if let Some(batch) = outcome.flushes.first() {
                assert!(flushed_at.is_none());
                assert_eq!(recorded, 500);
                assert_eq!(batch.frames.len(), 500);
                assert!(
                    batch
                        .frames
                        .iter()
                        .all(|frame| frame.physics.speed.kmh().is_finite())
                );
                flushed_at = Some(recorded);
            } else {
                assert!(recorded < 500);
            }
        }

        assert!(saw_stale);
        assert_eq!(completed, 1);
        assert_eq!(pits, 1);
        assert_eq!(flushed_at, Some(500));
        let mut previous = None;
        for mark in marks {
            if let Some(before) = previous {
                assert!(
                    mark.saturating_sub(before) >= STATUS_PERIOD_MS,
                    "status at {mark} follows {before}"
                );
            }
            previous = Some(mark);
        }
    }
}
