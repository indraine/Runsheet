//! Доставка во фронт: статус связи и одна пачка круга.
//!
//! Как часто звать `emit` и слать пачку, решает `pipeline`. Здесь только конверт.
//! `acc-status` — маленький JSON. Пачка круга — сырые байты заголовка и плоскости
//! f32, не массив чисел. Их забирает `Channel`: страница получает `ArrayBuffer`.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};

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

struct LapGate {
    channel: Option<Channel<InvokeResponseBody>>,
    /// Последняя пачка, если страница ещё не вызвала `listen_laps`.
    pending: Option<Vec<u8>>,
}

/// Куда поток чтения кладёт статус и пачки.
#[derive(Clone)]
pub(crate) struct Outbox {
    app: AppHandle,
    laps: Arc<Mutex<LapGate>>,
}

impl Outbox {
    pub(crate) fn new(app: AppHandle) -> Self {
        Self {
            app,
            laps: Arc::new(Mutex::new(LapGate {
                channel: None,
                pending: None,
            })),
        }
    }

    pub(crate) fn emit_status(&self, status: &Status) {
        let _ = self.app.emit(ACC_STATUS, status);
    }

    /// Кладёт пачку. Если канал уже есть, байты уходят сразу, иначе заменяют предыдущие.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub(crate) fn send_lap(&self, bytes: Vec<u8>) {
        self.laps.lock().expect("канал пачек круга").pending = Some(bytes);
        self.drain();
    }

    /// Отдаёт последнюю пачку, когда подписка появилась между тиками.
    pub(crate) fn drain(&self) {
        let ready = {
            let mut gate = self.laps.lock().expect("канал пачек круга");
            let channel = gate.channel.clone();
            let bytes = if channel.is_some() {
                gate.pending.take()
            } else {
                None
            };
            channel.zip(bytes)
        };
        let Some((channel, bytes)) = ready else {
            return;
        };
        // `Raw`, чтобы страница получила ArrayBuffer, а не JSON-массив чисел.
        if channel.send(InvokeResponseBody::Raw(bytes)).is_err() {
            self.laps.lock().expect("канал пачек круга").channel = None;
        }
    }

    fn listen(&self, channel: Channel<InvokeResponseBody>) {
        self.laps.lock().expect("канал пачек круга").channel = Some(channel);
        self.drain();
    }
}

/// Подписка на пачки круга. Аргумент `channel` — `Channel` с фронта.
#[tauri::command]
pub(crate) fn listen_laps(outbox: State<'_, Outbox>, channel: Channel<InvokeResponseBody>) {
    outbox.listen(channel);
}
