use uuid::Uuid;

use crate::domain::{LapId, LapTime, SessionEvent, SessionId};

const TRACE_GAP_MS: u64 = 50;

const LAP_CLOCK_GUARD_MS: i32 = 3_000;

const CLOCK_DROP_MS: i32 = 1_500;

/// How long a lap waits after the line for the game to publish its own time.
const LINE_WAIT_MS: u64 = 300;

/// Same threshold the sequencer uses for "the car is moving".
const OUTLAP_SPEED_KMH: f32 = 5.0;

/// An in-lap with no sector split is still kept once it has been driven this long.
/// The few seconds between the line and the pit entry are not a lap.
const INLAP_KEEP_MS: u64 = 15_000;

const CHANNEL_COUNT: usize = 19;

const HEADER_LEN: usize = 92;

const MISSING_MS: i32 = -1;

const MISSING_M: f32 = -1.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Sample {
    pub mono_ms: u64,
    pub session_id: SessionId,
    pub completed_lap: i32,
    pub last_time_ms: i32,
    pub last_sector_time_ms: i32,
    pub sector_index: i32,
    pub valid: bool,
    pub distance_m: f32,
    pub fuel: f32,
    pub throttle: f32,
    pub brake: f32,
    pub steer: f32,
    pub gear: i32,
    pub rpm: i32,
    pub heading: f32,
    pub speed: f32,
    pub lap_time_ms: i32,
    pub progress: f32,
    pub g_long: f32,
    pub g_lat: f32,
    pub x: f32,
    pub z: f32,
    pub pressure_fl: f32,
    pub pressure_fr: f32,
    pub pressure_rl: f32,
    pub pressure_rr: f32,
    pub brake_temp_fl: f32,
    pub brake_temp_fr: f32,
    pub tc: i32,
    pub abs: i32,
    pub engine_map: i32,
    pub brake_bias: f32,
    /// Race sessions stay closed until the green flag is shown.
    pub race: bool,
    /// Green flag or the global green light from the graphics page.
    pub green: bool,
    /// Pit lane from the entry line to the exit line. ACC `isInPitLane`.
    pub in_pit_lane: bool,
    /// Pit box stall. ACC `isInPit`. Standing in the box sets the lane flag too.
    pub in_pit_box: bool,
}

#[derive(Debug, Default)]
pub(crate) struct Collector {
    open: Option<OpenLap>,
    carry_completed: Option<i32>,
    crossing: Option<Crossing>,
    watch: StartWatch,
    events: Vec<SessionEvent>,
    /// Previous sample was in the pit lane or the pit box.
    was_in_pits: bool,
    /// Next lap number when it must not follow `completed_lap + 1`.
    pending_number: Option<i32>,
    /// Highest `completed_lap` seen while the car is in the pits.
    lane_completed: Option<i32>,
}

/// The line was seen, but the game has not published the lap time yet.
///
/// `completedLap` and `iLastTime` arrive a few frames after the clock resets.
/// Closing on the first frame would fall back to the last clock reading, which
/// is a frame older than the line. The samples seen since are kept and replayed
/// into the next lap.
#[derive(Debug)]
struct Crossing {
    since_ms: u64,
    samples: Vec<Sample>,
}

impl Collector {
    pub(crate) fn bound_session(&self) -> Option<SessionId> {
        self.open.as_ref().map(|open| open.session_id)
    }

    pub(crate) fn abandon(&mut self) -> Option<Vec<u8>> {
        self.watch = StartWatch::default();
        self.crossing = None;
        self.carry_completed = None;
        let open = self.open.take()?;
        if open.points.is_empty() {
            return None;
        }
        Some(pack(&open.abandoned()))
    }

    pub(crate) fn open_id(&self) -> Option<LapId> {
        self.open.as_ref().map(|open| open.id)
    }

    pub(crate) fn open_number(&self) -> Option<i32> {
        self.open.as_ref().map(|open| open.number)
    }

    /// Splits of the lap currently being driven, if the start line has been crossed.
    pub(crate) fn open_split(&self) -> Option<OpenSplit> {
        let open = self.open.as_ref()?;
        Some(OpenSplit {
            sector_index: open.sector,
            s1_ms: open.s1_ms,
            s2_ms: open.s2_ms,
            shown_ms: open.shown_ms,
        })
    }

