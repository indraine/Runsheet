
use crate::domain::{
    CarState, CleanSessionGraphic, Frame, GameStatus, LapTime, OutingEvent, OutingId, Session,
    SessionId, SessionPlace,
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

        self.step_car(&tick.graphic);
        let status = tick.graphic.status;
        let outing_events = self.machine.step(&Tick {
            mono_ms: moment.mono_ms,
            wall_ms: moment.wall_ms,
            sight: Sight::Frame(frame_from(&tick.graphic)),
        });
        let session_id = self.machine.session().map(|session| session.id);
        let packet = self.record(session_id, status, &tick, moment.mono_ms);
        let _ = self.laps.take_events();
        let snap = self.snap(Some(&tick), moment.mono_ms);
        self.finish(snap, packet, outing_events, moment)
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
        self.finish(snap, packet, outing_events, moment)
    }

    fn stale(&self) -> Outcome {
        Outcome {
            stale: true,
            emit_status: false,
            laps: Vec::new(),
            outing_events: Vec::new(),
            snap: Snap::empty(),
        }
    }

    fn step_car(&mut self, graphic: &CleanSessionGraphic) {
        if graphic.status == GameStatus::Replay {
            return;
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
        self.car = next;
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
        gear: physics.gear,
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
