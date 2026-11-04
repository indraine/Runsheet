//! Адаптер Assetto Corsa Competizione. Сырые страницы shared memory отсюда не выходят.

pub(crate) mod layout;
mod raw;
mod sanitize;

#[cfg_attr(not(windows), allow(unused_imports))]
pub(crate) use sanitize::decode;
