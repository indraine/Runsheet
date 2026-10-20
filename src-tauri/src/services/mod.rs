//! Доменные службы поверх уже чистого кадра.
//!
//! Машина выезда и сборщик круга не читают shared memory и не пишут на диск.

pub(crate) mod analyzer;
pub(crate) mod laps;
pub(crate) mod outing;