    pub(crate) fn preview(&self) -> Option<Vec<u8>> {
        self.open.as_ref().map(|open| pack(&open.partial()))
    }

    pub(crate) fn take_events(&mut self) -> Vec<SessionEvent> {
        std::mem::take(&mut self.events)
    }

    #[must_use]
    pub(crate) fn push(&mut self, sample: &Sample) -> Option<Vec<u8>> {
        if self
            .open
            .as_ref()
            .is_some_and(|open| open.session_id != sample.session_id)
        {
            self.open = None;
            self.crossing = None;
            self.carry_completed = None;
            self.watch = StartWatch::default();
            self.was_in_pits = false;
            self.pending_number = None;
            self.lane_completed = None;
        }

        if in_pits(sample) {
            return self.hold_in_pits(sample);
        }
        let left_pits = self.was_in_pits;
        self.was_in_pits = false;
        if left_pits {
            return self.begin_outlap(sample);
        }

        if self.crossing.is_some() {
            return self.settle(sample);
        }
        let closed = self.take_closed(sample);
        if self.crossing.is_some() {
            return None;
        }
        if self.open.is_none() {
            // The sample that closed a lap is already past the line, so it
            // starts the next one. A stint that is already rolling opens now,
            // so the outlap is stored instead of waiting for the line.
            let start = closed.is_some() || self.watch.ready(sample) || outlap_due(sample);
            if !start {
                self.watch.observe(sample);
                return closed;
            }
            self.open_next(sample, false);
        }
        self.observe(sample);
        closed
    }

    /// The start/finish line inside the pit lane does not end the in-lap and
    /// does not start the next one. That lap begins at the pit exit.
    fn hold_in_pits(&mut self, sample: &Sample) -> Option<Vec<u8>> {
        self.was_in_pits = true;
        self.watch = StartWatch::default();
        self.remember_completed(sample.completed_lap);

        if self.crossing.is_some() {
            // The line was crossed on track; the lap the game just opened has
            // not been driven. Drop it before a preview can leave.
            let closed = self.settle(sample);
            self.discard_unseen();
            return closed;
        }

        let young = self
            .open
            .as_ref()
            .is_some_and(|open| !open.worth_keeping(sample.mono_ms));
        if young {
            let retired = self.retire_open();
            return (!retired.is_empty()).then_some(retired);
        }
        None
    }

    /// Closes the in-lap without a finishing sector and opens the outlap.
    fn begin_outlap(&mut self, sample: &Sample) -> Option<Vec<u8>> {
        let game = self
            .lane_completed
            .unwrap_or(sample.completed_lap)
            .max(sample.completed_lap);
        self.lane_completed = None;
        let closed = if self
            .open
            .as_ref()
            .is_some_and(|open| open.worth_keeping(sample.mono_ms))
        {
            Some(self.seal_inlap())
        } else if self.open.is_some() {
            Some(self.retire_open())
        } else {
            None
        };
        self.carry_completed = Some(game);
        self.watch = StartWatch::default();
        self.open_next(sample, true);
        self.observe(sample);
        closed.filter(|packet| !packet.is_empty())
    }

    fn remember_completed(&mut self, completed: i32) {
        self.lane_completed = Some(
            self.lane_completed
                .map_or(completed, |seen| seen.max(completed)),
        );
    }

    fn seal_inlap(&mut self) -> Vec<u8> {
        let Some(open) = self.open.take() else {
            return Vec::new();
        };
        self.pending_number = Some(open.number.saturating_add(1));
        self.crossing = None;
        let number = open.number;
        self.events.push(SessionEvent::LapCompleted {
            lap_number: number,
            time: None,
        });
        pack(&open.abandoned())
    }

    fn retire_open(&mut self) -> Vec<u8> {
        let Some(open) = self.open.take() else {
            return Vec::new();
        };
        self.pending_number = Some(open.number);
        self.crossing = None;
        pack(&open.retire())
    }

    /// The lap was opened in this same push and never previewed.
    fn discard_unseen(&mut self) {
        if let Some(open) = self.open.take() {
            self.pending_number = Some(open.number);
            self.crossing = None;
        }
    }

