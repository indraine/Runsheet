//! Поток чтения shared memory ACC.
//!
//! Снимок берётся 20 раз в секунду. Статус сессии кормит машину выезда,
//! физика открытого круга — сборщик. Кольца всех пакетов нет: буфер принадлежит
//! открытому кругу и сбрасывается, когда выезд закрывается или сессия сменилась.
//! Полный `ACCMap` в лог и во фронт не копируется.

use std::time::Duration;

#[cfg(windows)]
use acc_shared_memory_rs::ACCSharedMemory;
#[cfg(any(windows, test))]
use acc_shared_memory_rs::datatypes::Vector3f;
#[cfg(any(windows, test))]
use acc_shared_memory_rs::enums::{AccSessionType, AccStatus};
#[cfg(windows)]
use acc_shared_memory_rs::maps::ACCMap;

#[cfg(any(windows, test))]
use crate::lap::{Collector, Sample};
#[cfg(windows)]
use crate::session::Frame;
#[cfg(any(windows, test))]
use crate::session::{Event, GameStatus, Machine, SessionKind, Sight, Tick};

use crate::game;
use crate::ipc::{self, Capture, LinkState, Relay, Status};

/// Пауза между попытками открыть память, пока ACC не запущена.
#[cfg(windows)]
const RETRY_AFTER: Duration = Duration::from_millis(500);

/// Пауза между снимками. 20 Гц — и статус сессии, и вход сборщика.
#[cfg(windows)]
const SNAPSHOT_EVERY: Duration = Duration::from_millis(ipc::STATUS_GAP_MS);

/// Что сказать в лог при смене связи. Повтор того же состояния молчит.
#[derive(Debug, PartialEq, Eq)]
enum LinkNotice {
    Unavailable,
    /// На этой системе память не открывается, поэтому ветка есть только в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Linked,
    Lost,
}

impl LinkNotice {
    const fn line(self) -> &'static str {
        match self {
            Self::Unavailable => "ACC недоступна",
            Self::Linked => "ACC на связи",
            Self::Lost => "связь с ACC потеряна",
        }
    }
}

/// Край связи. Пока состояние не меняется, новых строк нет.
#[derive(Debug, Default)]
struct Link {
    phase: LinkState,
    told_down: bool,
}

impl Link {
    /// На этой системе память не открывается, поэтому переход есть только в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    fn note_up(&mut self) -> Option<LinkNotice> {
        if self.phase == LinkState::Linked {
            return None;
        }
        self.phase = LinkState::Linked;
        self.told_down = false;
        Some(LinkNotice::Linked)
    }

    fn note_down(&mut self) -> Option<LinkNotice> {
        if self.phase == LinkState::Linked {
            self.phase = LinkState::Lost;
            self.told_down = true;
            return Some(LinkNotice::Lost);
        }
        if self.told_down {
            return None;
        }
        self.told_down = true;
        Some(LinkNotice::Unavailable)
    }

    fn state(&self) -> LinkState {
        self.phase
    }
}

fn report(notice: Option<LinkNotice>) {
    if let Some(notice) = notice {
        eprintln!("{}", notice.line());
    }
}

pub(crate) fn run(outbox: ipc::Outbox) {
    #[cfg(windows)]
    poll(outbox);

    // Имя памяти ACC существует только на Windows. Ждать её здесь нечего.
    #[cfg(not(windows))]
    wait_without_acc(outbox);
}

/// Памяти нет, поэтому круг не пишется. Статус «недоступна» всё равно уходит,
/// не чаще 20 Гц: страница может подписаться уже после старта потока.
#[cfg(not(windows))]
fn wait_without_acc(outbox: ipc::Outbox) -> ! {
    let mut link = Link::default();
    report(link.note_down());
    let mut relay = Relay::default();
    let start = std::time::Instant::now();
    loop {
        let now_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
        let decision = relay.decide(now_ms, false, false, None);
        if decision.emit_status {
            outbox.emit_status(&Status::capture(Capture {
                link: link.state(),
                presence: game::Presence::Off,
                packet_id: None,
                outing_id: None,
                session: None,
                lap_number: None,
                sector: None,
                speed: None,
                air_temp: None,
                road_temp: None,
                events: &[],
            }));
        }
        outbox.drain();
        std::thread::sleep(Duration::from_millis(ipc::STATUS_GAP_MS));
    }
}

