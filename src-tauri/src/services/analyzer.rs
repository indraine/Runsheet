//! Копилка открытого круга.
//!
//! Считает секторы, максимум скорости и топливо на старте только из событий
//! и снимка того же тика. Точки трейса не перечитывает. Событие выезда сюда
//! не приходит: сессию по нему заново не ищем.

use crate::domain::{SessionEvent, Speed};

/// Скорость и топливо тика, на котором случилось событие.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Reading {
    pub speed: Speed,
    pub fuel_l: f32,
}

/// Что накоплено по открытому кругу.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct OpenLapStats {
    pub sectors: u32,
    pub max_speed: Speed,
    pub fuel_at_start: f32,
}

/// Статистика текущего круга. Закрытый круг остаётся последним снимком.
#[derive(Debug, Default)]
pub(crate) struct LapAnalyzer {
    open: Option<OpenLapStats>,
    last_closed: Option<OpenLapStats>,
}

impl LapAnalyzer {
    /// `None` — живой тик без события круга: растёт только максимум скорости.
    pub(crate) fn on_event(&mut self, event: Option<SessionEvent>, reading: Reading) {
        match event {
            Some(SessionEvent::LapStarted { .. }) => {
                self.open = Some(OpenLapStats {
                    sectors: 0,
                    max_speed: reading.speed,
                    fuel_at_start: reading.fuel_l,
                });
            }
            Some(SessionEvent::SectorCompleted { .. }) => {
                if let Some(open) = &mut self.open {
                    open.sectors = open.sectors.saturating_add(1);
                    open.max_speed = faster(open.max_speed, reading.speed);
                }
            }
            Some(SessionEvent::LapCompleted { .. }) => {
                // Скорость границы принадлежит уже следующему кругу.
                self.last_closed = self.open.take();
            }
            Some(SessionEvent::PitEntry | SessionEvent::PitExit) | None => {
                if let Some(open) = &mut self.open {
                    open.max_speed = faster(open.max_speed, reading.speed);
                }
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn open(&self) -> Option<OpenLapStats> {
        self.open
    }

    #[cfg(test)]
    pub(crate) fn last_closed(&self) -> Option<OpenLapStats> {
        self.last_closed
    }
}

fn faster(current: Speed, seen: Speed) -> Speed {
    if seen.kmh() > current.kmh() {
        seen
    } else {
        current
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::LapTime;

    fn reading(speed: f32, fuel_l: f32) -> Reading {
        Reading {
            speed: Speed::from_kmh_unchecked(speed),
            fuel_l,
        }
    }

    #[test]
    fn stats_follow_events_without_walking_points() {
        let mut analyzer = LapAnalyzer::default();
        analyzer.on_event(
            Some(SessionEvent::LapStarted { lap_number: 1 }),
            reading(120.0, 48.0),
        );
        analyzer.on_event(None, reading(210.0, 47.0));
        analyzer.on_event(
            Some(SessionEvent::SectorCompleted {
                index: 1,
                time: LapTime::from_ms_unchecked(30_000),
            }),
            reading(180.0, 46.0),
        );
        analyzer.on_event(Some(SessionEvent::PitEntry), reading(40.0, 45.0));

        let open = analyzer.open().expect("lap still open in the pit lane");
        assert_eq!(open.sectors, 1);
        assert_eq!(open.max_speed.kmh(), 210.0);
        assert_eq!(open.fuel_at_start, 48.0);

        analyzer.on_event(
            Some(SessionEvent::LapCompleted {
                lap_number: 1,
                time: Some(LapTime::from_ms_unchecked(91_000)),
            }),
            reading(100.0, 44.0),
        );
        assert!(analyzer.open().is_none());
        assert_eq!(
            analyzer.last_closed().expect("closed").max_speed.kmh(),
            210.0
        );
    }
}
