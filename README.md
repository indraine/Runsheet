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

Desktop session sheet for **Assetto Corsa Competizione**. Everything is automatic: open the app, drive, and Runsheet captures sessions, laps, sectors (S1–S3), fuel, and validity on its own — no “start recording” button.

> Product concept and session model: **[docs/CONCEPT.md](docs/CONCEPT.md)**

## Demo

<!--
  If the clip is uploaded through GitHub Issues or a Release, replace src
  with the CDN URL: https://github.com/user-attachments/assets/...
-->

<div align="center">
  <video src="docs/demo.mp4" autoplay loop muted playsinline width="100%"></video>
</div>

> 💡 Video not playing? Watch the [demo as a GIF](docs/demo.gif) or download the [MP4](docs/demo.mp4).

---

## Screenshots

### Track catalog

![Track catalog — Dark](docs/screenshots/01_tracks_dark.png)

### Live Card

Spa · lap table with S1/S2/S3, fuel, delta, and track minimap.

| Dark | Light |
|:----:|:-----:|
| ![Live Card — Dark](docs/screenshots/01_spa_livecard_dark.png) | ![Live Card — Light](docs/screenshots/01_spa_livecard_light.png) |

| Dracula | Nord |
|:-------:|:----:|
| ![Live Card — Dracula](docs/screenshots/02_spa_livecard_dracula.png) | ![Live Card — Nord](docs/screenshots/03_spa_livecard_nord.png) |

---

## Features (v1.0.0)

- [x] Automatic lap, sector (S1 / S2 / S3), fuel, and validity tracking
- [x] Catalog of 25 ACC tracks — filters Recent, Popular, A–Z; personal bests and attempt counts
- [x] Session journal grouped by day and type (Practice, Qualifying, Race / Solo, Online)
- [x] Live Card with weather (Air, Asphalt), tyre pressure (psi), and vector track map
- [x] 11 appearance themes (Dark, Light, Dracula, Nord, Monokai, Gruvbox, Mocha, Solarized, …)
- [x] Multilingual UI (EN / RU)

---

## Roadmap (v1.1.0+)

- [ ] 2D track geometry scene with asphalt boundaries
- [ ] Driving trajectories on the map
- [ ] Telemetry charts (Speed, Throttle, Brake, Gear)
- [ ] Export to MoTeC / CSV

---

## Installation / Development build

**Requirements**

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- **Windows** for live ACC Shared Memory (reader is unavailable on macOS/Linux)

```bash
# Install dependencies
bun install

# Frontend only (Vite, seed data in dev)
bun run dev

# Full desktop app
bun run tauri dev

# Release build
bun run tauri build
```

```bash
# Checks
bun run test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Tech Stack

| Layer | Stack |
|-------|--------|
| Shell | Tauri 2 |
| Backend | Rust, ACC Shared Memory (`acc_shared_memory_rs`) |
| Frontend | SolidJS, TypeScript, Vite 8 |
| UI | Tailwind CSS 4, Ark UI, Lucide |
| Map | PixiJS |
| Storage | IndexedDB (`idb`) |
| i18n | `@solid-primitives/i18n` (EN / RU) |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Keep handlers thin; put domain logic in services / domain modules.
3. Run `bun run test` and Rust tests before opening a PR.
4. Prefer small, focused pull requests with a short “why” in the description.

Architectural invariants and layout: [AGENTS.md](AGENTS.md) · product concept: [docs/CONCEPT.md](docs/CONCEPT.md).

---

## License

Copyright (C) 2026 indrane

Licensed under the [GNU General Public License v3.0 or later](LICENSE).
