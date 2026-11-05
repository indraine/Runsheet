use acc_shared_memory_rs::datatypes::{CarDamage, ContactPoint, Vector3f, Wheels};
use acc_shared_memory_rs::enums::{
    AccFlagType, AccPenaltyType, AccRainIntensity, AccSessionType, AccStatus, AccTrackGripStatus,
};
use acc_shared_memory_rs::maps::ACCMap;

use crate::domain::{
    BodyDamage, BrakePosition, CarPlace, CarState, Celsius, GameStatus, GraphicsFrame, LapTime,
    Penalty, PhysicsFrame, Psi, RaceFlag, Rain, SessionKind, Speed, StaticsFrame, ThrottlePosition,
    TireSet, TrackGrip, TrackProgress, Vec3,
};

use super::raw::{RawGraphicPage, RawPhysicsPage, RawStaticPage};
use crate::ingress::{BoundaryError, CleanTick, PageOutcome};

#[must_use]
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn decode(
    previous_packet_id: Option<i32>,
    map: &ACCMap,
) -> Result<PageOutcome, BoundaryError> {
    if previous_packet_id == Some(map.physics.packet_id) {
        return Ok(PageOutcome::Stale);
    }
    let physics = PhysicsFrame::try_from(&map.physics)?;
    let graphic = GraphicsFrame::try_from(&map.graphics)?;
    let statics = StaticsFrame::try_from(&map.statics)?;
    Ok(PageOutcome::Fresh(CleanTick {
        physics,
        graphic,
        statics,
    }))
}

impl TryFrom<&RawPhysicsPage> for PhysicsFrame {
    type Error = BoundaryError;

    fn try_from(page: &RawPhysicsPage) -> Result<Self, Self::Error> {
        let g_lat = finite("g_force.x", page.g_force.x)?;
        let g_vert = finite("g_force.y", page.g_force.y)?;
        let g_long = finite("g_force.z", page.g_force.z)?;
        Ok(Self {
            packet_id: page.packet_id,
            speed: Speed::from_kmh_unchecked(finite("speed_kmh", page.speed_kmh)?),
            throttle: ThrottlePosition::from_fraction_unchecked(unit_interval("gas", page.gas)?),
            brake: BrakePosition::from_fraction_unchecked(unit_interval("brake", page.brake)?),
            clutch: unit_interval("clutch", page.clutch)?,
            steer_deg: finite("steer_angle", page.steer_angle)?,
            gear: page.gear,
            rpm: page.rpm,
            autoshifter: page.autoshifter_on,
            ignition: page.ignition_on,
            starter: page.starter_engine_on,
            engine_running: page.is_engine_running,
            velocity: xyz("velocity", page.velocity)?,
            local_velocity: xyz("local_velocity", page.local_velocity)?,
            angular_velocity: xyz("local_angular_vel", page.local_angular_vel)?,
            g_long,
            g_vert,
            g_lat,
            heading: finite("heading", page.heading)?,
            pitch: finite("pitch", page.pitch)?,
            roll: finite("roll", page.roll)?,
            force_feedback: finite("final_ff", page.final_ff)?,
            wheel_slip: wheels("wheel_slip", page.wheel_slip)?,
            pressure: wheels("wheel_pressure", page.wheel_pressure)?.map(Psi::from_psi_unchecked),
            wheel_angular_speed: wheels("wheel_angular_speed", page.wheel_angular_speed)?,
            tyre_temp: celsius_wheels("tyre_core_temp", page.tyre_core_temp)?,
            suspension_travel: wheels("suspension_travel", page.suspension_travel)?,
            brake_temp: celsius_wheels("brake_temp", page.brake_temp)?,
            brake_pressure: wheels("brake_pressure", page.brake_pressure)?,
            suspension_damage: wheels("suspension_damage", page.suspension_damage)?,
            slip_ratio: wheels("slip_ratio", page.slip_ratio)?,
            slip_angle: wheels("slip_angle", page.slip_angle)?,
            pad_life: wheels("pad_life", page.pad_life)?,
            disc_life: wheels("disc_life", page.disc_life)?,
            front_brake_compound: page.front_brake_compound,
            rear_brake_compound: page.rear_brake_compound,
            tyre_contact_point: contact("tyre_contact_point", page.tyre_contact_point)?,
            tyre_contact_normal: contact("tyre_contact_normal", page.tyre_contact_normal)?,
            tyre_contact_heading: contact("tyre_contact_heading", page.tyre_contact_heading)?,
            fuel_l: finite("fuel", page.fuel)?,
            tc: finite("tc", page.tc)?,
            abs: finite("abs", page.abs)?,
            pit_limiter: page.pit_limiter_on,
            turbo_boost: finite("turbo_boost", page.turbo_boost)?,
            air: Celsius::from_celsius_unchecked(finite("air_temp", page.air_temp)?),
            road: Celsius::from_celsius_unchecked(finite("road_temp", page.road_temp)?),
            water: Celsius::from_celsius_unchecked(finite("water_temp", page.water_temp)?),
            damage: body_damage(page.car_damage)?,
            ai_controlled: page.is_ai_controlled,
            brake_bias: unit_interval("brake_bias", page.brake_bias)?,
            kerb_vibration: finite("kerb_vibration", page.kerb_vibration)?,
            slip_vibration: finite("slip_vibration", page.slip_vibration)?,
            g_vibration: finite("g_vibration", page.g_vibration)?,
            abs_vibration: finite("abs_vibration", page.abs_vibration)?,
        })
    }
}

