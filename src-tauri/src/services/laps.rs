
use uuid::Uuid;

use crate::domain::{LapId, LapTime, SessionEvent, SessionId};

const TRACE_GAP_MS: u64 = 50;

const LAP_CLOCK_GUARD_MS: i32 = 3_000;

const CLOCK_DROP_MS: i32 = 1_500;

const CHANNEL_COUNT: usize = 17;

const HEADER_LEN: usize = 76;

const MISSING_MS: i32 = -1;

const MISSING_M: f32 = -1.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Sample {
    pub mono_ms: u64,
    pub session_id: SessionId,
    pub completed_lap: i32,
    pub last_time_ms: i32,
    pub last_sector_time_ms: i32,
    pub sector_index: i32,
    pub valid: bool,
    pub distance_m: f32,
    pub fuel: f32,
    pub throttle: f32,
    pub brake: f32,
    pub steer: f32,
    pub gear: i32,
    pub speed: f32,
    pub lap_time_ms: i32,
    pub progress: f32,
    pub g_long: f32,
    pub g_lat: f32,
    pub x: f32,
    pub z: f32,
    pub pressure_fl: f32,
    pub pressure_fr: f32,
    pub pressure_rl: f32,
    pub pressure_rr: f32,
    pub brake_temp_fl: f32,
    pub brake_temp_fr: f32,
}

#[derive(Debug, Default)]
pub(crate) struct Collector {
    open: Option<OpenLap>,
    carry_completed: Option<i32>,
    events: Vec<SessionEvent>,
}

impl Collector {
    pub(crate) fn bound_session(&self) -> Option<SessionId> {
        self.open.as_ref().map(|open| open.session_id)
    }

    pub(crate) fn abandon(&mut self) -> Option<Vec<u8>> {
        self.carry_completed = None;
        let open = self.open.take()?;
        if open.points.is_empty() {
            return None;
        }
        Some(pack(&open.abandoned()))
    }

    pub(crate) fn open_id(&self) -> Option<LapId> {
        self.open.as_ref().map(|open| open.id)
    }

    pub(crate) fn open_number(&self) -> Option<i32> {
        self.open.as_ref().map(|open| open.number)
    }

    pub(crate) fn preview(&self) -> Option<Vec<u8>> {
        self.open.as_ref().map(|open| pack(&open.partial()))
    }

    pub(crate) fn take_events(&mut self) -> Vec<SessionEvent> {
        std::mem::take(&mut self.events)
    }

    #[must_use]
    pub(crate) fn push(&mut self, sample: &Sample) -> Option<Vec<u8>> {
        if self
            .open
            .as_ref()
            .is_some_and(|open| open.session_id != sample.session_id)
        {
            self.open = None;
            self.carry_completed = None;
        }

        let closed = self.take_closed(sample);
        if self.open.is_none() {
            let completed_at_open = self.carry_completed.take().unwrap_or(sample.completed_lap);
            let open = OpenLap::begin(sample, completed_at_open);
            self.events.push(SessionEvent::LapStarted {
                lap_number: open.number,
            });
            self.open = Some(open);
        }
        self.observe(sample);
        closed
    }

    fn take_closed(&mut self, boundary: &Sample) -> Option<Vec<u8>> {
        let Some(open) = self.open.as_ref() else {
            return None;
        };
        let grown = boundary.completed_lap > open.completed_at_open;
        if !grown && !line_crossed(open, boundary) {
            return None;
        }
        let consumed = boundary
            .completed_lap
            .max(open.completed_at_open.saturating_add(1));
        let number = open.number;
        let open = self.open.take()?;
        self.carry_completed = Some(consumed);
        let time =
            (boundary.last_time_ms > 0).then(|| LapTime::from_ms_unchecked(boundary.last_time_ms));
        self.events.push(SessionEvent::LapCompleted {
            lap_number: number,
            time,
        });
        Some(pack(&open.finish(boundary)))
    }

    fn observe(&mut self, sample: &Sample) {
        let sector = {
            let Some(open) = self.open.as_mut() else {
                return;
            };
            let along_m = sample.distance_m - open.origin_m;
            let sector = open.note_sector(
                sample.sector_index,
                sample.last_sector_time_ms,
                sample.lap_time_ms,
                along_m,
            );
            open.valid = sample.valid;
            open.fuel = sample.fuel;
            open.max_speed = Some(match open.max_speed {
                Some(seen) => seen.max(sample.speed),
                None => sample.speed,
            });
            open.last_lap_time_ms = Some(sample.lap_time_ms);
            open.last_progress = Some(sample.progress);
            if open.due(sample.mono_ms) {
                open.points.push(LapPoint::capture(sample, along_m));
                open.last_trace_ms = Some(sample.mono_ms);
            }
            sector
        };
        if let Some(event) = sector {
            self.events.push(event);
        }
    }
}

