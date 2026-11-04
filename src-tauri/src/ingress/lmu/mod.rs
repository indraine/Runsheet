//! Адаптер Le Mans Ultimate. На Windows кадр `kerb` копируется в свою страницу,
//! и только она проходит санитизацию. Опрос в пайплайн пока не подключён:
//! выбор сима появится вместе с интерфейсом.

mod raw;
mod sanitize;

#[cfg(windows)]
mod bridge;

/// Нет машины игрока в кадре, поэтому тика нет. Ошибка границы — это уже битые числа.
///
/// `packet_id` задаёт вызывающий: повтор того же номера даёт устаревший кадр.
/// Пайплайн вызовет это, когда интерфейс сможет выбрать сим. До тех пор функция не опрашивается.
#[cfg(windows)]
#[allow(dead_code)]
pub(crate) fn decode_frame(
    previous_packet_id: Option<i32>,
    frame: &kerb::lmu::LmuFrame,
    packet_id: i32,
) -> Result<Option<crate::ingress::PageOutcome>, crate::ingress::BoundaryError> {
    let Some(page) = bridge::page_from_frame(frame, packet_id) else {
        return Ok(None);
    };
    sanitize::decode(previous_packet_id, &page).map(Some)
}
