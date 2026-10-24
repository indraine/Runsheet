import { createSignal } from "solid-js"
import { isTrackSort, type TrackSort } from "~/domain"

const SORT_KEY = "runsheet.track-board-sort"
const DEFAULT_SORT: TrackSort = "recent"

const readSort = (): TrackSort => {
    if (typeof localStorage === "undefined") return DEFAULT_SORT
    try {
        const stored = localStorage.getItem(SORT_KEY)
        if (stored && isTrackSort(stored)) return stored
    } catch {
        // ignore
    }
    return DEFAULT_SORT
}

const [trackBoardSort, setTrackBoardSortSignal] =
    createSignal<TrackSort>(readSort())

export { trackBoardSort }

export const setTrackBoardSort = (sort: TrackSort): void => {
    setTrackBoardSortSignal(sort)
    try {
        localStorage.setItem(SORT_KEY, sort)
    } catch {
        // private mode / quota — память сессии всё равно жива
    }
}
