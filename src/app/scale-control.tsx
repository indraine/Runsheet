import { createEffect, createSignal } from "solid-js"
import { Minus, Plus, RotateCcw } from "lucide-solid"
import {
    DEFAULT_SCALE,
    SCALE_MAX,
    SCALE_MIN,
    clampScale,
    setUiScale,
    uiScale,
    zoomBy,
} from "~/app/scale"
import { t } from "~/i18n"
import { buttonVariants, cn } from "~/ui"

const scaleButtonClass = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "size-6"
)

export const ScaleControl = () => {
    const [text, setText] = createSignal(String(uiScale()))
    let revertOnBlur = false

    createEffect(() => {
        setText(String(uiScale()))
    })

    const commit = () => {
        const parsed = Number(text().trim())
        if (!Number.isFinite(parsed)) {
            setText(String(uiScale()))
            return
        }
        const next = clampScale(parsed)
        setUiScale(next)
        setText(String(next))
    }

    return (
        <div class="flex items-center gap-1">
            <span class="mr-1 font-mono text-[12px] text-secondary">
                {t("app.scale")}
            </span>
            <button
                type="button"
                class={scaleButtonClass}
                aria-label={t("app.scaleDown")}
                disabled={uiScale() <= SCALE_MIN}
                onMouseDown={commit}
                onClick={() => zoomBy(-1)}
            >
                <Minus class="size-3.5" strokeWidth={1.75} />
            </button>
            <label class="flex h-6 items-center rounded border border-line bg-inset pr-1">
                <input
                    type="text"
                    inputMode="numeric"
                    aria-label={t("app.scale")}
                    class="w-8 bg-transparent text-center font-mono text-[12px] text-ink outline-none"
                    value={text()}
                    onFocus={event => event.currentTarget.select()}
                    onInput={event => setText(event.currentTarget.value)}
                    onBlur={() => {
                        if (revertOnBlur) {
                            revertOnBlur = false
                            setText(String(uiScale()))
                            return
                        }
                        commit()
                    }}
                    onKeyDown={(event: KeyboardEvent) => {
                        if (event.key === "Escape") {
                            revertOnBlur = true
                            ;(event.currentTarget as HTMLInputElement).blur()
                            return
                        }
                        if (event.key === "Enter") {
                            commit()
                            ;(event.currentTarget as HTMLInputElement).blur()
                        }
                    }}
                />
                <span class="font-mono text-[12px] text-secondary">%</span>
            </label>
            <button
                type="button"
                class={scaleButtonClass}
                aria-label={t("app.scaleUp")}
                disabled={uiScale() >= SCALE_MAX}
                onMouseDown={commit}
                onClick={() => zoomBy(1)}
            >
                <Plus class="size-3.5" strokeWidth={1.75} />
            </button>
            <button
                type="button"
                class={scaleButtonClass}
                aria-label={t("app.scaleReset")}
                disabled={uiScale() === DEFAULT_SCALE}
                onClick={() => setUiScale(DEFAULT_SCALE)}
            >
                <RotateCcw class="size-3" strokeWidth={1.75} />
            </button>
        </div>
    )
}
