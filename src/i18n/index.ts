import { flatten, resolveTemplate, translator } from "@solid-primitives/i18n"
import { createMemo, createRoot } from "solid-js"
import { appDict } from "~/i18n/app"
import { locale } from "~/i18n/locale"

// App-lifetime singleton: owned by a detached root so Solid doesn't warn about an ownerless memo.
const dict = createRoot(() =>
    createMemo(() => flatten({ app: appDict[locale()] }))
)

export const t = translator(dict, resolveTemplate)

export { carName } from "~/i18n/cars"
export { fmt } from "~/i18n/fmt"
export { trackCodes, trackName } from "~/i18n/tracks"
