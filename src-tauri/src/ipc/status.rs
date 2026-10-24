//! Снимок `acc-status`. Имена JSON совпадают с разбором на фронте.

use serde::Serialize;

use crate::domain::{OutingEvent, OutingId, Session, SessionKind};
use crate::platform::game::Presence;

/// Имя события Tauri со снимком связи и открытой сессии.
pub(crate) const ACC_STATUS: &str = "acc-status";

const LIVE: &str = "live";

/// Связь с памятью ACC. В JSON — `unavailable`, `linked`, `lost`.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LinkState {
    #[default]
    Unavailable,
    /// На не-Windows память не открывается, поэтому ветка жива в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Linked,
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Lost,
}

/// Снимок для `acc-status`. Поля названы так же, как сессия на фронте.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub link: LinkState,
    pub presence: Presence,
    pub packet_id: Option<i32>,
    pub outing_id: Option<String>,
    pub session: Option<SessionBody>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub speed: Option<f32>,
    pub in_pit: bool,
    pub air_temp: Option<f32>,
    pub road_temp: Option<f32>,
    pub events: Vec<StatusEvent>,
}

/// Открытая сессия внутри статуса. `status` здесь всегда `live`.
#[derive(Debug, Serialize)]
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

/// Что машина выезда решила на этом тике.
#[derive(Debug, Serialize)]
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

/// Поля одного тика, из которых собирается статус.
pub(crate) struct Capture<'a> {
    pub link: LinkState,
    pub presence: Presence,
    pub packet_id: Option<i32>,
    pub outing_id: Option<OutingId>,
    pub session: Option<&'a Session>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub speed: Option<f32>,
    pub in_pit: bool,
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
            speed: input.speed,
            in_pit: input.in_pit,
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

/// Текстовый UUID для фронта. В домене идентификатор — шестнадцать байт.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{OutingId, SessionId};

    #[test]
    fn session_body_snapshot_is_live_and_names_the_type() {
        let body = SessionBody::from_session(&sample_session());
        let json = serde_json::to_value(&body).expect("сессия сериализуется");
        assert_eq!(json["type"], "practice");
        assert_eq!(json["status"], "live");
        assert_eq!(json["track"], "monza");
        assert_eq!(json["outingId"], id_text([0x22; 16]));
        assert_eq!(json["startedAt"], 1_700_000_000_000u64);
        assert!(json["endedAt"].is_null());
    }

    #[test]
    fn outing_events_use_the_kinds_the_page_parses() {
        let session = sample_session();
        let events = [
            OutingEvent::OutingOpened {
                outing_id: session.outing_id,
            },
            OutingEvent::SessionOpened {
                session: session.clone(),
            },
            OutingEvent::SessionChanged {
                previous_id: session.id,
                ended_at_ms: 50,
                session: session.clone(),
            },
            OutingEvent::OutingClosed {
                outing_id: session.outing_id,
                session_id: None,
                ended_at_ms: 80,
            },
        ];
        let status = Status::capture(Capture {
            link: LinkState::Linked,
            presence: Presence::OnTrack,
            packet_id: Some(7),
            outing_id: Some(session.outing_id),
            session: Some(&session),
            lap_number: Some(3),
            sector: Some(1),
            speed: Some(120.0),
            in_pit: false,
            air_temp: Some(session.air_c),
            road_temp: Some(session.road_c),
            events: &events,
        });
        let json = serde_json::to_value(&status).expect("статус сериализуется");
        let kinds: Vec<_> = json["events"]
            .as_array()
            .expect("события — массив")
            .iter()
            .map(|event| event["kind"].as_str().expect("kind — строка").to_owned())
            .collect();
        assert_eq!(
            kinds,
            [
                "outingOpened",
                "sessionOpened",
                "sessionChanged",
                "outingClosed"
            ]
        );

        let changed = &json["events"][2];
        assert_eq!(changed["previousId"], id_text(session.id.as_bytes()));
        assert_eq!(changed["endedAt"], 50);
        assert_eq!(changed["session"]["type"], "practice");
        assert_eq!(changed["session"]["status"], "live");

        let closed = &json["events"][3];
        assert!(closed["sessionId"].is_null());
        assert_eq!(closed["endedAt"], 80);
        assert_eq!(closed["outingId"], id_text(session.outing_id.as_bytes()));
    }

    fn sample_session() -> Session {
        Session {
            id: SessionId::from_bytes([0x11; 16]),
            outing_id: OutingId::from_bytes([0x22; 16]),
            started_at_ms: 1_700_000_000_000,
            ended_at_ms: None,
            online: false,
            track: "monza".to_owned(),
            car: "porsche_991ii_gt3_r".to_owned(),
            kind: SessionKind::Practice,
            car_count: 20,
            air_c: 21.5,
            road_c: 27.0,
        }
    }
}
