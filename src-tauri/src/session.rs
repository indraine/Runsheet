//! Машина состояний выезда и сессии.
//!
//! На вход подаётся снимок полей, не shared memory. Часы тоже снаружи:
//! разрыв считается по монотонным миллисекундам, метки начала и конца — по локальным.
//! Идентификаторы создаются здесь.
//!
//! `Off` или отсутствие памяти дольше [`OUTING_GAP_MS`] закрывает выезд.
//! Пауза и повтор выезд не закрывают. Повтор сессию не открывает.
//! Боксы остаются `Live`, отдельного входа у них нет.
//! Смена машины, трассы, соло/онлайн, типа или индекса сессии открывает новую сессию того же выезда.

// Поля событий забирает доставка во фронт. На не-Windows поток машину не крутит,
// поэтому без `test` сборка эти типы не вызывает.
#![cfg_attr(not(any(windows, test)), allow(dead_code))]

use uuid::Uuid;

/// Сколько миллисекунд `Off` или пустой памяти держатся, прежде чем выезд закроется.
/// Ровно этот порог уже закрывает.
pub(crate) const OUTING_GAP_MS: u64 = 500;

/// `graphics.status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GameStatus {
    Off,
    Replay,
    Live,
    Pause,
}

/// `graphics.session_type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionKind {
    Unknown,
    Practice,
    Qualifying,
    Race,
    Hotlap,
    TimeAttack,
    Drift,
    Drag,
    Hotstint,
    HotlapSuperpole,
}

/// Поля одного пакета, которые решают, открыта ли сессия.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Frame {
    pub status: GameStatus,
    pub kind: SessionKind,
    /// Индекс сессии уикенда, `graphics.session_index`.
    pub session_index: i32,
    pub track: String,
    pub car: String,
    pub online: bool,
    /// Число машин в строке листа.
    pub car_count: i32,
    /// `graphics.is_setup_menu_visible`. В ключ строки не входит, поэтому поле только хранится.
    #[allow(dead_code)]
    pub setup_menu: bool,
    pub air_c: f32,
    pub road_c: f32,
}

/// Что видно на этом тике. Пустая память — тоже снимок.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Sight {
    Absent,
    Frame(Frame),
}

/// Один шаг машины. `mono_ms` — монотонные миллисекунды, `wall_ms` — локальные часы, epoch.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Tick {
    pub mono_ms: u64,
    pub wall_ms: u64,
    pub sight: Sight,
}

/// Открытая или только что открытая сессия.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Session {
    pub id: Uuid,
    pub outing_id: Uuid,
    pub started_at_ms: u64,
    pub ended_at_ms: Option<u64>,
    pub online: bool,
    pub track: String,
    pub car: String,
    pub kind: SessionKind,
    pub car_count: i32,
    pub air_c: f32,
    pub road_c: f32,
}

/// Что изменилось на этом снимке. Пустой вектор — тот же выезд и та же сессия.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Event {
    OutingOpened {
        outing_id: Uuid,
    },
    SessionOpened {
        session: Session,
    },
    SessionChanged {
        previous_id: Uuid,
        ended_at_ms: u64,
        session: Session,
    },
    OutingClosed {
        outing_id: Uuid,
        /// Сессия, которая ещё была открыта. Прошлые уже закрыты событием смены.
        session_id: Option<Uuid>,
        ended_at_ms: u64,
    },
}

#[derive(Debug)]
struct RowKey {
    kind: SessionKind,
    session_index: i32,
    track: String,
    car: String,
    online: bool,
}

impl RowKey {
    fn matches(&self, frame: &Frame) -> bool {
        self.kind == frame.kind
            && self.session_index == frame.session_index
            && self.track == frame.track
            && self.car == frame.car
            && self.online == frame.online
    }

    fn from(frame: &Frame) -> Self {
        Self {
            kind: frame.kind,
            session_index: frame.session_index,
            track: frame.track.clone(),
            car: frame.car.clone(),
            online: frame.online,
        }
    }
}

