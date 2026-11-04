//! Перевод страницы Le Mans Ultimate в общий тик. Единицы и оси объяснены у полей `raw`.

use crate::domain::{
    BodyDamage, BrakePosition, CarPlace, CarState, Celsius, GameStatus, GraphicsFrame, LapTime,
    Penalty, PhysicsFrame, Psi, RaceFlag, Rain, SessionKind, Speed, StaticsFrame, ThrottlePosition,
    TireSet, TrackGrip, TrackProgress, Vec3,
};
use crate::ingress::{BoundaryError, CleanTick, PageOutcome};

use super::raw::{RawPage, RawPlayer, RawSession, RawWheel};

const GRAVITY_MPS2: f64 = 9.80665;
const KPA_PER_PSI: f64 = 6.894_757_293_168_361;
const KELVIN_OFFSET: f64 = 273.15;

const PHASE_BEFORE: u8 = 0;
const PHASE_GREEN: u8 = 5;
const PHASE_YELLOW: u8 = 6;
const PHASE_STOPPED: u8 = 7;
const PHASE_OVER: u8 = 8;
const PHASE_PAUSED: u8 = 9;

const PIT_ENTERING: u8 = 2;
const PIT_STOPPED: u8 = 3;
const PIT_EXITING: u8 = 4;

const CONTROL_AI: i8 = 1;
const CONTROL_REPLAY: i8 = 3;
const FLAG_BLUE: u8 = 6;
const COUNT_LAP_AND_TIME: u8 = 2;
const FINISH_FINISHED: i8 = 1;
const GAME_MODE_CLIENT: u8 = 2;

#[must_use]
pub(super) fn decode(
    previous_packet_id: Option<i32>,
    page: &RawPage,
) -> Result<PageOutcome, BoundaryError> {
    if previous_packet_id == Some(page.packet_id) {
        return Ok(PageOutcome::Stale);
    }
    Ok(PageOutcome::Fresh(CleanTick {
        physics: physics(page)?,
        graphic: graphic(page)?,
        statics: statics(page)?,
    }))
}

