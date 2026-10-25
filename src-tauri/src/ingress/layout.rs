
pub(crate) const PHYSICS_SEGMENT_BYTES: usize = 800;

pub(crate) const GRAPHICS_SEGMENT_BYTES: usize = 1_588;

pub(crate) const STATICS_SEGMENT_BYTES: usize = 784;

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