#[cfg(windows)]
fn poll(outbox: ipc::Outbox) -> ! {
    let mut link = Link::default();
    let mut machine = Machine::default();
    let mut laps = Collector::default();
    let mut relay = Relay::default();
    let clock = Clock::start();
    let mut process = ProcessProbe::default();

    loop {
        let mut acc = match ACCSharedMemory::new() {
            Ok(acc) => acc,
            Err(_) => {
                report(link.note_down());
                deliver(
                    &outbox,
                    &mut relay,
                    &clock,
                    link.state(),
                    process.get(),
                    &mut machine,
                    &mut laps,
                    None,
                );
                std::thread::sleep(RETRY_AFTER);
                continue;
            }
        };

        report(link.note_up());

        loop {
            match acc.read_shared_memory() {
                Ok(Some(map)) => {
                    deliver(
                        &outbox,
                        &mut relay,
                        &clock,
                        link.state(),
                        process.get(),
                        &mut machine,
                        &mut laps,
                        Some(&map),
                    );
                    std::thread::sleep(SNAPSHOT_EVERY);
                }
                Ok(None) => {
                    // Физика замерла (пауза, меню), а статус живёт в другом сегменте.
                    // Сбрасываем защёлку пакета, чтобы следующий снимок её показал.
                    acc.reset();
                    if let Ok(Some(map)) = acc.read_shared_memory() {
                        deliver(
                            &outbox,
                            &mut relay,
                            &clock,
                            link.state(),
                            process.get(),
                            &mut machine,
                            &mut laps,
                            Some(&map),
                        );
                    }
                    std::thread::sleep(SNAPSHOT_EVERY);
                }
                Err(_) => {
                    report(link.note_down());
                    deliver(
                        &outbox,
                        &mut relay,
                        &clock,
                        link.state(),
                        process.get(),
                        &mut machine,
                        &mut laps,
                        None,
                    );
                    break;
                }
            }
        }
    }
}

/// Процесс ACC проверяется не на каждом снимке: `tasklist` тяжелее чтения памяти.
#[cfg(windows)]
#[derive(Default)]
struct ProcessProbe {
    running: bool,
    checked: Option<std::time::Instant>,
}

#[cfg(windows)]
impl ProcessProbe {
    fn get(&mut self) -> bool {
        let fresh = self
            .checked
            .is_some_and(|at| at.elapsed() < Duration::from_secs(1));
        if fresh {
            return self.running;
        }
        self.running = game::process_running();
        self.checked = Some(std::time::Instant::now());
        self.running
    }
}

/// `Off` — главное меню или экран вне заезда. Пауза и повтор остаются сессией.
#[cfg(windows)]
fn in_session(map: Option<&ACCMap>) -> bool {
    map.is_some_and(|map| map.graphics.status != AccStatus::Off)
}

/// Статус и пачка этого снимка. Промежуточная пачка открытого круга — не чаще раза в секунду.
#[cfg(windows)]
fn deliver(
    outbox: &ipc::Outbox,
    relay: &mut Relay,
    clock: &Clock,
    link: LinkState,
    process_running: bool,
    machine: &mut Machine,
    laps: &mut Collector,
    map: Option<&ACCMap>,
) {
    let packet_id = map.map(|map| map.physics.packet_id);
    let motion = map.map(motion_from);
    let tick = clock.stamp(match map {
        Some(map) => sight_from(map),
        None => Sight::Absent,
    });
    let shot = ingest(machine, laps, &tick, motion.as_ref());
    let frame = match &tick.sight {
        Sight::Frame(frame) => Some(frame),
        Sight::Absent => None,
    };
    let decision = relay.decide(
        tick.mono_ms,
        !shot.events.is_empty(),
        shot.lap.is_some(),
        laps.open_id(),
    );
    if decision.emit_status {
        outbox.emit_status(&Status::capture(Capture {
            link,
            presence: game::presence(link == LinkState::Linked, in_session(map), process_running),
            packet_id,
            outing_id: machine.outing_id(),
            session: machine.session(),
            lap_number: laps.open_number(),
            sector: motion.as_ref().map(|item| item.sector_index),
            speed: motion.as_ref().map(|item| item.speed),
            air_temp: frame.map(|item| item.air_c),
            road_temp: frame.map(|item| item.road_c),
            events: &shot.events,
        }));
    }
    let bytes = match decision.lap {
        ipc::LapSend::Closed => shot.lap,
        ipc::LapSend::Preview => laps.preview(),
        ipc::LapSend::None => None,
    };
    if let Some(bytes) = bytes {
        outbox.send_lap(bytes);
    } else {
        outbox.drain();
    }
}

