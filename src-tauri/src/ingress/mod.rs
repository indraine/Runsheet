//! Граница симов. Каждый сим живёт в своей папке и отдаёт наружу только `CleanTick`.

#![cfg_attr(not(any(windows, test)), allow(dead_code))]

pub(crate) mod acc;
pub(crate) mod lmu;
mod outcome;

pub(crate) use outcome::{BoundaryError, CleanTick, PageOutcome};
