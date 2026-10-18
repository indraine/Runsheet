//! Сборщик открытого круга.
//!
//! На вход подаётся снимок полей, не shared memory. Пока круг открыт, точка
//! трейса кладётся не чаще 20 Гц. Дистанция круга — `distance_traveled` минус
//! значение на старте. Смена сектора запоминает `last_sector_time` и эту
//! дистанцию. Рост `completed_lap` закрывает круг: время из `last_time`,
//! третий сектор — остаток, зачёт — с последнего тика перед линией.

// Пачку забирает доставка во фронт. На не-Windows поток сборщик не крутит,
// поэтому без `test` сборка эти типы не вызывает.
#![cfg_attr(not(any(windows, test)), allow(dead_code))]

use uuid::Uuid;

/// Минимальный зазор между точками трейса. 20 Гц — это 50 мс.
const TRACE_GAP_MS: u64 = 50;

/// Сколько каналов в плоскости. Порядок совпадает с `TRACE_CHANNELS` на фронте.
const CHANNEL_COUNT: usize = 16;

/// Байты заголовка до плоскости каналов.
const HEADER_LEN: usize = 76;

/// В заголовке нет времени сектора или круга.
const MISSING_MS: i32 = -1;

/// В заголовке нет дистанции границы сектора.
const MISSING_M: f32 = -1.0;

/// Один тик физики и графики. Часы снаружи, как у машины сессии.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Sample {
    /// Монотонные миллисекунды. От них считается зазор 20 Гц.
    pub mono_ms: u64,
    pub session_id: Uuid,
    /// `graphics.completed_lap`.
    pub completed_lap: i32,
    /// `graphics.last_time`, миллисекунды.
    pub last_time_ms: i32,
    /// `graphics.last_sector_time`, миллисекунды.
    pub last_sector_time_ms: i32,
    /// `graphics.current_sector_index`.
    pub sector_index: i32,
    /// `graphics.is_valid_lap` этого тика.
    pub valid: bool,
    /// `graphics.distance_traveled`, метры сессии.
    pub distance_m: f32,
    /// `physics.fuel`, литры.
    pub fuel: f32,
    /// `physics.gas`.
    pub throttle: f32,
    /// `physics.brake`.
    pub brake: f32,
    /// `physics.steer_angle`, градусы.
    pub steer: f32,
    /// `physics.speed_kmh`.
    pub speed: f32,
    /// `graphics.current_time`, миллисекунды текущего круга.
    pub lap_time_ms: i32,
    /// `physics.g_force.z`, продольная.
    pub g_long: f32,
    /// `physics.g_force.x`, боковая.
    pub g_lat: f32,
    /// Земля, `car_coordinates` машины `player_car_id`.
    pub x: f32,
    pub z: f32,
    pub pressure_fl: f32,
    pub pressure_fr: f32,
    pub pressure_rl: f32,
    pub pressure_rr: f32,
    /// Передние `physics.brake_temp`.
    pub brake_temp_fl: f32,
    pub brake_temp_fr: f32,
}

/// Состояние между тиками. Само время не читает.
#[derive(Debug, Default)]
pub(crate) struct Collector {
    open: Option<OpenLap>,
}

impl Collector {
    /// Сессия, которой принадлежит открытый буфер.
    pub(crate) fn bound_session(&self) -> Option<Uuid> {
        self.open.as_ref().map(|open| open.session_id)
    }

    /// Сбросить незавершённый круг, не пакуя его.
    /// Выезд закрылся или сессия сменилась: чужие точки в новый круг не переносятся.
    pub(crate) fn discard(&mut self) {
        self.open = None;
    }

    /// Сколько точек сейчас в открытом круге.
    #[cfg(test)]
    pub(crate) fn open_points(&self) -> usize {
        self.open
            .as_ref()
            .map(|open| open.points.len())
            .unwrap_or(0)
    }

    /// Принять тик. `Some` — круг только что закрылся, в буфере его пачка.
    #[must_use]
    pub(crate) fn push(&mut self, sample: &Sample) -> Option<Vec<u8>> {
        // Чужая сессия не дописывается в открытый круг: буфер принадлежит одной строке.
        if self
            .open
            .as_ref()
            .is_some_and(|open| open.session_id != sample.session_id)
        {
            self.open = None;
        }

        let closed = self.take_closed(sample);
        if self.open.is_none() {
            self.open = Some(OpenLap::begin(sample));
        }
        self.observe(sample);
        closed
    }

