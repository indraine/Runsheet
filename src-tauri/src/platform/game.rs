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

/// Связь с памятью и процесс вместе. Память открыта, но `Off` — это меню, не «игра выключена».
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn presence(memory_open: bool, in_session: bool, process_running: bool) -> Presence {
    if memory_open && in_session {
        return Presence::Session;
    }
    if memory_open || process_running {
        return Presence::Menu;
    }
    Presence::Off
}

/// Имя процесса ACC. На не-Windows процесса нет.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn process_running() -> bool {
    #[cfg(windows)]
    {
        return windows_process_running();
    }
    #[cfg(not(windows))]
    {
        false
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

/// Запускает найденный exe. Рабочий каталог — папка бинарника.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn launch() -> Result<(), String> {
    let exe = find_executable().ok_or_else(|| "ACC не найдена".to_owned())?;
    let directory = exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    Command::new(&exe)
        .current_dir(directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn windows_process_running() -> bool {
    let output = Command::new("tasklist")
        .args([
            "/FI",
            &format!("IMAGENAME eq {PROCESS_NAME}"),
            "/FO",
            "CSV",
            "/NH",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let Ok(output) = output else {
        return false;
    };
    String::from_utf8_lossy(&output.stdout)
        .to_ascii_lowercase()
        .contains(&PROCESS_NAME.to_ascii_lowercase())
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
        assert_eq!(presence(false, false, false), Presence::Off);
        assert_eq!(presence(false, false, true), Presence::Menu);
        assert_eq!(presence(true, false, true), Presence::Menu);
        assert_eq!(presence(true, true, true), Presence::Session);
    }

    #[test]
    fn vdf_path_keeps_spaces() {
        let text = r#""0" { "path" "D:\\Steam Library" }"#;
        let paths = vdf_paths(text);
        assert_eq!(paths, vec![PathBuf::from(r"D:\Steam Library")]);
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
