//! Поток чтения shared memory ACC.
//! Пакет в лог не пишется: на появлении и потере связи — одна строка.

#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
use acc_shared_memory_rs::ACCSharedMemory;

/// Пауза между попытками открыть память, пока ACC не запущена.
#[cfg(windows)]
const RETRY_AFTER: Duration = Duration::from_millis(500);

/// Пауза между чтениями, когда память уже открыта.
#[cfg(windows)]
const POLL_AFTER: Duration = Duration::from_millis(16);

/// Что сказать в лог при смене связи. Повтор того же состояния молчит.
#[derive(Debug, PartialEq, Eq)]
enum LinkNotice {
    Unavailable,
    /// На этой системе память не открывается, поэтому ветка есть только в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    Linked,
    Lost,
}

impl LinkNotice {
    const fn line(self) -> &'static str {
        match self {
            Self::Unavailable => "ACC недоступна",
            Self::Linked => "ACC на связи",
            Self::Lost => "связь с ACC потеряна",
        }
    }
}

/// Край связи. Пока состояние не меняется, новых строк нет.
#[derive(Debug, Default)]
struct Link {
    up: bool,
    told_down: bool,
}

impl Link {
    /// На этой системе память не открывается, поэтому переход есть только в тесте и на Windows.
    #[cfg_attr(not(any(windows, test)), allow(dead_code))]
    fn note_up(&mut self) -> Option<LinkNotice> {
        if self.up {
            return None;
        }
        self.up = true;
        self.told_down = false;
        Some(LinkNotice::Linked)
    }

    fn note_down(&mut self) -> Option<LinkNotice> {
        if self.up {
            self.up = false;
            self.told_down = true;
            return Some(LinkNotice::Lost);
        }
        if self.told_down {
            return None;
        }
        self.told_down = true;
        Some(LinkNotice::Unavailable)
    }
}

fn report(notice: Option<LinkNotice>) {
    if let Some(notice) = notice {
        eprintln!("{}", notice.line());
    }
}

pub(crate) fn run() {
    #[cfg(windows)]
    poll();

    // Имя памяти ACC существует только на Windows. Ждать её здесь нечего.
    #[cfg(not(windows))]
    wait_without_acc();
}

#[cfg(not(windows))]
fn wait_without_acc() -> ! {
    let mut link = Link::default();
    report(link.note_down());
    loop {
        std::thread::park();
    }
}

#[cfg(windows)]
fn poll() -> ! {
    let mut link = Link::default();
    loop {
        let mut acc = match ACCSharedMemory::new() {
            Ok(acc) => acc,
            Err(_) => {
                report(link.note_down());
                std::thread::sleep(RETRY_AFTER);
                continue;
            }
        };

        report(link.note_up());

        while acc.read_shared_memory().is_ok() {
            std::thread::sleep(POLL_AFTER);
        }

        report(link.note_down());
    }
}