    /// Рост `completed_lap` закрывает круг снимком, который был до этого тика.
    fn take_closed(&mut self, boundary: &Sample) -> Option<Vec<u8>> {
        let grown = self
            .open
            .as_ref()
            .is_some_and(|open| boundary.completed_lap > open.completed_at_open);
        if !grown {
            return None;
        }
        let open = self.open.take()?;
        Some(pack(&open.finish(boundary)))
    }

    fn observe(&mut self, sample: &Sample) {
        let Some(open) = self.open.as_mut() else {
            return;
        };
        let along_m = sample.distance_m - open.origin_m;
        open.note_sector(sample.sector_index, sample.last_sector_time_ms, along_m);
        open.valid = sample.valid;
        open.fuel = sample.fuel;
        open.max_speed = Some(match open.max_speed {
            Some(seen) => seen.max(sample.speed),
            None => sample.speed,
        });
        if !open.due(sample.mono_ms) {
            return;
        }
        open.points.push(Point::capture(sample, along_m));
        open.last_trace_ms = Some(sample.mono_ms);
    }
}

#[derive(Debug)]
struct OpenLap {
    id: Uuid,
    session_id: Uuid,
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
    points: Vec<Point>,
}

impl OpenLap {
    fn begin(sample: &Sample) -> Self {
        Self {
            id: Uuid::new_v4(),
            session_id: sample.session_id,
            number: sample.completed_lap.saturating_add(1),
            completed_at_open: sample.completed_lap,
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
            points: Vec::new(),
        }
    }

    /// `last_time` берётся с линии. Зачёт, топливо и трейс — с тика перед ней:
    /// на границе `is_valid_lap` уже относится к следующему кругу.
    fn finish(self, boundary: &Sample) -> Finished {
        let s3_ms = match (self.s1_ms, self.s2_ms) {
            (Some(s1), Some(s2)) => {
                Some(boundary.last_time_ms.saturating_sub(s1.saturating_add(s2)))
            }
            _ => None,
        };
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms: Some(boundary.last_time_ms),
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

    fn note_sector(&mut self, sector_index: i32, sector_ms: i32, along_m: f32) {
        if sector_index == self.sector {
            return;
        }
        if sector_index == 1 && self.s1_ms.is_none() {
            self.s1_ms = Some(sector_ms);
            self.s1_end_m = Some(along_m);
        } else if sector_index == 2 && self.s2_ms.is_none() {
            self.s2_ms = Some(sector_ms);
            self.s2_end_m = Some(along_m);
        }
        self.sector = sector_index;
    }

    fn due(&self, mono_ms: u64) -> bool {
        self.last_trace_ms
            .is_none_or(|previous| mono_ms.saturating_sub(previous) >= TRACE_GAP_MS)
    }
}

#[derive(Debug)]
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
    id: Uuid,
    session_id: Uuid,
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

/// Заголовок и плоскость сэмплов.
///
/// Little-endian. Сначала заголовок: `lap_id` и `session_id` по 16 байт,
/// `number` i32, число сэмплов u32, `time_ms` `s1_ms` `s2_ms` `s3_ms` как i32,
/// `s1_end_m` и `s2_end_m` как f32, `valid` u8, три нулевых байта,
/// `fuel` и `max_speed` как f32. Нет времени или границы — `-1` / `-1.0`.
/// Дальше каналы подряд, не сэмплы: все `distance`, все `time`, затем
/// `speed`, `throttle`, `brake`, `steer`, `gLong`, `gLat`, `x`, `z`,
/// `pressureFl`, `pressureFr`, `pressureRl`, `pressureRr`,
/// `brakeTempFl`, `brakeTempFr`. Каждый канал — little-endian f32.
fn pack(lap: &Finished) -> Vec<u8> {
    let count = u32::try_from(lap.points.len()).unwrap_or(u32::MAX);
    let mut out = Vec::with_capacity(HEADER_LEN + lap.points.len() * CHANNEL_COUNT * 4);
    out.extend_from_slice(lap.id.as_bytes());
    out.extend_from_slice(lap.session_id.as_bytes());
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
