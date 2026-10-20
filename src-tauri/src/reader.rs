//! Поток чтения shared memory ACC.
//!
//! Снимок берётся 20 раз в секунду. Статус сессии кормит машину выезда,
//! физика открытого круга — сборщик. Сырой `ACCMap` разбирает только `ingress::decode`.
//! Кольца всех пакетов нет: буфер принадлежит открытому кругу и сбрасывается,
//! когда выезд закрывается или сессия сменилась.

use std::time::Duration;

#[cfg(windows)]
use acc_shared_memory_rs::ACCSharedMemory;
#[cfg(windows)]
use acc_shared_memory_rs::maps::ACCMap;

#[cfg(any(windows, test))]
use crate::domain::{GameStatus as CleanStatus, LapTime, SessionKind as CleanKind};
#[cfg(any(windows, test))]
use crate::ingress::CleanTick;
#[cfg(windows)]
use crate::ingress::{PageOutcome, decode};
#[cfg(any(windows, test))]
use crate::lap::{Collector, Sample};
#[cfg(any(windows, test))]
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
    let mut seen_packet = None;

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
                    &mut seen_packet,
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
                        &mut seen_packet,
                    );
                    std::thread::sleep(SNAPSHOT_EVERY);
                }
                Ok(None) => {
                    // Физика замерла (пауза, меню), а статус живёт в другом сегменте.
                    // Сбрасываем защёлку пакета, чтобы следующий снимок её показал.
                    acc.reset();
                    if let Ok(Some(map)) = acc.read_shared_memory() {
                        // Идентификатор физики тот же, а пауза и меню живут в графике.
                        // Иначе decode вернёт Stale и выезд не увидит Off.
                        seen_packet = None;
                        deliver(
                            &outbox,
                            &mut relay,
                            &clock,
                            link.state(),
                            process.get(),
                            &mut machine,
                            &mut laps,
                            Some(&map),
                            &mut seen_packet,
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
                        &mut seen_packet,
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

/// Статус и пачка этого снимка. Промежуточная пачка открытого круга — не чаще раза в секунду.
///
/// `map` доходит только до `decode`. Повтор пакета и неконечное поле машину не двигают.
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
    seen_packet: &mut Option<i32>,
) {
    let fresh = match map {
        None => {
            *seen_packet = None;
            None
        }
        Some(map) => match decode(*seen_packet, map) {
            Ok(PageOutcome::Stale) => return,
            Ok(PageOutcome::Fresh(tick)) => {
                *seen_packet = Some(tick.physics.packet_id);
                Some(tick)
            }
            Err(error) => {
                eprintln!("кадр ACC отвергнут: {error}");
                return;
            }
        },
    };
    let packet_id = fresh.as_ref().map(|tick| tick.physics.packet_id);
    let motion = fresh.as_ref().map(motion_of);
    let tick = clock.stamp(match &fresh {
        Some(clean) => Sight::Frame(frame_of(clean)),
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
    let in_session = fresh
        .as_ref()
        .is_some_and(|tick| tick.graphic.status != CleanStatus::Off);
    if decision.emit_status {
        outbox.emit_status(&Status::capture(Capture {
            link,
            presence: game::presence(link == LinkState::Linked, in_session, process_running),
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

/// Старый снимок сессии. Машина выезда ещё принимает его, не страницы ACC.
#[cfg(any(windows, test))]
fn frame_of(tick: &CleanTick) -> Frame {
    let graphic = &tick.graphic;
    Frame {
        status: status_of(graphic.status),
        kind: kind_of(graphic.kind),
        session_index: graphic.session_index,
        track: graphic.track.clone(),
        car: graphic.car.clone(),
        online: graphic.online,
        car_count: graphic.car_count,
        setup_menu: graphic.setup_menu,
        air_c: graphic.air.celsius(),
        road_c: graphic.road.celsius(),
    }
}

#[cfg(any(windows, test))]
fn status_of(status: CleanStatus) -> GameStatus {
    match status {
        CleanStatus::Off => GameStatus::Off,
        CleanStatus::Replay => GameStatus::Replay,
        CleanStatus::Live => GameStatus::Live,
        CleanStatus::Pause => GameStatus::Pause,
    }
}

#[cfg(any(windows, test))]
fn kind_of(kind: CleanKind) -> SessionKind {
    match kind {
        CleanKind::Unknown => SessionKind::Unknown,
        CleanKind::Practice => SessionKind::Practice,
        CleanKind::Qualifying => SessionKind::Qualifying,
        CleanKind::Race => SessionKind::Race,
        CleanKind::Hotlap => SessionKind::Hotlap,
        CleanKind::TimeAttack => SessionKind::TimeAttack,
        CleanKind::Drift => SessionKind::Drift,
        CleanKind::Drag => SessionKind::Drag,
        CleanKind::Hotstint => SessionKind::Hotstint,
        CleanKind::HotlapSuperpole => SessionKind::HotlapSuperpole,
    }
}

/// Поля сборщика круга. Нет времени — `-1`, как у ACC, пока круг ещё не закрыт.
#[cfg(any(windows, test))]
fn motion_of(tick: &CleanTick) -> Motion {
    let physics = &tick.physics;
    let graphic = &tick.graphic;
    Motion {
        completed_lap: graphic.completed_lap,
        last_time_ms: lap_ms(graphic.last_time),
        last_sector_time_ms: lap_ms(graphic.last_sector_time),
        sector_index: graphic.sector_index,
        valid: graphic.valid_lap,
        distance_m: graphic.distance_m,
        fuel: physics.fuel_l,
        throttle: physics.throttle.fraction(),
        brake: physics.brake.fraction(),
        steer: physics.steer_deg,
        speed: physics.speed.kmh(),
        lap_time_ms: lap_ms(graphic.current_lap_time),
        progress: physics.progress.fraction(),
        g_long: physics.g_long,
        g_lat: physics.g_lat,
        x: physics.ground_x,
        z: physics.ground_z,
        pressure_fl: physics.pressure.front_left.psi(),
        pressure_fr: physics.pressure.front_right.psi(),
        pressure_rl: physics.pressure.rear_left.psi(),
        pressure_rr: physics.pressure.rear_right.psi(),
        brake_temp_fl: physics.brake_temp.front_left.celsius(),
        brake_temp_fr: physics.brake_temp.front_right.celsius(),
    }
}

#[cfg(any(windows, test))]
fn lap_ms(time: Option<LapTime>) -> i32 {
    time.map(LapTime::ms).unwrap_or(-1)
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

    #[test]
    fn clean_tick_feeds_the_frame_and_the_lap_motion() {
        use crate::domain::{
            BrakePosition, CarState, Celsius, CleanSessionGraphic, CleanTelemetryFrame, Psi, Speed,
            ThrottlePosition, TireSet, TrackProgress,
        };

        let tick = CleanTick {
            physics: CleanTelemetryFrame {
                packet_id: 7,
                speed: Speed::from_kmh_unchecked(180.0),
                throttle: ThrottlePosition::from_fraction_unchecked(1.0),
                brake: BrakePosition::from_fraction_unchecked(0.0),
                steer_deg: 8.0,
                progress: TrackProgress::from_fraction_unchecked(0.25),
                fuel_l: 42.0,
                g_long: 0.5,
                g_lat: 0.2,
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
                status: CleanStatus::Live,
                kind: CleanKind::Practice,
                session_index: 2,
                track: "monza".to_owned(),
                car: "ferrari_296_gt3".to_owned(),
                online: false,
                car_count: 20,
                setup_menu: false,
                air: Celsius::from_celsius_unchecked(21.5),
                road: Celsius::from_celsius_unchecked(28.0),
                car_state: CarState::OnTrack,
                completed_lap: 3,
                last_time: None,
                last_sector_time: Some(LapTime::from_ms_unchecked(30_000)),
                current_lap_time: Some(LapTime::from_ms_unchecked(12_000)),
                sector_index: 1,
                valid_lap: true,
                distance_m: 1_500.0,
                packet_id: 7,
            },
        };

        let frame = frame_of(&tick);
        assert_eq!(frame.status, GameStatus::Live);
        assert_eq!(frame.kind, SessionKind::Practice);
        assert_eq!(frame.track, "monza");
        assert_eq!(frame.air_c, 21.5);
        assert_eq!(frame.road_c, 28.0);

        let motion = motion_of(&tick);
        assert_eq!(motion.speed, 180.0);
        assert_eq!(motion.throttle, 1.0);
        assert_eq!(motion.last_time_ms, -1);
        assert_eq!(motion.last_sector_time_ms, 30_000);
        assert_eq!(motion.lap_time_ms, 12_000);
        assert_eq!(motion.x, 12.0);
        assert_eq!(motion.z, -4.0);
        assert_eq!(motion.pressure_rr, 26.4);
        assert_eq!(motion.brake_temp_fl, 420.0);
        assert_eq!(motion.brake_temp_fr, 430.0);
        assert_eq!(motion.g_long, 0.5);
        assert_eq!(motion.g_lat, 0.2);
    }
}