    fn open_next(&mut self, sample: &Sample, from_pit_exit: bool) {
        let completed_at_open = self.carry_completed.take().unwrap_or(sample.completed_lap);
        let number = self
            .pending_number
            .take()
            .unwrap_or_else(|| completed_at_open.saturating_add(1));
        let open = OpenLap::begin(sample, completed_at_open, number, from_pit_exit);
        self.events.push(SessionEvent::LapStarted {
            lap_number: open.number,
        });
        self.open = Some(open);
        self.watch = StartWatch::default();
    }

    /// Waits for the game's own lap time after the line, then closes the lap.
    fn settle(&mut self, sample: &Sample) -> Option<Vec<u8>> {
        let grown = self
            .open
            .as_ref()
            .is_some_and(|open| sample.completed_lap > open.completed_at_open);
        let crossing = self.crossing.as_mut()?;
        let waited = sample.mono_ms.saturating_sub(crossing.since_ms) >= LINE_WAIT_MS;
        if !grown && !waited {
            crossing.samples.push(*sample);
            return None;
        }
        let crossing = self.crossing.take()?;
        let closed = self.close(sample);
        for (index, held) in crossing.samples.iter().chain(Some(sample)).enumerate() {
            if index == 0 {
                self.open_next(held, false);
            }
            self.observe(held);
        }
        Some(closed)
    }

    fn take_closed(&mut self, boundary: &Sample) -> Option<Vec<u8>> {
        let Some(open) = self.open.as_ref() else {
            return None;
        };
        let grown = boundary.completed_lap > open.completed_at_open;
        if !grown {
            if line_crossed(open, boundary) {
                self.crossing = Some(Crossing {
                    since_ms: boundary.mono_ms,
                    samples: vec![*boundary],
                });
            }
            return None;
        }
        Some(self.close(boundary))
    }

    /// Ends the open lap. The boundary carries the game's own time once
    /// `completedLap` has grown; otherwise the last clock reading stands in.
    fn close(&mut self, boundary: &Sample) -> Vec<u8> {
        let Some(open) = self.open.take() else {
            return Vec::new();
        };
        self.crossing = None;
        let consumed = boundary
            .completed_lap
            .max(open.completed_at_open.saturating_add(1));
        let number = open.number;
        self.carry_completed = Some(consumed);
        let time =
            (boundary.last_time_ms > 0).then(|| LapTime::from_ms_unchecked(boundary.last_time_ms));
        self.events.push(SessionEvent::LapCompleted {
            lap_number: number,
            time,
        });
        pack(&open.finish(boundary))
    }

    fn observe(&mut self, sample: &Sample) {
        let sector = {
            let Some(open) = self.open.as_mut() else {
                return;
            };
            let along_m = sample.distance_m - open.origin_m;
            let lap_clock = open.clock_ms(sample);
            open.shown_ms = Some(lap_clock);
            let sector = open.note_sector(
                sample.sector_index,
                sample.last_sector_time_ms,
                lap_clock,
                along_m,
            );
            open.valid = sample.valid;
            open.fuel = sample.fuel;
            open.tc = sample.tc;
            open.abs = sample.abs;
            open.engine_map = sample.engine_map;
            open.brake_bias = sample.brake_bias;
            open.max_speed = Some(match open.max_speed {
                Some(seen) => seen.max(sample.speed),
                None => sample.speed,
            });
            open.last_lap_time_ms = Some(sample.lap_time_ms);
            open.last_progress = Some(sample.progress);
            if open.due(sample.mono_ms) {
                open.points
                    .push(LapPoint::capture(sample, along_m, lap_clock));
                open.last_trace_ms = Some(sample.mono_ms);
            }
            sector
        };
        if let Some(event) = sector {
            self.events.push(event);
        }
    }
}

#[derive(Debug)]
struct OpenLap {
    id: LapId,
    session_id: SessionId,
    number: i32,
    completed_at_open: i32,
    origin_m: f32,
    sector: i32,
    s1_ms: Option<i32>,
    s2_ms: Option<i32>,
    s1_end_m: Option<f32>,
    s2_end_m: Option<f32>,
    valid: bool,
    fuel: f32,
    tc: i32,
    abs: i32,
    engine_map: i32,
    brake_bias: f32,
    max_speed: Option<f32>,
    last_trace_ms: Option<u64>,
    last_lap_time_ms: Option<i32>,
    last_progress: Option<f32>,
    origin_mono: u64,
    /// Clock the sheet shows. Zero at the lap open, even when the game clock
    /// was already running through the pit lane.
    shown_ms: Option<i32>,
    from_pit_exit: bool,
    /// Game lap clock at the open, subtracted so a pit-lane timer does not
    /// count as part of the outlap.
    game_origin_ms: i32,
    points: Vec<LapPoint>,
}