fn physics(page: &RawPage) -> Result<PhysicsFrame, BoundaryError> {
    let player = &page.player;
    let session = &page.session;
    let (g_long, g_lat, g_vert) = gravity(player.local_accel)?;
    let (heading, pitch, roll) = attitude(player.ori)?;
    let ignition = player.ignition_starter != 0;
    let rpm = whole("engine_rpm", player.engine_rpm)?;
    Ok(PhysicsFrame {
        packet_id: page.packet_id,
        speed: Speed::from_kmh_unchecked(finite_f32(
            "speed",
            horizontal_speed(player.local_vel)? * 3.6,
        )?),
        throttle: ThrottlePosition::from_fraction_unchecked(unit_interval(
            "throttle",
            player.throttle,
        )?),
        brake: BrakePosition::from_fraction_unchecked(unit_interval("brake", player.brake)?),
        steer_deg: finite_f32("steer", steer_deg(player)?)?,
        gear: player.gear,
        rpm,
        g_long,
        g_lat,
        heading,
        pressure: TireSet::new(
            psi("pressure.fl", player.wheels[0].pressure_kpa)?,
            psi("pressure.fr", player.wheels[1].pressure_kpa)?,
            psi("pressure.rl", player.wheels[2].pressure_kpa)?,
            psi("pressure.rr", player.wheels[3].pressure_kpa)?,
        ),
        brake_temp: TireSet::new(
            celsius("brake_temp.fl", player.wheels[0].brake_temp_c)?,
            celsius("brake_temp.fr", player.wheels[1].brake_temp_c)?,
            celsius("brake_temp.rl", player.wheels[2].brake_temp_c)?,
            celsius("brake_temp.rr", player.wheels[3].brake_temp_c)?,
        ),
        fuel_l: finite_f32("fuel", player.fuel_l)?,
        air: celsius("ambient", session.ambient_c)?,
        road: celsius("track", session.track_c)?,
        brake_bias: 1.0 - unit_interval("rear_brake_bias", player.rear_brake_bias)?,
        clutch: unit_interval("clutch", player.clutch)?,
        autoshifter: false,
        ignition,
        starter: player.ignition_starter == 2,
        engine_running: ignition && rpm > 0,
        velocity: vec3("local_vel", player.local_vel)?,
        local_velocity: vec3("local_vel", player.local_vel)?,
        angular_velocity: vec3("local_rot", player.local_rot)?,
        g_vert,
        pitch,
        roll,
        force_feedback: finite_f32("steering_torque", player.steering_shaft_torque)?,
        wheel_slip: wheel_values(player, |wheel| finite_f32("slip", wheel.slip_long_mps))?,
        wheel_angular_speed: wheel_values(player, |wheel| {
            finite_f32("rotation", wheel.rotation_rad_s)
        })?,
        tyre_temp: TireSet::new(
            kelvin("carcass.fl", player.wheels[0].carcass_k)?,
            kelvin("carcass.fr", player.wheels[1].carcass_k)?,
            kelvin("carcass.rl", player.wheels[2].carcass_k)?,
            kelvin("carcass.rr", player.wheels[3].carcass_k)?,
        ),
        suspension_travel: wheel_values(player, |wheel| {
            finite_f32("suspension", wheel.suspension_deflection_m * 1_000.0)
        })?,
        brake_pressure: wheel_values(player, |wheel| {
            finite_f32("brake_pressure", wheel.brake_pressure)
        })?,
        suspension_damage: TireSet::new(0.0, 0.0, 0.0, 0.0),
        slip_ratio: TireSet::new(0.0, 0.0, 0.0, 0.0),
        slip_angle: TireSet::new(0.0, 0.0, 0.0, 0.0),
        pad_life: TireSet::new(0.0, 0.0, 0.0, 0.0),
        disc_life: TireSet::new(0.0, 0.0, 0.0, 0.0),
        front_brake_compound: 0,
        rear_brake_compound: 0,
        tyre_contact_point: TireSet::new(origin(), origin(), origin(), origin()),
        tyre_contact_normal: TireSet::new(origin(), origin(), origin(), origin()),
        tyre_contact_heading: TireSet::new(origin(), origin(), origin(), origin()),
        tc: 0.0,
        abs: 0.0,
        pit_limiter: player.speed_limiter,
        turbo_boost: finite_f32("turbo", player.turbo_boost)?,
        water: celsius("water", player.engine_water_temp)?,
        damage: body_damage(player.dents),
        ai_controlled: session.control == CONTROL_AI,
        kerb_vibration: 0.0,
        slip_vibration: 0.0,
        g_vibration: 0.0,
        abs_vibration: 0.0,
    })
}

