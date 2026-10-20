//! Общий кадр для тестов пайплайна. В сборку без `cfg(test)` не входит.

use crate::domain::{
    BrakePosition, CarState, Celsius, CleanSessionGraphic, CleanTelemetryFrame, GameStatus, Psi,
    SessionKind, Speed, ThrottlePosition, TireSet, TrackProgress,
};
use crate::ingress::CleanTick;

#[derive(Debug, Clone)]
pub(crate) struct TickDraft {
    pub packet_id: i32,
    pub status: GameStatus,
    pub car_state: CarState,
    pub kind: SessionKind,
    pub track: String,
    pub completed_lap: i32,
    pub sector_index: i32,
    pub distance_m: f32,
    pub last_time_ms: Option<i32>,
    pub last_sector_ms: Option<i32>,
    pub lap_time_ms: Option<i32>,
    pub progress: f32,
    pub speed: f32,
    pub fuel: f32,
}

impl Default for TickDraft {
    fn default() -> Self {
        Self {
            packet_id: 1,
            status: GameStatus::Live,
            car_state: CarState::OnTrack,
            kind: SessionKind::Practice,
            track: "monza".to_owned(),
            completed_lap: 0,
            sector_index: 0,
            distance_m: 100.0,
            last_time_ms: None,
            last_sector_ms: None,
            lap_time_ms: Some(10_000),
            progress: 0.1,
            speed: 180.0,
            fuel: 40.0,
        }
    }
}

impl TickDraft {
    pub(crate) fn build(self) -> CleanTick {
        let time = |ms: Option<i32>| {
            ms.filter(|ms| *ms > 0)
                .map(crate::domain::LapTime::from_ms_unchecked)
        };
        CleanTick {
            physics: CleanTelemetryFrame {
                packet_id: self.packet_id,
                speed: Speed::from_kmh_unchecked(self.speed),
                throttle: ThrottlePosition::from_fraction_unchecked(0.5),
                brake: BrakePosition::from_fraction_unchecked(0.0),
                steer_deg: 8.0,
                progress: TrackProgress::from_fraction_unchecked(self.progress),
                fuel_l: self.fuel,
                g_long: 0.2,
                g_lat: 0.1,
                ground_x: 12.0,
                ground_z: -4.0,
                pressure: TireSet::new(
                    Psi::from_psi_unchecked(27.5),
                    Psi::from_psi_unchecked(27.6),
                    Psi::from_psi_unchecked(26.5),
                    Psi::from_psi_unchecked(26.4),
                ),
                brake_temp: TireSet::new(
                    Celsius::from_celsius_unchecked(420.0),
                    Celsius::from_celsius_unchecked(430.0),
                    Celsius::from_celsius_unchecked(300.0),
                    Celsius::from_celsius_unchecked(310.0),
                ),
            },
            graphic: CleanSessionGraphic {
                status: self.status,
                kind: self.kind,
                session_index: 0,
                track: self.track,
                car: "ferrari_296_gt3".to_owned(),
                online: false,
                car_count: 20,
                setup_menu: false,
                air: Celsius::from_celsius_unchecked(21.0),
                road: Celsius::from_celsius_unchecked(28.0),
                car_state: self.car_state,
                completed_lap: self.completed_lap,
                last_time: time(self.last_time_ms),
                last_sector_time: time(self.last_sector_ms),
                current_lap_time: time(self.lap_time_ms),
                sector_index: self.sector_index,
                valid_lap: true,
                distance_m: self.distance_m,
                packet_id: self.packet_id,
            },
        }
    }
}
