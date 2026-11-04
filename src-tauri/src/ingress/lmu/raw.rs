//! Кадр Le Mans Ultimate в единицах плагина rFactor 2, уже без типов `kerb`.
//!
//! Оси машины: +x влево, +y вверх, +z назад. Давление шин в кПа, каркас шины в кельвинах,
//! тормоза и воздух в градусах Цельсия, времена в секундах, скорости в м/с.

#[derive(Debug, Clone, PartialEq)]
pub(super) struct RawPage {
    pub packet_id: i32,
    pub player: RawPlayer,
    pub session: RawSession,
    pub cars: Vec<RawCar>,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct RawPlayer {
    pub id: i32,
    pub pos: [f64; 3],
    pub local_vel: [f64; 3],
    pub local_accel: [f64; 3],
    pub ori: [[f64; 3]; 3],
    pub local_rot: [f64; 3],
    pub gear: i32,
    pub engine_rpm: f64,
    pub engine_max_rpm: f64,
    pub engine_water_temp: f64,
    pub throttle: f64,
    pub brake: f64,
    pub steering: f64,
    pub clutch: f64,
    pub steering_shaft_torque: f64,
    pub fuel_l: f64,
    pub fuel_capacity_l: f64,
    /// Сектор с битом пит-лейна в знаке: вход из третьего сектора приходит как `0x8000_0002`.
    pub current_sector: i32,
    pub speed_limiter: bool,
    pub ignition_starter: u8,
    pub visual_steering_range_deg: f32,
    /// Полный ход руля от упора до упора, радианы.
    pub physical_steering_range_rad: f32,
    pub rear_brake_bias: f64,
    pub turbo_boost: f64,
    pub wheels: [RawWheel; 4],
    pub dents: [u8; 8],
    pub vehicle_name: String,
    pub front_compound: String,
    pub rear_compound: String,
    pub scheduled_stops: u8,
    pub headlights: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub(super) struct RawWheel {
    pub suspension_deflection_m: f64,
    pub brake_temp_c: f64,
    pub brake_pressure: f64,
    pub rotation_rad_s: f64,
    pub slip_long_mps: f64,
    pub pressure_kpa: f64,
    pub carcass_k: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct RawSession {
    pub track: String,
    pub driver: String,
    pub plugin_version: String,
    /// `0` тестовый день, `1..=4` практика, `5..=8` квалификация, `9` прогрев, `10..=13` гонка.
    pub session: i32,
    /// Фаза из плагина: `0` до сессии, `5` зелёный, `6` жёлтый, `7` стоп, `8` финиш, `9` пауза.
    pub game_phase: u8,
    pub in_realtime: bool,
    pub session_started: bool,
    pub yellow_flag_state: i8,
    pub sector_flag: [i8; 3],
    pub ambient_c: f64,
    pub track_c: f64,
    pub raining: f64,
    pub wind: [f64; 3],
    pub path_wetness: f64,
    /// `2` — клиент на сервере. Ненулевой порт тоже значит онлайн.
    pub game_mode: u8,
    pub server_port: u16,
    pub lap_length_m: f64,
    pub max_laps: i32,
    pub current_et_s: f64,
    pub end_et_s: f64,
    pub num_vehicles: i32,
    pub completed_laps: i32,
    pub place: i32,
    pub lap_dist_m: f64,
    pub best_lap_s: f64,
    pub last_lap_s: f64,
    pub last_sector1_s: f64,
    pub last_sector2_s: f64,
    pub time_into_lap_s: f64,
    pub estimated_lap_s: f64,
    pub in_pits: bool,
    pub pit_state: u8,
    pub in_garage: bool,
    /// `0` никто, `1` финишировал, `2` сход, `3` дисквалификация.
    pub finish_status: i8,
    /// `0` зелёный, `6` синий. Другие значения плагин сейчас не пишет.
    pub flag: u8,
    /// `0` круг не считается, `1` круг без времени, `2` круг и время.
    pub count_lap_flag: u8,
    /// `0` локальный игрок, `1` локальный ИИ, `3` повтор.
    pub control: i8,
    pub num_penalties: i32,
    pub num_pitstops: i32,
    pub time_behind_next_s: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct RawCar {
    pub id: i32,
    pub pos: [f64; 3],
}

impl Default for RawPage {
    fn default() -> Self {
        Self {
            packet_id: 0,
            player: RawPlayer::default(),
            session: RawSession::default(),
            cars: Vec::new(),
        }
    }
}

impl Default for RawPlayer {
    fn default() -> Self {
        Self {
            id: 0,
            pos: [0.0; 3],
            local_vel: [0.0; 3],
            local_accel: [0.0; 3],
            ori: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            local_rot: [0.0; 3],
            gear: 0,
            engine_rpm: 0.0,
            engine_max_rpm: 0.0,
            engine_water_temp: 0.0,
            throttle: 0.0,
            brake: 0.0,
            steering: 0.0,
            clutch: 0.0,
            steering_shaft_torque: 0.0,
            fuel_l: 0.0,
            fuel_capacity_l: 0.0,
            current_sector: 0,
            speed_limiter: false,
            ignition_starter: 0,
            visual_steering_range_deg: 0.0,
            physical_steering_range_rad: 0.0,
            rear_brake_bias: 0.0,
            turbo_boost: 0.0,
            wheels: [RawWheel::default(); 4],
            dents: [0; 8],
            vehicle_name: String::new(),
            front_compound: String::new(),
            rear_compound: String::new(),
            scheduled_stops: 0,
            headlights: false,
        }
    }
}

impl Default for RawSession {
    fn default() -> Self {
        Self {
            track: String::new(),
            driver: String::new(),
            plugin_version: String::new(),
            session: 0,
            game_phase: 0,
            in_realtime: false,
            session_started: false,
            yellow_flag_state: 0,
            sector_flag: [0; 3],
            ambient_c: 0.0,
            track_c: 0.0,
            raining: 0.0,
            wind: [0.0; 3],
            path_wetness: 0.0,
            game_mode: 0,
            server_port: 0,
            lap_length_m: 0.0,
            max_laps: 0,
            current_et_s: 0.0,
            end_et_s: 0.0,
            num_vehicles: 0,
            completed_laps: 0,
            place: 0,
            lap_dist_m: 0.0,
            best_lap_s: 0.0,
            last_lap_s: 0.0,
            last_sector1_s: 0.0,
            last_sector2_s: 0.0,
            time_into_lap_s: 0.0,
            estimated_lap_s: 0.0,
            in_pits: false,
            pit_state: 0,
            in_garage: false,
            finish_status: 0,
            flag: 0,
            count_lap_flag: 0,
            control: 0,
            num_penalties: 0,
            num_pitstops: 0,
            time_behind_next_s: 0.0,
        }
    }
}