fn graphic(page: &RawPage) -> Result<GraphicsFrame, BoundaryError> {
    let player = &page.player;
    let session = &page.session;
    let (sector_index, sector_pit) = sector(player.current_sector);
    let status = game_status(session);
    let flag = race_flag(session, status);
    let in_pit_lane = session.in_pits
        || sector_pit
        || session.pit_state == PIT_ENTERING
        || session.pit_state == PIT_EXITING;
    let in_pit_box = session.pit_state == PIT_STOPPED;
    let setup_menu = session.in_garage;
    let place = CarPlace {
        status,
        setup_menu,
        in_pit_box,
        in_pit_lane,
        checkered: flag == RaceFlag::Checkered,
    };
    let (wind_speed, wind_direction) = wind(session.wind)?;
    let compound = compound(&player.front_compound, &player.rear_compound);
    let rain_tyres = is_wet(&compound);
    Ok(GraphicsFrame {
        status,
        kind: session_kind(session.session),
        completed_lap: session.completed_laps.max(0),
        current_lap_time: optional_ms("time_into_lap", session.time_into_lap_s, true)?,
        last_time: optional_ms("last_lap", session.last_lap_s, false)?,
        last_sector_time: last_sector(session, sector_index)?,
        sector_index,
        valid_lap: session.count_lap_flag == COUNT_LAP_AND_TIME,
        distance_m: finite_f32("lap_dist", session.lap_dist_m)?,
        in_pit_box,
        in_pit_lane,
        car_id: player.id,
        car_count: session.num_vehicles.max(0),
        ground_x: finite_f32("pos.x", player.pos[0])?,
        ground_z: finite_f32("pos.z", player.pos[2])?,
        tc: 0,
        engine_map: 0,
        abs: 0,
        setup_menu,
        main_menu: !session.in_realtime && session.game_phase == PHASE_BEFORE,
        green: session.game_phase == PHASE_GREEN,
        car_state: CarState::InGarage.step(place).state,
        progress: progress(session.lap_dist_m, session.lap_length_m)?,
        packet_id: page.packet_id,
        session_index: session.session,
        current_time_text: String::new(),
        last_time_text: String::new(),
        best_time_text: String::new(),
        last_sector_text: String::new(),
        position: session.place,
        best_time_ms: stored_ms("best_lap", session.best_lap_s)?,
        lap_count: session.max_laps,
        delta_text: String::new(),
        estimated_text: String::new(),
        delta_ms: 0,
        estimated_ms: stored_ms("estimated_lap", session.estimated_lap_s)?,
        delta_positive: false,
        fuel_laps: 0.0,
        session_left_s: session_left(session.current_et_s, session.end_et_s)?,
        ideal_line: false,
        mandatory_pit_done: false,
        missing_mandatory_pits: i32::from(player.scheduled_stops),
        penalty_time_s: 0.0,
        penalty: if session.num_penalties > 0 {
            Penalty::Unknown
        } else {
            Penalty::None
        },
        flag,
        car_coordinates: car_points(&page.cars)?,
        car_ids: page.cars.iter().map(|car| car.id).collect(),
        wind_speed,
        wind_direction,
        rain: rain(session.raining)?,
        rain_in_10m: Rain::None,
        rain_in_30m: Rain::None,
        grip: grip(session.path_wetness)?,
        track_status: String::new(),
        clock_s: finite_f32("current_et", session.current_et_s)?,
        tc_cut: 0,
        wipers: 0,
        stint_total_left_s: 0,
        stint_left_s: 0,
        rain_tyres,
        rain_light: false,
        flashing_light: false,
        light_stage: i32::from(player.headlights),
        indicator_left: false,
        indicator_right: false,
        tyre_compound: compound,
        main_display: 0,
        secondary_display: 0,
        fuel_per_lap: 0.0,
        used_fuel: 0.0,
        exhaust: Celsius::from_celsius_unchecked(0.0),
        gap_ahead_ms: stored_ms("time_behind_next", session.time_behind_next_s)?,
        gap_behind_ms: 0,
        yellow: session.game_phase == PHASE_YELLOW || session.yellow_flag_state > 0,
        yellow_s1: session.sector_flag[0] != 0,
        yellow_s2: session.sector_flag[1] != 0,
        yellow_s3: session.sector_flag[2] != 0,
        white_flag: false,
        green_light: session.game_phase == PHASE_GREEN,
        chequered: session.game_phase == PHASE_OVER || session.finish_status == FINISH_FINISHED,
        red_flag: session.game_phase == PHASE_STOPPED,
        mfd_tyre_set: 0,
        mfd_fuel_l: 0.0,
        mfd_pressure: TireSet::new(0.0, 0.0, 0.0, 0.0),
        current_tyre_set: 0,
        strategy_tyre_set: 0,
    })
}

fn statics(page: &RawPage) -> Result<StaticsFrame, BoundaryError> {
    let player = &page.player;
    let session = &page.session;
    let compound = compound(&player.front_compound, &player.rear_compound);
    let wet = is_wet(&compound);
    Ok(StaticsFrame {
        track: session.track.clone(),
        car: player.vehicle_name.clone(),
        driver: session.driver.clone(),
        online: session.game_mode == GAME_MODE_CLIENT || session.server_port != 0,
        shared_memory_version: session.plugin_version.clone(),
        game_version: "Le Mans Ultimate".to_string(),
        session_count: 0,
        entered_cars: session.num_vehicles.max(0),
        sector_count: 3,
        player_name: String::new(),
        player_surname: String::new(),
        player_nick: session.driver.clone(),
        max_rpm: whole("engine_max_rpm", player.engine_max_rpm)?,
        max_fuel_l: finite_f32("fuel_capacity", player.fuel_capacity_l)?,
        penalty_enabled: false,
        aid_fuel_rate: 0.0,
        aid_tyre_rate: 0.0,
        aid_mechanical_damage: 0.0,
        aid_stability: 0.0,
        aid_auto_clutch: false,
        pit_window_start_s: 0,
        pit_window_end_s: 0,
        dry_tyre: if wet { String::new() } else { compound.clone() },
        wet_tyre: if wet { compound } else { String::new() },
    })
}

