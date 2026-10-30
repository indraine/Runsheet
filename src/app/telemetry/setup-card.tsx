import { Tooltip } from "@ark-ui/solid/tooltip"
import { For, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { screenPopupClass, screenPositioning } from "~/app/screen-position"
import type { TraceSample } from "~/app/telemetry/sample"
import {
    formatBrakeBias,
    formatFuelPerLap,
    formatPressure,
} from "~/app/telemetry/setup-format"
import { lapTone } from "~/app/telemetry/lap-tone"
import type { Lap } from "~/domain"
import { t } from "~/i18n"
import { cn } from "~/ui"

export type SetupRow = {
    colorIndex: number
    label: string
    lap: Lap
    /** Trace sample at the cursor; hot pressures come from here. */
    sample: TraceSample | undefined
    fuelPerLap: number | undefined
}

const CELL = "px-1.5 py-1 text-right font-mono tabular-nums"
const HEAD = "px-1.5 py-1 text-right font-semibold text-muted"

type ColKey = "tc" | "abs" | "map" | "bb" | "fl" | "fr" | "rl" | "rr" | "fuel"

const COL = {
    tc: {
        short: "TC",
        title: "app.telemetryTc",
        wiki: "app.telemetryTcWiki",
    },
    abs: {
        short: "ABS",
        title: "app.telemetryAbs",
        wiki: "app.telemetryAbsWiki",
    },
    map: {
        short: "MAP",
        title: "app.telemetryEngineMap",
        wiki: "app.telemetryEngineMapWiki",
    },
    bb: {
        short: "BB",
        title: "app.telemetryBrakeBias",
        wiki: "app.telemetryBrakeBiasWiki",
    },
    fl: {
        short: "FL",
        title: "app.telemetryPressureFl",
        wiki: "app.telemetryPressureWiki",
    },
    fr: {
        short: "FR",
        title: "app.telemetryPressureFr",
        wiki: "app.telemetryPressureWiki",
    },
    rl: {
        short: "RL",
        title: "app.telemetryPressureRl",
        wiki: "app.telemetryPressureWiki",
    },
    rr: {
        short: "RR",
        title: "app.telemetryPressureRr",
        wiki: "app.telemetryPressureWiki",
    },
    fuel: {
        short: "L/lap",
        title: "app.telemetryFuelPerLap",
        wiki: "app.telemetryFuelPerLapWiki",
    },
} as const satisfies Record<
    ColKey,
    { short: string; title: `app.${string}`; wiki: `app.${string}` }
>

const TipHead = (props: { col: ColKey }) => {
    const meta = COL[props.col]
    return (
        <th class={HEAD}>
            <WikiTip title={t(meta.title)} wiki={t(meta.wiki)}>
                {meta.short}
            </WikiTip>
        </th>
    )
}

const WikiTip = (props: {
    title: string
    wiki: string
    children: JSX.Element
}) => (
    <Tooltip.Root
        openDelay={180}
        closeDelay={80}
        positioning={screenPositioning({ placement: "top" })}
    >
        <Tooltip.Trigger
            type="button"
            class="inline-flex cursor-help rounded-sm px-0.5 outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20"
        >
            {props.children}
        </Tooltip.Trigger>
        <Portal>
            <Tooltip.Positioner class={screenPopupClass}>
                <Tooltip.Content class="z-50 max-w-sm rounded border border-line bg-surface px-4 py-3 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                    <p class="text-sm font-semibold text-ink">{props.title}</p>
                    <p class="mt-2 font-sans text-sm leading-relaxed text-secondary">
                        {props.wiki}
                    </p>
                </Tooltip.Content>
            </Tooltip.Positioner>
        </Portal>
    </Tooltip.Root>
)

/** Electronics, hot pressures at the cursor and fuel use for each compared lap. */
export const SetupCard = (props: {
    rows: readonly SetupRow[]
    stintLapsLeft: number | undefined
}) => (
    <section class="shrink-0 rounded border border-line bg-surface p-3">
        <div class="mb-2 flex items-baseline justify-between gap-3">
            <p class="text-sm font-semibold tracking-wide text-secondary uppercase">
                {t("app.telemetrySetup")}
            </p>
            <Show when={props.stintLapsLeft !== undefined}>
                <p class="text-xs text-secondary">
                    {t("app.telemetryStintLeft", {
                        n: props.stintLapsLeft ?? 0,
                    })}
                </p>
            </Show>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-xs">
                <thead>
                    <tr>
                        <th class="px-1.5 py-1 text-left" />
                        <TipHead col="tc" />
                        <TipHead col="abs" />
                        <TipHead col="map" />
                        <TipHead col="bb" />
                        <TipHead col="fl" />
                        <TipHead col="fr" />
                        <TipHead col="rl" />
                        <TipHead col="rr" />
                        <TipHead col="fuel" />
                    </tr>
                </thead>
                <tbody>
                    <For each={props.rows}>
                        {row => (
                            <tr class="border-t border-line">
                                <th
                                    class={cn(
                                        "max-w-24 truncate px-1.5 py-1 text-left font-semibold",
                                        lapTone(row.colorIndex).text
                                    )}
                                >
                                    {row.label}
                                </th>
                                <td class={CELL}>{row.lap.tc}</td>
                                <td class={CELL}>{row.lap.abs}</td>
                                <td class={CELL}>{row.lap.engineMap}</td>
                                <td class={CELL}>
                                    {formatBrakeBias(row.lap.brakeBias)}
                                </td>
                                <td class={CELL}>
                                    {formatPressure(row.sample?.pressureFl)}
                                </td>
                                <td class={CELL}>
                                    {formatPressure(row.sample?.pressureFr)}
                                </td>
                                <td class={CELL}>
                                    {formatPressure(row.sample?.pressureRl)}
                                </td>
                                <td class={CELL}>
                                    {formatPressure(row.sample?.pressureRr)}
                                </td>
                                <td class={CELL}>
                                    {formatFuelPerLap(row.fuelPerLap)}
                                </td>
                            </tr>
                        )}
                    </For>
                </tbody>
            </table>
        </div>
    </section>
)
