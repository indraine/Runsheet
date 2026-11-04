//! Данные одного кадра из shared memory: физика, графика и статика.

use super::conditions::{Penalty, RaceFlag, Rain, TrackGrip};
use super::damage::BodyDamage;
use super::tires::TireSet;
use super::units::{BrakePosition, Celsius, LapTime, Psi, Speed, ThrottlePosition, TrackProgress};
use super::vec3::Vec3;
use super::{CarState, GameStatus, SessionKind};

/// Данные физики.
#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
pub(crate) struct PhysicsFrame {
    pub packet_id: i32,               // номер пакета, растёт с каждым обновлением
    pub speed: Speed,                 // скорость, км/ч
    pub throttle: ThrottlePosition,   // газ, от 0 до 1
    pub brake: BrakePosition,         // тормоз, от 0 до 1
    pub steer_deg: f32,               // угол руля, градусы
    pub gear: i32,                    // 0 — нейтраль, больше нуля — вперёд, меньше — назад
    pub rpm: i32,                     // обороты двигателя
    pub g_long: f32,                  // продольная перегрузка
    pub g_lat: f32,                   // боковая перегрузка
    pub heading: f32,                 // курс, радианы
    pub pressure: TireSet<Psi>,       // давление в шинах, psi
    pub brake_temp: TireSet<Celsius>, // температура тормозов, °C; в интерфейс уходят только передние
    pub fuel_l: f32,                  // топливо в баке, литры
    pub air: Celsius,                 // температура воздуха, °C
    pub road: Celsius,                // температура асфальта, °C
    pub brake_bias: f32,              // доля тормозного усилия на переднюю ось, от 0 до 1

    // NOTE: в пакет интерфейса не входит
    pub clutch: f32,                         // сцепление, от 0 до 1
    pub autoshifter: bool,                   // включено автопереключение
    pub ignition: bool,                      // включено зажигание
    pub starter: bool,                       // крутится стартер
    pub engine_running: bool,                // двигатель работает
    pub velocity: Vec3,                      // скорость в мире, м/с
    pub local_velocity: Vec3,                // скорость относительно машины, м/с
    pub angular_velocity: Vec3,              // угловая скорость, рад/с
    pub g_vert: f32,                         // вертикальная перегрузка
    pub pitch: f32,                          // тангаж, радианы
    pub roll: f32,                           // крен, радианы
    pub force_feedback: f32,                 // усилие на руле
    pub wheel_slip: TireSet<f32>,            // проскальзывание колёс
    pub wheel_angular_speed: TireSet<f32>,   // угловая скорость колёс, рад/с
    pub tyre_temp: TireSet<Celsius>,         // температура каркаса шин, °C
    pub suspension_travel: TireSet<f32>,     // ход подвески, мм
    pub brake_pressure: TireSet<f32>,        // давление в тормозных контурах, бар
    pub suspension_damage: TireSet<f32>,     // повреждение подвески, от 0 до 1
    pub slip_ratio: TireSet<f32>,            // коэффициент скольжения шин
    pub slip_angle: TireSet<f32>,            // угол увода шин, градусы
    pub pad_life: TireSet<f32>,              // остаток колодок, %
    pub disc_life: TireSet<f32>,             // остаток дисков, %
    pub front_brake_compound: i32,           // состав передних колодок
    pub rear_brake_compound: i32,            // состав задних колодок
    pub tyre_contact_point: TireSet<Vec3>,   // точка контакта шины с трассой
    pub tyre_contact_normal: TireSet<Vec3>,  // нормаль в точке контакта
    pub tyre_contact_heading: TireSet<Vec3>, // направление контакта шины
    pub tc: f32,                             // срабатывание трекшн-контроля
    pub abs: f32,                            // срабатывание ABS
    pub pit_limiter: bool,                   // включён ограничитель скорости на пит-лейне
    pub turbo_boost: f32,                    // наддув, бар
    pub water: Celsius,                      // температура охлаждающей жидкости, °C
    pub damage: BodyDamage,                  // повреждение кузова, от 0 до 1
    pub ai_controlled: bool,                 // машиной управляет ИИ
    pub kerb_vibration: f32,                 // вибрация от поребрика
    pub slip_vibration: f32,                 // вибрация от скольжения
    pub g_vibration: f32,                    // вибрация от перегрузки
    pub abs_vibration: f32,                  // вибрация от ABS
}

