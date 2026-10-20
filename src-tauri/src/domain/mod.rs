//! Чистые типы домена.
//!
//! Здесь нет shared memory, Tauri, `serde` и `uuid`.
//! Пайплайн эти типы ещё не читает: фаза 1 только задаёт контракт.

#![allow(dead_code, unused_imports)]

mod car;
mod frame;
mod ids;
mod outing;
mod tires;
mod units;

pub(crate) use car::{CarPlace, CarState, CarStep, SessionEvent};
pub(crate) use frame::{CleanSessionGraphic, CleanTelemetryFrame};
pub(crate) use ids::{LapId, OutingId, SessionId};
pub(crate) use outing::{Frame, GameStatus, OutingEvent, Session, SessionKind};
pub(crate) use tires::TireSet;
pub(crate) use units::{
    BrakePosition, Celsius, LapTime, Psi, Speed, ThrottlePosition, TrackProgress,
};
