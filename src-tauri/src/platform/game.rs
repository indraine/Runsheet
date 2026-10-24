//! Где лежит ACC и запущена ли она.
//!
//! Shared memory появляется в заезде. В главном меню процесс уже есть,
//! а памяти ещё нет — по одному только открытию памяти это не отличить.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
const PROCESS_NAME: &str = "AC2-Win64-Shipping.exe";

#[cfg(windows)]
const GAME_DIR: &str = "Assetto Corsa Competizione";

/// `Off` — процесса нет. `Menu` — игра открыта, заезда нет. `Session` — игрок в сессии.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Presence {
    Off,
    Menu,
    Session,
}

/// Что пробник увидел у процесса ACC. `Unknown` — ещё не видели запущенным.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(u8)]
pub(crate) enum ProcessSight {
    #[default]
    Unknown = 0,
    Running = 1,
    Exited = 2,
}

impl ProcessSight {
    /// `false` после `Running` — это выход, а не «ещё не смотрели».
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    pub(crate) fn note_poll(self, running: bool) -> Self {
        if running {
            Self::Running
        } else if self == Self::Running || self == Self::Exited {
            Self::Exited
        } else {
            Self::Unknown
        }
    }
}

/// Меню — только когда процесс точно жив. Мёртвый процесс гасит и залипшую память.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn presence(memory_open: bool, in_session: bool, process: ProcessSight) -> Presence {
    match process {
        ProcessSight::Exited => Presence::Off,
        ProcessSight::Running => {
            if memory_open && in_session {
                Presence::Session
            } else {
                Presence::Menu
            }
        }
        ProcessSight::Unknown => {
            if memory_open && in_session {
                Presence::Session
            } else {
                Presence::Off
            }
        }
    }
}

/// `Some` — пробник ответил. `None` — снимок процессов не открылся, прошлое значение живёт.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn poll_process() -> Option<bool> {
    #[cfg(windows)]
    {
        return windows_poll_process();
    }
    #[cfg(not(windows))]
    {
        Some(false)
    }
}

/// Каталог установки, если он нашёлся в обычных местах Steam.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn find_executable() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        return find_on_windows();
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Почему запуск не удался. `hint` говорит, куда смотреть.
#[derive(Debug)]
pub(crate) struct LaunchError {
    pub message: String,
    pub hint: String,
}

/// Где ищем exe. На не-Windows файла нет, места поиска те же.
const STEAM_SEARCH_HINT: &str = "\
Искали AC2-Win64-Shipping.exe в библиотеках Steam: реестр HKCU\\Software\\Valve\\Steam, \
libraryfolders.vdf, C:\\Program Files (x86)\\Steam и C:\\Program Files\\Steam.";

const SPAWN_HINT: &str = "Файл установки найден, но процесс не стартовал.";

impl LaunchError {
    fn missing() -> Self {
        Self {
            message: "ACC не найдена".to_owned(),
            hint: STEAM_SEARCH_HINT.to_owned(),
        }
    }

    fn spawn(error: std::io::Error) -> Self {
        Self {
            message: error.to_string(),
            hint: SPAWN_HINT.to_owned(),
        }
    }
}

/// Запускает найденный exe. Рабочий каталог — папка бинарника.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn launch() -> Result<(), LaunchError> {
    let exe = find_executable().ok_or_else(LaunchError::missing)?;
    let directory = exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    Command::new(&exe)
        .current_dir(directory)
        .spawn()
        .map(|_| ())
        .map_err(LaunchError::spawn)
}

#[cfg(windows)]
fn windows_poll_process() -> Option<bool> {
    use std::ffi::c_void;

    const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
    const MAX_PATH: usize = 260;

    #[repr(C)]
    struct ProcessEntry32W {
        size: u32,
        cnt_usage: u32,
        process_id: u32,
        default_heap_id: usize,
        module_id: u32,
        cnt_threads: u32,
        parent_process_id: u32,
        pri_class_base: i32,
        flags: u32,
        exe_file: [u16; MAX_PATH],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> *mut c_void;
        fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot.is_null() || snapshot == usize::MAX as *mut c_void {
            return None;
        }
        let mut entry = ProcessEntry32W {
            size: std::mem::size_of::<ProcessEntry32W>() as u32,
            cnt_usage: 0,
            process_id: 0,
            default_heap_id: 0,
            module_id: 0,
            cnt_threads: 0,
            parent_process_id: 0,
            pri_class_base: 0,
            flags: 0,
            exe_file: [0; MAX_PATH],
        };
        if Process32FirstW(snapshot, &mut entry) == 0 {
            CloseHandle(snapshot);
            return None;
        }
        let mut found = exe_matches(&entry.exe_file, PROCESS_NAME);
        while !found && Process32NextW(snapshot, &mut entry) != 0 {
            found = exe_matches(&entry.exe_file, PROCESS_NAME);
        }
        CloseHandle(snapshot);
        Some(found)
    }
}

/// Имя из `PROCESSENTRY32W`: UTF-16 до нуля, без регистра.
#[cfg_attr(not(any(windows, test)), allow(dead_code))]
fn exe_matches(file: &[u16], expected: &str) -> bool {
    let end = file
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(file.len());
    let name = String::from_utf16_lossy(&file[..end]);
    name.eq_ignore_ascii_case(expected)
}

