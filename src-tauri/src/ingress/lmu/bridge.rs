//! Копия кадра `kerb` в свою страницу. Проверок здесь нет: их делает `sanitize`.

use kerb::SimString;
use kerb::lmu::{LmuFrame, LmuVehicleScoring, LmuVehicleTelemetry, LmuWheelData};

use super::raw::{RawCar, RawPage, RawPlayer, RawSession, RawWheel};

pub(super) fn page_from_frame(frame: &LmuFrame, packet_id: i32) -> Option<RawPage> {
    let telemetry = frame.player_telemetry()?;
    let index = frame.player_scoring_idx()?;
    let scoring = frame.vehicles_scoring().get(index)?;
    Some(RawPage {
        packet_id,
        player: player(telemetry),
        session: session(frame, scoring),
        cars: frame
            .vehicles_scoring()
            .iter()
            .map(|car| RawCar {
                id: car.id,
                pos: car.pos,
            })
            .collect(),
    })
}

fn player(telemetry: &LmuVehicleTelemetry) -> RawPlayer {
    RawPlayer {
        id: telemetry.id,
        pos: telemetry.pos,
        local_vel: telemetry.local_vel,
        local_accel: telemetry.local_accel,
        ori: telemetry.ori,
        local_rot: telemetry.local_rot,
        gear: telemetry.gear,
        engine_rpm: telemetry.engine_rpm,
        engine_max_rpm: telemetry.engine_max_rpm,
        engine_water_temp: telemetry.engine_water_temp,
        throttle: telemetry.unfiltered_throttle,
        brake: telemetry.unfiltered_brake,
        steering: telemetry.unfiltered_steering,
        clutch: telemetry.unfiltered_clutch,
        steering_shaft_torque: telemetry.steering_shaft_torque,
        fuel_l: telemetry.fuel,
        fuel_capacity_l: telemetry.fuel_capacity,
        current_sector: telemetry.current_sector,
        speed_limiter: telemetry.speed_limiter != 0,
        ignition_starter: telemetry.ignition_starter,
        visual_steering_range_deg: telemetry.visual_steering_wheel_range,
        physical_steering_range_rad: telemetry.physical_steering_wheel_range,
        rear_brake_bias: telemetry.rear_brake_bias,
        turbo_boost: telemetry.turbo_boost_pressure,
        wheels: [
            wheel(&telemetry.wheels[0]),
            wheel(&telemetry.wheels[1]),
            wheel(&telemetry.wheels[2]),
            wheel(&telemetry.wheels[3]),
        ],
        dents: telemetry.dent_severity,
        vehicle_name: text(&telemetry.vehicle_name),
        front_compound: text(&telemetry.front_tire_compound_name),
        rear_compound: text(&telemetry.rear_tire_compound_name),
        scheduled_stops: telemetry.scheduled_stops,
        headlights: telemetry.headlights != 0,
    }
}

fn wheel(wheel: &LmuWheelData) -> RawWheel {
    RawWheel {
        suspension_deflection_m: wheel.suspension_deflection,
        brake_temp_c: wheel.brake_temp,
        brake_pressure: wheel.brake_pressure,
        rotation_rad_s: wheel.rotation,
        slip_long_mps: wheel.longitudinal_patch_vel,
        pressure_kpa: wheel.pressure,
        carcass_k: wheel.tire_carcass_temperature,
    }
}

fn session(frame: &LmuFrame, scoring: &LmuVehicleScoring) -> RawSession {
    let info = &frame.scoring_info;
    let driver = text(&scoring.driver_name);
    let driver = if driver.is_empty() {
        text(&info.player_name)
    } else {
        driver
    };
    RawSession {
        track: text(&info.track_name),
        driver,
        plugin_version: plugin_version(&frame.extended.version),
        session: info.session,
        game_phase: info.game_phase,
        in_realtime: info.in_realtime != 0 || frame.extended.in_realtime_fc != 0,
        session_started: frame.extended.session_started != 0,
        yellow_flag_state: info.yellow_flag_state,
        sector_flag: info.sector_flag,
        ambient_c: info.ambient_temp,
        track_c: info.track_temp,
        raining: info.raining,
        wind: info.wind,
        path_wetness: info.avg_path_wetness,
        game_mode: info.game_mode,
        server_port: info.server_port,
        lap_length_m: info.lap_dist,
        max_laps: info.max_laps,
        current_et_s: info.current_et,
        end_et_s: info.end_et,
        num_vehicles: info.num_vehicles,
        completed_laps: i32::from(scoring.total_laps),
        place: i32::from(scoring.place),
        lap_dist_m: scoring.lap_dist,
        best_lap_s: scoring.best_lap_time,
        last_lap_s: scoring.last_lap_time,
        last_sector1_s: scoring.last_sector1,
        last_sector2_s: scoring.last_sector2,
        time_into_lap_s: scoring.time_into_lap,
        estimated_lap_s: scoring.estimated_lap_time,
        in_pits: scoring.in_pits != 0,
        pit_state: scoring.pit_state,
        in_garage: scoring.in_garage_stall != 0,
        finish_status: scoring.finish_status,
        flag: scoring.flag,
        // В `kerb` это поле называется `count_laps_invalid_flags`, но в плагине это `mCountLapFlag`.
        count_lap_flag: scoring.count_laps_invalid_flags,
        control: scoring.control,
        num_penalties: i32::from(scoring.num_penalties),
        num_pitstops: i32::from(scoring.num_pitstops),
        time_behind_next_s: scoring.time_behind_next,
    }
}

fn text<const N: usize>(value: &SimString<N>) -> String {
    value.to_string_lossy().trim().to_string()
}

fn plugin_version(bytes: &[u8; 12]) -> String {
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).trim().to_string()
}
