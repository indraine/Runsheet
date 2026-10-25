use std::fmt;

use crate::ingress::layout::{
    GRAPHICS_SEGMENT_BYTES, PHYSICS_SEGMENT_BYTES, STATICS_SEGMENT_BYTES,
};

const LAYOUT_HINT: &str =
    "версия ACC не совпадает с acc_shared_memory_rs 0.8, обновите крейт или игру";

const PINNED_PHYSICS_BYTES: usize = 800;
const PINNED_GRAPHICS_BYTES: usize = 1_588;
const PINNED_STATICS_BYTES: usize = 784;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeFailure {
    pub message: String,
    pub hint: String,
}

impl ProbeFailure {
    pub(crate) fn new(message: impl Into<String>, hint: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            hint: hint.into(),
        }
    }
}

impl fmt::Display for ProbeFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}\n{}", self.message, self.hint)
    }
}

impl std::error::Error for ProbeFailure {}

pub struct StartupProbes;

impl StartupProbes {
    pub fn verify_memory_layout() -> Result<(), ProbeFailure> {
        pinned("physics", PHYSICS_SEGMENT_BYTES, PINNED_PHYSICS_BYTES)?;
        pinned("graphics", GRAPHICS_SEGMENT_BYTES, PINNED_GRAPHICS_BYTES)?;
        pinned("statics", STATICS_SEGMENT_BYTES, PINNED_STATICS_BYTES)?;
        crate::ingress::layout::ensure_mapped_views()
            .map_err(|message| ProbeFailure::new(message, LAYOUT_HINT))
    }
}

fn pinned(name: &str, actual: usize, expected: usize) -> Result<(), ProbeFailure> {
    if actual == expected {
        return Ok(());
    }
    Err(ProbeFailure::new(
        format!(
            "сегмент {name}: в layout {actual} байт, у acc_shared_memory_rs 0.8 ожидается {expected}"
        ),
        LAYOUT_HINT,
    ))
}
