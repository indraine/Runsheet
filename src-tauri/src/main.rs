#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Точка входа процесса. Тело приложения живёт в библиотечном крейте.

fn main() {
    runsheet_lib::run();
}