#[derive(Debug)]
struct OpenLap {
    id: LapId,
    session_id: SessionId,
    number: i32,
    completed_at_open: i32,
    origin_m: f32,
    sector: i32,
    s1_ms: Option<i32>,
    s2_ms: Option<i32>,
    s1_end_m: Option<f32>,
    s2_end_m: Option<f32>,
    valid: bool,
    fuel: f32,
    max_speed: Option<f32>,
    last_trace_ms: Option<u64>,
    last_lap_time_ms: Option<i32>,
    last_progress: Option<f32>,
    points: Vec<LapPoint>,
}

impl OpenLap {
    fn begin(sample: &Sample, completed_at_open: i32) -> Self {
        Self {
            id: LapId::from_bytes(Uuid::new_v4().into_bytes()),
            session_id: sample.session_id,
            number: completed_at_open.saturating_add(1),
            completed_at_open,
            origin_m: sample.distance_m,
            sector: sample.sector_index,
            s1_ms: None,
            s2_ms: None,
            s1_end_m: None,
            s2_end_m: None,
            valid: false,
            fuel: 0.0,
            max_speed: None,
            last_trace_ms: None,
            last_lap_time_ms: None,
            last_progress: None,
            points: Vec::new(),
        }
    }

    fn finish(self, boundary: &Sample) -> Finished {
        let time_ms = real_ms(boundary.last_time_ms)
            .or_else(|| self.last_lap_time_ms.and_then(real_ms));
        let s3_ms = match (time_ms, self.s1_ms, self.s2_ms) {
            (Some(total), Some(s1), Some(s2)) => {
                real_ms(total.saturating_sub(s1.saturating_add(s2)))
            }
            _ => None,
        };
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms,
            s1_ms: self.s1_ms,
            s2_ms: self.s2_ms,
            s3_ms,
            s1_end_m: self.s1_end_m,
            s2_end_m: self.s2_end_m,
            valid: self.valid,
            fuel: self.fuel,
            max_speed: self.max_speed.unwrap_or(0.0),
            points: self.points,
        }
    }

    fn abandoned(self) -> Finished {
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms: None,
            s1_ms: self.s1_ms,
            s2_ms: self.s2_ms,
            s3_ms: None,
            s1_end_m: self.s1_end_m,
            s2_end_m: self.s2_end_m,
            valid: false,
            fuel: self.fuel,
            max_speed: self.max_speed.unwrap_or(0.0),
            points: self.points,
        }
    }

    fn partial(&self) -> Finished {
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms: None,
            s1_ms: self.s1_ms,
            s2_ms: self.s2_ms,
            s3_ms: None,
            s1_end_m: self.s1_end_m,
            s2_end_m: self.s2_end_m,
            valid: self.valid,
            fuel: self.fuel,
            max_speed: self.max_speed.unwrap_or(0.0),
            points: self.points.clone(),
        }
    }

    fn note_sector(
        &mut self,
        sector_index: i32,
        sector_ms: i32,
        lap_ms: i32,
        along_m: f32,
    ) -> Option<SessionEvent> {
        if sector_index == self.sector {
            return None;
        }
        let recorded = if sector_index == 1 && self.s1_ms.is_none() {
            let ms = real_ms(sector_ms).or_else(|| real_ms(lap_ms));
            if let Some(ms) = ms {
                self.s1_ms = Some(ms);
                self.s1_end_m = Some(along_m);
            }
            ms
        } else if sector_index == 2 && self.s2_ms.is_none() {
            let ms = sector_duration(sector_ms, self.s1_ms)
                .or_else(|| split_after(lap_ms, self.s1_ms));
            if let Some(ms) = ms {
                self.s2_ms = Some(ms);
                self.s2_end_m = Some(along_m);
            }
            ms
        } else {
            None
        };
        self.sector = sector_index;
        recorded.map(|ms| SessionEvent::SectorCompleted {
            index: sector_index,
            time: LapTime::from_ms_unchecked(ms),
        })
    }

    fn due(&self, mono_ms: u64) -> bool {
        self.last_trace_ms
            .is_none_or(|previous| mono_ms.saturating_sub(previous) >= TRACE_GAP_MS)
    }
}

/// One high-rate sample along an open lap (packed into the IPC plane).
///
/// Ground plane uses ACC `x`/`z` (world Y is vertical). `timestamp` is the
/// in-lap clock in milliseconds.
#[derive(Debug, Clone)]
struct LapPoint {
    distance: f32,
    timestamp: f32,
    speed: f32,
    throttle: f32,
    brake: f32,
    steer: f32,
    gear: f32,
    g_long: f32,
    g_lat: f32,
    x: f32,
    z: f32,
    pressure_fl: f32,
    pressure_fr: f32,
    pressure_rl: f32,
    pressure_rr: f32,
    brake_temp_fl: f32,
    brake_temp_fr: f32,
}

