<p align="center">
  <img src="docs/brand/logo.svg" alt="Runsheet" width="420" />
</p>

<p align="center">
  <strong><a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="docs/CONCEPT.md">Concept</a> · <a href="docs/CONCEPT.ru.md">Концепция</a></strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/version-1.0.0-2a6fc9" alt="Version 1.0.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL-3.0" /></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Windows" />
  <img src="https://img.shields.io/badge/Tauri_2-SolidJS-24C8DB" alt="Tauri 2 · SolidJS" />
</p>

Десктопный лист сессии для **Assetto Corsa Competizione**. Всё автоматически: открыл приложение, поехал — Runsheet сам пишет сессии, круги, секторы (S1–S3), топливо и валидность. Кнопки «начать запись» нет.

> Продуктовая концепция и модель заезда: **[docs/CONCEPT.ru.md](docs/CONCEPT.ru.md)**

## Демонстрация работы

<!--
  Если ролик загружен через GitHub Issues или Release, замените ссылку
  на CDN-адрес: https://github.com/user-attachments/assets/...
-->

[![Демонстрация работы Runsheet](docs/demo.webp)](https://github.com/indraine/Runsheet/blob/main/docs/demo.mp4)

> 💡 [Смотреть MP4 на GitHub](https://github.com/indraine/Runsheet/blob/main/docs/demo.mp4)

---

## Скриншоты

### Каталог трасс

![Каталог трасс — Dark](docs/screenshots/01_tracks_dark.png)

### Live Card

Спа · таблица кругов с S1/S2/S3, топливом, дельтой и миникартой.

| Dark | Light |
|:----:|:-----:|
| ![Live Card — Dark](docs/screenshots/01_spa_livecard_dark.png) | ![Live Card — Light](docs/screenshots/01_spa_livecard_light.png) |

| Dracula | Nord |
|:-------:|:----:|
| ![Live Card — Dracula](docs/screenshots/02_spa_livecard_dracula.png) | ![Live Card — Nord](docs/screenshots/03_spa_livecard_nord.png) |

---

## Возможности (v1.0.0)

- [x] Автоматический трекинг кругов, секторов (S1, S2, S3), расхода топлива и валидности
- [x] Каталог 25 трасс Assetto Corsa Competizione (фильтры Recent, Popular, A–Z, рекорды PB, счётчик попыток)
- [x] Журнал сессий с группировкой по дням и типам (Practice, Qualifying, Race / Solo, Online)
- [x] Live Card с погодными условиями (Air, Asphalt), давлением в шинах (psi) и векторной картой трассы
- [x] 11 тем оформления (Dark, Light, Dracula, Nord, Monokai, Gruvbox, Mocha, Solarized и др.)
- [x] Мультиязычный интерфейс (EN / RU)

---

## Roadmap (v1.1.0+)

- [ ] 2D-сцена геометрии трассы с границами полотна
- [ ] Траектории на карте
- [ ] Графики телеметрии (Speed, Throttle, Brake, Gear)
- [ ] Экспорт в MoTeC / CSV

---

## Установка / Development build

**Требования**

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Предварительные требования Tauri 2](https://v2.tauri.app/start/prerequisites/)
- **Windows** для живой ACC Shared Memory (на macOS/Linux ридер недоступен)

```bash
# Зависимости
bun install

# Только фронтенд (Vite, в dev — seed-данные)
bun run dev

# Полное десктопное приложение
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

## Стек

| Слой | Стек |
|------|------|
| Оболочка | Tauri 2 |
| Бэкенд | Rust, ACC Shared Memory (`acc_shared_memory_rs`) |
| Фронтенд | SolidJS, TypeScript, Vite 8 |
| UI | Tailwind CSS 4, Ark UI, Lucide |
| Карта | PixiJS |
| Хранение | IndexedDB (`idb`) |
| i18n | `@solid-primitives/i18n` (EN / RU) |

---

## Contributing

1. Сделайте fork и ветку под задачу.
2. Держите обработчики тонкими; доменную логику — в сервисах / domain.
3. Перед PR прогоните `bun run test` и Rust-тесты.
4. Предпочтительны небольшие PR с коротким «зачем» в описании.

Инварианты и раскладка: [AGENTS.md](AGENTS.md) · концепция продукта: [docs/CONCEPT.ru.md](docs/CONCEPT.ru.md).

---

## License

Copyright (C) 2026 indrane

Лицензия: [GNU General Public License v3.0 or later](LICENSE).