#[cfg(windows)]
fn find_on_windows() -> Option<PathBuf> {
    let relative = Path::new("steamapps")
        .join("common")
        .join(GAME_DIR)
        .join("AC2")
        .join("Binaries")
        .join("Win64")
        .join(PROCESS_NAME);
    steam_roots().into_iter().find_map(|root| {
        let exe = root.join(&relative);
        exe.is_file().then_some(exe)
    })
}

#[cfg(windows)]
fn steam_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(steam) = steam_install() {
        push_root(&mut roots, steam.clone());
        for folder in ["steamapps", "config"] {
            let vdf = steam.join(folder).join("libraryfolders.vdf");
            let Ok(text) = std::fs::read_to_string(vdf) else {
                continue;
            };
            for path in vdf_paths(&text) {
                push_root(&mut roots, path);
            }
        }
    }
    push_root(&mut roots, PathBuf::from(r"C:\Program Files (x86)\Steam"));
    push_root(&mut roots, PathBuf::from(r"C:\Program Files\Steam"));
    roots
}

#[cfg(windows)]
fn push_root(roots: &mut Vec<PathBuf>, path: PathBuf) {
    if path.as_os_str().is_empty() || roots.iter().any(|have| have == &path) {
        return;
    }
    roots.push(path);
}

#[cfg(windows)]
fn steam_install() -> Option<PathBuf> {
    let output = Command::new("reg")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let value = reg_sz(&text, "SteamPath")?;
    let path = PathBuf::from(value);
    path.is_dir().then_some(path)
}

/// Значение `REG_SZ` на строке `name`. Путь с пробелами не режется.
#[cfg_attr(not(windows), allow(dead_code))]
fn reg_sz<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let line = text.lines().find(|line| line.contains(name))?;
    let value = line.split("REG_SZ").nth(1)?.trim();
    (!value.is_empty()).then_some(value)
}

/// Пути библиотек из `libraryfolders.vdf`. Ключ `"path"`, кавычки и `\\` снимаются.
#[cfg_attr(not(windows), allow(dead_code))]
fn vdf_paths(text: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut rest = text;
    while let Some(at) = rest.find("\"path\"") {
        rest = &rest[at + 6..];
        let Some(open) = rest.find('"') else {
            break;
        };
        rest = &rest[open + 1..];
        let mut value = String::new();
        let mut chars = rest.chars();
        let mut consumed = 0;
        while let Some(ch) = chars.next() {
            consumed += ch.len_utf8();
            if ch == '\\' {
                if let Some(next) = chars.next() {
                    consumed += next.len_utf8();
                    value.push(next);
                }
                continue;
            }
            if ch == '"' {
                break;
            }
            value.push(ch);
        }
        rest = rest.get(consumed..).unwrap_or("");
        if !value.is_empty() {
            paths.push(PathBuf::from(value));
        }
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_is_not_the_same_as_the_game_being_off() {
        assert_eq!(presence(false, false, ProcessSight::Unknown), Presence::Off);
        assert_eq!(
            presence(false, false, ProcessSight::Running),
            Presence::Menu
        );
        assert_eq!(presence(true, false, ProcessSight::Running), Presence::Menu);
        assert_eq!(
            presence(true, true, ProcessSight::Running),
            Presence::Session
        );
        assert_eq!(presence(true, true, ProcessSight::Exited), Presence::Off);
        assert_eq!(presence(true, false, ProcessSight::Unknown), Presence::Off);
        assert_eq!(
            presence(true, true, ProcessSight::Unknown),
            Presence::Session
        );
    }

    #[test]
    fn a_failed_poll_does_not_count_as_the_game_closing() {
        assert_eq!(
            ProcessSight::Unknown.note_poll(false),
            ProcessSight::Unknown
        );
        assert_eq!(ProcessSight::Unknown.note_poll(true), ProcessSight::Running);
        assert_eq!(ProcessSight::Running.note_poll(false), ProcessSight::Exited);
        assert_eq!(ProcessSight::Exited.note_poll(true), ProcessSight::Running);
    }

    #[test]
    fn exe_match_ignores_case_and_stops_at_nul() {
        let mut file = [0u16; 8];
        for (index, unit) in "Ac2.exe".encode_utf16().enumerate() {
            file[index] = unit;
        }
        assert!(exe_matches(&file, "ac2.exe"));
        assert!(!exe_matches(&file, "ac2.exe.old"));
    }

    #[test]
    fn vdf_path_keeps_spaces() {
        let text = r#""0" { "path" "D:\\Steam Library" }"#;
        let paths = vdf_paths(text);
        assert_eq!(paths, vec![PathBuf::from(r"D:\Steam Library")]);
    }

    #[test]
    fn missing_install_names_the_steam_places() {
        let error = LaunchError::missing();
        assert_eq!(error.message, "ACC не найдена");
        assert!(error.hint.contains("Steam"));
        assert!(error.hint.contains("libraryfolders.vdf"));
    }

    #[test]
    fn reg_sz_keeps_the_whole_path() {
        let text = "    SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam\r\n";
        assert_eq!(
            reg_sz(text, "SteamPath"),
            Some(r"C:\Program Files (x86)\Steam")
        );
    }
}
