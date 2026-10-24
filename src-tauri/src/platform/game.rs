//! Где лежит ACC.
//!
//! Состояние для листа — только по shared memory: заезд есть или его нет.
//! Процесс игры отдельно не смотрим.

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

/// `Menu` — заезда нет. `OnTrack` — игрок в сессии.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Presence {
    Menu,
    OnTrack,
}

/// Заезд виден по shared memory. Игру и меню по процессу не отличаем.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn presence(in_session: bool) -> Presence {
    if in_session {
        Presence::OnTrack
    } else {
        Presence::Menu
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
    fn session_is_on_track_and_everything_else_is_the_menu() {
        assert_eq!(presence(false), Presence::Menu);
        assert_eq!(presence(true), Presence::OnTrack);
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