#[cfg(windows)]
fn ingest_map(machine: &mut Machine, laps: &mut Collector, clock: &Clock, map: &ACCMap) -> Shot {
    let motion = motion_from(map);
    let tick = clock.stamp(sight_from(map));
    ingest(machine, laps, &tick, Some(&motion))
}

#[cfg(windows)]
fn ingest_absent(machine: &mut Machine, laps: &mut Collector, clock: &Clock) -> Shot {
    ingest(machine, laps, &clock.stamp(Sight::Absent), None)
}

/// Монотонные миллисекунды от старта потока и локальные часы.
#[cfg(windows)]
struct Clock {
    start: std::time::Instant,
}

#[cfg(windows)]
impl Clock {
    fn start() -> Self {
        Self {
            start: std::time::Instant::now(),
        }
    }

    fn stamp(&self, sight: Sight) -> Tick {
        Tick {
            mono_ms: u64::try_from(self.start.elapsed().as_millis()).unwrap_or(u64::MAX),
            wall_ms: wall_ms(),
            sight,
        }
    }
}

#[cfg(windows)]
fn wall_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

#[cfg(windows)]
fn sight_from(map: &ACCMap) -> Sight {
    Sight::Frame(Frame {
        status: game_status(map.graphics.status),
        kind: session_kind(map.graphics.session_type),
        session_index: map.graphics.session_index,
        track: map.statics.track.clone(),
        car: map.statics.car_model.clone(),
        online: map.statics.is_online,
        car_count: map.graphics.active_cars,
        setup_menu: map.graphics.is_setup_menu_visible,
        air_c: map.physics.air_temp,
        road_c: map.physics.road_temp,
    })
}

#[cfg(windows)]
fn motion_from(map: &ACCMap) -> Motion {
    let (x, z) = player_ground(
        &map.graphics.car_id,
        &map.graphics.car_coordinates,
        map.graphics.player_car_id,
    );
    let pressure = map.physics.wheel_pressure;
    let brake_temp = map.physics.brake_temp;
    Motion {
        completed_lap: map.graphics.completed_lap,
        last_time_ms: map.graphics.last_time,
        last_sector_time_ms: map.graphics.last_sector_time,
        sector_index: map.graphics.current_sector_index,
        valid: map.graphics.is_valid_lap,
        distance_m: map.graphics.distance_traveled,
        fuel: map.physics.fuel,
        throttle: map.physics.gas,
        brake: map.physics.brake,
        steer: map.physics.steer_angle,
        speed: map.physics.speed_kmh,
        lap_time_ms: map.graphics.current_time,
        progress: map.graphics.normalized_car_position,
        g_long: map.physics.g_force.z,
        g_lat: map.physics.g_force.x,
        x,
        z,
        pressure_fl: pressure.front_left,
        pressure_fr: pressure.front_right,
        pressure_rl: pressure.rear_left,
        pressure_rr: pressure.rear_right,
        brake_temp_fl: brake_temp.front_left,
        brake_temp_fr: brake_temp.front_right,
    }
}

#[cfg(any(windows, test))]
fn game_status(status: AccStatus) -> GameStatus {
    match status {
        AccStatus::Off => GameStatus::Off,
        AccStatus::Replay => GameStatus::Replay,
        AccStatus::Live => GameStatus::Live,
        AccStatus::Pause => GameStatus::Pause,
    }
}

#[cfg(any(windows, test))]
fn session_kind(kind: AccSessionType) -> SessionKind {
    match kind {
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
    }
}

/// Земля машины игрока: `x` и `z`. `player_car_id` — идентификатор, не индекс.
/// Слот ищется в `car_id`. Нет слота — нули, круг всё равно пишется.
#[cfg(any(windows, test))]
fn player_ground(car_ids: &[i32], coordinates: &[Vector3f], player_car_id: i32) -> (f32, f32) {
    let Some(slot) = car_ids.iter().position(|id| *id == player_car_id) else {
        return (0.0, 0.0);
    };
    let Some(point) = coordinates.get(slot) else {
        return (0.0, 0.0);
    };
    (point.x, point.z)
}

