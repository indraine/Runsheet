//! Единственное место, где сырой пакет становится доменным кадром.
//!
//! Конечность, диапазон педалей и неизвестный дискриминатор проверяются здесь.
//! Деления нет: производное отношение, если появится, тоже считается на этой границе.

use std::fmt;

#[cfg(test)]
use acc_shared_memory_rs::datatypes::Vector3f;
use acc_shared_memory_rs::datatypes::Wheels;
use acc_shared_memory_rs::enums::{AccFlagType, AccSessionType, AccStatus};
use acc_shared_memory_rs::maps::ACCMap;

use crate::domain::{
    BrakePosition, CarPlace, CarState, Celsius, CleanSessionGraphic, CleanTelemetryFrame,
    GameStatus, LapTime, Psi, SessionKind, Speed, ThrottlePosition, TireSet, TrackProgress,
};

use super::raw::{RawGraphicPage, RawPhysicsPage, RawStaticPage};

/// Кадр не прошёл границу. Домен его не увидит.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BoundaryError {
    NonFinite { field: &'static str },
    UnknownDiscriminant { field: &'static str, value: i32 },
}

impl fmt::Display for BoundaryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NonFinite { field } => write!(formatter, "поле {field} не конечное"),
            Self::UnknownDiscriminant { field, value } => {
                write!(formatter, "поле {field} содержит неизвестный код {value}")
            }
        }
    }
}

impl std::error::Error for BoundaryError {}

/// Повтор уже принятого `packet_id` или новый чистый кадр.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PageOutcome {
    Stale,
    Fresh(CleanTick),
}

/// Физика и графика одного свежего пакета.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CleanTick {
    pub physics: CleanTelemetryFrame,
    pub graphic: CleanSessionGraphic,
}

/// Свежий пакет или повтор того же `physics.packet_id`.
///
/// Откат идентификатора назад — новый поток, не ошибка.
/// Неконечное обязательное поле отвергает кадр целиком.
#[must_use]
pub(crate) fn decode(
    previous_packet_id: Option<i32>,
    map: &ACCMap,
) -> Result<PageOutcome, BoundaryError> {
    if previous_packet_id == Some(map.physics.packet_id) {
        return Ok(PageOutcome::Stale);
    }
    let mut physics = CleanTelemetryFrame::try_from(&map.physics)?;
    place_on_track(&mut physics, &map.graphics)?;
    let mut graphic = CleanSessionGraphic::try_from(&map.graphics)?;
    apply_session_context(&mut graphic, &map.statics, &map.physics)?;
    Ok(PageOutcome::Fresh(CleanTick { physics, graphic }))
}

impl TryFrom<&RawPhysicsPage> for CleanTelemetryFrame {
    type Error = BoundaryError;

    fn try_from(page: &RawPhysicsPage) -> Result<Self, Self::Error> {
        let pressure = finite_set(
            [
                "wheel_pressure.front_left",
                "wheel_pressure.front_right",
                "wheel_pressure.rear_left",
                "wheel_pressure.rear_right",
            ],
            page.wheel_pressure,
        )?;
        let brake_temp_fl = finite("brake_temp.front_left", page.brake_temp.front_left)?;
        let brake_temp_fr = finite("brake_temp.front_right", page.brake_temp.front_right)?;
        let g_lat = finite("g_force.x", page.g_force.x)?;
        let g_long = finite("g_force.z", page.g_force.z)?;
        finite("g_force.y", page.g_force.y)?;
        // Позиция и земля живут на странице графики. Ноль заменяется в `place_on_track`.
        Ok(Self {
            packet_id: page.packet_id,
            speed: Speed::from_kmh_unchecked(finite("speed_kmh", page.speed_kmh)?),
            throttle: ThrottlePosition::from_fraction_unchecked(unit_interval("gas", page.gas)?),
            brake: BrakePosition::from_fraction_unchecked(unit_interval("brake", page.brake)?),
            steer_deg: finite("steer_angle", page.steer_angle)?,
            progress: TrackProgress::from_fraction_unchecked(0.0),
            fuel_l: finite("fuel", page.fuel)?,
            g_long,
            g_lat,
            ground_x: 0.0,
            ground_z: 0.0,
            pressure: pressure.map(Psi::from_psi_unchecked),
            brake_temp_fl: Celsius::from_celsius_unchecked(brake_temp_fl),
            brake_temp_fr: Celsius::from_celsius_unchecked(brake_temp_fr),
        })
    }
}

