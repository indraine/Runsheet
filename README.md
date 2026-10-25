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

Session sheet for **Assetto Corsa Competizione**. Open the app, drive — laps, sectors (S1–S3), fuel, and lap validity write themselves. There is no “start recording” button.

> Product idea and outing model: **[docs/CONCEPT.md](docs/CONCEPT.md)**

## Demo

<!--
  If the clip is uploaded through GitHub Issues or a Release, replace the link
  with the CDN URL: https://github.com/user-attachments/assets/...
-->

[![Runsheet demo](docs/demo.webp)](https://github.com/indraine/Runsheet/blob/main/docs/demo.mp4)

> 💡 [Watch the MP4 on GitHub](https://github.com/indraine/Runsheet/blob/main/docs/demo.mp4)

---

## Screenshots

### Track catalog

![Track catalog — Dark](docs/screenshots/01_tracks_dark.png)

### Live card

Spa · lap table with S1/S2/S3, fuel, delta, and mini-map.

| Dark | Light |
|:----:|:-----:|
| ![Live card — Dark](docs/screenshots/01_spa_livecard_dark.png) | ![Live card — Light](docs/screenshots/01_spa_livecard_light.png) |

| Dracula | Nord |
|:-------:|:----:|
| ![Live card — Dracula](docs/screenshots/02_spa_livecard_dracula.png) | ![Live card — Nord](docs/screenshots/03_spa_livecard_nord.png) |

---

## What it does today (v1.0.0)

- [x] Writes laps, sectors (S1 / S2 / S3), fuel use, and lap validity on its own
- [x] Catalog of 25 ACC tracks — Recent, Popular, A–Z filters; personal bests and attempt counts
- [x] Outing journal by day and type (practice, qualifying, race / solo, online)
- [x] Live card: air and asphalt, tyre pressure (psi), vector track map
- [x] 11 themes (Dark, Light, Dracula, Nord, Monokai, Gruvbox, Mocha, Solarized, …)
- [x] Two UI languages (EN / RU)

---

## Roadmap

### v1.1.0 — Analysis & trajectories
- [ ] Flat track scene with asphalt boundaries
- [ ] Trajectories and racing-line comparison on the map
- [ ] Charts (speed, throttle, brake, gear, steering)
- [ ] Session export to CSV / MoTeC

### v2.0.0 — iRacing
- [ ] Telemetry via iRacing SDK / shared memory
- [ ] Automatic session and outing capture for iRacing
- [ ] Car and track catalogs for iRacing

### v3.0.0 — Automobilista 2
- [ ] AMS2 shared-memory reader
- [ ] Session tracking and AMS2 telemetry mapped to shared types

---

## Install & build

**Needs**

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- **Windows** for live ACC shared-memory reading (unavailable on macOS/Linux)

```bash
# Dependencies
bun install

# UI only (Vite; sample data in dev)
bun run dev

# Full app
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

## Stack

| Layer | Built with |
|-------|------------|
| Shell | Tauri 2 |
| Backend | Rust; ACC shared-memory reader today (`acc_shared_memory_rs`) |
| Client | SolidJS, TypeScript, Vite 8 |
| UI | Tailwind CSS 4, Ark UI, Lucide |
| Map | PixiJS |
| Storage | IndexedDB (`idb`) |
| Languages | `@solid-primitives/i18n` (EN / RU) |

---

## Architecture

Sim data crosses one intake boundary: the raw shared-memory buffer never leaves `src-tauri/src/ingress/`; it is mapped once into domain types. Past that — the read pipeline, outing/lap services, and the UI — stay free of any one game.

v1.0.0 ships ACC only. The same boundary is how iRacing (v2.0.0) and Automobilista 2 (v3.0.0) plug in later, without changing session logic.

| Path | Role |
|------|------|
| `src-tauri/src/ingress/` | Per-game reader and one-shot boundary normalization |
| `src-tauri/src/domain/` | Pure types and car state machine (`CarState`), no external SDKs |
| `src-tauri/src/pipeline/` · `services/` | High-rate polling, outing and lap collection |
| `src-tauri/src/ipc/` + `src/` | Thin bridge and session-sheet UI |

Rules and layout: [AGENTS.md](AGENTS.md).

---

## Contributing

1. Fork the repo and open a branch for the change.
2. Keep handlers short; put outing logic in services and `domain`.
3. Run `bun run test` and the Rust tests before a PR.
4. Prefer small PRs with a short “why” in the description.

Rules and layout: [AGENTS.md](AGENTS.md) · product idea: [docs/CONCEPT.md](docs/CONCEPT.md).

---

## License

Copyright (C) 2026 indrane

Licensed under the [GNU General Public License v3.0 or later](LICENSE).
