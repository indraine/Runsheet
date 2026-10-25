
use crate::domain::{
    CarState, CleanSessionGraphic, Frame, GameStatus, LapTime, OutingEvent, OutingId, Session,
    SessionEvent, SessionId, SessionPlace,
};
use crate::ingress::CleanTick;
use crate::services::laps::{Collector, Sample};
use crate::services::outing::{OutingMachine, Sight, Tick};

use super::broadcast::{LapSend, UiClock};

const CLOCK_DEAD_AFTER_MS: u64 = 1_000;

const MOTION_SPEED_KMH: f32 = 5.0;

pub(crate) struct Moment {
    pub mono_ms: u64,
    pub wall_ms: u64,
}

pub(crate) struct Snap {
    pub packet_id: Option<i32>,
    pub outing_id: Option<OutingId>,
    pub session: Option<Session>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub speed: Option<f32>,
    pub place: SessionPlace,
    pub air_c: Option<f32>,
    pub road_c: Option<f32>,
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
            place: SessionPlace::Menu,
            air_c: None,
            road_c: None,
        }
    }
}

pub(crate) struct Outcome {
    pub stale: bool,
    pub emit_status: bool,
    pub laps: Vec<Vec<u8>>,
    pub outing_events: Vec<OutingEvent>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub session_events: Vec<SessionEvent>,
    pub snap: Snap,
}

#[derive(Default)]
pub(crate) struct Sequencer {
    machine: OutingMachine,
    laps: Collector,
    clock: UiClock,
    car: CarState,
    seen_packet: Option<i32>,
    had_motion: bool,
    last_lap_time_ms: Option<i32>,
    last_clock_ms: Option<u64>,
}

