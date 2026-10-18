/** Стирает localStorage и перезагружает окно. Приветствие снова показывается. */
export const clearStored = (): void => {
    localStorage.clear()
    window.location.reload()
}
