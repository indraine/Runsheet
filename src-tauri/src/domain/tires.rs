
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct TireSet<T> {
    pub front_left: T,
    pub front_right: T,
    pub rear_left: T,
    pub rear_right: T,
}

impl<T> TireSet<T> {
    pub(crate) const fn new(front_left: T, front_right: T, rear_left: T, rear_right: T) -> Self {
        Self {
            front_left,
            front_right,
            rear_left,
            rear_right,
        }
    }

    pub(crate) fn map<U>(self, mut convert: impl FnMut(T) -> U) -> TireSet<U> {
        TireSet {
            front_left: convert(self.front_left),
            front_right: convert(self.front_right),
            rear_left: convert(self.rear_left),
            rear_right: convert(self.rear_right),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_keeps_each_corner() {
        let pressures = TireSet::new(1, 2, 3, 4);
        let scaled = pressures.map(|psi| psi * 10);
        assert_eq!(scaled.front_left, 10);
        assert_eq!(scaled.front_right, 20);
        assert_eq!(scaled.rear_left, 30);
        assert_eq!(scaled.rear_right, 40);
    }
}
