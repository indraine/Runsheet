import type { Locale } from "~/i18n/locale";

const en = {
  wordmark: "Runsheet",
  accOffline: "Assetto Corsa Competizione is not running",
  backToTimeline: "To timeline",
  welcomeSlogan: "Drove! Recorded! Reviewed!",
  welcomeBody:
    "Automatic session recording for the\nAssetto Corsa Competizione simulator.",
  start: "Start",
  frequency: "Frequency",
  packet: "Packet",
  hz: "Hz",
  empty: "—",
};

const ru: typeof en = {
  wordmark: "Runsheet",
  accOffline: "Assetto Corsa Competizione не запущена",
  backToTimeline: "К таймлайну",
  welcomeSlogan: "Проехал! Записал! Разобрал!",
  welcomeBody:
    "Программа автоматической записи сессий заездов в\nсимуляторе Assetto Corsa Competizione.",
  start: "Начать",
  frequency: "Частота",
  packet: "Пакет",
  hz: "Гц",
  empty: "—",
};

export const appDict: Record<Locale, typeof en> = { en, ru };