/// +z смотрит назад, поэтому разгон вперёд даёт отрицательное `local_accel.z`.
fn gravity(local_accel: [f64; 3]) -> Result<(f32, f32, f32), BoundaryError> {
    let x = finite_f64("local_accel.x", local_accel[0])?;
    let y = finite_f64("local_accel.y", local_accel[1])?;
    let z = finite_f64("local_accel.z", local_accel[2])?;
    Ok((
        finite_f32("g_long", -z / GRAVITY_MPS2)?,
        finite_f32("g_lat", -x / GRAVITY_MPS2)?,
        finite_f32("g_vert", y / GRAVITY_MPS2)?,
    ))
}

fn horizontal_speed(local_vel: [f64; 3]) -> Result<f64, BoundaryError> {
    let x = finite_f64("local_vel.x", local_vel[0])?;
    let z = finite_f64("local_vel.z", local_vel[2])?;
    Ok((x * x + z * z).sqrt())
}

/// Идентичная матрица — нос вдоль мирового −Z, курс 0.
fn attitude(ori: [[f64; 3]; 3]) -> Result<(f32, f32, f32), BoundaryError> {
    if ori.iter().flatten().any(|value| !value.is_finite()) {
        return Err(BoundaryError::NonFinite { field: "ori" });
    }
    let heading = ori[0][2].atan2(ori[2][2]);
    let forward_y = -ori[1][2];
    let horizontal = (ori[0][2] * ori[0][2] + ori[2][2] * ori[2][2]).sqrt();
    let pitch = forward_y.atan2(horizontal);
    let roll = ori[0][1].atan2(ori[1][1]);
    Ok((
        finite_f32("heading", heading)?,
        finite_f32("pitch", pitch)?,
        finite_f32("roll", roll)?,
    ))
}

/// Физический ход — радианы от упора до упора. Если его нет, берём визуальный ход в градусах.
fn steer_deg(player: &RawPlayer) -> Result<f64, BoundaryError> {
    let steering = finite_f64("steering", player.steering)?;
    let physical = finite_f64(
        "physical_steering_range",
        f64::from(player.physical_steering_range_rad),
    )?;
    let visual = finite_f64(
        "visual_steering_range",
        f64::from(player.visual_steering_range_deg),
    )?;
    let half_deg = if physical.abs() > 1.0e-3 {
        physical * 0.5 * (180.0 / std::f64::consts::PI)
    } else {
        visual * 0.5
    };
    Ok(steering * half_deg)
}

fn sector(encoded: i32) -> (i32, bool) {
    let pit = encoded < 0;
    let index = (encoded as u32 & 0x7fff_ffff) as i32;
    let index = if (0..=2).contains(&index) { index } else { 0 };
    (index, pit)
}

fn game_status(session: &RawSession) -> GameStatus {
    if session.control == CONTROL_REPLAY {
        return GameStatus::Replay;
    }
    if session.game_phase == PHASE_PAUSED || session.game_phase == PHASE_STOPPED {
        return GameStatus::Pause;
    }
    if session.in_realtime {
        return GameStatus::Live;
    }
    if session.session_started && session.game_phase != PHASE_BEFORE {
        return GameStatus::Pause;
    }
    GameStatus::Off
}

fn race_flag(session: &RawSession, status: GameStatus) -> RaceFlag {
    if status == GameStatus::Replay {
        return RaceFlag::None;
    }
    if session.game_phase == PHASE_OVER || session.finish_status == FINISH_FINISHED {
        return RaceFlag::Checkered;
    }
    if session.flag == FLAG_BLUE {
        return RaceFlag::Blue;
    }
    if session.game_phase == PHASE_YELLOW || session.yellow_flag_state > 0 {
        return RaceFlag::Yellow;
    }
    if session.game_phase == PHASE_GREEN {
        return RaceFlag::Green;
    }
    RaceFlag::None
}

fn session_kind(session: i32) -> SessionKind {
    match session {
        0..=4 | 9 => SessionKind::Practice,
        5..=8 => SessionKind::Qualifying,
        10..=13 => SessionKind::Race,
        _ => SessionKind::Unknown,
    }
}