impl OpenLap {
    fn begin(
        sample: &Sample,
        completed_at_open: i32,
        number: i32,
        from_pit_exit: bool,
    ) -> Self {
        let game_origin_ms = if from_pit_exit && clock_ticking(sample.lap_time_ms) {
            sample.lap_time_ms
        } else {
            0
        };
        Self {
            id: LapId::from_bytes(Uuid::new_v4().into_bytes()),
            session_id: sample.session_id,
            number,
            completed_at_open,
            origin_m: sample.distance_m,
            sector: sample.sector_index,
            s1_ms: None,
            s2_ms: None,
            s1_end_m: None,
            s2_end_m: None,
            valid: false,
            fuel: 0.0,
            tc: sample.tc,
            abs: sample.abs,
            engine_map: sample.engine_map,
            brake_bias: sample.brake_bias,
            max_speed: None,
            last_trace_ms: None,
            last_lap_time_ms: None,
            last_progress: None,
            origin_mono: sample.mono_ms,
            shown_ms: None,
            from_pit_exit,
            game_origin_ms,
            points: Vec::new(),
        }
    }

    fn finish(self, boundary: &Sample) -> Finished {
        // A lap that started at the pit exit keeps the clock we ran from that
        // line. The game's last time still includes the pit lane.
        let time_ms = if self.from_pit_exit {
            self.shown_ms.and_then(real_ms)
        } else if boundary.completed_lap > self.completed_at_open {
            real_ms(boundary.last_time_ms)
                .or_else(|| self.shown_ms.and_then(real_ms))
                .or_else(|| self.last_lap_time_ms.and_then(real_ms))
        } else {
            self.last_lap_time_ms
                .and_then(real_ms)
                .or_else(|| self.shown_ms.and_then(real_ms))
                .or_else(|| real_ms(boundary.last_time_ms))
        };
        let s3_ms = match (time_ms, self.s1_ms, self.s2_ms) {
            (Some(total), Some(s1), Some(s2)) => {
                real_ms(total.saturating_sub(s1.saturating_add(s2)))
            }
            _ => None,
        };
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms,
            s1_ms: self.s1_ms,
            s2_ms: self.s2_ms,
            s3_ms,
            s1_end_m: self.s1_end_m,
            s2_end_m: self.s2_end_m,
            valid: self.valid,
            fuel: self.fuel,
            tc: self.tc,
            abs: self.abs,
            engine_map: self.engine_map,
            brake_bias: self.brake_bias,
            max_speed: self.max_speed.unwrap_or(0.0),
            points: self.points,
            retire: false,
        }
    }

    fn abandoned(self) -> Finished {
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms: None,
            s1_ms: self.s1_ms,
            s2_ms: self.s2_ms,
            s3_ms: None,
            s1_end_m: self.s1_end_m,
            s2_end_m: self.s2_end_m,
            valid: false,
            fuel: self.fuel,
            tc: self.tc,
            abs: self.abs,
            engine_map: self.engine_map,
            brake_bias: self.brake_bias,
            max_speed: self.max_speed.unwrap_or(0.0),
            points: self.points,
            retire: false,
        }
    }

    fn retire(self) -> Finished {
        let mut finished = self.abandoned();
        finished.retire = true;
        finished
    }

    fn partial(&self) -> Finished {
        Finished {
            id: self.id,
            session_id: self.session_id,
            number: self.number,
            time_ms: None,
            s1_ms: self.s1_ms,
            s2_ms: self.s2_ms,
            s3_ms: None,
            s1_end_m: self.s1_end_m,
            s2_end_m: self.s2_end_m,
            valid: self.valid,
            fuel: self.fuel,
            tc: self.tc,
            abs: self.abs,
            engine_map: self.engine_map,
            brake_bias: self.brake_bias,
            max_speed: self.max_speed.unwrap_or(0.0),
            points: self.points.clone(),
            retire: false,
        }
    }

    /// Sheet clock. The game clock wins while it is counting from this lap.
    /// Otherwise the time since the lap opened is used, which is the outlap
    /// while ACC holds `iCurrentTime` at zero.
    fn clock_ms(&self, sample: &Sample) -> i32 {
        if clock_ticking(sample.lap_time_ms) {
            return sample
                .lap_time_ms
                .saturating_sub(self.game_origin_ms)
                .max(0);
        }
        i32::try_from(sample.mono_ms.saturating_sub(self.origin_mono)).unwrap_or(MAX_LAP_MS)
    }

    fn worth_keeping(&self, now_ms: u64) -> bool {
        self.s1_ms.is_some()
            || self.s2_ms.is_some()
            || now_ms.saturating_sub(self.origin_mono) >= INLAP_KEEP_MS
    }

    fn note_sector(
        &mut self,
        sector_index: i32,
        sector_ms: i32,
        lap_ms: i32,
        along_m: f32,
    ) -> Option<SessionEvent> {
        if sector_index == self.sector {
            return None;
        }
        let recorded = if sector_index == 1 && self.s1_ms.is_none() {
            // After a pit exit the game split still starts at the line inside
            // the lane. The sheet's split starts at the exit.
            let ms = if self.from_pit_exit {
                real_ms(lap_ms)
            } else {
                real_ms(sector_ms).or_else(|| real_ms(lap_ms))
            };
            if let Some(ms) = ms {
                self.s1_ms = Some(ms);
                self.s1_end_m = Some(along_m);
            }
            ms
        } else if sector_index == 2 && self.s2_ms.is_none() {
            let ms = if self.from_pit_exit {
                split_after(lap_ms, self.s1_ms)
            } else {
                sector_duration(sector_ms, self.s1_ms).or_else(|| split_after(lap_ms, self.s1_ms))
            };
            if let Some(ms) = ms {
                self.s2_ms = Some(ms);
                self.s2_end_m = Some(along_m);
            }
            ms
        } else {
            None
        };
        self.sector = sector_index;
        recorded.map(|ms| SessionEvent::SectorCompleted {
            index: sector_index,
            time: LapTime::from_ms_unchecked(ms),
        })
    }

    fn due(&self, mono_ms: u64) -> bool {
        self.last_trace_ms
            .is_none_or(|previous| mono_ms.saturating_sub(previous) >= TRACE_GAP_MS)
    }
}

