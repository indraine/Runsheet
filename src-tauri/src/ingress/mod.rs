//! Граница shared memory ACC.
//!
//! Сырые страницы отсюда не выходят. `reader` до фазы 4 ещё принимает `ACCMap`,
//! но только как аргумент `decode`.

#![cfg_attr(not(any(windows, test)), allow(dead_code))]

pub(crate) mod layout;
mod raw;
mod sanitize;

#[cfg_attr(not(windows), allow(unused_imports))]
pub(crate) use sanitize::{CleanTick, PageOutcome, decode};
// Reader печатает ошибку через Display и вариант пока не разбирает.
#[allow(unused_imports)]
pub(crate) use sanitize::BoundaryError;