fn last_sector(session: &RawSession, sector_index: i32) -> Result<Option<LapTime>, BoundaryError> {
    let seconds = match sector_index {
        1 => session.last_sector1_s,
        2 => session.last_sector2_s,
        _ => return Ok(None),
    };
    optional_ms("last_sector", seconds, false)
}

fn progress(along_m: f64, length_m: f64) -> Result<TrackProgress, BoundaryError> {
    let along_m = finite_f64("lap_dist", along_m)?;
    let length_m = finite_f64("lap_length", length_m)?;
    let fraction = if length_m > 0.0 {
        (along_m / length_m).clamp(0.0, 1.0)
    } else {
        0.0
    };
    Ok(TrackProgress::from_fraction_unchecked(finite_f32(
        "progress", fraction,
    )?))
}

fn session_left(current_s: f64, end_s: f64) -> Result<f32, BoundaryError> {
    let current_s = finite_f64("current_et", current_s)?;
    let end_s = finite_f64("end_et", end_s)?;
    let left = if end_s > current_s {
        end_s - current_s
    } else {
        0.0
    };
    finite_f32("session_left", left)
}

fn wind(vector: [f64; 3]) -> Result<(f32, f32), BoundaryError> {
    let x = finite_f64("wind.x", vector[0])?;
    let z = finite_f64("wind.z", vector[2])?;
    Ok((
        finite_f32("wind_speed", (x * x + z * z).sqrt())?,
        finite_f32("wind_direction", x.atan2(z).to_degrees())?,
    ))
}

fn rain(amount: f64) -> Result<Rain, BoundaryError> {
    let amount = finite_f64("raining", amount)?;
    Ok(if amount <= 0.0 {
        Rain::None
    } else if amount < 0.05 {
        Rain::Drizzle
    } else if amount < 0.20 {
        Rain::Light
    } else if amount < 0.45 {
        Rain::Medium
    } else if amount < 0.75 {
        Rain::Heavy
    } else {
        Rain::Thunderstorm
    })
}

fn grip(wetness: f64) -> Result<TrackGrip, BoundaryError> {
    let wetness = finite_f64("path_wetness", wetness)?;
    Ok(if wetness < 0.02 {
        TrackGrip::Optimum
    } else if wetness < 0.15 {
        TrackGrip::Greasy
    } else if wetness < 0.40 {
        TrackGrip::Damp
    } else if wetness < 0.75 {
        TrackGrip::Wet
    } else {
        TrackGrip::Flooded
    })
}

fn body_damage(dents: [u8; 8]) -> BodyDamage {
    // Восемь точек по кругу без подписей сторон. Пока пик лежит только в центре.
    let peak = f32::from(dents.into_iter().max().unwrap_or(0)) / 2.0;
    BodyDamage {
        front: 0.0,
        rear: 0.0,
        left: 0.0,
        right: 0.0,
        center: peak,
    }
}

fn origin() -> Vec3 {
    Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    }
}

fn compound(front: &str, rear: &str) -> String {
    if front.is_empty() {
        return rear.to_string();
    }
    if rear.is_empty() || front == rear {
        return front.to_string();
    }
    format!("{front} / {rear}")
}

fn is_wet(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name.contains("wet") || name.contains("rain")
}

fn car_points(cars: &[super::raw::RawCar]) -> Result<Vec<Vec3>, BoundaryError> {
    cars.iter().map(|car| vec3("car_pos", car.pos)).collect()
}

fn wheel_values(
    player: &RawPlayer,
    mut read: impl FnMut(&RawWheel) -> Result<f32, BoundaryError>,
) -> Result<TireSet<f32>, BoundaryError> {
    Ok(TireSet::new(
        read(&player.wheels[0])?,
        read(&player.wheels[1])?,
        read(&player.wheels[2])?,
        read(&player.wheels[3])?,
    ))
}

fn vec3(field: &'static str, value: [f64; 3]) -> Result<Vec3, BoundaryError> {
    Ok(Vec3 {
        x: finite_f32(field, value[0])?,
        y: finite_f32(field, value[1])?,
        z: finite_f32(field, value[2])?,
    })
}