/// One high-rate sample along an open lap (packed into the IPC plane).
///
/// Ground plane uses ACC `x`/`z` (world Y is vertical). `timestamp` is the
/// in-lap clock in milliseconds.
#[derive(Debug, Clone)]
struct LapPoint {
    distance: f32,
    timestamp: f32,
    speed: f32,
    throttle: f32,
    brake: f32,
    steer: f32,
    gear: f32,
    g_long: f32,
    g_lat: f32,
    x: f32,
    z: f32,
    pressure_fl: f32,
    pressure_fr: f32,
    pressure_rl: f32,
    pressure_rr: f32,
    brake_temp_fl: f32,
    brake_temp_fr: f32,
    rpm: f32,
    heading: f32,
}

impl LapPoint {
    fn capture(sample: &Sample, along_m: f32, lap_ms: i32) -> Self {
        Self {
            distance: along_m,
            timestamp: lap_ms as f32,
            speed: sample.speed,
            throttle: sample.throttle,
            brake: sample.brake,
            steer: sample.steer,
            gear: sample.gear as f32,
            g_long: sample.g_long,
            g_lat: sample.g_lat,
            x: sample.x,
            z: sample.z,
            pressure_fl: sample.pressure_fl,
            pressure_fr: sample.pressure_fr,
            pressure_rl: sample.pressure_rl,
            pressure_rr: sample.pressure_rr,
            brake_temp_fl: sample.brake_temp_fl,
            brake_temp_fr: sample.brake_temp_fr,
            rpm: sample.rpm as f32,
            heading: sample.heading,
        }
    }
}

