use serde::Serialize;

use crate::domain::{OutingEvent, OutingId, Session, SessionKind};
use crate::platform::game::Presence;

const LIVE: &str = "live";

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LinkState {
    #[default]
    Unavailable,
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Linked,
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Lost,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub link: LinkState,
    pub presence: Presence,
    pub packet_id: Option<i32>,
    pub outing_id: Option<String>,
    pub session: Option<SessionBody>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub current_lap_ms: Option<i32>,
    pub sector_ms: Option<i32>,
    pub s1_ms: Option<i32>,
    pub s2_ms: Option<i32>,
    pub outlap: bool,
    pub speed: Option<f32>,
    pub air_temp: Option<f32>,
    pub road_temp: Option<f32>,
    pub events: Vec<StatusEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionBody {
    pub id: String,
    pub outing_id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub online: bool,
    pub track: String,
    pub car: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub car_count: i32,
    pub status: &'static str,
    pub air_temp: f32,
    pub road_temp: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum StatusEvent {
    OutingOpened {
        outing_id: String,
    },
    SessionOpened {
        session: SessionBody,
    },
    SessionChanged {
        previous_id: String,
        ended_at: u64,
        session: SessionBody,
    },
    OutingClosed {
        outing_id: String,
        session_id: Option<String>,
        ended_at: u64,
    },
}

pub(crate) struct Capture<'a> {
    pub link: LinkState,
    pub presence: Presence,
    pub packet_id: Option<i32>,
    pub outing_id: Option<OutingId>,
    pub session: Option<&'a Session>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub current_lap_ms: Option<i32>,
    pub sector_ms: Option<i32>,
    pub s1_ms: Option<i32>,
    pub s2_ms: Option<i32>,
    pub outlap: bool,
    pub speed: Option<f32>,
    pub air_temp: Option<f32>,
    pub road_temp: Option<f32>,
    pub events: &'a [OutingEvent],
}

impl Status {
    pub(crate) fn capture(input: Capture<'_>) -> Self {
        Self {
            link: input.link,
            presence: input.presence,
            packet_id: input.packet_id,
            outing_id: input.outing_id.map(|id| id_text(id.as_bytes())),
            session: input.session.map(SessionBody::from_session),
            lap_number: input.lap_number,
            sector: input.sector,
            current_lap_ms: input.current_lap_ms,
            sector_ms: input.sector_ms,
            s1_ms: input.s1_ms,
            s2_ms: input.s2_ms,
            outlap: input.outlap,
            speed: input.speed,
            air_temp: input.air_temp,
            road_temp: input.road_temp,
            events: input.events.iter().map(StatusEvent::from_event).collect(),
        }
    }
}

impl SessionBody {
    fn from_session(session: &Session) -> Self {
        Self {
            id: id_text(session.id.as_bytes()),
            outing_id: id_text(session.outing_id.as_bytes()),
            started_at: session.started_at_ms,
            ended_at: session.ended_at_ms,
            online: session.online,
            track: session.track.clone(),
            car: session.car.clone(),
            kind: kind_name(session.kind),
            car_count: session.car_count,
            status: LIVE,
            air_temp: session.air_c,
            road_temp: session.road_c,
        }
    }
}

impl StatusEvent {
    fn from_event(event: &OutingEvent) -> Self {
        match event {
            OutingEvent::OutingOpened { outing_id } => Self::OutingOpened {
                outing_id: id_text(outing_id.as_bytes()),
            },
            OutingEvent::SessionOpened { session } => Self::SessionOpened {
                session: SessionBody::from_session(session),
            },
            OutingEvent::SessionChanged {
                previous_id,
                ended_at_ms,
                session,
            } => Self::SessionChanged {
                previous_id: id_text(previous_id.as_bytes()),
                ended_at: *ended_at_ms,
                session: SessionBody::from_session(session),
            },
            OutingEvent::OutingClosed {
                outing_id,
                session_id,
                ended_at_ms,
            } => Self::OutingClosed {
                outing_id: id_text(outing_id.as_bytes()),
                session_id: session_id.map(|id| id_text(id.as_bytes())),
                ended_at: *ended_at_ms,
            },
        }
    }
}

fn id_text(bytes: [u8; 16]) -> String {
    uuid::Uuid::from_bytes(bytes).to_string()
}

fn kind_name(kind: SessionKind) -> &'static str {
    match kind {
        SessionKind::Unknown => "unknown",
        SessionKind::Practice => "practice",
        SessionKind::Qualifying => "qualifying",
        SessionKind::Race => "race",
        SessionKind::Hotlap => "hotlap",
        SessionKind::TimeAttack => "timeAttack",
        SessionKind::Drift => "drift",
        SessionKind::Drag => "drag",
        SessionKind::Hotstint => "hotstint",
        SessionKind::HotlapSuperpole => "hotlapSuperpole",
    }
}