impl TryFrom<&RawGraphicPage> for GraphicsFrame {
    type Error = BoundaryError;

    fn try_from(page: &RawGraphicPage) -> Result<Self, Self::Error> {
        let status = game_status(page.status as i32)?;
        let flag = race_flag(page.flag as i32)?;
        let place = CarPlace {
            status,
            setup_menu: page.is_setup_menu_visible,
            in_pit_box: page.is_in_pit,
            in_pit_lane: page.is_in_pit_lane,
            checkered: flag == RaceFlag::Checkered,
        };
        let car_state = CarState::InGarage.step(place).state;
        let (ground_x, ground_z) = player_ground(page)?;
        Ok(Self {
            packet_id: page.packet_id,
            status,
            kind: session_kind(page.session_type as i32)?,
            session_index: page.session_index,
            current_time_text: page.current_time_str.clone(),
            last_time_text: page.last_time_str.clone(),
            best_time_text: page.best_time_str.clone(),
            last_sector_text: page.last_sector_time_str.clone(),
            completed_lap: page.completed_lap,
            position: page.position,
            current_lap_time: running_clock(page.current_time),
            last_time: known_time(page.last_time),
            best_time_ms: page.best_time,
            last_sector_time: known_time(page.last_sector_time),
            lap_count: page.number_of_laps,
            delta_text: page.delta_lap_time_str.clone(),
            estimated_text: page.estimated_lap_time_str.clone(),
            delta_ms: page.delta_lap_time,
            estimated_ms: page.estimated_lap_time,
            delta_positive: page.is_delta_positive,
            valid_lap: page.is_valid_lap,
            fuel_laps: finite("fuel_estimated_laps", page.fuel_estimated_laps)?,
            distance_m: finite("distance_traveled", page.distance_traveled)?,
            progress: TrackProgress::from_fraction_unchecked(unit_interval(
                "normalized_car_position",
                page.normalized_car_position,
            )?),
            session_left_s: finite("session_time_left", page.session_time_left)?,
            sector_index: page.current_sector_index,
            in_pit_box: page.is_in_pit,
            in_pit_lane: page.is_in_pit_lane,
            ideal_line: page.ideal_line_on,
            mandatory_pit_done: page.mandatory_pit_done,
            missing_mandatory_pits: page.missing_mandatory_pits,
            penalty_time_s: finite("penalty_time", page.penalty_time)?,
            penalty: penalty(page.penalty as i32),
            flag,
            car_coordinates: car_points(&page.car_coordinates)?,
            car_ids: page.car_id.clone(),
            car_id: page.player_car_id,
            car_count: page.active_cars,
            ground_x,
            ground_z,
            wind_speed: finite("wind_speed", page.wind_speed)?,
            wind_direction: finite("wind_direction", page.wind_direction)?,
            rain: rain(page.rain_intensity as i32)?,
            rain_in_10m: rain(page.rain_intensity_in_10min as i32)?,
            rain_in_30m: rain(page.rain_intensity_in_30min as i32)?,
            grip: track_grip(page.track_grip_status as i32)?,
            track_status: page.track_status.clone(),
            clock_s: finite("clock", page.clock)?,
            tc: page.tc_level,
            tc_cut: page.tc_cut_level,
            engine_map: page.engine_map,
            abs: page.abs_level,
            wipers: page.wiper_stage,
            stint_total_left_s: page.driver_stint_total_time_left,
            stint_left_s: page.driver_stint_time_left,
            rain_tyres: page.rain_tyres,
            rain_light: page.rain_light,
            flashing_light: page.flashing_light,
            light_stage: page.light_stage,
            indicator_left: page.direction_light_left,
            indicator_right: page.direction_light_right,
            tyre_compound: page.tyre_compound.clone(),
            setup_menu: page.is_setup_menu_visible,
            main_display: page.main_display_index,
            secondary_display: page.secondary_display_index,
            main_menu: page.main_display_index != 0,
            fuel_per_lap: finite("fuel_per_lap", page.fuel_per_lap)?,
            used_fuel: finite("used_fuel", page.used_fuel)?,
            exhaust: Celsius::from_celsius_unchecked(finite("exhaust_temp", page.exhaust_temp)?),
            gap_ahead_ms: page.gap_ahead,
            gap_behind_ms: page.gap_behind,
            yellow: page.global_yellow,
            yellow_s1: page.global_yellow_s1,
            yellow_s2: page.global_yellow_s2,
            yellow_s3: page.global_yellow_s3,
            white_flag: page.global_white,
            green_light: page.global_green,
            chequered: page.global_chequered,
            red_flag: page.global_red,
            green: page.global_green || flag == RaceFlag::Green,
            mfd_tyre_set: page.mfd_tyre_set,
            mfd_fuel_l: finite("mfd_fuel_to_add", page.mfd_fuel_to_add)?,
            mfd_pressure: wheels("mfd_tyre_pressure", page.mfd_tyre_pressure)?,
            current_tyre_set: page.current_tyre_set,
            strategy_tyre_set: page.strategy_tyre_set,
            car_state,
        })
    }
}

