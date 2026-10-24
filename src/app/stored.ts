/** Тема, приветствие и выбор запуска ACC живут в `localStorage`. Перезагрузка применяет пустое. */
export const resetSettings = (): void => {
    localStorage.clear()
    window.location.reload()
}
