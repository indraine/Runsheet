//! Единицы измерения.
//!
//! Конструкторы не проверяют конечность и диапазон: это делает ingress один раз.
//! Методы чтения отдают сохранённое число как есть.

use std::fmt;

/// Скорость, км/ч.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct Speed(f32);

impl Speed {
    pub(crate) const fn from_kmh_unchecked(kmh: f32) -> Self {
        Self(kmh)
    }

    pub(crate) const fn kmh(self) -> f32 {
        self.0
    }
}

impl fmt::Display for Speed {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} km/h", self.0)
    }
}

/// Давление шины, psi.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct Psi(f32);

impl Psi {
    pub(crate) const fn from_psi_unchecked(psi: f32) -> Self {
        Self(psi)
    }

    pub(crate) const fn psi(self) -> f32 {
        self.0
    }
}

impl fmt::Display for Psi {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} psi", self.0)
    }
}

/// Температура, градусы Цельсия.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct Celsius(f32);

impl Celsius {
    pub(crate) const fn from_celsius_unchecked(celsius: f32) -> Self {
        Self(celsius)
    }

    pub(crate) const fn celsius(self) -> f32 {
        self.0
    }
}

impl fmt::Display for Celsius {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} °C", self.0)
    }
}

/// Известное время круга или сектора, миллисекунды.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct LapTime(i32);

impl LapTime {
    pub(crate) const fn from_ms_unchecked(ms: i32) -> Self {
        Self(ms)
    }

    pub(crate) const fn ms(self) -> i32 {
        self.0
    }
}

impl fmt::Display for LapTime {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} ms", self.0)
    }
}

/// Доля длины трассы, `0.0..=1.0`.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct TrackProgress(f32);

impl TrackProgress {
    pub(crate) const fn from_fraction_unchecked(fraction: f32) -> Self {
        Self(fraction)
    }

    pub(crate) const fn fraction(self) -> f32 {
        self.0
    }
}

impl fmt::Display for TrackProgress {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

/// Положение газа, `0.0..=1.0`.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct ThrottlePosition(f32);

impl ThrottlePosition {
    pub(crate) const fn from_fraction_unchecked(fraction: f32) -> Self {
        Self(fraction)
    }

    pub(crate) const fn fraction(self) -> f32 {
        self.0
    }
}

impl fmt::Display for ThrottlePosition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

/// Положение тормоза, `0.0..=1.0`.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct BrakePosition(f32);

impl BrakePosition {
    pub(crate) const fn from_fraction_unchecked(fraction: f32) -> Self {
        Self(fraction)
    }

    pub(crate) const fn fraction(self) -> f32 {
        self.0
    }
}

impl fmt::Display for BrakePosition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unchecked_units_keep_the_finite_value_they_were_given() {
        assert_eq!(Speed::from_kmh_unchecked(187.5).kmh(), 187.5);
        assert_eq!(Psi::from_psi_unchecked(27.2).psi(), 27.2);
        assert_eq!(Celsius::from_celsius_unchecked(86.0).celsius(), 86.0);
        assert_eq!(LapTime::from_ms_unchecked(91_234).ms(), 91_234);
        assert_eq!(TrackProgress::from_fraction_unchecked(0.0).fraction(), 0.0);
        assert_eq!(TrackProgress::from_fraction_unchecked(1.0).fraction(), 1.0);
        assert_eq!(
            ThrottlePosition::from_fraction_unchecked(0.25).fraction(),
            0.25
        );
        assert_eq!(BrakePosition::from_fraction_unchecked(1.0).fraction(), 1.0);
    }
}
