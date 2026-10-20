//! Размеры именованных сегментов ACC, байты.
//!
//! Те же числа, что `acc_shared_memory_rs` 0.8 передаёт в `SharedMemoryReader`
//! для `Local\acpmf_physics`, `Local\acpmf_graphics` и `Local\acpmf_static`.
//! Проба старта сверяет константы. На Windows она ещё смотрит длину `MapView`,
//! если сегмент уже есть. Сырые страницы отсюда не возвращаются.

/// `Local\acpmf_physics`.
pub(crate) const PHYSICS_SEGMENT_BYTES: usize = 800;

/// `Local\acpmf_graphics`.
pub(crate) const GRAPHICS_SEGMENT_BYTES: usize = 1_588;

/// `Local\acpmf_static`.
pub(crate) const STATICS_SEGMENT_BYTES: usize = 784;

/// Сегмента нет — нормальный старт без ACC. На не-Windows память не открывается.
///
/// `Err` — `MapView` короче закреплённого размера. Текст называет сегмент.
pub(crate) fn ensure_mapped_views() -> Result<(), String> {
    #[cfg(windows)]
    {
        return open_named_views();
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[cfg(windows)]
fn open_named_views() -> Result<(), String> {
    use acc_shared_memory_rs::ACCError;
    use acc_shared_memory_rs::core::SharedMemoryReader;

    let views = [
        (r"Local\acpmf_physics", PHYSICS_SEGMENT_BYTES),
        (r"Local\acpmf_graphics", GRAPHICS_SEGMENT_BYTES),
        (r"Local\acpmf_static", STATICS_SEGMENT_BYTES),
    ];
    for (name, expected) in views {
        match SharedMemoryReader::new(name, expected) {
            Ok(view) => {
                let mapped = view.size();
                if mapped < expected {
                    return Err(format!(
                        "MapView {name}: {mapped} байт, ожидалось {expected}"
                    ));
                }
            }
            Err(ACCError::SharedMemoryNotAvailable) => {}
            Err(ACCError::SharedMemoryMap(_)) => {
                return Err(format!("MapView {name} не покрывает {expected} байт"));
            }
            Err(_) => {}
        }
    }
    Ok(())
}
