
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
