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
