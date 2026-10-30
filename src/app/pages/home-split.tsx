import { Maximize2, Minimize2 } from "lucide-solid"
import { createSignal, type JSX } from "solid-js"
import {
    DEFAULT_SPLIT,
    homeLayout,
    resetHomeSplit,
    setHomeSplit,
    toggleHomePane,
    type HomeExpanded,
    type HomePane,
} from "~/app/home-layout"
import { layoutPoint } from "~/app/zoom-space"
import { t } from "~/i18n"
import { buttonVariants, cn } from "~/ui"

/** Width of the drag handle between the panes: Tailwind `w-6`. */
const HANDLE_PX = 24

/** Keyboard step of the handle, as a share of the page width. */
const KEY_STEP = 0.02

/**
 * Two panes with a drag handle between them. One pane can fill the whole
 * page; the other stays mounted, only hidden, so it keeps its state.
 * `expanded` comes from the caller: a pane without anything to expand into
 * must not leave the page stuck on the other one.
 */
export function HomeSplit(props: {
    expanded: HomeExpanded
    left: JSX.Element
    right: JSX.Element
}) {
    let host: HTMLDivElement | undefined
    const split = () => homeLayout().split
    const single = () => props.expanded !== "none"

    return (
        <div
            ref={host}
            class="flex min-h-0 min-w-0 flex-1"
            style={{ "--home-split": `${split() * 100}%` }}
        >
            <div
                class={cn(
                    "flex min-h-0 flex-1 flex-col",
                    single() ? "min-w-0" : "min-w-[20rem]",
                    props.expanded === "right" && "hidden"
                )}
            >
                {props.left}
            </div>
            <Handle host={() => host} hidden={single()} />
            <div
                class={cn(
                    "flex min-h-0 flex-col",
                    single()
                        ? "min-w-0 flex-1"
                        : "min-w-[22rem] flex-none basis-(--home-split)",
                    props.expanded === "left" && "hidden"
                )}
            >
                {props.right}
            </div>
        </div>
    )
}

function Handle(props: {
    host: () => HTMLDivElement | undefined
    hidden: boolean
}) {
    const [dragging, setDragging] = createSignal(false)

    const moveTo = (event: PointerEvent) => {
        const host = props.host()
        if (!host || host.clientWidth <= 0) return
        const { x } = layoutPoint(host, event.clientX, event.clientY)
        const right = host.clientWidth - x - HANDLE_PX / 2
        setHomeSplit(right / host.clientWidth)
    }

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("app.paneResize")}
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(homeLayout().split * 100)}
            tabindex={0}
            class={cn(
                "group flex w-6 shrink-0 cursor-col-resize touch-none items-stretch justify-center outline-none select-none",
                props.hidden && "hidden"
            )}
            onPointerDown={event => {
                if (event.button !== 0) return
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(true)
            }}
            onPointerMove={event => {
                if (dragging()) moveTo(event)
            }}
            onPointerUp={event => {
                setDragging(false)
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                }
            }}
            onPointerCancel={() => setDragging(false)}
            onDblClick={resetHomeSplit}
            onKeyDown={event => {
                const grow =
                    event.key === "ArrowLeft"
                        ? KEY_STEP
                        : event.key === "ArrowRight"
                          ? -KEY_STEP
                          : 0
                if (grow !== 0) {
                    event.preventDefault()
                    setHomeSplit(homeLayout().split + grow)
                } else if (event.key === "Enter") {
                    event.preventDefault()
                    setHomeSplit(DEFAULT_SPLIT)
                }
            }}
        ></div>
    )
}

/** Button in a pane's header: fill the page with this pane, or restore. */
export function PaneToggle(props: { pane: HomePane; class?: string }) {
    const expanded = () => homeLayout().expanded === props.pane
    const label = () =>
        expanded() ? t("app.paneRestore") : t("app.paneExpand")

    return (
        <button
            type="button"
            class={cn(
                buttonVariants({ variant: "ghost", size: "iconSm" }),
                props.class
            )}
            aria-label={label()}
            aria-pressed={expanded()}
            title={label()}
            onClick={() => toggleHomePane(props.pane)}
        >
            {expanded() ? (
                <Minimize2 class="size-4" strokeWidth={1.75} />
            ) : (
                <Maximize2 class="size-4" strokeWidth={1.75} />
            )}
        </button>
    )
}