struct Finished {
    id: LapId,
    session_id: SessionId,
    number: i32,
    time_ms: Option<i32>,
    s1_ms: Option<i32>,
    s2_ms: Option<i32>,
    s3_ms: Option<i32>,
    s1_end_m: Option<f32>,
    s2_end_m: Option<f32>,
    valid: bool,
    fuel: f32,
    tc: i32,
    abs: i32,
    engine_map: i32,
    brake_bias: f32,
    max_speed: f32,
    /// The lap was opened and then thrown away. The sheet drops this id.
    retire: bool,
    points: Vec<LapPoint>,
}

const MAX_LAP_MS: i32 = 2 * 60 * 60 * 1000;

fn real_ms(ms: i32) -> Option<i32> {
    (ms > 0 && ms <= MAX_LAP_MS).then_some(ms)
}

fn sector_duration(split_ms: i32, previous: Option<i32>) -> Option<i32> {
    match (real_ms(split_ms), previous) {
        (Some(split), Some(done)) if split > done => Some(split - done),
        _ => None,
    }
}

fn split_after(lap_ms: i32, previous: Option<i32>) -> Option<i32> {
    sector_duration(lap_ms, previous)
}

/// Where the open lap is on track. The game's sector index is `0`, `1`, or `2`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct OpenSplit {
    pub sector_index: i32,
    pub s1_ms: Option<i32>,
    pub s2_ms: Option<i32>,
    /// Lap clock to paint. Counts from the pit exit when the game clock does not.
    pub shown_ms: Option<i32>,
}

/// Progress and lap clock seen before a lap is allowed to open.
///
/// Sitting on the grid has a sector index and a frozen clock, but the car
/// has not crossed the start line. That must not become lap 1 sector 1.
#[derive(Debug, Default)]
struct StartWatch {
    progress: Option<f32>,
    lap_ms: Option<i32>,
}

impl StartWatch {
    fn observe(&mut self, sample: &Sample) {
        self.progress = Some(sample.progress);
        self.lap_ms = Some(sample.lap_time_ms);
    }

    fn ready(&self, sample: &Sample) -> bool {
        let crossed = self.wrapped(sample) || self.clock_reset(sample);
        if !crossed {
            return false;
        }
        if !sample.race {
            return true;
        }
        // Formation and the grid can cross the line while the flag is still out.
        sample.green && (clock_ticking(sample.lap_time_ms) || sample.lap_time_ms == 0)
    }

    fn wrapped(&self, sample: &Sample) -> bool {
        self.progress
            .is_some_and(|previous| progress_wrapped(previous, sample.progress))
    }

    fn clock_reset(&self, sample: &Sample) -> bool {
        let Some(previous) = self.lap_ms else {
            return false;
        };
        if previous < LAP_CLOCK_GUARD_MS {
            return false;
        }
        let reset =
            sample.lap_time_ms < 0 || sample.lap_time_ms.saturating_add(CLOCK_DROP_MS) < previous;
        reset && (0..LAP_CLOCK_GUARD_MS).contains(&sample.lap_time_ms)
    }
}

/// The car is rolling and the lap has not opened yet.
///
/// A race with the green flag still down is the grid or the formation lap.
/// That wait stays blank. Once the lap opens, the outlap is stored with its
/// sectors and stays on the sheet after the line.
pub(crate) fn show_outlap(lap_open: bool, rolling: bool, race: bool, green: bool) -> bool {
    rolling && !lap_open && (!race || green)
}

fn in_pits(sample: &Sample) -> bool {
    sample.in_pit_lane || sample.in_pit_box
}

fn outlap_due(sample: &Sample) -> bool {
    sample.speed >= OUTLAP_SPEED_KMH && (!sample.race || sample.green)
}

fn clock_ticking(ms: i32) -> bool {
    ms > 0 && ms <= MAX_LAP_MS
}

/// Elapsed time inside the sector the car is in.
///
/// Sector `0` is the lap clock. Later sectors subtract the splits already
/// stored on the open lap. A missing split stays blank instead of repeating
/// the previous sector.
pub(crate) fn sector_elapsed(
    lap_ms: i32,
    sector_index: i32,
    s1_ms: Option<i32>,
    s2_ms: Option<i32>,
) -> Option<i32> {
    if !(0..=MAX_LAP_MS).contains(&lap_ms) {
        return None;
    }
    let done = match sector_index {
        0 => 0,
        1 => s1_ms?,
        _ => s1_ms?.saturating_add(s2_ms?),
    };
    Some(lap_ms.saturating_sub(done))
}

