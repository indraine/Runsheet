import { createSignal } from "solid-js"

export const SESSION_LIST_SORTS = ["newest", "oldest"] as const

export type SessionListSort = (typeof SESSION_LIST_SORTS)[number]

export const isSessionListSort = (value: string): value is SessionListSort =>
    (SESSION_LIST_SORTS as readonly string[]).includes(value)

const SORT_KEY = "runsheet.session-list-sort"
const DEFAULT_SORT: SessionListSort = "newest"

const readSort = (): SessionListSort => {
    if (typeof localStorage === "undefined") return DEFAULT_SORT
    try {
        const stored = localStorage.getItem(SORT_KEY)
        if (stored && isSessionListSort(stored)) return stored
    } catch {
    }
    return DEFAULT_SORT
}

const [sessionListSort, setSessionListSortSignal] =
    createSignal<SessionListSort>(readSort())

export { sessionListSort }

export const setSessionListSort = (sort: SessionListSort): void => {
    setSessionListSortSignal(sort)
    try {
        localStorage.setItem(SORT_KEY, sort)
    } catch {
    }
}
