# Runsheet

Desktop telemetry recording, lap analysis, and setup tracking for Assetto Corsa Competizione (ACC).

## Scope
- Governs: entire repo root
- `src-tauri/` — Rust backend: ACC Shared Memory reader, domain state machine, live telemetry.
- `src/` — SolidJS frontend: real-time dashboard, lap telemetry, setup sheets.

## Architecture & Layout

| Path | Role |
|------|------|
| `src-tauri/src/ingress/` | Isolation of ACC Shared Memory (`acc_shared_memory_rs`); normalize raw packets into `CleanTick`. |
| `src-tauri/src/domain/` | Pure telemetry types and car state machine (`CarState`). Zero external SDK dependencies. |
| `src-tauri/src/pipeline/` | Ring-buffer processing; outing, validity, and lap detection (`sequencer.rs`). |
| `src-tauri/src/services/` | Outing machine and lap collector. |
| `src-tauri/src/startup.rs` | Fail-fast probe: shared memory layout validation. |
| `src-tauri/src/ipc/` | IPC event bridge between Rust and SolidJS. |
| `src/` | Lightweight frontend: SolidJS + Tailwind CSS 4 + PixiJS. |

## Invariants & Boundaries (STRICT)

1. **Single Boundary Invariant:**
   - Raw ACC structs MUST NEVER leave `src-tauri/src/ingress/`.
   - All conversions happen at the boundary into `CleanTick` / domain types.
   - Domain and services assume data is already sanitized (NO `isNaN`, NO defensive bounds checks inside domain).
2. **State Machine Invariant:**
   - Session flow is modeled exclusively via `CarState` enum variants.
   - Do NOT use independent boolean flags (`is_pit`, `is_running`) for session state.
3. **UI Downsampling:**
   - Backend MUST NOT emit IPC events faster than 30 Hz.
   - High-frequency samples stay in the lap sent over IPC. They are not written to disk.
4. **Thin IPC:**
   - Tauri commands (`#[tauri::command]`) are strictly 1-2 line dispatchers calling `services/`.
   - Responses follow `{ status: "success", data }` or `{ status: "error", message, hint }`.

## Startup Fail-Fast Probes
- `StartupProbes::verify_memory_layout`: fails if shared memory buffer size < expected struct size.

## Tooling
- Local frontend: **Bun** (`bun.lockb`).
- Windows release CI: **npm** — Bun often hangs on `windows-latest` (see `.github/workflows/release.yml`).
- `tauri.conf.json`: `beforeDevCommand` → Bun; `beforeBuildCommand` → npm (for CI).

## Commands

```bash
# Frontend
bun install
bun run test
bun run fmt

# Backend (Tauri / Rust)
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml

# Full app
bun run tauri dev
bun run tauri build
```

