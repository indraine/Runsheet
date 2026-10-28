const POPUP_SELECTOR = [
    "[role='dialog'][aria-modal='true']",
    "[data-scope='select'][data-state='open']",
    "[data-scope='popover'][data-state='open']",
    "[data-scope='menu'][data-state='open']",
    "[data-scope='date-picker'][data-state='open']",
].join(", ")

type PointerSurface = {
    hasPointerCapture: (pointerId: number) => boolean
    releasePointerCapture: (pointerId: number) => void
}

type PointerHost = PointerSurface & {
    querySelector: (selector: string) => PointerSurface | null
}

/** A dialog or an open Ark popup is on screen, so a chart must not keep the pointer. */
export const popupBlocksCanvas = (
    root: { querySelector: (selector: string) => unknown } = document
): boolean => root.querySelector(POPUP_SELECTOR) !== null

/**
 * Drop capture on the plot host and its canvas.
 *
 * The host captures a drag. The canvas can still hold the browser's implicit
 * capture, and a later click then never reaches a select.
 */
export const releaseHeldPointer = (
    host: PointerHost,
    pointerId: number
): void => {
    const canvas = host.querySelector("canvas")
    for (const node of [host, canvas]) {
        if (!node?.hasPointerCapture(pointerId)) continue
        node.releasePointerCapture(pointerId)
    }
}

type Guard = {
    host: PointerHost
    held: Set<number>
    onSuspend?: () => void
}

const guards = new Set<Guard>()
let observer: MutationObserver | undefined
let listening = false

const release = (guard: Guard, pointerId: number) => {
    releaseHeldPointer(guard.host, pointerId)
    guard.held.delete(pointerId)
}

const suspend = (guard: Guard) => {
    if (guard.held.size === 0) return
    for (const pointerId of guard.held) {
        releaseHeldPointer(guard.host, pointerId)
    }
    guard.held.clear()
    guard.onSuspend?.()
}

const onWindowUp = (event: PointerEvent) => {
    for (const guard of guards) release(guard, event.pointerId)
}

const ensureWatch = () => {
    if (listening) return
    listening = true
    window.addEventListener("pointerup", onWindowUp, true)
    window.addEventListener("pointercancel", onWindowUp, true)
    observer = new MutationObserver(() => {
        if (!popupBlocksCanvas()) return
        for (const guard of guards) suspend(guard)
    })
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-state", "aria-modal", "role"],
    })
}

const stopWatch = () => {
    if (guards.size > 0) return
    observer?.disconnect()
    observer = undefined
    window.removeEventListener("pointerup", onWindowUp, true)
    window.removeEventListener("pointercancel", onWindowUp, true)
    listening = false
}

/**
 * Release pointer capture when the button comes up, when a select or dialog
 * opens, and when the returned function runs from `onCleanup`.
 *
 * `onSuspend` runs only when a popup takes the pointer away mid-gesture.
 */
export const guardPointerCapture = (
    host: HTMLElement,
    onSuspend?: () => void
): (() => void) => {
    const guard: Guard = { host, held: new Set(), onSuspend }
    guards.add(guard)
    ensureWatch()
    const onDown = (event: PointerEvent) => {
        guard.held.add(event.pointerId)
        if (popupBlocksCanvas()) suspend(guard)
    }
    host.addEventListener("pointerdown", onDown, true)
    return () => {
        suspend(guard)
        guards.delete(guard)
        host.removeEventListener("pointerdown", onDown, true)
        stopWatch()
    }
}
