//! Типы выезда и сессии.
//!
//! Это снимок полей, ещё не чистый кадр ingress. Температуры и счётчики здесь
//! сырые числа: санитизация появится на границе, а не внутри этих структур.

use super::{OutingId, SessionId};

/// `graphics.status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum GameStatus {
    #[default]
    Off,
    Replay,
    Live,
    Pause,
}

/// `graphics.session_type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum SessionKind {
    #[default]
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
///
/// Числа ещё не приведены к единицам домена.
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
    /// `graphics.is_setup_menu_visible`. В ключ строки не входит.
    pub setup_menu: bool,
    pub air_c: f32,
    pub road_c: f32,
}

/// Открытая или только что открытая сессия.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Session {
    pub id: SessionId,
    pub outing_id: OutingId,
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

/// Что изменилось в выезде на этом снимке.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum OutingEvent {
    OutingOpened {
        outing_id: OutingId,
    },
    SessionOpened {
        session: Session,
    },
    SessionChanged {
        previous_id: SessionId,
        ended_at_ms: u64,
        session: Session,
    },
    OutingClosed {
        outing_id: OutingId,
        /// Сессия, которая ещё была открыта. Прошлые уже закрыты событием смены.
        session_id: Option<SessionId>,
        ended_at_ms: u64,
    },
}
