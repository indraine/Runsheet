import { flatten, resolveTemplate, translator } from "@solid-primitives/i18n";
import { createMemo } from "solid-js";
import { locale } from "~/i18n/locale";
import { appDict } from "~/i18n/app";

const dict = createMemo(() => flatten({ app: appDict[locale()] }));

export const t = translator(dict, resolveTemplate);
