/** Zoom currently painted on the document. An empty value means 100%. */
export const documentZoom = (): number => {
    const zoom = Number(getComputedStyle(document.documentElement).zoom)
    return zoom > 0 ? zoom : 1
}

/**
 * Map a viewport coordinate into the element's layout pixels.
 *
 * `getBoundingClientRect()` sometimes omits CSS zoom while pointer events
 * stay in visual pixels. Layout pixels are what the canvases draw in.
 *
 * zoom 1.5, rect not yet scaled, click on the right edge of a 200px box
 * whose visual origin is 150:
 * layoutOffset(450, 100, 200, 200, 1.5) === 200
 */
export const layoutOffset = (
    client: number,
    origin: number,
    boxSize: number,
    layoutSize: number,
    zoom: number
): number => {
    const includesZoom = layoutSize > 0 && boxSize / layoutSize > 1.01
    const visualOrigin = includesZoom ? origin : origin * zoom
    const visualPerLayout = includesZoom ? boxSize / layoutSize : zoom
    if (visualPerLayout <= 0) return 0
    return (client - visualOrigin) / visualPerLayout
}

/** Convert a pointer delta from visual pixels into layout pixels. */
export const layoutDelta = (
    clientDelta: number,
    boxSize: number,
    layoutSize: number,
    zoom: number
): number => {
    const includesZoom = layoutSize > 0 && boxSize / layoutSize > 1.01
    const visualPerLayout = includesZoom ? boxSize / layoutSize : zoom
    if (visualPerLayout <= 0) return 0
    return clientDelta / visualPerLayout
}

export const layoutPoint = (
    host: HTMLElement,
    clientX: number,
    clientY: number
): { x: number; y: number } => {
    const box = host.getBoundingClientRect()
    const zoom = documentZoom()
    return {
        x: layoutOffset(clientX, box.left, box.width, host.clientWidth, zoom),
        y: layoutOffset(clientY, box.top, box.height, host.clientHeight, zoom),
    }
}

export const layoutTravel = (
    host: HTMLElement,
    dx: number,
    dy: number
): { x: number; y: number } => {
    const box = host.getBoundingClientRect()
    const zoom = documentZoom()
    return {
        x: layoutDelta(dx, box.width, host.clientWidth, zoom),
        y: layoutDelta(dy, box.height, host.clientHeight, zoom),
    }
}
