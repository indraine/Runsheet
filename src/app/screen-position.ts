import type { Placement, PositioningOptions } from "@zag-js/popper"
import { documentZoom } from "~/app/zoom-space"

const SCREEN_PADDING = 12

type Align = "start" | "center" | "end"
type Prefer = "above" | "below"

type AnchorBox = {
    left: number
    top: number
    right: number
    bottom: number
}

export type PlacedFrame = {
    top: number
    left: number
    maxHeight: number
    width: number
}

export const placedFrame = (input: {
    anchor: AnchorBox
    popupWidth: number
    popupHeight: number
    viewportWidth: number
    viewportHeight: number
    zoom: number
    gap: number
    padding: number
    align: Align
    prefer: Prefer
}): PlacedFrame => {
    const zoom = input.zoom > 0 ? input.zoom : 1
    const spaceBelow =
        input.viewportHeight - input.anchor.bottom - input.padding
    const spaceAbove = input.anchor.top - input.padding
    const openAbove =
        input.prefer === "above"
            ? !(spaceAbove < input.popupHeight && spaceBelow > spaceAbove)
            : spaceBelow < input.popupHeight && spaceAbove > spaceBelow
    const room = Math.max(0, (openAbove ? spaceAbove : spaceBelow) - input.gap)
    const used = Math.min(input.popupHeight, room)
    const visualTop = openAbove
        ? input.anchor.top - input.gap - used
        : input.anchor.bottom + input.gap
    const anchorWidth = input.anchor.right - input.anchor.left
    const aligned =
        input.align === "end"
            ? input.anchor.right - input.popupWidth
            : input.align === "center"
              ? input.anchor.left + (anchorWidth - input.popupWidth) / 2
              : input.anchor.left
    const minLeft = input.padding
    const maxLeft = Math.max(
        minLeft,
        input.viewportWidth - input.padding - input.popupWidth
    )
    const visualLeft = Math.min(Math.max(aligned, minLeft), maxLeft)
    return {
        top: visualTop / zoom,
        left: visualLeft / zoom,
        maxHeight: room / zoom,
        width: input.popupWidth / zoom,
    }
}

const alignOf = (placement: string): Align => {
    if (placement.endsWith("-end")) return "end"
    if (placement.endsWith("-start")) return "start"
    return "center"
}

const preferOf = (placement: string): Prefer =>
    placement.startsWith("top") ? "above" : "below"

const visualBox = (element: HTMLElement, zoom: number): DOMRect => {
    const rect = element.getBoundingClientRect()
    const scale =
        element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1
    if (scale > 1.01) return rect
    return new DOMRect(
        rect.x * zoom,
        rect.y * zoom,
        rect.width * zoom,
        rect.height * zoom
    )
}

const triggerFor = (floating: HTMLElement): HTMLElement | null => {
    const id = floating.id
    const triggerId = id.endsWith(":popper")
        ? `${id.slice(0, -":popper".length)}:trigger`
        : id.endsWith(":positioner")
          ? `${id.slice(0, -":positioner".length)}:trigger`
          : null
    if (triggerId) {
        const trigger = document.getElementById(triggerId)
        if (trigger) return trigger
    }
    const scope = floating.getAttribute("data-scope")
    if (!scope) return null
    return document.querySelector<HTMLElement>(
        `[data-scope="${scope}"][data-part="trigger"][data-state="open"]`
    )
}

const placeInScreen = (
    floating: HTMLElement,
    options: { gutter: number; sameWidth: boolean; placement: string }
): void => {
    const anchor = triggerFor(floating)
    if (!anchor) return
    const zoom = documentZoom()
    const anchorBox = visualBox(anchor, zoom)
    const frame = placedFrame({
        anchor: anchorBox,
        popupWidth: options.sameWidth
            ? anchorBox.width
            : floating.offsetWidth * zoom,
        popupHeight:
            Math.max(floating.scrollHeight, floating.offsetHeight) * zoom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        zoom,
        gap: options.gutter,
        padding: SCREEN_PADDING,
        align: alignOf(options.placement),
        prefer: preferOf(options.placement),
    })
    floating.style.setProperty("--x", `${frame.left}px`)
    floating.style.setProperty("--y", `${frame.top}px`)
    floating.style.setProperty("--available-height", `${frame.maxHeight}px`)
    floating.style.setProperty(
        "--available-width",
        `${Math.max(0, (window.innerWidth - SCREEN_PADDING * 2) / zoom)}px`
    )
    floating.style.removeProperty("max-height")
    floating.style.removeProperty("overflow-y")
    if (options.sameWidth) {
        floating.style.setProperty("--reference-width", `${frame.width}px`)
    }
}

export const screenPopupClass = "z-50"

export const screenPopupOverModalClass = "z-[60]"

export const screenMenuListClass =
    "max-h-(--available-height) overflow-y-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]"

export const screenPositioning = (options: {
    placement: Placement
    gutter?: number
    sameWidth?: boolean
}): PositioningOptions => {
    const gutter = options.gutter ?? 8
    const sameWidth = options.sameWidth ?? false
    return {
        strategy: "fixed",
        placement: options.placement,
        gutter,
        flip: true,
        slide: true,
        overflowPadding: SCREEN_PADDING,
        fitViewport: false,
        sameWidth,
        updatePosition: async ({ updatePosition, floatingElement }) => {
            await updatePosition()
            if (!floatingElement) return
            placeInScreen(floatingElement, {
                gutter,
                sameWidth,
                placement: options.placement,
            })
        },
    }
}
