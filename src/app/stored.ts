export const clearStored = (): void => {
    localStorage.clear()
    window.location.reload()
}
