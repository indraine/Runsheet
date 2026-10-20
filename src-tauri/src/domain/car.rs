//! Где стоит машина.
//!
//! Состояние — один вариант перечисления. Флаги боксов и меню приходят
//! снимком на один шаг и внутри `CarState` не хранятся.

use super::GameStatus;
use super::units::LapTime;

/// Место машины в сессии. Варианты не пересекаются.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum CarState {
    #[default]
    InGarage,
    InPitLane,
    OnTrack,
    SessionFinished,
}

/// Событие круга или пит-стопа.
///
/// Круг и сектор порождает сборщик. Этот модуль сам выдаёт только вход и выход с пит-лейна.
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

/// Один уже разобранный снимок места. Это вход шага, не сохранённое состояние.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CarPlace {
    pub status: GameStatus,
    pub setup_menu: bool,
    pub in_pit: bool,
    pub in_pit_lane: bool,
    pub checkered: bool,
}

/// Куда машина перешла на этом снимке.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CarStep {
    pub state: CarState,
    /// Событие есть только при смене варианта и только для входа на пит-лейн или выхода с него.
    pub event: Option<SessionEvent>,
}

impl CarState {
    /// Следующее место по одному снимку.
    ///
    /// Повтор место не меняет и события не даёт. Клетчатый флаг на быстром круге
    /// оставляет машину на трассе. Клетчатый в боксах или на пит-лейне завершает сессию.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn place(
        status: GameStatus,
        setup_menu: bool,
        in_pit: bool,
        in_pit_lane: bool,
        checkered: bool,
    ) -> CarPlace {
        CarPlace {
            status,
            setup_menu,
            in_pit,
            in_pit_lane,
            checkered,
        }
    }

    #[test]
    fn place_follows_the_session_without_boolean_flags() {
        let cases = [
            (
                CarState::OnTrack,
                place(GameStatus::Off, false, false, false, false),
                CarState::InGarage,
            ),
            (
                CarState::OnTrack,
                place(GameStatus::Live, true, false, false, false),
                CarState::InGarage,
            ),
            (
                CarState::InGarage,
                place(GameStatus::Live, false, false, true, false),
                CarState::InPitLane,
            ),
            (
                CarState::InGarage,
                place(GameStatus::Pause, false, true, false, false),
                CarState::InPitLane,
            ),
            (
                CarState::InPitLane,
                place(GameStatus::Live, false, false, false, false),
                CarState::OnTrack,
            ),
            (
                CarState::OnTrack,
                place(GameStatus::Live, false, false, false, true),
                CarState::OnTrack,
            ),
            (
                CarState::OnTrack,
                place(GameStatus::Live, false, true, false, true),
                CarState::SessionFinished,
            ),
            (
                CarState::OnTrack,
                place(GameStatus::Pause, false, false, true, true),
                CarState::SessionFinished,
            ),
            (
                CarState::OnTrack,
                place(GameStatus::Replay, false, true, true, true),
                CarState::OnTrack,
            ),
            (
                CarState::InPitLane,
                place(GameStatus::Replay, true, false, false, true),
                CarState::InPitLane,
            ),
        ];

        for (from, seen, expect) in cases {
            assert_eq!(from.step(seen).state, expect);
        }
    }

    #[test]
    fn pit_event_appears_only_when_the_variant_changes() {
        let pit_lane = place(GameStatus::Live, false, false, true, false);
        let entered = CarState::OnTrack.step(pit_lane);
        assert_eq!(entered.state, CarState::InPitLane);
        assert_eq!(entered.event, Some(SessionEvent::PitEntry));

        let held = entered.state.step(pit_lane);
        assert_eq!(held.state, CarState::InPitLane);
        assert_eq!(held.event, None);

        let left = held
            .state
            .step(place(GameStatus::Live, false, false, false, false));
        assert_eq!(left.state, CarState::OnTrack);
        assert_eq!(left.event, Some(SessionEvent::PitExit));

        let garage = CarState::OnTrack.step(place(GameStatus::Off, false, false, false, false));
        assert_eq!(garage.state, CarState::InGarage);
        assert_eq!(garage.event, None);

        let replay = CarState::OnTrack.step(place(GameStatus::Replay, false, true, true, false));
        assert_eq!(replay.state, CarState::OnTrack);
        assert_eq!(replay.event, None);
    }
}