impl TryFrom<&RawStaticPage> for StaticsFrame {
    type Error = BoundaryError;

    fn try_from(page: &RawStaticPage) -> Result<Self, Self::Error> {
        Ok(Self {
            shared_memory_version: page.sm_version.clone(),
            game_version: page.ac_version.clone(),
            session_count: page.number_of_sessions,
            entered_cars: page.num_cars,
            track: track_code(&page.track),
            sector_count: page.sector_count,
            player_name: page.player_name.clone(),
            player_surname: page.player_surname.clone(),
            player_nick: page.player_nick.clone(),
            car: page.car_model.clone(),
            driver: driver_name(&page.player_nick, &page.player_name, &page.player_surname),
            max_rpm: page.max_rpm,
            max_fuel_l: finite("max_fuel", page.max_fuel)?,
            penalty_enabled: page.penalty_enabled,
            aid_fuel_rate: finite("aid_fuel_rate", page.aid_fuel_rate)?,
            aid_tyre_rate: finite("aid_tyre_rate", page.aid_tyre_rate)?,
            aid_mechanical_damage: finite("aid_mechanical_damage", page.aid_mechanical_damage)?,
            aid_stability: finite("aid_stability", page.aid_stability)?,
            aid_auto_clutch: page.aid_auto_clutch,
            pit_window_start_s: page.pit_window_start,
            pit_window_end_s: page.pit_window_end,
            online: page.is_online,
            dry_tyre: page.dry_tyres_name.clone(),
            wet_tyre: page.wet_tyres_name.clone(),
        })
    }
}

/// Canonical track code: ACC reports most tracks in snake_case, but Spa arrives as `"Spa"`.
pub(crate) fn track_code(raw: &str) -> String {
    raw.trim().to_ascii_lowercase()
}

