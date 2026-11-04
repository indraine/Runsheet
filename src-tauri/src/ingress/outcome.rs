//! Общий результат границы: сырой кадр сима либо отбрасывается, либо становится `CleanTick`.

use std::fmt;

use crate::domain::{GraphicsFrame, PhysicsFrame, StaticsFrame};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BoundaryError {
    NonFinite { field: &'static str },
    UnknownDiscriminant { field: &'static str, value: i32 },
}

impl fmt::Display for BoundaryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NonFinite { field } => write!(formatter, "поле {field} не конечное"),
            Self::UnknownDiscriminant { field, value } => {
                write!(formatter, "поле {field} содержит неизвестный код {value}")
            }
        }
    }
}

impl std::error::Error for BoundaryError {}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PageOutcome {
    Stale,
    Fresh(CleanTick),
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CleanTick {
    pub physics: PhysicsFrame,
    pub graphic: GraphicsFrame,
    pub statics: StaticsFrame,
}
