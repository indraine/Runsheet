//! Размеры именованных сегментов ACC, байты.
//!
//! Те же числа, что `acc_shared_memory_rs` 0.8 передаёт в `SharedMemoryReader`
//! для `Local\acpmf_physics`, `Local\acpmf_graphics` и `Local\acpmf_static`.
//! Проба старта сверяет их, не открывая память.

#![allow(dead_code)]

/// `Local\acpmf_physics`.
pub(crate) const PHYSICS_SEGMENT_BYTES: usize = 800;

/// `Local\acpmf_graphics`.
pub(crate) const GRAPHICS_SEGMENT_BYTES: usize = 1_588;

/// `Local\acpmf_static`.
pub(crate) const STATICS_SEGMENT_BYTES: usize = 784;
