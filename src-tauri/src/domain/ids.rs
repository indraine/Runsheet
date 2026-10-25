
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub(crate) struct SessionId([u8; 16]);

impl SessionId {
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    pub(crate) const fn as_bytes(self) -> [u8; 16] {
        self.0
    }
}

impl fmt::Display for SessionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_bytes(formatter, &self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub(crate) struct OutingId([u8; 16]);

impl OutingId {
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    pub(crate) const fn as_bytes(self) -> [u8; 16] {
        self.0
    }
}

impl fmt::Display for OutingId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_bytes(formatter, &self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub(crate) struct LapId([u8; 16]);

impl LapId {
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    pub(crate) const fn as_bytes(self) -> [u8; 16] {
        self.0
    }
}

impl fmt::Display for LapId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_bytes(formatter, &self.0)
    }
}

fn write_bytes(formatter: &mut fmt::Formatter<'_>, bytes: &[u8; 16]) -> fmt::Result {
    for byte in bytes {
        write!(formatter, "{byte:02x}")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_round_trip_without_a_uuid_crate() {
        let bytes = [7u8; 16];
        assert_eq!(SessionId::from_bytes(bytes).as_bytes(), bytes);
        assert_eq!(OutingId::from_bytes(bytes).as_bytes(), bytes);
        assert_eq!(LapId::from_bytes(bytes).as_bytes(), bytes);
        assert_eq!(SessionId::default().as_bytes(), [0; 16]);
    }
}
