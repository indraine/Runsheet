import { Show } from "solid-js"
import wheelMark from "~/assets/steering-wheel.png"
import {
    formatSteerDeg,
    wheelRotationDeg,
    type TraceSample,
} from "~/app/telemetry/sample"
import { t } from "~/i18n"
import { cn } from "~/ui"

export const InstantHud = (props: {
    primary: TraceSample | undefined
    reference: TraceSample | undefined
    primarySteerPeak: number
    referenceSteerPeak: number
}) => (
    <section class="shrink-0 rounded border border-line bg-surface p-4">
        <Show
            when={props.primary}
            fallback={
                <p class="text-sm text-muted">{t("app.telemetryNoTrace")}</p>
            }
        >
            {point => (
                <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <PedalStack
                        label={t("app.telemetryThrottle")}
                        primary={point().throttle}
                        reference={props.reference?.throttle}
                        side="left"
                    />
                    <SteeringCluster
                        primarySteer={wheelRotationDeg(
                            point().steer,
                            props.primarySteerPeak
                        )}
                        referenceSteer={
                            props.reference
                                ? wheelRotationDeg(
                                      props.reference.steer,
                                      props.referenceSteerPeak
                                  )
                                : undefined
                        }
                        speed={point().speed}
                        referenceSpeed={props.reference?.speed}
                    />
                    <PedalStack
                        label={t("app.telemetryBrake")}
                        primary={point().brake}
                        reference={props.reference?.brake}
                        side="right"
                    />
                </div>
            )}
        </Show>
    </section>
)

const PedalStack = (props: {
    label: string
    primary: number
    reference?: number
    side: "left" | "right"
}) => (
    <div
        class={cn(
            "flex flex-col gap-2",
            props.side === "right" ? "items-end" : "items-start"
        )}
    >
        <p class="text-sm tracking-wide text-secondary uppercase">
            {props.label}
        </p>
        <div
            class={cn(
                "flex h-36 items-end gap-3",
                props.side === "right" && "flex-row-reverse"
            )}
        >
            <VerticalBar value={props.primary} tone="a" caption="A" />
            <Show when={props.reference !== undefined}>
                <VerticalBar
                    value={props.reference ?? 0}
                    tone="b"
                    caption="B"
                />
            </Show>
        </div>
    </div>
)

const VerticalBar = (props: {
    value: number
    tone: "a" | "b"
    caption: string
}) => (
    <div class="flex h-full flex-col items-center justify-end gap-1">
        <div class="relative flex h-full w-8 items-end overflow-hidden rounded-sm bg-line/60">
            <div
                class={cn(
                    "w-full rounded-sm",
                    props.tone === "a" ? "bg-lap-a" : "bg-lap-b"
                )}
                style={{ height: `${clamp01(props.value) * 100}%` }}
            />
        </div>
        <span class="text-xs text-muted">{props.caption}</span>
    </div>
)

const SteeringCluster = (props: {
    primarySteer: number
    referenceSteer?: number
    speed: number
    referenceSpeed?: number
}) => (
    <div class="flex items-end justify-center gap-4">
        <WheelReadout
            steer={props.primarySteer}
            speed={props.speed}
            tone="a"
            caption="A"
        />
        <Show when={props.referenceSteer !== undefined}>
            <WheelReadout
                steer={props.referenceSteer ?? 0}
                speed={props.referenceSpeed ?? 0}
                tone="b"
                caption="B"
            />
        </Show>
    </div>
)

const WheelReadout = (props: {
    steer: number
    speed: number
    tone: "a" | "b"
    caption: string
}) => (
    <div class="flex flex-col items-center gap-1">
        <div class="relative size-36">
            <img
                src={wheelMark}
                alt=""
                draggable={false}
                class="size-full origin-center select-none object-contain"
                style={{ rotate: `${props.steer}deg` }}
            />
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                    class={cn(
                        "font-mono text-[22px] font-bold leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]",
                        props.tone === "a" ? "text-lap-a" : "text-lap-b"
                    )}
                >
                    {props.caption}
                </span>
            </div>
        </div>
        <span
            class={cn(
                "font-mono text-base font-semibold",
                props.tone === "a" ? "text-lap-a" : "text-lap-b"
            )}
        >
            {props.speed.toFixed(0)}
        </span>
        <span class="font-mono text-xs text-secondary">
            {formatSteerDeg(props.steer)}
        </span>
    </div>
)

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
