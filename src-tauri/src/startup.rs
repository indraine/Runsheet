//! Пробы до воркера телеметрии.
//!
//! Сессии и круги пишет фронт в IndexedDB. Здесь нет базы: каталог данных
//! только проверяется на запись, размеры shared memory сверяются с крейтом.

use std::fmt;
use std::fs;
use std::io;
use std::path::Path;

use crate::ingress::layout::{
    GRAPHICS_SEGMENT_BYTES, PHYSICS_SEGMENT_BYTES, STATICS_SEGMENT_BYTES,
};

const STORAGE_HINT: &str = "проверьте права на каталог данных приложения";
const LAYOUT_HINT: &str =
    "версия ACC не совпадает с acc_shared_memory_rs 0.8, обновите крейт или игру";

const PINNED_PHYSICS_BYTES: usize = 800;
const PINNED_GRAPHICS_BYTES: usize = 1_588;
const PINNED_STATICS_BYTES: usize = 784;

/// Почему старт остановился до воркера.
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

/// Проверки, без которых поток чтения не запускается.
pub struct StartupProbes;

impl StartupProbes {
    /// Создаёт каталог, пишет и удаляет `probe.tmp`.
    ///
    /// Файлов сессий, кругов и базы проба не оставляет.
    ///
    /// # Example
    /// ```
    /// use runsheet_lib::startup::StartupProbes;
    ///
    /// let dir = std::env::temp_dir().join("runsheet-startup-example");
    /// let _ = std::fs::remove_dir_all(&dir);
    /// StartupProbes::verify_storage_dir(&dir).expect("каталог доступен для записи");
    /// assert!(!dir.join("probe.tmp").exists());
    /// std::fs::remove_dir_all(&dir).expect("временный каталог удаляется");
    /// ```
    pub fn verify_storage_dir(dir: &Path) -> Result<(), ProbeFailure> {
        fs::create_dir_all(dir).map_err(|error| storage_failure(dir, &error))?;
        let probe = dir.join("probe.tmp");
        fs::write(&probe, b"ok").map_err(|error| storage_failure(dir, &error))?;
        fs::remove_file(&probe).map_err(|error| storage_failure(dir, &error))?;
        Ok(())
    }

    /// Сверяет 800 / 1588 / 784 с `ingress::layout`.
    ///
    /// На не-Windows сегменты `Local\acpmf_*` не открываются. На Windows короткий
    /// `MapView` уже существующего сегмента останавливает старт; отсутствие сегмента — нет.
    ///
    /// # Example
    /// ```
    /// use runsheet_lib::startup::StartupProbes;
    ///
    /// StartupProbes::verify_memory_layout().expect("размеры сегментов совпадают");
    /// ```
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

fn storage_failure(dir: &Path, error: &io::Error) -> ProbeFailure {
    ProbeFailure::new(
        format!("не удалось проверить каталог {}: {error}", dir.display()),
        STORAGE_HINT,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("runsheet-{name}-{nanos}"))
    }

    #[test]
    fn writable_dir_passes_and_a_file_in_its_place_fails() {
        let dir = scratch("writable");
        let _ = fs::remove_dir_all(&dir);
        StartupProbes::verify_storage_dir(&dir).expect("writable directory");
        assert!(
            !dir.join("probe.tmp").exists(),
            "probe file is removed after a successful check"
        );
        fs::remove_dir_all(&dir).expect("scratch dir");

        let blocked = scratch("not-a-dir");
        let _ = fs::remove_file(&blocked);
        fs::write(&blocked, b"not-a-directory").expect("placeholder file");
        let failure = StartupProbes::verify_storage_dir(&blocked)
            .expect_err("a file is not a writable directory");
        assert!(!failure.hint.is_empty());
        assert_eq!(failure.hint, STORAGE_HINT);
        assert!(failure.to_string().contains(STORAGE_HINT));
        fs::remove_file(&blocked).expect("placeholder file");
    }

    #[cfg(unix)]
    #[test]
    fn read_only_dir_fails_with_a_hint() {
        use std::os::unix::fs::PermissionsExt;

        let dir = scratch("read-only");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).expect("read-only");
        let failure = StartupProbes::verify_storage_dir(&dir);
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).expect("restore");
        let failure = failure.expect_err("read-only directory");
        assert!(!failure.hint.is_empty());
        assert_eq!(failure.hint, STORAGE_HINT);
        fs::remove_dir_all(&dir).expect("scratch dir");
    }

    #[test]
    fn memory_layout_is_green_without_opening_segments() {
        // На этой ОС (не Windows) `ensure_mapped_views` не вызывает `SharedMemoryReader`.
        StartupProbes::verify_memory_layout().expect("pinned sizes match");
    }
}
