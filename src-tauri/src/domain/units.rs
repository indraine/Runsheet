use std::fmt;

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