impl TryFrom<&RawGraphicPage> for CleanSessionGraphic {
    type Error = BoundaryError;

    fn try_from(page: &RawGraphicPage) -> Result<Self, Self::Error> {
        let status = game_status(page.status as i32)?;
        let place = CarPlace {
            status,
            setup_menu: page.is_setup_menu_visible,
            in_pit: page.is_in_pit,
            in_pit_lane: page.is_in_pit_lane,
            checkered: checkered_flag(page.flag as i32)?,
        };
        // У страницы нет предыдущего места. Replay его не задаёт и остаётся гаражом.
        // Шаг с историей делает секвенсор, когда у него есть прошлый `CarState`.
        let car_state = CarState::InGarage.step(place).state;
        Ok(Self {
            status,
            kind: session_kind(page.session_type as i32)?,
            session_index: page.session_index,
            track: String::new(),
            car: String::new(),
            online: false,
            car_count: page.active_cars,
            setup_menu: page.is_setup_menu_visible,
            air: Celsius::from_celsius_unchecked(0.0),
            road: Celsius::from_celsius_unchecked(0.0),
            car_state,
            completed_lap: page.completed_lap,
            last_time: known_time(page.last_time),
            last_sector_time: known_time(page.last_sector_time),
            current_lap_time: known_time(page.current_time),
            sector_index: page.current_sector_index,
            valid_lap: page.is_valid_lap,
            distance_m: finite("distance_traveled", page.distance_traveled)?,
            packet_id: page.packet_id,
        })
    }
}

/// `normalized_car_position` и земля игрока лежат на графике, а в домене — на физике.
fn place_on_track(
    frame: &mut CleanTelemetryFrame,
    graphic: &RawGraphicPage,
) -> Result<(), BoundaryError> {
    let (ground_x, ground_z) = player_ground(graphic)?;
    frame.ground_x = ground_x;
    frame.ground_z = ground_z;
    frame.progress = TrackProgress::from_fraction_unchecked(unit_interval(
        "normalized_car_position",
        graphic.normalized_car_position,
    )?);
    Ok(())
}

/// Трасса, машина и температуры приходят с других страниц того же пакета.
fn apply_session_context(
    graphic: &mut CleanSessionGraphic,
    statics: &RawStaticPage,
    physics: &RawPhysicsPage,
) -> Result<(), BoundaryError> {
    graphic.track = statics.track.clone();
    graphic.car = statics.car_model.clone();
    graphic.online = statics.is_online;
    graphic.air = Celsius::from_celsius_unchecked(finite("air_temp", physics.air_temp)?);
    graphic.road = Celsius::from_celsius_unchecked(finite("road_temp", physics.road_temp)?);
    Ok(())
}

/// Слот ищется по идентификатору, не по индексу. Нет слота — земля `(0, 0)`, кадр живой.
fn player_ground(graphic: &RawGraphicPage) -> Result<(f32, f32), BoundaryError> {
    let Some(slot) = graphic
        .car_id
        .iter()
        .position(|id| *id == graphic.player_car_id)
    else {
        return Ok((0.0, 0.0));
    };
    let Some(point) = graphic.car_coordinates.get(slot) else {
        return Ok((0.0, 0.0));
    };
    Ok((
        finite("car_coordinates.x", point.x)?,
        finite("car_coordinates.z", point.z)?,
    ))
}

fn game_status(value: i32) -> Result<GameStatus, BoundaryError> {
    let status = AccStatus::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
        field: "status",
        value,
    })?;
    Ok(match status {
        AccStatus::Off => GameStatus::Off,
        AccStatus::Replay => GameStatus::Replay,
        AccStatus::Live => GameStatus::Live,
        AccStatus::Pause => GameStatus::Pause,
    })
}

fn session_kind(value: i32) -> Result<SessionKind, BoundaryError> {
    let kind =
        AccSessionType::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
            field: "session_type",
            value,
        })?;
    Ok(match kind {
        AccSessionType::Unknown => SessionKind::Unknown,
        AccSessionType::Practice => SessionKind::Practice,
        AccSessionType::Qualifying => SessionKind::Qualifying,
        AccSessionType::Race => SessionKind::Race,
        AccSessionType::Hotlap => SessionKind::Hotlap,
        AccSessionType::TimeAttack => SessionKind::TimeAttack,
        AccSessionType::Drift => SessionKind::Drift,
        AccSessionType::Drag => SessionKind::Drag,
        AccSessionType::Hotstint => SessionKind::Hotstint,
        AccSessionType::HotlapSuperpole => SessionKind::HotlapSuperpole,
    })
}

