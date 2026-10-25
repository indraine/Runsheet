const MILLISECONDS_PER_SECOND = 1000
const MILLISECONDS_PER_MINUTE = 60_000

function pad(value: number, width: number): string {
    return String(value).padStart(width, "0")
}

function wholeMilliseconds(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.round(value)
}

function lap(milliseconds: number): string {
    const total = Math.max(0, wholeMilliseconds(milliseconds))
    const minutes = Math.floor(total / MILLISECONDS_PER_MINUTE)
    const seconds = Math.floor(
        (total % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND
    )
    const millis = total % MILLISECONDS_PER_SECOND
    return `${minutes}:${pad(seconds, 2)}.${pad(millis, 3)}`
}


function delta(milliseconds: number): string {
    const rounded = wholeMilliseconds(milliseconds)
    const sign = rounded < 0 ? "-" : "+"
    const absolute = Math.abs(rounded)
    const seconds = Math.floor(absolute / MILLISECONDS_PER_SECOND)
    const millis = absolute % MILLISECONDS_PER_SECOND
    return `${sign}${seconds}.${pad(millis, 3)}`
}


function clock(at: Date | number): string {
    const date = typeof at === "number" ? new Date(at) : at
    return `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}`
}


const sector = (milliseconds: number): string => {
    const text = lap(milliseconds)
    return text.startsWith("0:") ? text.slice(2) : text
}

export const fmt = { lap, delta, clock, sector }
