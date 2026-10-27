const MAP_KEY = "runsheet.telemetry-map"
const ZONE_KEY = "runsheet.telemetry-zone"

/** Metres of slack when a saved turn is matched to a freshly computed zone. */
const ZONE_MATCH_M = 0.5

/** Camera the telemetry map should reopen with. */
export type StoredMapView = {
    following: boolean
    followBias: number
    zoom: number
    panX: number
    panY: number
}

/** Divergence section last opened on the charts. */
export type StoredZone = {
    startM: number
    endM: number
}

/**
 * Read a stored map camera.
 *
 * A broken payload is dropped so a corrupt entry cannot pin the camera
 * at a nonsense scale.
 *
 * @example
 * ```ts
 * parseStoredMapView(
 *   '{"following":false,"followBias":1,"zoom":1,"panX":0,"panY":0}'
 * )
 * // { following: false, followBias: 1, zoom: 1, panX: 0, panY: 0 }
 * ```
 */
export const parseStoredMapView = (
    raw: string | null
): StoredMapView | undefined => {
    if (!raw) return undefined
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return undefined
    }
    if (!isRecord(value)) return undefined
    if (typeof value.following !== "boolean") return undefined
    const followBias = finite(value.followBias)
    const zoom = finite(value.zoom)
    const panX = finite(value.panX)
    const panY = finite(value.panY)
    if (
        followBias === undefined ||
        zoom === undefined ||
        panX === undefined ||
        panY === undefined
    ) {
        return undefined
    }
    if (followBias <= 0 || zoom <= 0) return undefined
    return { following: value.following, followBias, zoom, panX, panY }
}

/**
 * Read a stored divergence section.
 *
 * The end must sit after the start. Anything else is ignored.
 *
 * @example
 * ```ts
 * parseStoredZone('{"startM":120,"endM":180}')
 * // { startM: 120, endM: 180 }
 * ```
 */
export const parseStoredZone = (raw: string | null): StoredZone | undefined => {
    if (!raw) return undefined
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return undefined
    }
    if (!isRecord(value)) return undefined
    const startM = finite(value.startM)
    const endM = finite(value.endM)
    if (startM === undefined || endM === undefined) return undefined
    if (endM <= startM) return undefined
    return { startM, endM }
}

/**
 * Find the live zone that still covers a saved section.
 *
 * Bounds are matched with half a metre of slack because a JSON
 * round-trip can nudge a float. Zones are much wider than that.
 *
 * @example
 * ```ts
 * matchStoredZone(
 *   [{ startM: 120, endM: 180 }],
 *   { startM: 120, endM: 180 }
 * )
 * // { startM: 120, endM: 180 }
 * ```
 */
export const matchStoredZone = <T extends StoredZone>(
    zones: readonly T[],
    stored: StoredZone | undefined
): T | undefined => {
    if (!stored) return undefined
    return zones.find(
        zone =>
            Math.abs(zone.startM - stored.startM) < ZONE_MATCH_M &&
            Math.abs(zone.endM - stored.endM) < ZONE_MATCH_M
    )
}

/** Last map camera saved in this browser, if the payload is still valid. */
export const readStoredMapView = (): StoredMapView | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseStoredMapView(localStorage.getItem(MAP_KEY))
    } catch {
        return undefined
    }
}

/** Remember the map camera that should come back after a reload. */
export const writeStoredMapView = (view: StoredMapView): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.setItem(MAP_KEY, JSON.stringify(view))
    } catch {
        // Storage can be unavailable in private mode. The page still works.
    }
}

/** Last divergence section saved in this browser, if the payload is still valid. */
export const readStoredZone = (): StoredZone | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseStoredZone(localStorage.getItem(ZONE_KEY))
    } catch {
        return undefined
    }
}

/** Remember the divergence section that should come back after a reload. */
export const writeStoredZone = (zone: StoredZone): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.setItem(
            ZONE_KEY,
            JSON.stringify({ startM: zone.startM, endM: zone.endM })
        )
    } catch {
        // Same as the map: a storage failure leaves the in-memory page usable.
    }
}

/** Drop a divergence section that no longer matches the open laps. */
export const clearStoredZone = (): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.removeItem(ZONE_KEY)
    } catch {
        // Same as write: a storage failure leaves the in-memory page usable.
    }
}

let programmaticCursor = false

/**
 * Run a cursor update that the map must not treat as a chart scrub.
 *
 * Reloading a saved turn moves the cursor onto that section. That jump
 * is not the user dragging the charts, so the saved camera stays put.
 *
 * @example
 * ```ts
 * withProgrammaticCursor(() => {
 *   cursorIsProgrammatic() // true
 * })
 * cursorIsProgrammatic() // false
 * ```
 */
export const withProgrammaticCursor = (update: () => void): void => {
    const previous = programmaticCursor
    programmaticCursor = true
    try {
        update()
    } finally {
        programmaticCursor = previous
    }
}

/** True while a reload is placing the cursor, not while the user is scrubbing. */
export const cursorIsProgrammatic = (): boolean => programmaticCursor

const finite = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null