/// Данные графики.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub(crate) struct GraphicsFrame {
    pub status: GameStatus, // выключена, повтор, на трассе или пауза
    pub kind: SessionKind,  // практика, квалификация, гонка и остальные типы
    pub completed_lap: i32, // сколько кругов уже закончено
    pub current_lap_time: Option<LapTime>, // время текущего круга
    pub last_time: Option<LapTime>, // время последнего круга
    pub last_sector_time: Option<LapTime>, // время последнего сектора
    pub sector_index: i32,  // текущий сектор: 0, 1 или 2
    pub valid_lap: bool,    // круг засчитан
    pub distance_m: f32,    // пройденный путь, метры
    pub in_pit_box: bool,   // машина в боксе
    pub in_pit_lane: bool,  // машина на пит-лейне
    pub car_id: i32,        // индекс машины игрока
    pub car_count: i32,     // сколько машин в сессии
    pub ground_x: f32,      // координата X машины игрока на трассе
    pub ground_z: f32,      // координата Z машины игрока на трассе
    pub tc: i32,            // уровень трекшн-контроля
    pub engine_map: i32,    // карта двигателя
    pub abs: i32,           // уровень ABS
    pub setup_menu: bool,   // открыто меню настроек
    pub main_menu: bool,    // открыто главное меню
    pub green: bool,        // зелёный флаг или общий зелёный свет
    pub car_state: CarState, // гараж, пит-лейн, трасса или сессия закончена

    // NOTE: в пакет интерфейса не входит
    pub progress: TrackProgress, // доля круга, от 0 до 1
    pub packet_id: i32,              // номер пакета графики
    pub session_index: i32,          // номер сессии внутри заезда
    pub current_time_text: String,   // время текущего круга, как его пишет игра
    pub last_time_text: String,      // время последнего круга, как его пишет игра
    pub best_time_text: String,      // лучшее время, как его пишет игра
    pub last_sector_text: String,    // время последнего сектора, как его пишет игра
    pub position: i32,               // место в сессии
    pub best_time_ms: i32,           // лучший круг, миллисекунды, как прислала игра
    pub lap_count: i32,              // сколько кругов задано на сессию
    pub delta_text: String,          // дельта круга, как её пишет игра
    pub estimated_text: String,      // расчётное время круга, как его пишет игра
    pub delta_ms: i32,               // дельта круга, миллисекунды
    pub estimated_ms: i32,           // расчётное время круга, миллисекунды
    pub delta_positive: bool,        // дельта положительная
    pub fuel_laps: f32,              // на сколько кругов хватит топлива
    pub session_left_s: f32,         // сколько осталось до конца сессии, секунды
    pub ideal_line: bool,            // включена идеальная траектория
    pub mandatory_pit_done: bool,    // обязательный пит уже сделан
    pub missing_mandatory_pits: i32, // сколько обязательных питов ещё не сделано
    pub penalty_time_s: f32,         // штрафное время, секунды
    pub penalty: Penalty,            // назначенный штраф
    pub flag: RaceFlag,              // флаг, который видит гонщик
    pub car_coordinates: Vec<Vec3>,  // координаты всех машин
    pub car_ids: Vec<i32>,           // индексы машин в том же порядке, что и координаты
    pub wind_speed: f32,             // скорость ветра, м/с
    pub wind_direction: f32,         // направление ветра, градусы
    pub rain: Rain,                  // дождь сейчас
    pub rain_in_10m: Rain,           // дождь через 10 минут
    pub rain_in_30m: Rain,           // дождь через 30 минут
    pub grip: TrackGrip,             // сцепление трассы
    pub track_status: String,        // состояние трассы, как его пишет игра
    pub clock_s: f32,                // игровые часы, секунды
    pub tc_cut: i32,                 // уровень среза трекшн-контроля
    pub wipers: i32,                 // положение дворников
    pub stint_total_left_s: i32,     // остаток всего стинта, секунды
    pub stint_left_s: i32,           // остаток текущего стинта, секунды
    pub rain_tyres: bool,            // надета дождевая резина
    pub rain_light: bool,            // горит фонарь дождя
    pub flashing_light: bool,        // горит проблесковый маяк
    pub light_stage: i32,            // режим фар
    pub indicator_left: bool,        // левый поворотник
    pub indicator_right: bool,       // правый поворотник
    pub tyre_compound: String,       // название состава резины
    pub main_display: i32,           // номер главного экрана
    pub secondary_display: i32,      // номер второго экрана
    pub fuel_per_lap: f32,           // топливо на круг, литры
    pub used_fuel: f32,              // израсходованное топливо, литры
    pub exhaust: Celsius,            // температура выхлопа, °C
    pub gap_ahead_ms: i32,           // отрыв до машины впереди, миллисекунды
    pub gap_behind_ms: i32,          // отрыв до машины сзади, миллисекунды
    pub yellow: bool,                // жёлтый флаг на всей трассе
    pub yellow_s1: bool,             // жёлтый флаг в первом секторе
    pub yellow_s2: bool,             // жёлтый флаг во втором секторе
    pub yellow_s3: bool,             // жёлтый флаг в третьем секторе
    pub white_flag: bool,            // белый флаг
    pub green_light: bool,           // общий зелёный свет
    pub chequered: bool,             // клетчатый флаг
    pub red_flag: bool,              // красный флаг
    pub mfd_tyre_set: i32,           // комплект шин, выбранный в меню
    pub mfd_fuel_l: f32,             // долив топлива в меню, литры
    pub mfd_pressure: TireSet<f32>,  // давление шин, заданное в меню
    pub current_tyre_set: i32,       // текущий комплект шин
    pub strategy_tyre_set: i32,      // комплект шин в стратегии
}

