
use uuid::Uuid;

use crate::domain::{LapId, LapTime, SessionEvent, SessionId};

const TRACE_GAP_MS: u64 = 50;

const LAP_CLOCK_GUARD_MS: i32 = 3_000;

const CLOCK_DROP_MS: i32 = 1_500;

const CHANNEL_COUNT: usize = 16;

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

    #[cfg(test)]
    pub(crate) fn open_points(&self) -> usize {
        self.open
            .as_ref()
            .map(|open| open.points.len())
            .unwrap_or(0)
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
                open.points.push(Point::capture(sample, along_m));
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
    points: Vec<Point>,
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

#[derive(Debug, Clone)]
struct Point {
    distance: f32,
    time: f32,
    speed: f32,
    throttle: f32,
    brake: f32,
    steer: f32,
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

impl Point {
    fn capture(sample: &Sample, along_m: f32) -> Self {
        Self {
            distance: along_m,
            time: sample.lap_time_ms as f32,
            speed: sample.speed,
            throttle: sample.throttle,
            brake: sample.brake,
            steer: sample.steer,
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
    points: Vec<Point>,
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

fn write_plane(out: &mut Vec<u8>, points: &[Point]) {
    write_values(out, points, |point| point.distance);
    write_values(out, points, |point| point.time);
    write_values(out, points, |point| point.speed);
    write_values(out, points, |point| point.throttle);
    write_values(out, points, |point| point.brake);
    write_values(out, points, |point| point.steer);
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

fn write_values(out: &mut Vec<u8>, points: &[Point], value: impl Fn(&Point) -> f32) {
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

#[cfg(test)]
fn packet_lap_id(bytes: &[u8]) -> Option<LapId> {
    let raw: [u8; 16] = bytes.get(..16)?.try_into().ok()?;
    Some(LapId::from_bytes(raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(mono_ms: u64, completed: i32, sector: i32, distance_m: f32) -> Sample {
        Sample {
            mono_ms,
            session_id: SessionId::default(),
            completed_lap: completed,
            last_time_ms: 90_000,
            last_sector_time_ms: 30_000,
            sector_index: sector,
            valid: true,
            distance_m,
            fuel: 40.0,
            throttle: 0.5,
            brake: 0.0,
            steer: 1.0,
            speed: 200.0,
            lap_time_ms: 10_000,
            progress: 0.0,
            g_long: -0.2,
            g_lat: 0.1,
            x: 1.0,
            z: 2.0,
            pressure_fl: 27.0,
            pressure_fr: 27.0,
            pressure_rl: 27.0,
            pressure_rr: 27.0,
            brake_temp_fl: 300.0,
            brake_temp_fr: 300.0,
        }
    }

    fn read_i32(bytes: &[u8], at: usize) -> i32 {
        let raw: [u8; 4] = bytes[at..at + 4].try_into().unwrap();
        i32::from_le_bytes(raw)
    }

    fn read_u32(bytes: &[u8], at: usize) -> u32 {
        let raw: [u8; 4] = bytes[at..at + 4].try_into().unwrap();
        u32::from_le_bytes(raw)
    }

    fn read_f32(bytes: &[u8], at: usize) -> f32 {
        let raw: [u8; 4] = bytes[at..at + 4].try_into().unwrap();
        f32::from_le_bytes(raw)
    }

    #[test]
    fn preview_keeps_the_lap_id_and_grows_until_the_close() {
        let mut laps = Collector::default();
        assert!(laps.preview().is_none());

        assert!(laps.push(&at(0, 0, 0, 100.0)).is_none());
        assert_eq!(laps.open_number(), Some(1));
        let first = laps.preview().expect("открытый круг");
        assert_eq!(packet_lap_id(&first), laps.open_id());
        assert_eq!(first.len(), HEADER_LEN + CHANNEL_COUNT * 4);
        assert_eq!(read_u32(&first, 36), 1);
        assert_eq!(read_i32(&first, 40), MISSING_MS);

        assert!(laps.push(&at(TRACE_GAP_MS, 0, 1, 250.0)).is_none());
        let second = laps.preview().expect("круг всё ещё открыт");
        assert_eq!(packet_lap_id(&second), packet_lap_id(&first));
        assert_eq!(read_u32(&second, 36), 2);
        assert_eq!(read_i32(&second, 44), 30_000);
        assert_eq!(read_f32(&second, 56), 150.0);
        assert_eq!(read_i32(&second, 52), MISSING_MS);

        let open = laps.open_id();
        let mut boundary = at(TRACE_GAP_MS * 2, 1, 0, 400.0);
        boundary.last_time_ms = 91_234;
        let closed = laps.push(&boundary).expect("финиш");
        assert_eq!(packet_lap_id(&closed), open);
        assert_ne!(laps.open_id(), open);
        assert_eq!(read_i32(&closed, 40), 91_234);
        assert_eq!(read_u32(&closed, 36), 2);
    }

    #[test]
    fn line_cross_opens_the_next_lap_before_completed_lap_catches_up() {
        let mut laps = Collector::default();
        let mut running = at(0, 0, 2, 100.0);
        running.lap_time_ms = 80_000;
        running.progress = 0.97;
        assert!(laps.push(&running).is_none());
        assert_eq!(laps.open_number(), Some(1));

        let mut line = at(TRACE_GAP_MS, 0, 0, 4_100.0);
        line.lap_time_ms = 80;
        line.progress = 0.01;
        line.last_time_ms = 81_500;
        let closed = laps.push(&line).expect("финиш по линии");
        assert_eq!(read_i32(&closed, 32), 1);
        assert_eq!(read_i32(&closed, 40), 81_500);
        assert_eq!(laps.open_number(), Some(2));

        let mut follow = at(TRACE_GAP_MS + 10, 1, 0, 4_140.0);
        follow.lap_time_ms = 160;
        follow.progress = 0.02;
        assert!(laps.push(&follow).is_none());
        assert_eq!(laps.open_number(), Some(2));
        assert_eq!(laps.open_points(), 1);
    }

    #[test]
    fn sentinel_clock_on_the_line_still_closes_the_lap() {
        let mut laps = Collector::default();
        let mut running = at(0, 0, 2, 100.0);
        running.lap_time_ms = 90_000;
        running.progress = 0.96;
        assert!(laps.push(&running).is_none());

        let mut line = at(TRACE_GAP_MS, 0, 0, 5_900.0);
        line.lap_time_ms = -1;
        line.progress = 0.02;
        line.last_time_ms = 91_200;
        let closed = laps.push(&line).expect("финиш при стороже часов");
        assert_eq!(read_i32(&closed, 40), 91_200);
        assert_eq!(laps.open_number(), Some(2));
    }

    #[test]
    fn sector_wrap_closes_when_clock_has_not_dropped_yet() {
        let mut laps = Collector::default();
        let mut running = at(0, 0, 2, 100.0);
        running.lap_time_ms = 88_000;
        running.progress = 0.5;
        assert!(laps.push(&running).is_none());

        let mut line = at(TRACE_GAP_MS, 0, 0, 5_800.0);
        line.lap_time_ms = 88_100;
        line.progress = 0.5;
        line.last_time_ms = 88_050;
        let closed = laps.push(&line).expect("финиш по сектору 2→0");
        assert_eq!(read_i32(&closed, 32), 1);
        assert_eq!(laps.open_number(), Some(2));
    }

    #[test]
    fn sector_change_and_the_line_emit_session_events() {
        let mut laps = Collector::default();
        assert!(laps.push(&at(0, 0, 0, 100.0)).is_none());
        let started = laps.take_events();
        assert_eq!(started, vec![SessionEvent::LapStarted { lap_number: 1 }]);

        assert!(laps.push(&at(TRACE_GAP_MS, 0, 1, 250.0)).is_none());
        let sector = laps.take_events();
        assert_eq!(
            sector,
            vec![SessionEvent::SectorCompleted {
                index: 1,
                time: LapTime::from_ms_unchecked(30_000),
            }]
        );

        let mut boundary = at(TRACE_GAP_MS * 2, 1, 0, 400.0);
        boundary.last_time_ms = 91_234;
        assert!(laps.push(&boundary).is_some());
        let finished = laps.take_events();
        assert!(finished.contains(&SessionEvent::LapCompleted {
            lap_number: 1,
            time: Some(LapTime::from_ms_unchecked(91_234)),
        }));
        assert!(finished.contains(&SessionEvent::LapStarted { lap_number: 2 }));
    }

    #[test]
    fn s2_uses_cumulative_last_sector_as_a_split() {
        let mut laps = Collector::default();
        let mut start = at(0, 0, 0, 100.0);
        start.lap_time_ms = 1_000;
        start.last_sector_time_ms = i32::MAX;
        assert!(laps.push(&start).is_none());

        let mut first = at(TRACE_GAP_MS, 0, 1, 800.0);
        first.lap_time_ms = 30_000;
        first.last_sector_time_ms = 30_000;
        assert!(laps.push(&first).is_none());

        let mut second = at(TRACE_GAP_MS * 2, 0, 2, 1_600.0);
        second.lap_time_ms = 65_000;
        second.last_sector_time_ms = 65_000;
        assert!(laps.push(&second).is_none());
        let preview = laps.preview().expect("S2 как длительность");
        assert_eq!(read_i32(&preview, 44), 30_000);
        assert_eq!(read_i32(&preview, 48), 35_000);

        let mut near = at(TRACE_GAP_MS * 3, 0, 2, 2_200.0);
        near.lap_time_ms = 95_000;
        near.last_time_ms = i32::MAX;
        assert!(laps.push(&near).is_none());

        let mut line = at(TRACE_GAP_MS * 4, 1, 0, 2_400.0);
        line.lap_time_ms = 80;
        line.last_time_ms = 95_000;
        let closed = laps.push(&line).expect("финиш");
        assert_eq!(read_i32(&closed, 40), 95_000);
        assert_eq!(read_i32(&closed, 44), 30_000);
        assert_eq!(read_i32(&closed, 48), 35_000);
        assert_eq!(read_i32(&closed, 52), 30_000);
    }

    #[test]
    fn max_sentinel_is_not_a_sector_time() {
        let mut laps = Collector::default();
        let mut start = at(0, 0, 0, 100.0);
        start.lap_time_ms = 1_000;
        start.last_sector_time_ms = i32::MAX;
        start.last_time_ms = i32::MAX;
        assert!(laps.push(&start).is_none());

        let mut first = at(TRACE_GAP_MS, 0, 1, 800.0);
        first.lap_time_ms = 31_000;
        first.last_sector_time_ms = i32::MAX;
        first.last_time_ms = i32::MAX;
        assert!(laps.push(&first).is_none());
        let preview = laps.preview().expect("открытый круг");
        assert_eq!(read_i32(&preview, 44), 31_000);

        let mut second = at(TRACE_GAP_MS * 2, 0, 2, 1_600.0);
        second.lap_time_ms = 62_000;
        second.last_sector_time_ms = i32::MAX;
        assert!(laps.push(&second).is_none());
        let preview = laps.preview().expect("оба сектора");
        assert_eq!(read_i32(&preview, 48), 31_000);

        let mut near = at(TRACE_GAP_MS * 3, 0, 2, 2_200.0);
        near.lap_time_ms = 90_000;
        near.last_time_ms = i32::MAX;
        assert!(laps.push(&near).is_none());

        let mut line = at(TRACE_GAP_MS * 4, 1, 0, 2_400.0);
        line.lap_time_ms = 80;
        line.last_time_ms = i32::MAX;
        let closed = laps.push(&line).expect("финиш без last_time");
        assert_eq!(read_i32(&closed, 40), 90_000);
        assert_eq!(read_i32(&closed, 44), 31_000);
        assert_eq!(read_i32(&closed, 48), 31_000);
        assert_eq!(read_i32(&closed, 52), 28_000);
    }
}
