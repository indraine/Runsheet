use crate::domain::LapId;

pub(crate) const STATUS_PERIOD_MS: u64 = 33;

const PREVIEW_PERIOD_MS: u64 = 1_000;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LapSend {
    None,
    Preview,
    Closed,
}

#[derive(Debug, Default)]
pub(crate) struct UiClock {
    last_status_ms: Option<u64>,
    last_lap_ms: Option<u64>,
    seen_lap: Option<LapId>,
}

impl UiClock {
    pub(crate) fn status_due(&mut self, mono_ms: u64, force: bool) -> bool {
        let due = self
            .last_status_ms
            .is_none_or(|previous| mono_ms.saturating_sub(previous) >= STATUS_PERIOD_MS);
        if !force && !due {
            return false;
        }
        self.last_status_ms = Some(mono_ms);
        true
    }

    pub(crate) fn preview_due(
        &mut self,
        mono_ms: u64,
        open_id: Option<LapId>,
        closed: bool,
    ) -> LapSend {
        if closed {
            self.last_lap_ms = Some(mono_ms);
            self.seen_lap = None;
            return LapSend::Closed;
        }
        let Some(open_id) = open_id else {
            self.seen_lap = None;
            return LapSend::None;
        };
        let fresh = self.seen_lap != Some(open_id);
        let due = self
            .last_lap_ms
            .is_none_or(|previous| mono_ms.saturating_sub(previous) >= PREVIEW_PERIOD_MS);
        if !fresh && !due {
            return LapSend::None;
        }
        self.last_lap_ms = Some(mono_ms);
        self.seen_lap = Some(open_id);
        LapSend::Preview
    }
}
