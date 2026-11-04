import { createSignal } from "solid-js"

const KEY = "runsheet.delete-without-asking"

const read = (): boolean => {
    if (typeof localStorage === "undefined") return false
    try {
        return localStorage.getItem(KEY) === "1"
    } catch {
        return false
    }
}

const [deleteWithoutAsking, setSignal] = createSignal(read())

export { deleteWithoutAsking }

export const setDeleteWithoutAsking = (value: boolean): void => {
    setSignal(value)
    try {
        if (value) localStorage.setItem(KEY, "1")
        else localStorage.removeItem(KEY)
    } catch {
    }
}
