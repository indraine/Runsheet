//! Доставка во фронт: статус связи, пачка круга и тонкие команды.
//!
//! Как часто звать `emit` и слать пачку, решает `pipeline`. Здесь только конверт.
//! `acc-status` — маленький JSON. Пачка круга — сырые байты, не массив чисел.
//! Эти два канала в `IpcResponse` не оборачиваются.

mod commands;
mod laps;
mod response;
mod status;

pub(crate) use commands::{acc_install, launch_acc};
pub(crate) use laps::{Outbox, listen_laps};
pub(crate) use status::{Capture, LinkState, Status};
