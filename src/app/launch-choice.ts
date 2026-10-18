const LAUNCH_KEY = "runsheet.launchAcc"

/** `yes` — запускать ACC вместе с Runsheet. `no` — больше не спрашивать. */
export type LaunchChoice = "yes" | "no"

/** Нет ключа — выбор ещё не запомнен. */
export const readLaunchChoice = (): LaunchChoice | undefined => {
    try {
        const value = localStorage.getItem(LAUNCH_KEY)
        if (value === "yes" || value === "no") return value
        return undefined
    } catch {
        return undefined
    }
}

/** Пишет выбор. Битый storage не мешает текущему запуску. */
export const writeLaunchChoice = (choice: LaunchChoice): void => {
    try {
        localStorage.setItem(LAUNCH_KEY, choice)
    } catch {
        /* приватный режим — в этот раз просто запускаем или закрываем */
    }
}
