//! Повреждение кузова по зонам, от 0 до 1.

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct BodyDamage {
    pub front: f32,
    pub rear: f32,
    pub left: f32,
    pub right: f32,
    pub center: f32,
}