/// Поля физики круга без сессии: её идентификатор знает только машина.
#[cfg(any(windows, test))]
#[derive(Debug, Clone, Copy, PartialEq)]
struct Motion {
    completed_lap: i32,
    last_time_ms: i32,
    last_sector_time_ms: i32,
    sector_index: i32,
    valid: bool,
    distance_m: f32,
    fuel: f32,
    throttle: f32,
    brake: f32,
    steer: f32,
    speed: f32,
    lap_time_ms: i32,
    progress: f32,
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

#[cfg(any(windows, test))]
impl Motion {
    fn sample(self, mono_ms: u64, session_id: uuid::Uuid) -> Sample {
        Sample {
            mono_ms,
            session_id,
            completed_lap: self.completed_lap,
            last_time_ms: self.last_time_ms,
            last_sector_time_ms: self.last_sector_time_ms,
            sector_index: self.sector_index,
            valid: self.valid,
            distance_m: self.distance_m,
            fuel: self.fuel,
            throttle: self.throttle,
            brake: self.brake,
            steer: self.steer,
            speed: self.speed,
            lap_time_ms: self.lap_time_ms,
            progress: self.progress,
            g_long: self.g_long,
            g_lat: self.g_lat,
            x: self.x,
            z: self.z,
            pressure_fl: self.pressure_fl,
            pressure_fr: self.pressure_fr,
            pressure_rl: self.pressure_rl,
            pressure_rr: self.pressure_rr,
            brake_temp_fl: self.brake_temp_fl,
            brake_temp_fr: self.brake_temp_fr,
        }
    }
}

/// Что изменил один снимок. Пачка есть только если на этом тике круг закрылся.
#[cfg(any(windows, test))]
struct Shot {
    events: Vec<Event>,
    lap: Option<Vec<u8>>,
}

/// Один снимок: машина, затем сборщик.
/// Чужой буфер пакуется незачётным до записи точки новой сессии.
#[cfg(any(windows, test))]
fn ingest(
    machine: &mut Machine,
    laps: &mut Collector,
    tick: &Tick,
    motion: Option<&Motion>,
) -> Shot {
    let events = machine.step(tick);
    let abandoned = release_foreign_lap(machine, laps);
    let finished = record_live(machine, laps, tick, motion);
    Shot {
        events,
        lap: finished.or(abandoned),
    }
}

/// Буфер принадлежит открытой сессии.
/// Закрытый выезд и чужая сессия отдают точки одной пачкой, если они есть.
#[cfg(any(windows, test))]
fn release_foreign_lap(machine: &Machine, laps: &mut Collector) -> Option<Vec<u8>> {
    let current = machine.session().map(|session| session.id);
    if laps.bound_session() == current {
        return None;
    }
    laps.abandon()
}

/// Точку пишет только `Live`. Пауза, повтор и `Off` буфер не пополняют.
#[cfg(any(windows, test))]
fn record_live(
    machine: &Machine,
    laps: &mut Collector,
    tick: &Tick,
    motion: Option<&Motion>,
) -> Option<Vec<u8>> {
    let Sight::Frame(frame) = &tick.sight else {
        return None;
    };
    if frame.status != GameStatus::Live {
        return None;
    }
    let session_id = machine.session()?.id;
    let motion = motion?;
    laps.push(&motion.sample(tick.mono_ms, session_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_remembers_a_drop_after_it_was_up() {
        let mut link = Link::default();
        assert_eq!(link.state(), LinkState::Unavailable);
        assert_eq!(link.note_down(), Some(LinkNotice::Unavailable));
        assert_eq!(link.note_down(), None);
        assert_eq!(link.state(), LinkState::Unavailable);

        assert_eq!(link.note_up(), Some(LinkNotice::Linked));
        assert_eq!(link.note_up(), None);
        assert_eq!(link.state(), LinkState::Linked);

        assert_eq!(link.note_down(), Some(LinkNotice::Lost));
        assert_eq!(link.note_down(), None);
        assert_eq!(link.state(), LinkState::Lost);

        assert_eq!(link.note_up(), Some(LinkNotice::Linked));
        assert_eq!(link.state(), LinkState::Linked);
    }
}
