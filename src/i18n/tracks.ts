import type { Locale } from "~/i18n/locale";
import { locale } from "~/i18n/locale";

/**
 * Human names for `statics.track`.
 * Keys are the track ids from the ACC server track list.
 * An unknown code is shown as-is.
 */
const en = {
  barcelona: "Barcelona",
  brands_hatch: "Brands Hatch",
  cota: "COTA",
  donington: "Donington",
  hungaroring: "Hungaroring",
  imola: "Imola",
  indianapolis: "Indianapolis",
  kyalami: "Kyalami",
  laguna_seca: "Laguna Seca",
  misano: "Misano",
  monza: "Monza",
  mount_panorama: "Mount Panorama",
  nurburgring: "Nürburgring",
  nurburgring_24h: "Nürburgring 24h",
  oulton_park: "Oulton Park",
  paul_ricard: "Paul Ricard",
  red_bull_ring: "Red Bull Ring",
  silverstone: "Silverstone",
  snetterton: "Snetterton",
  spa: "Spa",
  suzuka: "Suzuka",
  valencia: "Valencia",
  watkins_glen: "Watkins Glen",
  zandvoort: "Zandvoort",
  zolder: "Zolder",
};

const ru: typeof en = {
  barcelona: "Барселона",
  brands_hatch: "Брэндс-Хэтч",
  cota: "Остин",
  donington: "Донингтон",
  hungaroring: "Хунгароринг",
  imola: "Имола",
  indianapolis: "Индианаполис",
  kyalami: "Кьялами",
  laguna_seca: "Лагуна-Сека",
  misano: "Мизано",
  monza: "Монца",
  mount_panorama: "Маунт-Панорама",
  nurburgring: "Нюрбургринг",
  nurburgring_24h: "Нордшляйфе",
  oulton_park: "Оултон-Парк",
  paul_ricard: "Поль-Рикар",
  red_bull_ring: "Ред-Булл-Ринг",
  silverstone: "Сильверстоун",
  snetterton: "Снеттертон",
  spa: "Спа",
  suzuka: "Судзука",
  valencia: "Валенсия",
  watkins_glen: "Уоткинс-Глен",
  zandvoort: "Зандворт",
  zolder: "Золдер",
};

const trackDict: Record<Locale, typeof en> = { en, ru };

export function trackName(code: string): string {
  const names: Record<string, string> = trackDict[locale()];
  return names[code] ?? code;
}
