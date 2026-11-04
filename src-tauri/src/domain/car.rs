//! Положение машины.

use super::units::LapTime;
use super::{GameStatus, SessionKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum SessionPlace {
    #[default]
    Menu,
    Garage,
    InPits,
    PitLane,
    OnGrid,
    OnTrack,
    Pause,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum CarState {
    #[default]
    InGarage,
    InPitLane,
    OnTrack,
    SessionFinished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionEvent {
    LapStarted {
        lap_number: i32,
    },
    SectorCompleted {
        index: i32,
        time: LapTime,
    },
    LapCompleted {
        lap_number: i32,
        time: Option<LapTime>,
    },
    PitEntry,
    PitExit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CarPlace {
    pub status: GameStatus,
    pub setup_menu: bool,
    pub in_pit_box: bool,
    pub in_pit_lane: bool,
    pub checkered: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CarStep {
    pub state: CarState,
    pub event: Option<SessionEvent>,
}

impl CarState {
    #[must_use]
    pub(crate) const fn step(self, place: CarPlace) -> CarStep {
        let Some(next) = resolve(place) else {
            return CarStep {
                state: self,
                event: None,
            };
        };
        CarStep {
            state: next,
            event: pit_event(self, next),
        }
    }
}

const fn resolve(place: CarPlace) -> Option<CarState> {
    match place.status {
        GameStatus::Replay => None,
        GameStatus::Off => Some(CarState::InGarage),
        GameStatus::Pause => Some(CarState::InGarage),
        GameStatus::Live => {
            if place.setup_menu {
                return Some(CarState::InGarage);
            }
            if place.checkered && (place.in_pit_box || place.in_pit_lane) {
                return Some(CarState::SessionFinished);
            }
            if place.in_pit_box || place.in_pit_lane {
                return Some(CarState::InPitLane);
            }
            Some(CarState::OnTrack)
        }
    }
}

const fn pit_event(from: CarState, to: CarState) -> Option<SessionEvent> {
    match (from, to) {
        (CarState::OnTrack, CarState::InPitLane) => Some(SessionEvent::PitEntry),
        (CarState::InPitLane, CarState::OnTrack) => Some(SessionEvent::PitExit),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PlaceView {
    pub status: GameStatus,
    pub kind: SessionKind,
    pub setup_menu: bool,
    pub main_menu: bool,
    pub in_pit_box: bool,
    pub in_pit_lane: bool,
    pub completed_lap: i32,
    pub race_clock_started: bool,
    pub race_released: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) struct RacePhase {
    pub session: Option<(SessionKind, i32)>,
    pub clock_started: bool,
    pub clock_ms: Option<i32>,
    pub released: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RaceSample {
    pub status: GameStatus,
    pub kind: SessionKind,
    pub session_index: i32,
    pub completed_lap: i32,
    pub lap_ms: Option<i32>,
    pub green: bool,
    pub in_pits: bool,
}

const LAP_CLOCK_COUNTING_MS: i32 = 200;

pub(crate) fn session_place(car: CarState, view: Option<PlaceView>) -> SessionPlace {
    let Some(view) = view else {
        return SessionPlace::Menu;
    };
    match view.status {
        GameStatus::Pause => SessionPlace::Pause,
        GameStatus::Off => SessionPlace::Menu,
        GameStatus::Replay => parked(car),
        GameStatus::Live => live_place(view),
    }
}

fn parked(car: CarState) -> SessionPlace {
    match car {
        CarState::InPitLane => SessionPlace::InPits,
        CarState::OnTrack => SessionPlace::OnTrack,
        CarState::InGarage | CarState::SessionFinished => SessionPlace::Menu,
    }
}

fn live_place(view: PlaceView) -> SessionPlace {
    if view.main_menu {
        return SessionPlace::Menu;
    }
    if view.setup_menu {
        return SessionPlace::Garage;
    }
    if view.in_pit_box {
        return SessionPlace::InPits;
    }
    if view.in_pit_lane {
        return SessionPlace::PitLane;
    }
    if view.kind == SessionKind::Race
        && view.completed_lap == 0
        && !view.race_clock_started
        && !view.race_released
    {
        return SessionPlace::OnGrid;
    }
    SessionPlace::OnTrack
}

pub(crate) const fn lap_clock_counting(previous_ms: Option<i32>, current_ms: Option<i32>) -> bool {
    let Some(ms) = current_ms else {
        return false;
    };
    if ms >= LAP_CLOCK_COUNTING_MS {
        return true;
    }
    match previous_ms {
        Some(previous) => ms > previous && ms > 0,
        None => false,
    }
}

pub(crate) fn note_race_phase(phase: &mut RacePhase, sample: RaceSample) {
    if sample.status == GameStatus::Off {
        *phase = RacePhase::default();
        return;
    }
    let key = (sample.kind, sample.session_index);
    if phase.session != Some(key) {
        *phase = RacePhase {
            session: Some(key),
            ..RacePhase::default()
        };
    }
    if sample.status != GameStatus::Live || sample.kind != SessionKind::Race {
        return;
    }
    if sample.completed_lap > 0 || lap_clock_counting(phase.clock_ms, sample.lap_ms) {
        phase.clock_started = true;
    }
    phase.clock_ms = sample.lap_ms;
    if sample.green && sample.in_pits {
        phase.released = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(kind: SessionKind) -> PlaceView {
        PlaceView {
            status: GameStatus::Live,
            kind,
            setup_menu: false,
            main_menu: false,
            in_pit_box: false,
            in_pit_lane: false,
            completed_lap: 0,
            race_clock_started: false,
            race_released: false,
        }
    }

    #[test]
    fn place_follows_the_status_table() {
        assert_eq!(session_place(CarState::OnTrack, None), SessionPlace::Menu);

        let mut paused = view(SessionKind::Race);
        paused.status = GameStatus::Pause;
        paused.setup_menu = true;
        assert_eq!(
            session_place(CarState::OnTrack, Some(paused)),
            SessionPlace::Pause
        );

        let mut off = view(SessionKind::Practice);
        off.status = GameStatus::Off;
        off.setup_menu = true;
        off.in_pit_box = true;
        assert_eq!(
            session_place(CarState::InPitLane, Some(off)),
            SessionPlace::Menu
        );

        let mut menu = view(SessionKind::Practice);
        menu.main_menu = true;
        menu.setup_menu = true;
        assert_eq!(
            session_place(CarState::InGarage, Some(menu)),
            SessionPlace::Menu
        );

        let mut garage = view(SessionKind::Practice);
        garage.setup_menu = true;
        garage.in_pit_box = true;
        assert_eq!(
            session_place(CarState::InGarage, Some(garage)),
            SessionPlace::Garage
        );

        let mut pit_box = view(SessionKind::Practice);
        pit_box.in_pit_box = true;
        pit_box.in_pit_lane = true;
        assert_eq!(
            session_place(CarState::InPitLane, Some(pit_box)),
            SessionPlace::InPits
        );

        let mut lane = view(SessionKind::Race);
        lane.in_pit_lane = true;
        assert_eq!(
            session_place(CarState::InPitLane, Some(lane)),
            SessionPlace::PitLane
        );

        assert_eq!(
            session_place(CarState::OnTrack, Some(view(SessionKind::Race))),
            SessionPlace::OnGrid
        );

        let mut started = view(SessionKind::Race);
        started.race_clock_started = true;
        assert_eq!(
            session_place(CarState::OnTrack, Some(started)),
            SessionPlace::OnTrack
        );

        let mut missed = view(SessionKind::Race);
        missed.race_released = true;
        assert_eq!(
            session_place(CarState::OnTrack, Some(missed)),
            SessionPlace::OnTrack
        );

        assert_eq!(
            session_place(CarState::OnTrack, Some(view(SessionKind::Practice))),
            SessionPlace::OnTrack
        );

        let mut replay = view(SessionKind::Race);
        replay.status = GameStatus::Replay;
        assert_eq!(
            session_place(CarState::OnTrack, Some(replay)),
            SessionPlace::OnTrack
        );
        assert_eq!(
            session_place(CarState::InPitLane, Some(replay)),
            SessionPlace::InPits
        );
    }

    #[test]
    fn a_frozen_zero_is_not_a_running_lap() {
        assert!(!lap_clock_counting(None, None));
        assert!(!lap_clock_counting(None, Some(0)));
        assert!(!lap_clock_counting(Some(0), Some(0)));
        assert!(!lap_clock_counting(None, Some(15)));
        assert!(lap_clock_counting(Some(0), Some(32)));
        assert!(lap_clock_counting(None, Some(LAP_CLOCK_COUNTING_MS)));
    }

    #[test]
    fn green_in_the_pits_releases_the_grid() {
        let mut phase = RacePhase::default();
        let mut sample = RaceSample {
            status: GameStatus::Live,
            kind: SessionKind::Race,
            session_index: 2,
            completed_lap: 0,
            lap_ms: None,
            green: true,
            in_pits: true,
        };
        note_race_phase(&mut phase, sample);
        assert!(phase.released);
        assert!(!phase.clock_started);

        sample.in_pits = false;
        sample.green = false;
        sample.lap_ms = Some(0);
        note_race_phase(&mut phase, sample);
        assert!(phase.released);
        assert!(!phase.clock_started);

        sample.lap_ms = Some(40);
        note_race_phase(&mut phase, sample);
        assert!(phase.clock_started);
    }

    #[test]
    fn green_on_the_formation_lap_does_not_release_the_grid() {
        let mut phase = RacePhase::default();
        note_race_phase(
            &mut phase,
            RaceSample {
                status: GameStatus::Live,
                kind: SessionKind::Race,
                session_index: 2,
                completed_lap: 0,
                lap_ms: None,
                green: true,
                in_pits: false,
            },
        );
        assert!(!phase.released);
        assert!(!phase.clock_started);
    }

    #[test]
    fn leaving_the_race_clears_the_grid_memory() {
        let mut phase = RacePhase {
            session: Some((SessionKind::Race, 2)),
            clock_started: true,
            clock_ms: Some(1_000),
            released: true,
        };
        note_race_phase(
            &mut phase,
            RaceSample {
                status: GameStatus::Off,
                kind: SessionKind::Race,
                session_index: 2,
                completed_lap: 3,
                lap_ms: None,
                green: false,
                in_pits: false,
            },
        );
        assert_eq!(phase, RacePhase::default());
    }
}