fn progress_wrapped(previous: f32, current: f32) -> bool {
    current >= 0.0 && current < 0.15 && previous > 0.85 && previous - current > 0.5
}

fn line_crossed(open: &OpenLap, sample: &Sample) -> bool {
    let Some(previous_time) = open.last_lap_time_ms else {
        return false;
    };
    if previous_time < LAP_CLOCK_GUARD_MS {
        return false;
    }
    let clock_reset =
        sample.lap_time_ms < 0 || sample.lap_time_ms.saturating_add(CLOCK_DROP_MS) < previous_time;
    if clock_reset {
        return true;
    }
    if open.sector >= 2 && sample.sector_index == 0 {
        return true;
    }
    let Some(previous) = open.last_progress else {
        return false;
    };
    progress_wrapped(previous, sample.progress)
}

fn pack(lap: &Finished) -> Vec<u8> {
    let count = u32::try_from(lap.points.len()).unwrap_or(u32::MAX);
    let mut out = Vec::with_capacity(HEADER_LEN + lap.points.len() * CHANNEL_COUNT * 4);
    out.extend_from_slice(&lap.id.as_bytes());
    out.extend_from_slice(&lap.session_id.as_bytes());
    write_i32(&mut out, lap.number);
    write_u32(&mut out, count);
    write_i32(&mut out, lap.time_ms.unwrap_or(MISSING_MS));
    write_i32(&mut out, lap.s1_ms.unwrap_or(MISSING_MS));
    write_i32(&mut out, lap.s2_ms.unwrap_or(MISSING_MS));
    write_i32(&mut out, lap.s3_ms.unwrap_or(MISSING_MS));
    write_f32(&mut out, lap.s1_end_m.unwrap_or(MISSING_M));
    write_f32(&mut out, lap.s2_end_m.unwrap_or(MISSING_M));
    out.push(u8::from(lap.valid));
    // Byte 65 tells the sheet to drop this lap id. The two bytes after stay zero.
    out.push(u8::from(lap.retire));
    out.extend_from_slice(&[0, 0]);
    write_f32(&mut out, lap.fuel);
    write_f32(&mut out, lap.max_speed);
    write_i32(&mut out, lap.tc);
    write_i32(&mut out, lap.abs);
    write_i32(&mut out, lap.engine_map);
    write_f32(&mut out, lap.brake_bias);
    debug_assert_eq!(out.len(), HEADER_LEN);
    write_plane(&mut out, &lap.points);
    out
}

fn write_plane(out: &mut Vec<u8>, points: &[LapPoint]) {
    write_values(out, points, |point| point.distance);
    write_values(out, points, |point| point.timestamp);
    write_values(out, points, |point| point.speed);
    write_values(out, points, |point| point.throttle);
    write_values(out, points, |point| point.brake);
    write_values(out, points, |point| point.steer);
    write_values(out, points, |point| point.gear);
    write_values(out, points, |point| point.g_long);
    write_values(out, points, |point| point.g_lat);
    write_values(out, points, |point| point.x);
    write_values(out, points, |point| point.z);
    write_values(out, points, |point| point.pressure_fl);
    write_values(out, points, |point| point.pressure_fr);
    write_values(out, points, |point| point.pressure_rl);
    write_values(out, points, |point| point.pressure_rr);
    write_values(out, points, |point| point.brake_temp_fl);
    write_values(out, points, |point| point.brake_temp_fr);
    write_values(out, points, |point| point.rpm);
    write_values(out, points, |point| point.heading);
}

fn write_values(out: &mut Vec<u8>, points: &[LapPoint], value: impl Fn(&LapPoint) -> f32) {
    for point in points {
        write_f32(out, value(point));
    }
}

