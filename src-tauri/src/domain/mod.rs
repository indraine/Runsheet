//! Чистые типы домена.
//!
//! Здесь нет shared memory, Tauri, `serde` и `uuid`.
//! Идентификатор в шестнадцати байтах. Текстовый UUID собирает только IPC.

mod car;
mod frame;
mod ids;
mod outing;
mod tires;
mod units;

pub(crate) use car::{CarPlace, CarState, SessionEvent};
pub(crate) use frame::{CleanSessionGraphic, CleanTelemetryFrame};
pub(crate) use ids::{LapId, OutingId, SessionId};
pub(crate) use outing::{Frame, GameStatus, OutingEvent, Session, SessionKind};
pub(crate) use tires::TireSet;
pub(crate) use units::{
    BrakePosition, Celsius, LapTime, Psi, Speed, ThrottlePosition, TrackProgress,
};
