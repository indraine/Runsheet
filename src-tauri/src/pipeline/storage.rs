//! Журнал сырых кадров на диске.
//!
//! Это не база сессий и не база кругов: строк трассы, машины и идентификаторов
//! круга в файле нет. Пока сессии нет или игра в `Off`, кадры сюда не попадают.
//! Имя файла — `{session_id}/{first_packet}-{last_packet}.bin`.

use std::path::{Path, PathBuf};

use tokio::task::JoinHandle;

use crate::domain::SessionId;
use crate::ingress::CleanTick;

/// Мягкий порог: батч отдаётся на запись, если предыдущая уже закончилась.
const SOFT_FLUSH: usize = 500;

/// Жёсткий потолок. Дальше потребитель ждёт конец предыдущей записи.
const HARD_FLUSH: usize = 1_000;

/// Кадры одной сессии, которые пора писать.
#[derive(Debug)]
pub(crate) struct JournalBatch {
    pub session_id: SessionId,
    pub frames: Vec<CleanTick>,
}

/// Накопитель до порога. Сам на диск не пишет.
#[derive(Debug, Default)]
pub(crate) struct FrameBatch {
    bound: Option<SessionId>,
    frames: Vec<CleanTick>,
}

impl FrameBatch {
    /// Кладёт кадр. Смена сессии сначала отдаёт хвост предыдущей, даже короткий.
    ///
    /// На 500 кадрах батч готов, если `write_busy == false`. На 1000 — готов
    /// в любом случае: вызывающий дожидается предыдущей записи и не копит дальше.
    pub(crate) fn push(
        &mut self,
        session: SessionId,
        tick: CleanTick,
        write_busy: bool,
    ) -> Vec<JournalBatch> {
        let mut ready = Vec::new();
        if self.bound.is_some_and(|current| current != session)
            && let Some(batch) = self.take()
        {
            ready.push(batch);
        }
        self.bound = Some(session);
        self.frames.push(tick);
        let hard = self.frames.len() >= HARD_FLUSH;
        let soft = self.frames.len() >= SOFT_FLUSH && !write_busy;
        if (hard || soft)
            && let Some(batch) = self.take()
        {
            ready.push(batch);
        }
        ready
    }

    /// Хвост, когда сессия закрылась и нового кадра нет.
    pub(crate) fn take(&mut self) -> Option<JournalBatch> {
        if self.frames.is_empty() {
            return None;
        }
        let session_id = self.bound.take().expect("кадры журнала привязаны к сессии");
        Some(JournalBatch {
            session_id,
            frames: std::mem::take(&mut self.frames),
        })
    }
}

/// Фоновая запись батчей. Следующий жёсткий порог ждёт предыдущий `JoinHandle`.
pub(crate) struct Journal {
    root: PathBuf,
    inflight: Option<JoinHandle<()>>,
}

impl Journal {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            root,
            inflight: None,
        }
    }

    pub(crate) fn busy(&self) -> bool {
        self.inflight
            .as_ref()
            .is_some_and(|handle| !handle.is_finished())
    }

    pub(crate) async fn wait(&mut self) {
        if let Some(handle) = self.inflight.take() {
            let _ = handle.await;
        }
    }

    pub(crate) fn spawn(&mut self, batch: JournalBatch) {
        let root = self.root.clone();
        self.inflight = Some(tokio::spawn(async move {
            if let Err(error) = write_batch(&root, &batch).await {
                eprintln!("журнал кадров не записан: {error}");
            }
        }));
    }
}

/// Пишет батч. Каталог сессии создаётся здесь, не пробой старта.
pub(crate) async fn write_batch(root: &Path, batch: &JournalBatch) -> std::io::Result<()> {
    let session = uuid::Uuid::from_bytes(batch.session_id.as_bytes());
    let first = batch
        .frames
        .first()
        .map(|frame| frame.physics.packet_id)
        .unwrap_or(0);
    let last = batch
        .frames
        .last()
        .map(|frame| frame.physics.packet_id)
        .unwrap_or(first);
    let dir = root.join(session.to_string());
    tokio::fs::create_dir_all(&dir).await?;
    let path = dir.join(format!("{first}-{last}.bin"));
    tokio::fs::write(path, encode(&batch.frames)).await
}

