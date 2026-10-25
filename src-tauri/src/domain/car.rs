
use super::GameStatus;
use super::units::LapTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum SessionPlace {
    #[default]
    Menu,
    InPits,
    OnTrack,
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
    pub in_pit: bool,
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
        GameStatus::Live | GameStatus::Pause => {
            if place.setup_menu {
                return Some(CarState::InGarage);
            }
            if place.checkered && (place.in_pit || place.in_pit_lane) {
                return Some(CarState::SessionFinished);
            }
            if place.in_pit || place.in_pit_lane {
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