impl Sequencer {
    pub(crate) fn on_tick(&mut self, tick: CleanTick, resync: bool, moment: Moment) -> Outcome {
        if !resync && self.seen_packet == Some(tick.physics.packet_id) {
            return self.stale();
        }
        self.note_motion(&tick);
        self.note_clock(&tick, moment.mono_ms);
        if self.parked_on_track(&tick, moment.mono_ms) {
            return self.on_absent(moment);
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
        let session_events = self.note_lap(pit);
        let snap = self.snap(Some(&tick), moment.mono_ms);
        self.finish(snap, packet, outing_events, session_events, moment)
    }

    pub(crate) fn on_absent(&mut self, moment: Moment) -> Outcome {
        self.kill_clock();
        let outing_events = self.machine.step(&Tick {
            mono_ms: moment.mono_ms,
            wall_ms: moment.wall_ms,
            sight: Sight::Absent,
        });
        let packet = release_foreign(&self.machine, &mut self.laps);
        let _ = self.laps.take_events();
        let snap = self.snap(None, moment.mono_ms);
        self.finish(snap, packet, outing_events, Vec::new(), moment)
    }

    fn stale(&self) -> Outcome {
        Outcome {
            stale: true,
            emit_status: false,
            laps: Vec::new(),
            outing_events: Vec::new(),
            session_events: Vec::new(),
            snap: Snap::empty(),
        }
    }

    fn step_car(&mut self, graphic: &CleanSessionGraphic) -> Option<SessionEvent> {
        if graphic.status == GameStatus::Replay {
            return None;
        }
        let next = graphic.car_state;
        if next == CarState::InGarage
            || next == CarState::InPitLane
            || graphic.status == GameStatus::Off
            || graphic.status == GameStatus::Pause
        {
            self.had_motion = false;
            self.kill_clock();
        }
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

    fn note_lap(&mut self, pit: Option<SessionEvent>) -> Vec<SessionEvent> {
        let mut events = self.laps.take_events();
        if let Some(pit) = pit {
            events.push(pit);
        }
        events
    }

    fn note_motion(&mut self, tick: &CleanTick) {
        if tick.physics.speed.kmh() >= MOTION_SPEED_KMH {
            self.had_motion = true;
        }
    }

    fn note_clock(&mut self, tick: &CleanTick, mono_ms: u64) {
        let lap_time_ms = lap_ms(tick.graphic.current_lap_time);
        if self.last_lap_time_ms != Some(lap_time_ms) {
            self.last_lap_time_ms = Some(lap_time_ms);
            self.last_clock_ms = Some(mono_ms);
        }
    }

    fn kill_clock(&mut self) {
        self.last_clock_ms = None;
    }

    fn clock_live(&self, mono_ms: u64) -> bool {
        self.last_clock_ms
            .is_some_and(|fresh| mono_ms.saturating_sub(fresh) < CLOCK_DEAD_AFTER_MS)
    }

    fn parked_on_track(&self, tick: &CleanTick, mono_ms: u64) -> bool {
        self.had_motion
            && !self.clock_live(mono_ms)
            && tick.graphic.status == GameStatus::Live
            && tick.graphic.car_state == CarState::OnTrack
    }

    fn is_driving(&self, tick: &CleanTick, mono_ms: u64) -> bool {
        if tick.graphic.status != GameStatus::Live || self.car != CarState::OnTrack {
            return false;
        }
        if !self.clock_live(mono_ms) {
            return false;
        }
        let moving = tick.physics.speed.kmh() >= MOTION_SPEED_KMH;
        moving || self.had_motion
    }

    fn place(&self, tick: Option<&CleanTick>, mono_ms: u64) -> SessionPlace {
        match self.car {
            CarState::InPitLane => SessionPlace::InPits,
            CarState::OnTrack if tick.is_some_and(|tick| self.is_driving(tick, mono_ms)) => {
                SessionPlace::OnTrack
            }
            _ => SessionPlace::Menu,
        }
    }

    fn snap(&self, tick: Option<&CleanTick>, mono_ms: u64) -> Snap {
        Snap {
            packet_id: tick.map(|tick| tick.physics.packet_id),
            outing_id: self.machine.outing_id(),
            session: self.machine.session().cloned(),
            lap_number: self.laps.open_number(),
            sector: tick.map(|tick| tick.graphic.sector_index),
            speed: tick.map(|tick| tick.physics.speed.kmh()),
            place: self.place(tick, mono_ms),
            air_c: tick.map(|tick| tick.graphic.air.celsius()),
            road_c: tick.map(|tick| tick.graphic.road.celsius()),
        }
    }

    fn finish(
        &mut self,
        snap: Snap,
        packet: Option<Vec<u8>>,
        outing_events: Vec<OutingEvent>,
        session_events: Vec<SessionEvent>,
        moment: Moment,
    ) -> Outcome {
        let emit_status = self
            .clock
            .status_due(moment.mono_ms, !outing_events.is_empty());
        let laps = self.take_packets(packet, moment.mono_ms);
        Outcome {
            stale: false,
            emit_status,
            laps,
            outing_events,
            session_events,
            snap,
        }
    }

    fn take_packets(&mut self, closed: Option<Vec<u8>>, mono_ms: u64) -> Vec<Vec<u8>> {
        let mut packets = Vec::new();
        match self
            .clock
            .preview_due(mono_ms, self.laps.open_id(), closed.is_some())
        {
            LapSend::Closed => {
                if let Some(packet) = closed {
                    packets.push(packet);
                }
                if self.clock.preview_due(mono_ms, self.laps.open_id(), false) == LapSend::Preview {
                    if let Some(preview) = self.laps.preview() {
                        packets.push(preview);
                    }
                }
            }
            LapSend::Preview => {
                if let Some(preview) = self.laps.preview() {
                    packets.push(preview);
                }
            }
            LapSend::None => {}
        }
        packets
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
        brake_temp_fl: physics.brake_temp_fl.celsius(),
        brake_temp_fr: physics.brake_temp_fr.celsius(),
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
        for index in 0..8 {
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
    fn replay_counts_one_lap_one_pit_and_throttles_status() {
        let mut sequencer = Sequencer::default();
        let mut marks = Vec::new();
        let mut completed = 0;
        let mut pits = 0;
        let mut saw_stale = false;

        for (mono, draft) in script() {
            let duplicate = draft.packet_id == 4 && mono == 40;
            let outcome = sequencer.on_tick(draft.build(), false, moment(mono));
            if duplicate {
                assert!(outcome.stale);
                assert!(outcome.session_events.is_empty());
                assert!(!outcome.emit_status);
                saw_stale = true;
                continue;
            }
            assert!(!outcome.stale);
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
        }

        assert!(saw_stale);
        assert_eq!(completed, 1);
        assert_eq!(pits, 1);

        let mut fresh = Sequencer::default();
        let opened = fresh.on_tick(
            TickDraft {
                packet_id: 1,
                lap_time_ms: Some(80_000),
                progress: 0.97,
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert_eq!(opened.laps.len(), 1);

        let crossed = fresh.on_tick(
            TickDraft {
                packet_id: 2,
                completed_lap: 1,
                lap_time_ms: Some(80),
                last_time_ms: Some(81_500),
                progress: 0.01,
                distance_m: 4_100.0,
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(50),
        );
        assert_eq!(crossed.laps.len(), 2);
        assert_eq!(read_i32(&crossed.laps[0], 32), 1);
        assert_eq!(read_i32(&crossed.laps[0], 40), 81_500);
        assert_eq!(read_i32(&crossed.laps[1], 32), 2);
        assert_eq!(read_i32(&crossed.laps[1], 40), -1);
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

    #[test]
    fn dead_lap_clock_with_a_live_status_is_the_menu() {
        let mut sequencer = Sequencer::default();
        let driving = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                lap_time_ms: Some(10_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(driving.snap.place == SessionPlace::OnTrack);

        let echo = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                lap_time_ms: Some(10_000),
                ..TickDraft::default()
            }
            .build(),
            true,
            moment(200),
        );
        assert!(echo.snap.place == SessionPlace::OnTrack);

        let menu = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                lap_time_ms: Some(10_000),
                ..TickDraft::default()
            }
            .build(),
            true,
            moment(CLOCK_DEAD_AFTER_MS),
        );
        assert!(menu.snap.place != SessionPlace::OnTrack);
    }

    #[test]
    fn bumping_packet_id_with_frozen_clock_is_the_menu() {
        let mut sequencer = Sequencer::default();
        let driving = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                speed: 120.0,
                distance_m: 500.0,
                lap_time_ms: Some(20_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(driving.snap.place == SessionPlace::OnTrack);

        let still = sequencer.on_tick(
            TickDraft {
                packet_id: 2,
                speed: 0.0,
                distance_m: 500.0,
                lap_time_ms: Some(20_050),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(50),
        );
        assert!(still.snap.place == SessionPlace::OnTrack);

        let menu = sequencer.on_tick(
            TickDraft {
                packet_id: 99,
                speed: 0.0,
                distance_m: 500.0,
                lap_time_ms: Some(20_050),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(50 + CLOCK_DEAD_AFTER_MS),
        );
        assert!(menu.snap.place != SessionPlace::OnTrack);
    }

    #[test]
    fn frozen_clock_ignores_speed_and_distance_jitter_in_the_menu() {
        let mut sequencer = Sequencer::default();
        let driving = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                speed: 140.0,
                distance_m: 800.0,
                lap_time_ms: Some(30_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(driving.snap.place == SessionPlace::OnTrack);

        let mut mono = CLOCK_DEAD_AFTER_MS;
        for packet_id in 2..12 {
            let parked = sequencer.on_tick(
                TickDraft {
                    packet_id,
                    speed: if packet_id % 2 == 0 { 0.0 } else { 88.0 },
                    distance_m: 800.0 + (packet_id as f32) * 0.25,
                    lap_time_ms: Some(30_000),
                    ..TickDraft::default()
                }
                .build(),
                false,
                moment(mono),
            );
            assert!(
                parked.snap.place != SessionPlace::OnTrack,
                "jitter at {mono} ms must leave the track"
            );
            mono += 50;
        }
    }

    #[test]
    fn standing_before_first_motion_is_not_on_track() {
        let mut sequencer = Sequencer::default();
        let start = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                speed: 0.0,
                distance_m: 10.0,
                lap_time_ms: Some(100),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(start.snap.place != SessionPlace::OnTrack);

        let waiting = sequencer.on_tick(
            TickDraft {
                packet_id: 2,
                speed: 0.0,
                distance_m: 10.0,
                lap_time_ms: Some(200),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(100),
        );
        assert!(waiting.snap.place != SessionPlace::OnTrack);
    }

    #[test]
    fn short_stop_after_motion_stays_on_track_while_clock_runs() {
        let mut sequencer = Sequencer::default();
        let driving = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                speed: 120.0,
                distance_m: 400.0,
                lap_time_ms: Some(40_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(driving.snap.place == SessionPlace::OnTrack);

        let stopped = sequencer.on_tick(
            TickDraft {
                packet_id: 2,
                speed: 0.0,
                distance_m: 400.0,
                lap_time_ms: Some(40_080),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(80),
        );
        assert!(stopped.snap.place == SessionPlace::OnTrack);

        let waiting = sequencer.on_tick(
            TickDraft {
                packet_id: 3,
                speed: 0.0,
                distance_m: 400.0,
                lap_time_ms: Some(45_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(5_000),
        );
        assert!(waiting.snap.place == SessionPlace::OnTrack);
    }

    #[test]
    fn off_then_live_stationary_is_the_menu() {
        let mut sequencer = Sequencer::default();
        let driving = sequencer.on_tick(
            TickDraft {
                packet_id: 1,
                speed: 140.0,
                distance_m: 800.0,
                lap_time_ms: Some(50_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(driving.snap.place == SessionPlace::OnTrack);

        let off = sequencer.on_tick(
            TickDraft {
                packet_id: 2,
                status: GameStatus::Off,
                car_state: CarState::InGarage,
                speed: 0.0,
                distance_m: 800.0,
                lap_time_ms: Some(50_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(20),
        );
        assert!(off.snap.place != SessionPlace::OnTrack);

        let echo = sequencer.on_tick(
            TickDraft {
                packet_id: 3,
                speed: 0.0,
                distance_m: 800.0,
                lap_time_ms: Some(50_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(40),
        );
        assert!(echo.snap.place != SessionPlace::OnTrack);

        let later = sequencer.on_tick(
            TickDraft {
                packet_id: 4,
                speed: 120.0,
                distance_m: 800.1,
                lap_time_ms: Some(50_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(40 + CLOCK_DEAD_AFTER_MS),
        );
        assert!(later.snap.place != SessionPlace::OnTrack);
    }

    #[test]
    fn garage_and_pit_are_not_on_track() {
        let mut sequencer = Sequencer::default();
        let driving = sequencer.on_tick(
            TickDraft {
                lap_time_ms: Some(12_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(0),
        );
        assert!(driving.snap.place == SessionPlace::OnTrack);

        let garage = sequencer.on_tick(
            TickDraft {
                packet_id: 2,
                car_state: CarState::InGarage,
                lap_time_ms: Some(12_000),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(10),
        );
        assert_eq!(garage.snap.place, SessionPlace::Menu);

        let pit = sequencer.on_tick(
            TickDraft {
                packet_id: 3,
                car_state: CarState::InPitLane,
                speed: 60.0,
                lap_time_ms: Some(12_100),
                ..TickDraft::default()
            }
            .build(),
            false,
            moment(20),
        );
        assert_eq!(pit.snap.place, SessionPlace::InPits);
    }

    fn read_i32(bytes: &[u8], at: usize) -> i32 {
        let raw: [u8; 4] = bytes[at..at + 4].try_into().unwrap();
        i32::from_le_bytes(raw)
    }
}