pub(crate) fn driver_name(nick: &str, name: &str, surname: &str) -> String {
    let nick = nick.trim();
    if !nick.is_empty() {
        return nick.to_string();
    }
    let name = name.trim();
    let surname = surname.trim();
    match (name.is_empty(), surname.is_empty()) {
        (true, true) => String::new(),
        (false, true) => name.to_string(),
        (true, false) => surname.to_string(),
        (false, false) => format!("{name} {surname}"),
    }
}

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

fn race_flag(value: i32) -> Result<RaceFlag, BoundaryError> {
    let flag = AccFlagType::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
        field: "flag",
        value,
    })?;
    Ok(match flag {
        AccFlagType::NoFlag => RaceFlag::None,
        AccFlagType::BlueFlag => RaceFlag::Blue,
        AccFlagType::YellowFlag => RaceFlag::Yellow,
        AccFlagType::BlackFlag => RaceFlag::Black,
        AccFlagType::WhiteFlag => RaceFlag::White,
        AccFlagType::CheckeredFlag => RaceFlag::Checkered,
        AccFlagType::PenaltyFlag => RaceFlag::Penalty,
        AccFlagType::GreenFlag => RaceFlag::Green,
        AccFlagType::OrangeFlag => RaceFlag::Orange,
    })
}

fn penalty(value: i32) -> Penalty {
    let Ok(kind) = AccPenaltyType::try_from(value) else {
        return Penalty::Unknown;
    };
    match kind {
        AccPenaltyType::Unknown => Penalty::Unknown,
        AccPenaltyType::None => Penalty::None,
        AccPenaltyType::DriveThoughCutting => Penalty::DriveThroughCutting,
        AccPenaltyType::StopAndGo10Cutting => Penalty::StopAndGo10Cutting,
        AccPenaltyType::StopAndGo20Cutting => Penalty::StopAndGo20Cutting,
        AccPenaltyType::StopAndGo30Cutting => Penalty::StopAndGo30Cutting,
        AccPenaltyType::DisqualifiedCutting => Penalty::DisqualifiedCutting,
        AccPenaltyType::RemoveBestLaptimeCutting => Penalty::RemoveBestLapCutting,
        AccPenaltyType::DriveThoughPitSpeeding => Penalty::DriveThroughPitSpeeding,
        AccPenaltyType::StopAndGo10PitSpeeding => Penalty::StopAndGo10PitSpeeding,
        AccPenaltyType::StopAndGo20PitSpeeding => Penalty::StopAndGo20PitSpeeding,
        AccPenaltyType::StopAndGo30PitSpeeding => Penalty::StopAndGo30PitSpeeding,
        AccPenaltyType::DisqualifiedPitSpeeding => Penalty::DisqualifiedPitSpeeding,
        AccPenaltyType::RemoveBestLaptimePitSpeeding => Penalty::RemoveBestLapPitSpeeding,
        AccPenaltyType::DisqualifiedIgnoredMandatoryPit => Penalty::DisqualifiedIgnoredMandatoryPit,
        AccPenaltyType::PostRaceTime => Penalty::PostRaceTime,
        AccPenaltyType::DisqualifiedTrolling => Penalty::DisqualifiedTrolling,
        AccPenaltyType::DisqualifiedPitEntry => Penalty::DisqualifiedPitEntry,
        AccPenaltyType::DisqualifiedPitExit => Penalty::DisqualifiedPitExit,
        AccPenaltyType::DisqualifiedWrongWayOld => Penalty::DisqualifiedWrongWayOld,
        AccPenaltyType::DriveThoughIgnoredDriverStint => Penalty::DriveThroughIgnoredStint,
        AccPenaltyType::DisqualifiedIgnoredDriverStint => Penalty::DisqualifiedIgnoredStint,
        AccPenaltyType::DisqualifiedExceededDriverStintLimit => Penalty::DisqualifiedExceededStint,
        AccPenaltyType::DisqualifiedWrongWay => Penalty::DisqualifiedWrongWay,
    }
}

fn rain(value: i32) -> Result<Rain, BoundaryError> {
    let rain =
        AccRainIntensity::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
            field: "rain_intensity",
            value,
        })?;
    Ok(match rain {
        AccRainIntensity::NoRain => Rain::None,
        AccRainIntensity::Drizzle => Rain::Drizzle,
        AccRainIntensity::LightRain => Rain::Light,
        AccRainIntensity::MediumRain => Rain::Medium,
        AccRainIntensity::HeavyRain => Rain::Heavy,
        AccRainIntensity::Thunderstorm => Rain::Thunderstorm,
    })
}

