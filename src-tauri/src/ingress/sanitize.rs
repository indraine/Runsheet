use std::fmt;

use acc_shared_memory_rs::datatypes::Wheels;
use acc_shared_memory_rs::enums::{AccFlagType, AccSessionType, AccStatus};
use acc_shared_memory_rs::maps::ACCMap;

use crate::domain::{
    BrakePosition, CarPlace, CarState, Celsius, CleanSessionGraphic, CleanTelemetryFrame,
    GameStatus, LapTime, Psi, SessionKind, Speed, ThrottlePosition, TireSet, TrackProgress,
};

use super::raw::{RawGraphicPage, RawPhysicsPage, RawStaticPage};

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

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PageOutcome {
    Stale,
    Fresh(CleanTick),
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CleanTick {
    pub physics: CleanTelemetryFrame,
    pub graphic: CleanSessionGraphic,
}

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
        Ok(Self {
            packet_id: page.packet_id,
            speed: Speed::from_kmh_unchecked(finite("speed_kmh", page.speed_kmh)?),
            throttle: ThrottlePosition::from_fraction_unchecked(unit_interval("gas", page.gas)?),
            brake: BrakePosition::from_fraction_unchecked(unit_interval("brake", page.brake)?),
            steer_deg: finite("steer_angle", page.steer_angle)?,
            gear: page.gear,
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
        let car_state = CarState::InGarage.step(place).state;
        Ok(Self {
            status,
            kind: session_kind(page.session_type as i32)?,
            session_index: page.session_index,
            track: String::new(),
            car: String::new(),
            driver: String::new(),
            car_id: page.player_car_id,
            online: false,
            car_count: page.active_cars,
            setup_menu: page.is_setup_menu_visible,
            air: Celsius::from_celsius_unchecked(0.0),
            road: Celsius::from_celsius_unchecked(0.0),
            car_state,
            completed_lap: page.completed_lap,
            last_time: known_time(page.last_time),
            last_sector_time: known_time(page.last_sector_time),
            current_lap_time: running_clock(page.current_time),
            sector_index: page.current_sector_index,
            valid_lap: page.is_valid_lap,
            green: page.global_green || page.flag == AccFlagType::GreenFlag,
            distance_m: finite("distance_traveled", page.distance_traveled)?,
            packet_id: page.packet_id,
        })
    }
}

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

fn apply_session_context(
    graphic: &mut CleanSessionGraphic,
    statics: &RawStaticPage,
    physics: &RawPhysicsPage,
) -> Result<(), BoundaryError> {
    graphic.track = statics.track.clone();
    graphic.car = statics.car_model.clone();
    graphic.driver = driver_name(
        &statics.player_nick,
        &statics.player_name,
        &statics.player_surname,
    );
    graphic.online = statics.is_online;
    graphic.air = Celsius::from_celsius_unchecked(finite("air_temp", physics.air_temp)?);
    graphic.road = Celsius::from_celsius_unchecked(finite("road_temp", physics.road_temp)?);
    Ok(())
}

/// Nick wins. An empty nick falls back to the first and last name.
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

fn checkered_flag(value: i32) -> Result<bool, BoundaryError> {
    let flag = AccFlagType::try_from(value).map_err(|()| BoundaryError::UnknownDiscriminant {
        field: "flag",
        value,
    })?;
    Ok(flag == AccFlagType::CheckeredFlag)
}

fn known_time(ms: i32) -> Option<LapTime> {
    if ms > 0 && ms < i32::MAX {
        Some(LapTime::from_ms_unchecked(ms))
    } else {
        None
    }
}

/// Lap clock as the game paints it, including `0` at the start line.
///
/// `known_time` treats `0` as "no split". The running clock must keep that
/// zero, otherwise the first moments of a lap stay blank.
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
    use super::driver_name;

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
