//! Как часто UI видит статус и промежуточную пачку круга.
//!
//! Статус — не чаще 30 Гц. Событие выезда этот предел снимает: закрытие нельзя
//! отложить. Первая пачка нового круга и финиш уходят сразу, дальше превью
//! не чаще раза в секунду.

use crate::domain::LapId;

/// Нижняя граница между `acc-status`. 30 Гц — это 33 мс.
pub(crate) const STATUS_PERIOD_MS: u64 = 33;

/// Как часто растёт строка ещё не закрытого круга.
const PREVIEW_PERIOD_MS: u64 = 1_000;

/// Какую пачку круга отдать. `None` — на этом тике байтов нет.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LapSend {
    None,
    /// Открытый круг, тот же id, что будет на финише.
    Preview,
    /// Круг только что закрылся.
    Closed,
}

/// Решает частоту статуса и промежуточных пачек. Часы снаружи.
#[derive(Debug, Default)]
pub(crate) struct UiClock {
    last_status_ms: Option<u64>,
    last_lap_ms: Option<u64>,
    seen_lap: Option<LapId>,
}

impl UiClock {
    /// `force` выпускает статус сразу. Его ставит событие выезда.
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

    /// Финиш — сразу. Первая пачка нового id — сразу, дальше не чаще раза в секунду.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::LapId;

    #[test]
    fn close_does_not_delay_the_next_lap_preview() {
        let mut clock = UiClock::default();
        let first = LapId::from_bytes([1; 16]);
        let second = LapId::from_bytes([2; 16]);
        assert_eq!(clock.preview_due(0, Some(first), false), LapSend::Preview);
        assert_eq!(clock.preview_due(10, Some(second), true), LapSend::Closed);
        assert_eq!(clock.preview_due(10, Some(second), false), LapSend::Preview);
    }
}