fn track_grip(value: i32) -> Result<TrackGrip, BoundaryError> {
    let grip =
        AccTrackGripStatus::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
            field: "track_grip_status",
            value,
        })?;
    Ok(match grip {
        AccTrackGripStatus::Green => TrackGrip::Green,
        AccTrackGripStatus::Fast => TrackGrip::Fast,
        AccTrackGripStatus::Optimum => TrackGrip::Optimum,
        AccTrackGripStatus::Greasy => TrackGrip::Greasy,
        AccTrackGripStatus::Damp => TrackGrip::Damp,
        AccTrackGripStatus::Wet => TrackGrip::Wet,
        AccTrackGripStatus::Flooded => TrackGrip::Flooded,
    })
}

fn known_time(ms: i32) -> Option<LapTime> {
    if ms > 0 && ms < i32::MAX {
        Some(LapTime::from_ms_unchecked(ms))
    } else {
        None
    }
}

fn running_clock(ms: i32) -> Option<LapTime> {
    if ms >= 0 && ms < i32::MAX {
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

fn unit_interval(field: &'static str, value: f32) -> Result<f32, BoundaryError> {
    Ok(finite(field, value)?.clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::{driver_name, track_code};

    #[test]
    fn track_codes_are_lowercase_snake_case() {
        assert_eq!(track_code("Spa"), "spa");
        assert_eq!(track_code(" brands_hatch "), "brands_hatch");
        assert_eq!(track_code("monza"), "monza");
    }

    #[test]
    fn nick_wins_over_the_real_name() {
        assert_eq!(driver_name(" Nick ", "Ada", "Lovelace"), "Nick");
    }

    #[test]
    fn an_empty_nick_uses_the_first_and_last_name() {
        assert_eq!(driver_name("  ", "Ada", "Lovelace"), "Ada Lovelace");
        assert_eq!(driver_name("", "Ada", " "), "Ada");
        assert_eq!(driver_name("", "", ""), "");
    }
}

fn finite_set(names: [&'static str; 4], wheels: Wheels) -> Result<TireSet<f32>, BoundaryError> {
    Ok(TireSet::new(
        finite(names[0], wheels.front_left)?,
        finite(names[1], wheels.front_right)?,
        finite(names[2], wheels.rear_left)?,
        finite(names[3], wheels.rear_right)?,
    ))
}

fn wheels(field: &'static str, value: Wheels) -> Result<TireSet<f32>, BoundaryError> {
    finite_set([field, field, field, field], value)
}

fn celsius_wheels(field: &'static str, value: Wheels) -> Result<TireSet<Celsius>, BoundaryError> {
    Ok(wheels(field, value)?.map(Celsius::from_celsius_unchecked))
}

fn xyz(field: &'static str, value: Vector3f) -> Result<Vec3, BoundaryError> {
    Ok(Vec3 {
        x: finite(field, value.x)?,
        y: finite(field, value.y)?,
        z: finite(field, value.z)?,
    })
}

fn contact(field: &'static str, point: ContactPoint) -> Result<TireSet<Vec3>, BoundaryError> {
    Ok(TireSet::new(
        xyz(field, point.front_left)?,
        xyz(field, point.front_right)?,
        xyz(field, point.rear_left)?,
        xyz(field, point.rear_right)?,
    ))
}

fn body_damage(damage: CarDamage) -> Result<BodyDamage, BoundaryError> {
    Ok(BodyDamage {
        front: finite("car_damage.front", damage.front)?,
        rear: finite("car_damage.rear", damage.rear)?,
        left: finite("car_damage.left", damage.left)?,
        right: finite("car_damage.right", damage.right)?,
        center: finite("car_damage.center", damage.center)?,
    })
}

fn car_points(points: &[Vector3f]) -> Result<Vec<Vec3>, BoundaryError> {
    points
        .iter()
        .map(|point| xyz("car_coordinates", *point))
        .collect()
}