/// Статические данные. За сессию не меняются.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub(crate) struct StaticsFrame {
    pub track: String,  // название трассы
    pub car: String,    // модель машины
    pub driver: String, // никнейм, или имя и фамилия
    pub online: bool,   // онлайн-сессия

    // NOTE: в пакет интерфейса не входит
    pub shared_memory_version: String, // версия shared memory
    pub game_version: String,          // версия ACC
    pub session_count: i32,            // сколько сессий в заезде
    pub entered_cars: i32,             // сколько машин заявлено
    pub sector_count: i32,             // сколько секторов на трассе
    pub player_name: String,           // имя пилота
    pub player_surname: String,        // фамилия пилота
    pub player_nick: String,           // ник пилота
    pub max_rpm: i32,                  // максимальные обороты
    pub max_fuel_l: f32,               // объём бака, литры
    pub penalty_enabled: bool,         // штрафы включены
    pub aid_fuel_rate: f32,            // множитель расхода топлива
    pub aid_tyre_rate: f32,            // множитель износа шин
    pub aid_mechanical_damage: f32,    // множитель механических повреждений
    pub aid_stability: f32,            // уровень системы стабилизации
    pub aid_auto_clutch: bool,         // включено автоматическое сцепление
    pub pit_window_start_s: i32,       // начало пит-окна, секунды
    pub pit_window_end_s: i32,         // конец пит-окна, секунды
    pub dry_tyre: String,              // название сухой резины
    pub wet_tyre: String,              // название дождевой резины
}
