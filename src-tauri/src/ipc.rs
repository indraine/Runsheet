//! Доставка во фронт: редкий статус связи и одна пачка круга.
//!
//! `acc-status` — маленький JSON, не чаще 20 Гц. Пачка круга — сырые байты
//! заголовка и плоскости f32 из сборщика, не массив чисел. Их забирает `Channel`:
//! страница получает `ArrayBuffer`. Пока круг открыт, промежуточная пачка
//! уходит примерно раз в секунду с тем же id.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::game::Presence;
use crate::session::{Event, Session, SessionKind};

/// Имя события Tauri со снимком связи и открытой сессии.
pub(crate) const ACC_STATUS: &str = "acc-status";

/// Нижняя граница между событиями `acc-status`. 20 Гц.
pub(crate) const STATUS_GAP_MS: u64 = 50;

/// Как часто растёт строка ещё не закрытого круга.
const LAP_GAP_MS: u64 = 1_000;

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
    pub outing_id: Option<Uuid>,
    pub session: Option<&'a Session>,
    pub lap_number: Option<i32>,
    pub sector: Option<i32>,
    pub speed: Option<f32>,
    pub air_temp: Option<f32>,
    pub road_temp: Option<f32>,
    pub events: &'a [Event],
}

impl Status {
    pub(crate) fn capture(input: Capture<'_>) -> Self {
        Self {
            link: input.link,
            presence: input.presence,
            packet_id: input.packet_id,
            outing_id: input.outing_id.map(|id| id.to_string()),
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
            id: session.id.to_string(),
            outing_id: session.outing_id.to_string(),
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
    fn from_event(event: &Event) -> Self {
        match event {
            Event::OutingOpened { outing_id } => Self::OutingOpened {
                outing_id: outing_id.to_string(),
            },
            Event::SessionOpened { session } => Self::SessionOpened {
                session: SessionBody::from_session(session),
            },
            Event::SessionChanged {
                previous_id,
                ended_at_ms,
                session,
            } => Self::SessionChanged {
                previous_id: previous_id.to_string(),
                ended_at: *ended_at_ms,
                session: SessionBody::from_session(session),
            },
            Event::OutingClosed {
                outing_id,
                session_id,
                ended_at_ms,
            } => Self::OutingClosed {
                outing_id: outing_id.to_string(),
                session_id: session_id.map(|id| id.to_string()),
                ended_at: *ended_at_ms,
            },
        }
    }
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

/// Что отправить на этом тике.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Decision {
    pub emit_status: bool,
    pub lap: LapSend,
}

/// Какую пачку круга отдать. `None` — на этом тике байтов нет.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LapSend {
    None,
    /// Открытый круг, тот же id, что будет на финише.
    Preview,
    /// Круг только что закрылся.
    Closed,
}

/// Решает частоту статуса и промежуточных пачек. Часы снаружи.
#[derive(Debug, Default)]
pub(crate) struct Relay {
    last_status_ms: Option<u64>,
    last_lap_ms: Option<u64>,
    seen_lap: Option<Uuid>,
}

impl Relay {
    /// `has_events` выпускает статус сразу: закрытие выезда нельзя проглотить паузой 20 Гц.
    /// Финиш круга тоже сразу. Первая пачка нового id — сразу, дальше не чаще раза в секунду.
    pub(crate) fn decide(
        &mut self,
        now_ms: u64,
        has_events: bool,
        lap_closed: bool,
        open_id: Option<Uuid>,
    ) -> Decision {
        Decision {
            emit_status: self.take_status(now_ms, has_events),
            lap: self.take_lap(now_ms, lap_closed, open_id),
        }
    }

    fn take_status(&mut self, now_ms: u64, force: bool) -> bool {
        let due = self
            .last_status_ms
            .is_none_or(|previous| now_ms.saturating_sub(previous) >= STATUS_GAP_MS);
        if !force && !due {
            return false;
        }
        self.last_status_ms = Some(now_ms);
        true
    }

    fn take_lap(&mut self, now_ms: u64, lap_closed: bool, open_id: Option<Uuid>) -> LapSend {
        if lap_closed {
            self.last_lap_ms = Some(now_ms);
            self.seen_lap = None;
            return LapSend::Closed;
        }
        let Some(open_id) = open_id else {
            self.seen_lap = None;
            return LapSend::None;
        };
        let fresh = self.seen_lap != Some(open_id);
        let due = self
            .last_lap_ms
            .is_none_or(|previous| now_ms.saturating_sub(previous) >= LAP_GAP_MS);
        if !fresh && !due {
            return LapSend::None;
        }
        self.last_lap_ms = Some(now_ms);
        self.seen_lap = Some(open_id);
        LapSend::Preview
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
