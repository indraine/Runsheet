import { For, Show } from "solid-js"
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

const CELL = "px-1.5 py-1 text-right tabular-nums"
const HEAD = "px-1.5 py-1 text-right font-semibold text-muted"

/** Electronics, hot pressures at the cursor and fuel use for each compared lap. */
export const SetupCard = (props: {
    rows: readonly SetupRow[]
    stintLapsLeft: number | undefined
}) => (
    <section class="shrink-0 rounded border border-line bg-surface p-3">
        <div class="mb-2 flex items-baseline justify-between gap-3">
            <p class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                {t("app.telemetrySetup")}
            </p>
            <Show when={props.stintLapsLeft !== undefined}>
                <p class="font-mono text-xs text-secondary">
                    {t("app.telemetryStintLeft", {
                        n: props.stintLapsLeft ?? 0,
                    })}
                </p>
            </Show>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full font-mono text-xs">
                <thead>
                    <tr>
                        <th class="px-1.5 py-1 text-left" />
                        <th class={HEAD}>TC</th>
                        <th class={HEAD}>ABS</th>
                        <th class={HEAD} title={t("app.telemetryEngineMap")}>
                            MAP
                        </th>
                        <th class={HEAD} title={t("app.telemetryBrakeBias")}>
                            BB
                        </th>
                        <th class={HEAD}>FL</th>
                        <th class={HEAD}>FR</th>
                        <th class={HEAD}>RL</th>
                        <th class={HEAD}>RR</th>
                        <th class={HEAD} title={t("app.telemetryFuelPerLap")}>
                            L/lap
                        </th>
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