/// Физика кадра без строк. Трасса и машина в файл не входят.
fn encode(frames: &[CleanTick]) -> Vec<u8> {
    let mut out = Vec::with_capacity(frames.len() * 76);
    for frame in frames {
        let physics = &frame.physics;
        write_i32(&mut out, physics.packet_id);
        write_f32(&mut out, physics.speed.kmh());
        write_f32(&mut out, physics.throttle.fraction());
        write_f32(&mut out, physics.brake.fraction());
        write_f32(&mut out, physics.steer_deg);
        write_f32(&mut out, physics.progress.fraction());
        write_f32(&mut out, physics.fuel_l);
        write_f32(&mut out, physics.g_long);
        write_f32(&mut out, physics.g_lat);
        write_f32(&mut out, physics.ground_x);
        write_f32(&mut out, physics.ground_z);
        write_f32(&mut out, physics.pressure.front_left.psi());
        write_f32(&mut out, physics.pressure.front_right.psi());
        write_f32(&mut out, physics.pressure.rear_left.psi());
        write_f32(&mut out, physics.pressure.rear_right.psi());
        write_f32(&mut out, physics.brake_temp.front_left.celsius());
        write_f32(&mut out, physics.brake_temp.front_right.celsius());
        write_f32(&mut out, physics.brake_temp.rear_left.celsius());
        write_f32(&mut out, physics.brake_temp.rear_right.celsius());
    }
    out
}

fn write_i32(out: &mut Vec<u8>, value: i32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn write_f32(out: &mut Vec<u8>, value: f32) {
    out.extend_from_slice(&value.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::fixture::TickDraft;

    fn frame(packet_id: i32) -> CleanTick {
        TickDraft {
            packet_id,
            track: "monza".to_owned(),
            ..TickDraft::default()
        }
        .build()
    }

    #[test]
    fn soft_flush_at_500_and_hard_flush_at_1000_while_a_write_runs() {
        let mut batch = FrameBatch::default();
        let session = SessionId::from_bytes([1; 16]);
        for id in 0..499 {
            assert!(batch.push(session, frame(id), false).is_empty());
        }
        let soft = batch.push(session, frame(499), false);
        assert_eq!(soft.len(), 1);
        assert_eq!(soft[0].frames.len(), SOFT_FLUSH);
        assert_eq!(soft[0].frames[0].physics.packet_id, 0);
        assert_eq!(soft[0].frames[499].physics.packet_id, 499);

        for id in 500..1_499 {
            assert!(
                batch.push(session, frame(id), true).is_empty(),
                "packet {id} stays queued while the previous write runs"
            );
        }
        let hard = batch.push(session, frame(1_499), true);
        assert_eq!(hard.len(), 1);
        assert_eq!(hard[0].frames.len(), HARD_FLUSH);
        assert_eq!(hard[0].frames[0].physics.packet_id, 500);
        assert_eq!(hard[0].frames[999].physics.packet_id, 1_499);
    }

    #[test]
    fn encoded_batch_has_no_track_string() {
        let bytes = encode(&[frame(4)]);
        assert!(!bytes.windows(5).any(|window| window == b"monza"));
        assert!(frame(4).physics.speed.kmh().is_finite());
    }

    #[tokio::test]
    async fn journal_names_the_file_by_session_and_packet_range() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("runsheet-journal-{nanos}"));
        let _ = std::fs::remove_dir_all(&root);
        let session = SessionId::from_bytes([9; 16]);
        let mut journal = Journal::new(root.clone());
        journal.spawn(JournalBatch {
            session_id: session,
            frames: vec![frame(10), frame(12)],
        });
        journal.wait().await;

        let dir = root.join(uuid::Uuid::from_bytes(session.as_bytes()).to_string());
        let path = dir.join("10-12.bin");
        let bytes = std::fs::read(&path).expect("batch file");
        assert!(!bytes.windows(5).any(|window| window == b"monza"));
        assert!(!bytes.windows(3).any(|window| window == b"spa"));
        std::fs::remove_dir_all(&root).expect("scratch dir");
    }
}
