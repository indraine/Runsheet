#![cfg_attr(not(any(windows, test)), allow(dead_code))]

pub(crate) mod layout;
mod raw;
mod sanitize;

#[allow(unused_imports)]
pub(crate) use sanitize::BoundaryError;
#[cfg_attr(not(windows), allow(unused_imports))]
pub(crate) use sanitize::{CleanTick, PageOutcome, decode};
