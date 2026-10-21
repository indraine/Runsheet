//! Чистый кадр телеметрии.

use super::tires::TireSet;
use super::units::{BrakePosition, Celsius, LapTime, Psi, Speed, ThrottlePosition, TrackProgress};
use super::{CarState, GameStatus, SessionKind};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct CleanTelemetryFrame {
    pub packet_id: i32,
    pub speed: Speed,
    pub throttle: ThrottlePosition,
    pub brake: BrakePosition,
    pub steer_deg: f32,
    pub progress: TrackProgress,
    pub fuel_l: f32,
    pub g_long: f32,
    pub g_lat: f32,
    pub ground_x: f32,
    pub ground_z: f32,
    pub pressure: TireSet<Psi>,
    /// Передние `physics.brake_temp`.
    pub brake_temp_fl: Celsius,
    pub brake_temp_fr: Celsius,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CleanSessionGraphic {
    pub status: GameStatus,
    pub kind: SessionKind,
    pub session_index: i32,
    pub track: String,
    pub car: String,
    pub online: bool,
    pub car_count: i32,
    pub setup_menu: bool,
    pub air: Celsius,
    pub road: Celsius,
    pub car_state: CarState,
    pub completed_lap: i32,
    pub last_time: Option<LapTime>,
    pub last_sector_time: Option<LapTime>,
    pub current_lap_time: Option<LapTime>,
    pub sector_index: i32,
    pub valid_lap: bool,
    pub distance_m: f32,
    pub packet_id: i32,
}
