<p align="center">
  <img src="docs/brand/logo.svg" alt="Runsheet" width="280" />
</p>

<p align="center">
  <strong>Motorsport Telemetry Analysis</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/version-1.0.0-2a6fc9" alt="Version 1.0.0" /></a>
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

**Runsheet** — лист учёта заездов для симулятора **Assetto Corsa Competizione**. Приложение читает телеметрию из общей памяти игры и ведёт хронологию выездов: круги, времена секторов, расход топлива и зачётность круга фиксируются автоматически, без отдельной команды начала записи. Закрытые сессии сохраняются в журнале и доступны для последующего разбора и сравнения телеметрии.

## Возможности

- [x] Автоматическая фиксация кругов, времён секторов, расхода топлива и зачётности круга
- [x] Каталог 25 трасс ACC с фильтрами с личными рекордами и числом попыток
- [x] Журнал заездов с группировкой по дням и типам сессии
- [x] Live-карточка заезда: температура воздуха и асфальта, давление в шинах, векторная карта трассы
- [x] Плоская сцена трассы с границами асфальтового полотна
- [x] Сравнение траекторий и гоночных линий на карте
- [x] Графики телеметрических каналов [скорость | газ | тормоз | передача | руль]
- [x] Сравнение телеметрии двух кругов: графики, наложение гоночных линий и визуализация органов управления; система автообнаружения расхождений
- [x] Импорт и экспорт журнала заездов
- [x] Выбор тем интерфейса на CSS custom properties
- [x] Локализация интерфейса с расширяемым набором языков

---

## Планы

### Ближайшее
- [ ] Экспорт сессии в форматы CSV / MoTeC
- [ ] Интерактивный обучающий тур по интерфейсу

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
