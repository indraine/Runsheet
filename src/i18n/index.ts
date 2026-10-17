import { flatten, resolveTemplate, translator } from "@solid-primitives/i18n";
import { createMemo } from "solid-js";
import { appDict } from "~/i18n/app";
import { locale } from "~/i18n/locale";

const dict = createMemo(() => flatten({ app: appDict[locale()] }));

export const t = translator(dict, resolveTemplate);

export { carName } from "~/i18n/cars";
export { fmt } from "~/i18n/fmt";
export { trackName } from "~/i18n/tracks";
