import { createSignal } from "solid-js"

export const SESSION_COLUMNS = [
    "time",
    "track",
    "type",
    "driver",
    "car",
    "best",
] as const

export type SessionColumn = (typeof SESSION_COLUMNS)[number]

export const isSessionColumn = (value: unknown): value is SessionColumn =>
    typeof value === "string" &&
    (SESSION_COLUMNS as readonly string[]).includes(value)

const COLUMNS_KEY = "runsheet.session-columns"

/**
 * Visible columns from a stored JSON array, in the table's own order.
 * Unknown ids are dropped. An unreadable or empty value falls back to all
 * columns, so the table never ends up with nothing to show.
 *
 * parseSessionColumns('["best","track","x"]') -> ["track", "best"]
 */
export const parseSessionColumns = (
    stored: string | null
): readonly SessionColumn[] => {
    if (!stored) return SESSION_COLUMNS
    let parsed: unknown
    try {
        parsed = JSON.parse(stored)
    } catch {
        return SESSION_COLUMNS
    }
    if (!Array.isArray(parsed)) return SESSION_COLUMNS
    const chosen = new Set(parsed.filter(isSessionColumn))
    const visible = SESSION_COLUMNS.filter(column => chosen.has(column))
    return visible.length > 0 ? visible : SESSION_COLUMNS
}

/**
 * Flip one column. The last visible column cannot be hidden.
 */
export const toggleSessionColumn = (
    current: readonly SessionColumn[],
    column: SessionColumn
): readonly SessionColumn[] => {
    if (current.includes(column)) {
        if (current.length <= 1) return current
        return current.filter(item => item !== column)
    }
    return SESSION_COLUMNS.filter(
        item => item === column || current.includes(item)
    )
}

const readColumns = (): readonly SessionColumn[] => {
    if (typeof localStorage === "undefined") return SESSION_COLUMNS
    try {
        return parseSessionColumns(localStorage.getItem(COLUMNS_KEY))
    } catch {
        return SESSION_COLUMNS
    }
}

const [sessionColumns, setSessionColumnsSignal] = createSignal<
    readonly SessionColumn[]
>(readColumns())

export { sessionColumns }

const storeColumns = (columns: readonly SessionColumn[]): void => {
    setSessionColumnsSignal(columns)
    try {
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns))
    } catch {
        // The choice still holds until the window closes.
    }
}

export const setSessionColumnShown = (
    column: SessionColumn,
    shown: boolean
): void => {
    const current = sessionColumns()
    if (current.includes(column) === shown) return
    storeColumns(toggleSessionColumn(current, column))
}

export const resetSessionColumns = (): void => {
    storeColumns(SESSION_COLUMNS)
}
