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

**Runsheet** is a session sheet for the **Assetto Corsa Competizione** simulator. The app reads telemetry from the game’s shared memory and keeps a chronological outing log: laps, sector times, fuel use, and lap validity are recorded automatically, with no separate start-recording command. Closed sessions stay in the journal for later review and telemetry comparison.

> Product idea and outing model: **[docs/CONCEPT.md](docs/CONCEPT.md)**

## Demo

https://github.com/user-attachments/assets/0669f286-4e5b-4b5b-856e-6f346069dacf

---

## Screenshots

### Track catalog

![Track catalog — Dark](docs/screenshots/01_tracks_dark.png)

### Live card

Spa · lap table with S1/S2/S3, fuel, delta, and mini-map.

| Slate | Light |
|:----:|:-----:|
| ![Live card — Dark](docs/screenshots/01_spa_livecard_dark.png) | ![Live card — Light](docs/screenshots/01_spa_livecard_light.png) |

### Telemetry comparison

Monza · BMW M4 · two-lap overlay — throttle, brake, steer, speed, racing line, and divergence zones.

| Dark | Light |
|:----:|:-----:|
| ![Telemetry — Dark](docs/screenshots/telemetry-dark.png) | ![Telemetry — Light](docs/screenshots/telemetry-light.png) |

---

## Features (v1.0.0)

- [x] Automatic capture of laps, sector times, fuel use, and lap validity
- [x] Catalog of 25 ACC tracks with filters, personal bests, and attempt counts
- [x] Outing journal grouped by day and session type
- [x] Live outing card: air and asphalt temperature, tyre pressure, vector track map
- [x] Two-lap telemetry comparison: charts, racing-line overlay, and cockpit controls; automatic divergence detection
- [x] Import and export of the outing journal
- [x] UI theming via CSS custom properties
- [x] UI localization with an extensible language set

---

## Roadmap

### v1.1.0 — Analysis & trajectories
- [x] Flat track scene with asphalt-surface boundaries
- [x] Trajectory and racing-line comparison on the map
- [x] Telemetry channel charts [speed | throttle | brake | gear | steer]
- [ ] Session export to CSV / MoTeC
- [ ] Interactive UI onboarding tour

### v2.0.0 — Le Mans Ultimate ([kerb](https://crates.io/crates/kerb))
- [ ] LMU telemetry via shared memory
- [ ] Automatic session and outing capture for LMU
- [ ] LMU car and track catalogs

### v3.0.0 — RaceRoom ([simetry](https://crates.io/crates/simetry))
- [ ] RaceRoom telemetry via shared memory (`$R3E` / r3e-api)
- [ ] Automatic session and outing capture for RaceRoom
- [ ] RaceRoom car and track catalogs

### v4.0.0 — iRacing ([pitwall](https://crates.io/crates/pitwall))
- [ ] iRacing telemetry via SDK / shared memory
- [ ] Automatic session and outing capture for iRacing
- [ ] iRacing car and track catalogs

---

## Install & build

**Needs**

- [Bun](https://bun.sh/) — local install and `dev` / `test`
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- **Windows** for live ACC shared-memory reading (unavailable on macOS/Linux)

> Release CI on Windows uses **npm** (Bun often hangs on `windows-latest`). Day-to-day development stays on Bun.

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

v1.0.0 ships ACC only. The same boundary is how Le Mans Ultimate (v2.0.0), RaceRoom (v3.0.0), and iRacing (v4.0.0) plug in later, without changing session logic.

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