fn optional_ms(
    field: &'static str,
    seconds: f64,
    allow_zero: bool,
) -> Result<Option<LapTime>, BoundaryError> {
    if !seconds.is_finite() {
        return Err(BoundaryError::NonFinite { field });
    }
    if seconds < 0.0 || (!allow_zero && seconds == 0.0) {
        return Ok(None);
    }
    let ms = seconds * 1_000.0;
    if !(0.0..=f64::from(i32::MAX)).contains(&ms) {
        return Ok(None);
    }
    Ok(Some(LapTime::from_ms_unchecked(ms.round() as i32)))
}

fn stored_ms(field: &'static str, seconds: f64) -> Result<i32, BoundaryError> {
    Ok(optional_ms(field, seconds, false)?
        .map(LapTime::ms)
        .unwrap_or(0))
}

fn celsius(field: &'static str, degrees: f64) -> Result<Celsius, BoundaryError> {
    Ok(Celsius::from_celsius_unchecked(finite_f32(field, degrees)?))
}

fn kelvin(field: &'static str, kelvin: f64) -> Result<Celsius, BoundaryError> {
    let kelvin = finite_f64(field, kelvin)?;
    let degrees = if kelvin <= 0.0 {
        0.0
    } else {
        kelvin - KELVIN_OFFSET
    };
    Ok(Celsius::from_celsius_unchecked(finite_f32(field, degrees)?))
}

fn psi(field: &'static str, kpa: f64) -> Result<Psi, BoundaryError> {
    Ok(Psi::from_psi_unchecked(finite_f32(
        field,
        finite_f64(field, kpa)? / KPA_PER_PSI,
    )?))
}

fn whole(field: &'static str, value: f64) -> Result<i32, BoundaryError> {
    let value = finite_f64(field, value)?;
    if !(f64::from(i32::MIN)..=f64::from(i32::MAX)).contains(&value) {
        return Err(BoundaryError::NonFinite { field });
    }
    Ok(value.round() as i32)
}

fn unit_interval(field: &'static str, value: f64) -> Result<f32, BoundaryError> {
    Ok(finite_f32(field, value)?.clamp(0.0, 1.0))
}

fn finite_f32(field: &'static str, value: f64) -> Result<f32, BoundaryError> {
    if value.is_finite() && value.abs() <= f64::from(f32::MAX) {
        Ok(value as f32)
    } else {
        Err(BoundaryError::NonFinite { field })
    }
}

fn finite_f64(field: &'static str, value: f64) -> Result<f64, BoundaryError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(BoundaryError::NonFinite { field })
    }
}

#[cfg(test)]
mod tests {
    use super::{COUNT_LAP_AND_TIME, GRAVITY_MPS2, PHASE_GREEN, RawPage, decode, sector};
    use crate::domain::{CarState, GameStatus, RaceFlag, SessionKind};
    use crate::ingress::PageOutcome;

    fn near(actual: f32, expected: f32) {
        assert!((actual - expected).abs() < 1.0e-3, "{actual} != {expected}");
    }

    fn driving() -> RawPage {
        let mut page = RawPage::default();
        page.packet_id = 7;
        page.player.local_vel[2] = -50.0;
        page.player.local_accel[0] = -GRAVITY_MPS2;
        page.player.local_accel[2] = GRAVITY_MPS2;
        page.player.throttle = 0.5;
        page.player.brake = 0.25;
        page.player.steering = 1.0;
        page.player.physical_steering_range_rad = std::f32::consts::PI;
        page.player.gear = 4;
        page.player.engine_rpm = 7_000.0;
        page.player.fuel_l = 40.0;
        page.player.rear_brake_bias = 0.4;
        page.player.pos = [100.0, 2.0, -40.0];
        page.player.vehicle_name = "Oreca 07".to_string();
        page.player.wheels[0].pressure_kpa = 28.0 * 6.894_757_293_168_361;
        page.player.wheels[0].carcass_k = 373.15;
        page.player.wheels[0].brake_temp_c = 450.0;
        page.session.track = "Le Mans".to_string();
        page.session.driver = "Nick".to_string();
        page.session.session = 10;
        page.session.game_phase = PHASE_GREEN;
        page.session.in_realtime = true;
        page.session.ambient_c = 22.0;
        page.session.track_c = 31.0;
        page.session.lap_length_m = 13_626.0;
        page.session.lap_dist_m = 6_813.0;
        page.session.completed_laps = 3;
        page.session.time_into_lap_s = 12.5;
        page.session.last_lap_s = 95.5;
        page.session.last_sector1_s = 30.5;
        page.session.count_lap_flag = COUNT_LAP_AND_TIME;
        page.player.current_sector = 1;
        page
    }

