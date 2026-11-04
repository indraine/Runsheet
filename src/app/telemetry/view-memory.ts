const MAP_KEY = "runsheet.telemetry-map"
const ZONE_KEY = "runsheet.telemetry-zone"

const ZONE_MATCH_M = 0.5

export type StoredMapView = {
    following: boolean
    followBias: number
    zoom: number
    panX: number
    panY: number
}

export type StoredZone = {
    startM: number
    endM: number
}

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

export const readStoredMapView = (): StoredMapView | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseStoredMapView(localStorage.getItem(MAP_KEY))
    } catch {
        return undefined
    }
}

export const writeStoredMapView = (view: StoredMapView): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.setItem(MAP_KEY, JSON.stringify(view))
    } catch {
    }
}

export const readStoredZone = (): StoredZone | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseStoredZone(localStorage.getItem(ZONE_KEY))
    } catch {
        return undefined
    }
}

export const writeStoredZone = (zone: StoredZone): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.setItem(
            ZONE_KEY,
            JSON.stringify({ startM: zone.startM, endM: zone.endM })
        )
    } catch {
    }
}

export const clearStoredZone = (): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.removeItem(ZONE_KEY)
    } catch {
    }
}

let programmaticCursor = false

export const withProgrammaticCursor = (update: () => void): void => {
    const previous = programmaticCursor
    programmaticCursor = true
    try {
        update()
    } finally {
        programmaticCursor = previous
    }
}

export const cursorIsProgrammatic = (): boolean => programmaticCursor

const finite = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null
