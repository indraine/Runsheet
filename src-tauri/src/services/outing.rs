
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
}

impl RowKey {
    fn matches(&self, frame: &Frame) -> bool {
        self.kind == frame.kind
            && self.session_index == frame.session_index
            && self.track == frame.track
            && self.car == frame.car
            && self.online == frame.online
    }

    fn from(frame: &Frame) -> Self {
        Self {
            kind: frame.kind,
            session_index: frame.session_index,
            track: frame.track.clone(),
            car: frame.car.clone(),
            online: frame.online,
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

        if let Some(open) = &mut self.open
            && open.key.matches(frame)
        {
            open.session.car_count = frame.car_count;
            open.session.air_c = frame.air_c;
            open.session.road_c = frame.road_c;
            return events;
        }

        let session = Session::open(outing_id, wall_ms, frame);
        let event = match self.open.replace(OpenSession {
            key: RowKey::from(frame),
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
            kind: frame.kind,
            car_count: frame.car_count,
            air_c: frame.air_c,
            road_c: frame.road_c,
        }
    }
}

fn react(machine: &mut OutingMachine, tick: &Tick) -> Vec<OutingEvent> {
    let mut events = Vec::new();
    if machine.gap_reached(tick.mono_ms) {
        events.extend(machine.close(tick.wall_ms));
    }

    match &tick.sight {
        Sight::Absent => machine.arm_gap(tick.mono_ms),
        Sight::Frame(frame) => match frame.status {
            GameStatus::Off => machine.arm_gap(tick.mono_ms),
            GameStatus::Replay => machine.gap_from_ms = None,
            GameStatus::Live | GameStatus::Pause => {
                machine.gap_from_ms = None;
                events.extend(machine.sync_row(tick.wall_ms, frame));
            }
        },
    }

    events
}

#[cfg(test)]
mod tests {
    use super::*;

    fn live(track: &str) -> Frame {
        Frame {
            status: GameStatus::Live,
            kind: SessionKind::Practice,
            session_index: 0,
            track: track.to_owned(),
            car: "ferrari_296_gt3".to_owned(),
            online: false,
            car_count: 20,
            setup_menu: false,
            air_c: 21.0,
            road_c: 28.0,
        }
    }

    fn with_status(status: GameStatus) -> Frame {
        Frame {
            status,
            ..live("monza")
        }
    }

    fn at(mono_ms: u64, sight: Sight) -> Tick {
        Tick {
            mono_ms,
            wall_ms: 1_000 + mono_ms,
            sight,
        }
    }

    fn closed(events: &[OutingEvent]) -> bool {
        events
            .iter()
            .any(|event| matches!(event, OutingEvent::OutingClosed { .. }))
    }

    #[test]
    fn gap_of_500_ms_closes_and_499_does_not() {
        let mut machine = OutingMachine::default();
        let opened = machine.step(&at(0, Sight::Frame(live("monza"))));
        assert!(
            opened
                .iter()
                .any(|event| matches!(event, OutingEvent::OutingOpened { .. }))
        );
        assert!(machine.outing_id().is_some());

        let armed = machine.step(&at(0, Sight::Frame(with_status(GameStatus::Off))));
        assert!(!closed(&armed));

        let held = machine.step(&at(499, Sight::Absent));
        assert!(!closed(&held));
        assert!(machine.outing_id().is_some());

        let done = machine.step(&at(500, Sight::Absent));
        assert!(closed(&done));
        assert!(machine.outing_id().is_none());
        assert!(machine.session().is_none());
    }

    #[test]
    fn pause_and_replay_do_not_close_the_outing() {
        let mut machine = OutingMachine::default();
        let _opened = machine.step(&at(0, Sight::Frame(live("monza"))));
        let session_id = machine.session().expect("session").id;

        let paused = machine.step(&at(10_000, Sight::Frame(with_status(GameStatus::Pause))));
        assert!(!closed(&paused));
        assert_eq!(
            machine.session().expect("pause keeps session").id,
            session_id
        );

        let replayed = machine.step(&at(20_000, Sight::Frame(with_status(GameStatus::Replay))));
        assert!(!closed(&replayed));
        assert!(machine.outing_id().is_some());
        assert_eq!(
            machine.session().expect("replay keeps the open session").id,
            session_id
        );
    }

    #[test]
    fn track_change_emits_session_changed() {
        let mut machine = OutingMachine::default();
        let opened = machine.step(&at(0, Sight::Frame(live("monza"))));
        let previous_id = opened
            .iter()
            .find_map(|event| match event {
                OutingEvent::SessionOpened { session } => Some(session.id),
                _ => None,
            })
            .expect("first session");

        let changed = machine.step(&at(1_000, Sight::Frame(live("spa"))));
        match changed.as_slice() {
            [
                OutingEvent::SessionChanged {
                    previous_id: seen,
                    session,
                    ..
                },
            ] => {
                assert_eq!(*seen, previous_id);
                assert_eq!(session.track, "spa");
                assert_ne!(session.id, previous_id);
                assert_eq!(session.outing_id, machine.outing_id().expect("same outing"));
            }
            other => panic!("expected SessionChanged, got {other:?}"),
        }
    }
}