    #[test]
    fn a_repeated_packet_is_stale() {
        let page = driving();
        let PageOutcome::Fresh(_) = decode(None, &page).unwrap() else {
            panic!("first packet must be fresh");
        };
        assert_eq!(decode(Some(7), &page).unwrap(), PageOutcome::Stale);
    }

    #[test]
    fn a_green_lap_keeps_driver_inputs_and_session() {
        let PageOutcome::Fresh(tick) = decode(None, &driving()).unwrap() else {
            panic!("expected a fresh tick");
        };
        near(tick.physics.speed.kmh(), 180.0);
        near(tick.physics.g_long, -1.0);
        near(tick.physics.g_lat, 1.0);
        near(tick.physics.throttle.fraction(), 0.5);
        near(tick.physics.brake.fraction(), 0.25);
        near(tick.physics.steer_deg, 90.0);
        near(tick.physics.brake_bias, 0.6);
        near(tick.physics.pressure.front_left.psi(), 28.0);
        near(tick.physics.tyre_temp.front_left.celsius(), 100.0);
        near(tick.physics.brake_temp.front_left.celsius(), 450.0);
        near(tick.physics.heading, 0.0);
        assert_eq!(tick.physics.gear, 4);
        assert_eq!(tick.physics.rpm, 7_000);
        assert_eq!(tick.graphic.kind, SessionKind::Race);
        assert_eq!(tick.graphic.status, GameStatus::Live);
        assert_eq!(tick.graphic.car_state, CarState::OnTrack);
        assert_eq!(tick.graphic.flag, RaceFlag::Green);
        assert_eq!(tick.graphic.completed_lap, 3);
        assert_eq!(tick.graphic.sector_index, 1);
        assert_eq!(tick.graphic.current_lap_time.unwrap().ms(), 12_500);
        assert_eq!(tick.graphic.last_time.unwrap().ms(), 95_500);
        assert_eq!(tick.graphic.last_sector_time.unwrap().ms(), 30_500);
        near(tick.graphic.progress.fraction(), 0.5);
        near(tick.graphic.ground_x, 100.0);
        near(tick.graphic.ground_z, -40.0);
        assert_eq!(tick.statics.track, "Le Mans");
        assert_eq!(tick.statics.car, "Oreca 07");
        assert_eq!(tick.statics.driver, "Nick");
        assert!(tick.graphic.valid_lap);
    }

    #[test]
    fn the_pit_bit_on_the_sector_puts_the_car_in_the_lane() {
        let (index, pit) = sector(0x8000_0002_u32 as i32);
        assert_eq!((index, pit), (2, true));
        let mut page = driving();
        page.player.current_sector = 0x8000_0002_u32 as i32;
        let PageOutcome::Fresh(tick) = decode(None, &page).unwrap() else {
            panic!("expected a fresh tick");
        };
        assert_eq!(tick.graphic.sector_index, 2);
        assert!(tick.graphic.in_pit_lane);
        assert_eq!(tick.graphic.car_state, CarState::InPitLane);
    }

    #[test]
    fn the_garage_stall_is_the_garage() {
        let mut page = driving();
        page.session.in_garage = true;
        let PageOutcome::Fresh(tick) = decode(None, &page).unwrap() else {
            panic!("expected a fresh tick");
        };
        assert!(tick.graphic.setup_menu);
        assert_eq!(tick.graphic.car_state, CarState::InGarage);
    }

    #[test]
    fn an_unknown_session_code_does_not_drop_the_tick() {
        let mut page = driving();
        page.session.session = 99;
        let PageOutcome::Fresh(tick) = decode(None, &page).unwrap() else {
            panic!("expected a fresh tick");
        };
        assert_eq!(tick.graphic.kind, SessionKind::Unknown);
    }

    #[test]
    fn a_non_finite_fuel_reading_is_rejected() {
        let mut page = driving();
        page.player.fuel_l = f64::NAN;
        let error = decode(None, &page).unwrap_err();
        assert_eq!(
            error,
            crate::ingress::BoundaryError::NonFinite { field: "fuel" }
        );
    }
}