impl LapPoint {
    fn capture(sample: &Sample, along_m: f32) -> Self {
        Self {
            distance: along_m,
            timestamp: sample.lap_time_ms as f32,
            speed: sample.speed,
            throttle: sample.throttle,
            brake: sample.brake,
            steer: sample.steer,
            gear: sample.gear as f32,
            g_long: sample.g_long,
            g_lat: sample.g_lat,
            x: sample.x,
            z: sample.z,
            pressure_fl: sample.pressure_fl,
            pressure_fr: sample.pressure_fr,
            pressure_rl: sample.pressure_rl,
            pressure_rr: sample.pressure_rr,
            brake_temp_fl: sample.brake_temp_fl,
            brake_temp_fr: sample.brake_temp_fr,
        }
    }
}

struct Finished {
    id: LapId,
    session_id: SessionId,
    number: i32,
    time_ms: Option<i32>,
    s1_ms: Option<i32>,
    s2_ms: Option<i32>,
    s3_ms: Option<i32>,
    s1_end_m: Option<f32>,
    s2_end_m: Option<f32>,
    valid: bool,
    fuel: f32,
    max_speed: f32,
    points: Vec<LapPoint>,
}

const MAX_LAP_MS: i32 = 2 * 60 * 60 * 1000;

fn real_ms(ms: i32) -> Option<i32> {
    (ms > 0 && ms <= MAX_LAP_MS).then_some(ms)
}

fn sector_duration(split_ms: i32, previous: Option<i32>) -> Option<i32> {
    match (real_ms(split_ms), previous) {
        (Some(split), Some(done)) if split > done => Some(split - done),
        _ => None,
    }
}

fn split_after(lap_ms: i32, previous: Option<i32>) -> Option<i32> {
    sector_duration(lap_ms, previous)
}

fn line_crossed(open: &OpenLap, sample: &Sample) -> bool {
    let Some(previous_time) = open.last_lap_time_ms else {
        return false;
    };
    if previous_time < LAP_CLOCK_GUARD_MS {
        return false;
    }
    let clock_reset = sample.lap_time_ms < 0
        || sample
            .lap_time_ms
            .saturating_add(CLOCK_DROP_MS)
            < previous_time;
    if clock_reset {
        return true;
    }
    if open.sector >= 2 && sample.sector_index == 0 {
        return true;
    }
    let Some(previous) = open.last_progress else {
        return false;
    };
    sample.progress >= 0.0
        && sample.progress < 0.15
        && previous > 0.85
        && previous - sample.progress > 0.5
}

fn pack(lap: &Finished) -> Vec<u8> {
    let count = u32::try_from(lap.points.len()).unwrap_or(u32::MAX);
    let mut out = Vec::with_capacity(HEADER_LEN + lap.points.len() * CHANNEL_COUNT * 4);
    out.extend_from_slice(&lap.id.as_bytes());
    out.extend_from_slice(&lap.session_id.as_bytes());
    write_i32(&mut out, lap.number);
    write_u32(&mut out, count);
    write_i32(&mut out, lap.time_ms.unwrap_or(MISSING_MS));
    write_i32(&mut out, lap.s1_ms.unwrap_or(MISSING_MS));
    write_i32(&mut out, lap.s2_ms.unwrap_or(MISSING_MS));
    write_i32(&mut out, lap.s3_ms.unwrap_or(MISSING_MS));
    write_f32(&mut out, lap.s1_end_m.unwrap_or(MISSING_M));
    write_f32(&mut out, lap.s2_end_m.unwrap_or(MISSING_M));
    out.push(u8::from(lap.valid));
    out.extend_from_slice(&[0, 0, 0]);
    write_f32(&mut out, lap.fuel);
    write_f32(&mut out, lap.max_speed);
    debug_assert_eq!(out.len(), HEADER_LEN);
    write_plane(&mut out, &lap.points);
    out
}

fn write_plane(out: &mut Vec<u8>, points: &[LapPoint]) {
    write_values(out, points, |point| point.distance);
    write_values(out, points, |point| point.timestamp);
    write_values(out, points, |point| point.speed);
    write_values(out, points, |point| point.throttle);
    write_values(out, points, |point| point.brake);
    write_values(out, points, |point| point.steer);
    write_values(out, points, |point| point.gear);
    write_values(out, points, |point| point.g_long);
    write_values(out, points, |point| point.g_lat);
    write_values(out, points, |point| point.x);
    write_values(out, points, |point| point.z);
    write_values(out, points, |point| point.pressure_fl);
    write_values(out, points, |point| point.pressure_fr);
    write_values(out, points, |point| point.pressure_rl);
    write_values(out, points, |point| point.pressure_rr);
    write_values(out, points, |point| point.brake_temp_fl);
    write_values(out, points, |point| point.brake_temp_fr);
}

fn write_values(out: &mut Vec<u8>, points: &[LapPoint], value: impl Fn(&LapPoint) -> f32) {
    for point in points {
        write_f32(out, value(point));
    }
}

fn write_i32(out: &mut Vec<u8>, value: i32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn write_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn write_f32(out: &mut Vec<u8>, value: f32) {
    out.extend_from_slice(&value.to_le_bytes());
}
