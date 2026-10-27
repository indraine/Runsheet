<p align="center">
  <img src="docs/brand/logo.svg" alt="Runsheet" width="280" />
</p>

<p align="center">
  <strong>Motorsport Telemetry Analysis</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/version-1.1.0-2a6fc9" alt="Version 1.1.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL-3.0" /></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Windows" />
  <img src="https://img.shields.io/badge/Tauri_2-SolidJS-24C8DB" alt="Tauri 2 · SolidJS" />
</p>

<p align="center">
  <strong><a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="docs/CONCEPT.md">Concept</a> · <a href="docs/CONCEPT.ru.md">Концепция</a></strong>
</p>

<p align="center">
  <img src="docs/brand/runsheet-hero-banner.png" alt="Runsheet Motorsport Telemetry Analysis" width="100%">
</p>

**Runsheet** — легковесный local-first лист учёта заездов и инструмент пит-волла для симулятора **Assetto Corsa Competizione**. Построенный на базе Rust и Tauri 2, он работает с околонулевой нагрузкой на CPU и не снижает FPS в игре. Приложение автоматически фиксирует круги, сектора, расход топлива и зачётность из shared memory для последующего анализа и сравнения телеметрии.

## Возможности

- [x] **Запись сессий без настройки** — автоматическая фиксация кругов, времён секторов S1/S2/S3, расхода топлива и зачётности круга через shared memory ACC
- [x] **Live-карточка пит-волла** — температура трассы и воздуха, давление в шинах, живые дельты секторов и интерактивная векторная карта трассы
- [x] **Сравнение телеметрии двух кругов** — многоканальные графики скорости, газа, тормоза, угла руля и передачи с синхронизированной прокруткой по дистанции
- [x] **Автообнаружение расхождений** — алгоритм, выделяющий ключевые зоны торможения, газа и потери скорости между кругами
- [x] **2D-траектория и гоночная линия** — GPU-ускоренный вид полотна трассы на PixiJS с границами асфальта, зумом на апекс и режимом следования за машиной
- [x] **Интерактивный cockpit HUD** — педали и анимированный руль с мгновенными вводами пилота в позиции курсора
- [x] **Каталог трасс и сессий** — все 25 трасс ACC с личными рекордами, журналом заездов по дням, экспортом и импортом
- [x] **Легковесность и Local-first** — компактный размер (~15 МБ), минимальное потребление RAM (<60 МБ), нулевое влияние на FPS в игре, поддержка тем оформления и полная локализация

---

## Планы

### Ближайшее
- [ ] Экспорт сессии в форматы CSV / MoTeC
- [ ] Интерактивный обучающий тур по интерфейсу
- [ ] AI-тренер пилотажа — автоматический разбор телеметрии и рекомендации по пилотажу через OpenAI-совместимые API-ключи пользователя на основе зон расхождения

### Симуляторы
- [ ] Le Mans Ultimate — телеметрия из shared memory ([kerb](https://crates.io/crates/kerb)), автоматическая фиксация сессий, каталоги машин и трасс
- [ ] RaceRoom — телеметрия из shared memory (`$R3E` / r3e-api, [simetry](https://crates.io/crates/simetry)), автоматическая фиксация сессий, каталоги машин и трасс
- [ ] iRacing — телеметрия через SDK / shared memory ([pitwall](https://crates.io/crates/pitwall)), автоматическая фиксация сессий, каталоги машин и трасс

---

## Демо

https://github.com/user-attachments/assets/0669f286-4e5b-4b5b-856e-6f346069dacf

---

## Скриншоты

### Каталог трасс

![Каталог трасс — Dark](docs/screenshots/01_tracks_dark.png)

### Живая карточка

Спа · таблица кругов с S1/S2/S3, топливом, дельтой и мини-картой.

| Slate | Light |
|:----:|:-----:|
| ![Живая карточка — Dark](docs/screenshots/01_spa_livecard_dark.png) | ![Живая карточка — Light](docs/screenshots/01_spa_livecard_light.png) |

### Сравнение телеметрии

Монца · BMW M4 · наложение двух кругов — газ, тормоз, руль, скорость, гоночная линия и зоны расхождения.

| Dark | Light |
|:----:|:-----:|
| ![Телеметрия — Dark](docs/screenshots/telemetry-dark.png) | ![Телеметрия — Light](docs/screenshots/telemetry-light.png) |

---

## Установка и сборка

**Что нужно**

- [Bun](https://bun.sh/) — локальная установка и `dev` / `test`
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Предварительные требования Tauri 2](https://v2.tauri.app/start/prerequisites/)
- **Windows** для живого чтения общей памяти ACC (на macOS/Linux чтение недоступно)

> Релизный CI на Windows использует **npm** (Bun часто зависает на `windows-latest`). Повседневная разработка — на Bun.

```bash
# Зависимости
bun install

# Только интерфейс (Vite; в разработке — тестовые данные)
bun run dev

# Полное приложение
bun run tauri dev

# Релизная сборка
bun run tauri build
```

```bash
# Проверки
bun run test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```


---

## Участие

Приветствуются pull request’ы. Для крупных изменений сначала откройте issue и обсудите идею.

1. Сделайте fork репозитория и создайте ветку от `main`.
2. Внесите изменения и убедитесь, что проверки проходят:

```bash
bun run test
cargo test --manifest-path src-tauri/Cargo.toml
```

3. Откройте pull request с кратким описанием изменений.

---

## Лицензия

Copyright (C) 2026 indrane

Лицензия: [GNU General Public License v3.0 or later](LICENSE).
