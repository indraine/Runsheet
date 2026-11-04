//! Флаг, штраф, дождь и сцепление трассы.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RaceFlag {
    None,
    Blue,
    Yellow,
    Black,
    White,
    Checkered,
    Penalty,
    Green,
    Orange,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Penalty {
    Unknown,
    None,
    DriveThroughCutting,
    StopAndGo10Cutting,
    StopAndGo20Cutting,
    StopAndGo30Cutting,
    DisqualifiedCutting,
    RemoveBestLapCutting,
    DriveThroughPitSpeeding,
    StopAndGo10PitSpeeding,
    StopAndGo20PitSpeeding,
    StopAndGo30PitSpeeding,
    DisqualifiedPitSpeeding,
    RemoveBestLapPitSpeeding,
    DisqualifiedIgnoredMandatoryPit,
    PostRaceTime,
    DisqualifiedTrolling,
    DisqualifiedPitEntry,
    DisqualifiedPitExit,
    DisqualifiedWrongWayOld,
    DriveThroughIgnoredStint,
    DisqualifiedIgnoredStint,
    DisqualifiedExceededStint,
    DisqualifiedWrongWay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Rain {
    None,
    Drizzle,
    Light,
    Medium,
    Heavy,
    Thunderstorm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TrackGrip {
    Green,
    Fast,
    Optimum,
    Greasy,
    Damp,
    Wet,
    Flooded,
}