fn write_i32(out: &mut Vec<u8>, value: i32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn write_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn write_f32(out: &mut Vec<u8>, value: f32) {
    out.extend_from_slice(&value.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_sample(completed_lap: i32, lap_time_ms: i32, last_time_ms: i32) -> Sample {
        Sample {
            mono_ms: 1000,
            session_id: SessionId::from_bytes([1; 16]),
            completed_lap,
            last_time_ms,
            last_sector_time_ms: -1,
            sector_index: 0,
            valid: true,
            distance_m: 100.0,
            fuel: 10.0,
            throttle: 1.0,
            brake: 0.0,
            steer: 0.0,
            gear: 3,
            rpm: 6000,
            heading: 0.0,
            speed: 150.0,
            lap_time_ms,
            progress: 0.05,
            g_long: 0.0,
            g_lat: 0.0,
            x: 0.0,
            z: 0.0,
            pressure_fl: 27.5,
            pressure_fr: 27.5,
            pressure_rl: 27.5,
            pressure_rr: 27.5,
            brake_temp_fl: 400.0,
            brake_temp_fr: 400.0,
            tc: 0,
            abs: 0,
            engine_map: 1,
            brake_bias: 0.6,
            race: false,
            green: true,
            in_pit_lane: false,
            in_pit_box: false,
        }
    }

    #[test]
    fn finish_prefers_last_lap_time_when_completed_lap_not_incremented() {
        let start_sample = dummy_sample(1, 0, 115_330);
        let mut open = OpenLap::begin(&start_sample, 1, 2, false);
        open.last_lap_time_ms = Some(112_235);
        open.s1_ms = Some(35_830);
        open.s2_ms = Some(39_392);

        // Boundary triggered by line_crossed before completed_lap increments:
        // boundary.last_time_ms is still stale (115_330 from lap 1)
        let boundary = dummy_sample(1, 10, 115_330);
        let finished = open.finish(&boundary);

        assert_eq!(finished.time_ms, Some(112_235));
        assert_eq!(finished.s3_ms, Some(112_235 - 35_830 - 39_392));
    }

    #[test]
    fn finish_uses_boundary_last_time_when_completed_lap_incremented() {
        let start_sample = dummy_sample(1, 0, 115_330);
        let mut open = OpenLap::begin(&start_sample, 1, 2, false);
        open.last_lap_time_ms = Some(112_230);
        open.s1_ms = Some(35_830);
        open.s2_ms = Some(39_392);

        // Boundary triggered after completed_lap increments:
        // boundary.last_time_ms is now officially updated to 112_235
        let boundary = dummy_sample(2, 10, 112_235);
        let finished = open.finish(&boundary);

        assert_eq!(finished.time_ms, Some(112_235));
        assert_eq!(finished.s3_ms, Some(112_235 - 35_830 - 39_392));
    }
    fn waiting_collector() -> Collector {
        let mut open = OpenLap::begin(&dummy_sample(1, 0, 115_330), 1, 2, false);
        open.last_lap_time_ms = Some(112_230);
        open.last_progress = Some(0.99);
        open.s1_ms = Some(35_830);
        open.s2_ms = Some(39_392);
        Collector {
            open: Some(open),
            ..Collector::default()
        }
    }

    fn at(mono_ms: u64, completed_lap: i32, lap_time_ms: i32, last_time_ms: i32) -> Sample {
        let mut sample = dummy_sample(completed_lap, lap_time_ms, last_time_ms);
        sample.mono_ms = mono_ms;
        sample.progress = 0.01;
        sample
    }

    fn packed_time_ms(packed: &[u8]) -> i32 {
        i32::from_le_bytes(packed[40..44].try_into().unwrap())
    }

    #[test]
    fn line_waits_for_the_official_time_of_the_game() {
        let mut collector = waiting_collector();

        // The clock reset is seen first, the official time is still stale.
        assert!(collector.push(&at(2_000, 1, 10, 115_330)).is_none());
        let closed = collector.push(&at(2_016, 2, 26, 112_235));

        let packed = closed.expect("lap closes once the game publishes its time");
        assert_eq!(packed_time_ms(&packed), 112_235);
        assert_eq!(collector.open_number(), Some(2));
    }

    #[test]
    fn line_falls_back_to_the_clock_when_the_game_stays_silent() {
        let mut collector = waiting_collector();

        assert!(collector.push(&at(2_000, 1, 10, 115_330)).is_none());
        assert!(collector.push(&at(2_100, 1, 110, 115_330)).is_none());
        let closed = collector.push(&at(2_320, 1, 330, 115_330));

        let packed = closed.expect("lap closes after the wait");
        assert_eq!(packed_time_ms(&packed), 112_230);
        assert_eq!(collector.open_number(), Some(2));
    }
}