fn checkered_flag(value: i32) -> Result<bool, BoundaryError> {
    let flag = AccFlagType::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
        field: "flag",
        value,
    })?;
    Ok(flag == AccFlagType::CheckeredFlag)
}

/// `-1` и `i32::MAX` у ACC значат «ещё нет». Ноль тоже не время круга.
fn known_time(ms: i32) -> Option<LapTime> {
    if ms > 0 && ms < i32::MAX {
        Some(LapTime::from_ms_unchecked(ms))
    } else {
        None
    }
}

fn finite(field: &'static str, value: f32) -> Result<f32, BoundaryError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(BoundaryError::NonFinite { field })
    }
}

/// Сначала конечность: `clamp` у NaN остаётся NaN.
fn unit_interval(field: &'static str, value: f32) -> Result<f32, BoundaryError> {
    Ok(finite(field, value)?.clamp(0.0, 1.0))
}

fn finite_set(names: [&'static str; 4], wheels: Wheels) -> Result<TireSet<f32>, BoundaryError> {
    Ok(TireSet::new(
        finite(names[0], wheels.front_left)?,
        finite(names[1], wheels.front_right)?,
        finite(names[2], wheels.rear_left)?,
        finite(names[3], wheels.rear_right)?,
    ))
}

#[cfg(test)]
fn raw_physics() -> RawPhysicsPage {
    use acc_shared_memory_rs::datatypes::{CarDamage, ContactPoint};

    let origin = Vector3f::zero();
    let still = Wheels::zero();
    RawPhysicsPage {
        packet_id: 1,
        gas: 0.4,
        brake: 0.0,
        clutch: 0.0,
        steer_angle: 8.0,
        gear: 3,
        rpm: 6_000,
        autoshifter_on: false,
        ignition_on: true,
        starter_engine_on: false,
        is_engine_running: true,
        speed_kmh: 180.0,
        velocity: origin,
        local_velocity: origin,
        local_angular_vel: origin,
        g_force: Vector3f::new(0.2, 1.0, 0.5),
        heading: 0.0,
        pitch: 0.0,
        roll: 0.0,
        final_ff: 0.0,
        wheel_slip: still,
        wheel_pressure: Wheels::new(27.5, 27.6, 26.5, 26.4),
        wheel_angular_speed: still,
        tyre_core_temp: still,
        suspension_travel: still,
        brake_temp: Wheels::new(420.0, 430.0, 300.0, 310.0),
        brake_pressure: still,
        suspension_damage: still,
        slip_ratio: still,
        slip_angle: still,
        pad_life: still,
        disc_life: still,
        front_brake_compound: 0,
        rear_brake_compound: 0,
        tyre_contact_point: ContactPoint::zero(),
        tyre_contact_normal: ContactPoint::zero(),
        tyre_contact_heading: ContactPoint::zero(),
        fuel: 42.0,
        tc: 0.0,
        abs: 0.0,
        pit_limiter_on: false,
        turbo_boost: 0.0,
        air_temp: 21.5,
        road_temp: 28.0,
        water_temp: 90.0,
        car_damage: CarDamage::none(),
        is_ai_controlled: false,
        brake_bias: 0.0,
        kerb_vibration: 0.0,
        slip_vibration: 0.0,
        g_vibration: 0.0,
        abs_vibration: 0.0,
    }
}

#[cfg(test)]
fn raw_graphic() -> RawGraphicPage {
    use acc_shared_memory_rs::enums::{AccPenaltyType, AccRainIntensity, AccTrackGripStatus};

    RawGraphicPage {
        packet_id: 1,
        status: AccStatus::Live,
        session_type: AccSessionType::Practice,
        session_index: 2,
        current_time_str: String::new(),
        last_time_str: String::new(),
        best_time_str: String::new(),
        last_sector_time_str: String::new(),
        completed_lap: 3,
        position: 1,
        current_time: 12_000,
        last_time: 91_234,
        best_time: 90_000,
        last_sector_time: 30_000,
        number_of_laps: 0,
        delta_lap_time_str: String::new(),
        estimated_lap_time_str: String::new(),
        delta_lap_time: 0,
        estimated_lap_time: 0,
        is_delta_positive: false,
        is_valid_lap: true,
        fuel_estimated_laps: 0.0,
        distance_traveled: 1_500.0,
        normalized_car_position: 0.25,
        session_time_left: 0.0,
        current_sector_index: 1,
        is_in_pit: false,
        is_in_pit_lane: false,
        ideal_line_on: false,
        mandatory_pit_done: false,
        missing_mandatory_pits: 0,
        penalty_time: 0.0,
        penalty: AccPenaltyType::None,
        flag: AccFlagType::NoFlag,
        car_coordinates: vec![Vector3f::new(1.0, 0.0, 1.0), Vector3f::new(12.0, 5.0, -4.0)],
        car_id: vec![10, 3],
        player_car_id: 3,
        active_cars: 20,
        wind_speed: 0.0,
        wind_direction: 0.0,
        rain_intensity: AccRainIntensity::NoRain,
        rain_intensity_in_10min: AccRainIntensity::NoRain,
        rain_intensity_in_30min: AccRainIntensity::NoRain,
        track_grip_status: AccTrackGripStatus::Green,
        track_status: String::new(),
        clock: 0.0,
        tc_level: 0,
        tc_cut_level: 0,
        engine_map: 0,
        abs_level: 0,
        wiper_stage: 0,
        driver_stint_total_time_left: 0,
        driver_stint_time_left: 0,
        rain_tyres: false,
        rain_light: false,
        flashing_light: false,
        light_stage: 0,
        direction_light_left: false,
        direction_light_right: false,
        tyre_compound: String::new(),
        is_setup_menu_visible: false,
        main_display_index: 0,
        secondary_display_index: 0,
        fuel_per_lap: 0.0,
        used_fuel: 0.0,
        exhaust_temp: 0.0,
        gap_ahead: 0,
        gap_behind: 0,
        global_yellow: false,
        global_yellow_s1: false,
        global_yellow_s2: false,
        global_yellow_s3: false,
        global_white: false,
        global_green: false,
        global_chequered: false,
        global_red: false,
        mfd_tyre_set: 0,
        mfd_fuel_to_add: 0.0,
        mfd_tyre_pressure: Wheels::zero(),
        current_tyre_set: 0,
        strategy_tyre_set: 0,
    }
}

#[cfg(test)]
fn raw_statics() -> RawStaticPage {
    RawStaticPage {
        sm_version: String::new(),
        ac_version: String::new(),
        number_of_sessions: 1,
        num_cars: 20,
        track: "monza".to_owned(),
        sector_count: 3,
        player_name: String::new(),
        player_surname: String::new(),
        player_nick: String::new(),
        car_model: "ferrari_296_gt3".to_owned(),
        max_rpm: 0,
        max_fuel: 0.0,
        penalty_enabled: false,
        aid_fuel_rate: 0.0,
        aid_tyre_rate: 0.0,
        aid_mechanical_damage: 0.0,
        aid_stability: 0.0,
        aid_auto_clutch: false,
        pit_window_start: 0,
        pit_window_end: 0,
        is_online: false,
        dry_tyres_name: String::new(),
        wet_tyres_name: String::new(),
    }
}

#[cfg(test)]
fn raw_map(packet_id: i32) -> ACCMap {
    let mut physics = raw_physics();
    physics.packet_id = packet_id;
    let mut graphic = raw_graphic();
    graphic.packet_id = packet_id;
    ACCMap::new(physics, graphic, raw_statics())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_finite_sample_rejects_the_whole_frame() {
        let poisons = [f32::NAN, f32::INFINITY, f32::NEG_INFINITY];
        for value in poisons {
            let mut speed = raw_physics();
            speed.speed_kmh = value;
            assert_eq!(
                CleanTelemetryFrame::try_from(&speed).unwrap_err(),
                BoundaryError::NonFinite { field: "speed_kmh" }
            );

            let mut pressure = raw_physics();
            pressure.wheel_pressure.rear_right = value;
            assert_eq!(
                CleanTelemetryFrame::try_from(&pressure).unwrap_err(),
                BoundaryError::NonFinite {
                    field: "wheel_pressure.rear_right"
                }
            );

            let mut force = raw_physics();
            force.g_force.x = value;
            assert_eq!(
                CleanTelemetryFrame::try_from(&force).unwrap_err(),
                BoundaryError::NonFinite { field: "g_force.x" }
            );
        }

        let mut vertical = raw_physics();
        vertical.g_force.y = f32::NAN;
        assert_eq!(
            CleanTelemetryFrame::try_from(&vertical).unwrap_err(),
            BoundaryError::NonFinite { field: "g_force.y" }
        );
    }

    #[test]
    fn pedals_and_progress_clamp_into_the_unit_interval() {
        let mut map = raw_map(1);
        map.physics.gas = 1.4;
        map.physics.brake = -0.25;
        map.graphics.normalized_car_position = -0.2;
        let PageOutcome::Fresh(tick) = decode(None, &map).unwrap() else {
            panic!("кадр с педалями вне диапазона всё ещё свежий");
        };
        assert_eq!(tick.physics.throttle.fraction(), 1.0);
        assert_eq!(tick.physics.brake.fraction(), 0.0);
        assert_eq!(tick.physics.progress.fraction(), 0.0);
    }

    #[test]
    fn missing_lap_time_is_none() {
        let mut graphic = raw_graphic();
        graphic.last_time = -1;
        graphic.last_sector_time = 0;
        graphic.current_time = -5;
        let clean = CleanSessionGraphic::try_from(&graphic).unwrap();
        assert_eq!(clean.last_time, None);
        assert_eq!(clean.last_sector_time, None);
        assert_eq!(clean.current_lap_time, None);

        graphic.last_time = i32::MAX;
        graphic.last_sector_time = i32::MAX;
        graphic.current_time = i32::MAX;
        let sentinel = CleanSessionGraphic::try_from(&graphic).unwrap();
        assert_eq!(sentinel.last_time, None);
        assert_eq!(sentinel.last_sector_time, None);
        assert_eq!(sentinel.current_lap_time, None);

        graphic.last_time = 91_234;
        let known = CleanSessionGraphic::try_from(&graphic).unwrap();
        assert_eq!(known.last_time, Some(LapTime::from_ms_unchecked(91_234)));
    }

    #[test]
    fn same_packet_is_stale_and_a_lower_id_is_fresh() {
        let first = raw_map(10);
        let PageOutcome::Fresh(tick) = decode(None, &first).unwrap() else {
            panic!("первый пакет свежий");
        };
        assert_eq!(tick.physics.packet_id, 10);
        assert_eq!(tick.graphic.track, "monza");
        assert_eq!(tick.graphic.car, "ferrari_296_gt3");
        assert_eq!(tick.graphic.air.celsius(), 21.5);
        assert_eq!(tick.graphic.road.celsius(), 28.0);
        assert_eq!(tick.physics.ground_x, 12.0);
        assert_eq!(tick.physics.ground_z, -4.0);
        assert_eq!(tick.physics.progress.fraction(), 0.25);

        assert!(matches!(
            decode(Some(10), &first).unwrap(),
            PageOutcome::Stale
        ));

        let rolled = raw_map(9);
        assert!(matches!(
            decode(Some(10), &rolled).unwrap(),
            PageOutcome::Fresh(_)
        ));
    }

    #[test]
    fn missing_player_slot_keeps_the_origin() {
        let mut map = raw_map(4);
        map.graphics.player_car_id = 99;
        let PageOutcome::Fresh(tick) = decode(None, &map).unwrap() else {
            panic!("нет слота — кадр живой");
        };
        assert_eq!(tick.physics.ground_x, 0.0);
        assert_eq!(tick.physics.ground_z, 0.0);
    }

    #[test]
    fn pit_lane_while_live_is_in_pit_lane() {
        let mut graphic = raw_graphic();
        graphic.status = AccStatus::Live;
        graphic.is_in_pit_lane = true;
        let clean = CleanSessionGraphic::try_from(&graphic).unwrap();
        assert_eq!(clean.car_state, CarState::InPitLane);
    }

    #[test]
    fn unknown_status_discriminant_is_not_live() {
        assert_eq!(
            game_status(4).unwrap_err(),
            BoundaryError::UnknownDiscriminant {
                field: "status",
                value: 4,
            }
        );
        assert_eq!(
            game_status(AccStatus::Live as i32).unwrap(),
            GameStatus::Live
        );
        assert_eq!(
            session_kind(42).unwrap_err(),
            BoundaryError::UnknownDiscriminant {
                field: "session_type",
                value: 42,
            }
        );
        assert_eq!(session_kind(-1).unwrap(), SessionKind::Unknown);
        assert_eq!(
            checkered_flag(9).unwrap_err(),
            BoundaryError::UnknownDiscriminant {
                field: "flag",
                value: 9,
            }
        );
    }
}
