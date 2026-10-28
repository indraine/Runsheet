use crate::domain::{Frame, GameStatus, OutingEvent, OutingId, Session, SessionId, SessionKind};

pub(crate) const OUTING_GAP_MS: u64 = 500;

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Sight {
    Absent,
    Frame(Frame),
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Tick {
    pub mono_ms: u64,
    pub wall_ms: u64,
    pub sight: Sight,
}

#[derive(Debug)]
struct RowKey {
    kind: SessionKind,
    session_index: i32,
    track: String,
    car: String,
    online: bool,
    /// Wall clock of the live sight that opened this row after `Off` or a 500 ms gap.
    joined_at_ms: u64,
}

impl RowKey {
    fn matches(&self, frame: &Frame, joined_at_ms: u64) -> bool {
        self.kind == frame.kind
            && self.session_index == frame.session_index
            && self.track == frame.track
            && self.car == frame.car
            && self.online == frame.online
            && self.joined_at_ms == joined_at_ms
    }

    fn from(frame: &Frame, joined_at_ms: u64) -> Self {
        Self {
            kind: frame.kind,
            session_index: frame.session_index,
            track: frame.track.clone(),
            car: frame.car.clone(),
            online: frame.online,
            joined_at_ms,
        }
    }
}

#[derive(Debug)]
struct OpenSession {
    key: RowKey,
    session: Session,
}

#[derive(Debug, Default)]
pub(crate) struct OutingMachine {
    outing_id: Option<OutingId>,
    open: Option<OpenSession>,
    gap_from_ms: Option<u64>,
    joined_at_ms: Option<u64>,
}

impl OutingMachine {
    #[must_use]
    pub(crate) fn step(&mut self, tick: &Tick) -> Vec<OutingEvent> {
        react(self, tick)
    }

    pub(crate) fn outing_id(&self) -> Option<OutingId> {
        self.outing_id
    }

    pub(crate) fn session(&self) -> Option<&Session> {
        self.open.as_ref().map(|open| &open.session)
    }

    fn gap_reached(&self, mono_ms: u64) -> bool {
        let Some(started) = self.gap_from_ms else {
            return false;
        };
        mono_ms.saturating_sub(started) >= OUTING_GAP_MS
    }

    fn arm_gap(&mut self, mono_ms: u64) {
        if self.outing_id.is_some() && self.gap_from_ms.is_none() {
            self.gap_from_ms = Some(mono_ms);
        }
    }

    fn close(&mut self, wall_ms: u64) -> Option<OutingEvent> {
        let outing_id = self.outing_id.take()?;
        self.gap_from_ms = None;
        self.joined_at_ms = None;
        let session_id = self.open.take().map(|open| open.session.id);
        Some(OutingEvent::OutingClosed {
            outing_id,
            session_id,
            ended_at_ms: wall_ms,
        })
    }

    fn ensure_outing(&mut self, events: &mut Vec<OutingEvent>) -> OutingId {
        if let Some(id) = self.outing_id {
            return id;
        }
        let outing_id = OutingId::from_bytes(uuid::Uuid::new_v4().into_bytes());
        self.outing_id = Some(outing_id);
        events.push(OutingEvent::OutingOpened { outing_id });
        outing_id
    }

    fn sync_row(&mut self, wall_ms: u64, frame: &Frame) -> Vec<OutingEvent> {
        let mut events = Vec::new();
        let outing_id = self.ensure_outing(&mut events);
        let joined_at_ms = self.joined_at_ms.unwrap_or(wall_ms);
        self.joined_at_ms = Some(joined_at_ms);

        if let Some(open) = &mut self.open
            && open.key.matches(frame, joined_at_ms)
        {
            open.session.car_count = frame.car_count;
            open.session.air_c = frame.air_c;
            open.session.road_c = frame.road_c;
            open.session.car_id = frame.car_id;
            if open.session.driver != frame.driver {
                open.session.driver.clone_from(&frame.driver);
            }
            return events;
        }

        let session = Session::open(outing_id, wall_ms, frame);
        let event = match self.open.replace(OpenSession {
            key: RowKey::from(frame, joined_at_ms),
            session: session.clone(),
        }) {
            None => OutingEvent::SessionOpened { session },
            Some(previous) => OutingEvent::SessionChanged {
                previous_id: previous.session.id,
                ended_at_ms: wall_ms,
                session,
            },
        };
        events.push(event);
        events
    }
}

impl Session {
    fn open(outing_id: OutingId, wall_ms: u64, frame: &Frame) -> Self {
        Self {
            id: SessionId::from_bytes(uuid::Uuid::new_v4().into_bytes()),
            outing_id,
            started_at_ms: wall_ms,
            ended_at_ms: None,
            online: frame.online,
            track: frame.track.clone(),
            car: frame.car.clone(),
            driver: frame.driver.clone(),
            car_id: frame.car_id,
            kind: frame.kind,
            car_count: frame.car_count,
            air_c: frame.air_c,
            road_c: frame.road_c,
        }
    }
}

fn away(sight: &Sight) -> bool {
    match sight {
        Sight::Absent => true,
        Sight::Frame(frame) => frame.status == GameStatus::Off,
    }
}

fn react(machine: &mut OutingMachine, tick: &Tick) -> Vec<OutingEvent> {
    let mut events = Vec::new();
    // Still gone after the gap: archive the outing. A live frame after the
    // same gap is a new join and keeps the outing, closing only the row.
    if away(&tick.sight) && machine.gap_reached(tick.mono_ms) {
        events.extend(machine.close(tick.wall_ms));
    }

    match &tick.sight {
        Sight::Absent => machine.arm_gap(tick.mono_ms),
        Sight::Frame(frame) => match frame.status {
            GameStatus::Off => machine.arm_gap(tick.mono_ms),
            GameStatus::Replay => machine.gap_from_ms = None,
            GameStatus::Pause => {
                machine.gap_from_ms = None;
                events.extend(machine.sync_row(tick.wall_ms, frame));
            }
            GameStatus::Live => {
                let returning = machine.gap_from_ms.is_some();
                let split = machine.gap_reached(tick.mono_ms);
                machine.gap_from_ms = None;
                if machine.joined_at_ms.is_none() || (returning && split) {
                    machine.joined_at_ms = Some(tick.wall_ms);
                }
                events.extend(machine.sync_row(tick.wall_ms, frame));
            }
        },
    }

    events
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;

    fn frame(kind: SessionKind, status: GameStatus) -> Frame {
        Frame {
            status,
            kind,
            session_index: 1,
            track: "spa".into(),
            car: "bmw_m4_gt3".into(),
            driver: "Nick".into(),
            car_id: 3,
            online: true,
            car_count: 20,
            setup_menu: false,
            air_c: 20.0,
            road_c: 28.0,
        }
    }

    fn tick(mono_ms: u64, sight: Sight) -> Tick {
        Tick {
            mono_ms,
            wall_ms: 1_700_000_000_000 + mono_ms,
            sight,
        }
    }

    #[test]
    fn a_kind_change_closes_the_previous_session() {
        let mut machine = OutingMachine::default();
        let _ = machine.step(&tick(
            0,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Live)),
        ));
        let previous = machine.session().unwrap().id;

        let events = machine.step(&tick(
            50,
            Sight::Frame(frame(SessionKind::Race, GameStatus::Live)),
        ));

        let next = machine.session().unwrap();
        assert_ne!(previous, next.id);
        assert_eq!(next.driver, "Nick");
        assert_eq!(next.car_id, 3);
        assert!(events.iter().any(|event| matches!(
            event,
            OutingEvent::SessionChanged { previous_id, session, .. }
                if *previous_id == previous && session.id == next.id
        )));
    }

    #[test]
    fn a_short_drop_stays_on_the_same_session() {
        let mut machine = OutingMachine::default();
        machine.step(&tick(
            0,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Live)),
        ));
        let id = machine.session().unwrap().id;

        machine.step(&tick(
            100,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Off)),
        ));
        machine.step(&tick(
            200,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Live)),
        ));

        assert_eq!(machine.session().unwrap().id, id);
    }

    #[test]
    fn live_after_the_gap_is_a_new_session_and_the_previous_stays_closed() {
        let mut machine = OutingMachine::default();
        machine.step(&tick(
            0,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Live)),
        ));
        let previous = machine.session().unwrap().id;
        let outing = machine.outing_id().unwrap();

        machine.step(&tick(
            10,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Off)),
        ));
        let events = machine.step(&tick(
            10 + OUTING_GAP_MS,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Live)),
        ));

        let next = machine.session().unwrap();
        assert_ne!(previous, next.id);
        assert_eq!(machine.outing_id(), Some(outing));
        assert!(events.iter().any(|event| matches!(
            event,
            OutingEvent::SessionChanged { previous_id, ended_at_ms, session }
                if *previous_id == previous
                    && *ended_at_ms == 1_700_000_000_000 + 10 + OUTING_GAP_MS
                    && session.id == next.id
        )));
    }

    #[test]
    fn staying_off_past_the_gap_closes_the_outing() {
        let mut machine = OutingMachine::default();
        machine.step(&tick(
            0,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Live)),
        ));
        let previous = machine.session().unwrap().id;

        machine.step(&tick(
            10,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Off)),
        ));
        let events = machine.step(&tick(
            10 + OUTING_GAP_MS,
            Sight::Frame(frame(SessionKind::Qualifying, GameStatus::Off)),
        ));

        assert!(machine.session().is_none());
        assert!(events.iter().any(|event| matches!(
            event,
            OutingEvent::OutingClosed { session_id: Some(id), .. } if *id == previous
        )));
    }
}
