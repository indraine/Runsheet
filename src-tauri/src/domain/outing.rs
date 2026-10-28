use super::{OutingId, SessionId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum GameStatus {
    #[default]
    Off,
    Replay,
    Live,
    Pause,
}

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

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Frame {
    pub status: GameStatus,
    pub kind: SessionKind,
    pub session_index: i32,
    pub track: String,
    pub car: String,
    /// `player_nick`, or the first and last name when the nick is empty.
    pub driver: String,
    /// Player car index from the graphics page (`player_car_id`).
    pub car_id: i32,
    pub online: bool,
    pub car_count: i32,
    pub setup_menu: bool,
    pub air_c: f32,
    pub road_c: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Session {
    pub id: SessionId,
    pub outing_id: OutingId,
    pub started_at_ms: u64,
    pub ended_at_ms: Option<u64>,
    pub online: bool,
    pub track: String,
    pub car: String,
    pub driver: String,
    pub car_id: i32,
    pub kind: SessionKind,
    pub car_count: i32,
    pub air_c: f32,
    pub road_c: f32,
}

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
        session_id: Option<SessionId>,
        ended_at_ms: u64,
    },
}
