#![cfg_attr(not(any(windows, test)), allow(dead_code))]

pub(crate) mod layout;
mod raw;
mod sanitize;

#[cfg_attr(not(windows), allow(unused_imports))]
pub(crate) use sanitize::{CleanTick, PageOutcome, decode};
#[allow(unused_imports)]
pub(crate) use sanitize::BoundaryError;