#[derive(Debug)]
struct OpenSession {
    key: RowKey,
    session: Session,
}

/// Состояние между снимками. Само время не читает.
#[derive(Debug, Default)]
pub(crate) struct Machine {
    outing_id: Option<Uuid>,
    open: Option<OpenSession>,
    gap_from_ms: Option<u64>,
}

impl Machine {
    /// Переход по одному снимку.
    #[must_use]
    pub(crate) fn step(&mut self, tick: &Tick) -> Vec<Event> {
        react(self, tick)
    }

    pub(crate) fn outing_id(&self) -> Option<Uuid> {
        self.outing_id
    }

    pub(crate) fn session(&self) -> Option<&Session> {
        self.open.as_ref().map(|open| &open.session)
    }

    fn gap_reached(&self, mono_ms: u64) -> bool {
        let Some(started) = self.gap_from_ms else {
            return false;
        };
        // Шаг часов назад разрыв не закрывает.
        mono_ms.saturating_sub(started) >= OUTING_GAP_MS
    }

    fn arm_gap(&mut self, mono_ms: u64) {
        if self.outing_id.is_some() && self.gap_from_ms.is_none() {
            self.gap_from_ms = Some(mono_ms);
        }
    }

    fn close(&mut self, wall_ms: u64) -> Option<Event> {
        let outing_id = self.outing_id.take()?;
        self.gap_from_ms = None;
        let session_id = self.open.take().map(|open| open.session.id);
        Some(Event::OutingClosed {
            outing_id,
            session_id,
            ended_at_ms: wall_ms,
        })
    }

    fn ensure_outing(&mut self, events: &mut Vec<Event>) -> Uuid {
        if let Some(id) = self.outing_id {
            return id;
        }
        let outing_id = Uuid::new_v4();
        self.outing_id = Some(outing_id);
        events.push(Event::OutingOpened { outing_id });
        outing_id
    }

    fn sync_row(&mut self, wall_ms: u64, frame: &Frame) -> Vec<Event> {
        let mut events = Vec::new();
        let outing_id = self.ensure_outing(&mut events);

        if let Some(open) = &mut self.open
            && open.key.matches(frame)
        {
            open.session.car_count = frame.car_count;
            open.session.air_c = frame.air_c;
            open.session.road_c = frame.road_c;
            return events;
        }

        let session = Session::open(outing_id, wall_ms, frame);
        let event = match self.open.replace(OpenSession {
            key: RowKey::from(frame),
            session: session.clone(),
        }) {
            None => Event::SessionOpened { session },
            Some(previous) => Event::SessionChanged {
                previous_id: previous.session.id,
                ended_at_ms: wall_ms,
                session,
            },
        };
        events.push(event);
        events
    }
}

impl Session {
    fn open(outing_id: Uuid, wall_ms: u64, frame: &Frame) -> Self {
        Self {
            id: Uuid::new_v4(),
            outing_id,
            started_at_ms: wall_ms,
            ended_at_ms: None,
            online: frame.online,
            track: frame.track.clone(),
            car: frame.car.clone(),
            kind: frame.kind,
            car_count: frame.car_count,
            air_c: frame.air_c,
            road_c: frame.road_c,
        }
    }
}

fn react(machine: &mut Machine, tick: &Tick) -> Vec<Event> {
    let mut events = Vec::new();
    if machine.gap_reached(tick.mono_ms) {
        events.extend(machine.close(tick.wall_ms));
    }

    match &tick.sight {
        Sight::Absent => machine.arm_gap(tick.mono_ms),
        Sight::Frame(frame) => match frame.status {
            GameStatus::Off => machine.arm_gap(tick.mono_ms),
            GameStatus::Replay => machine.gap_from_ms = None,
            GameStatus::Live | GameStatus::Pause => {
                machine.gap_from_ms = None;
                events.extend(machine.sync_row(tick.wall_ms, frame));
            }
        },
    }

    events
}
