const LAUNCH_KEY = "runsheet.launchAcc"

export type LaunchChoice = "yes" | "no"

export const readLaunchChoice = (): LaunchChoice | undefined => {
    try {
        const value = localStorage.getItem(LAUNCH_KEY)
        if (value === "yes" || value === "no") return value
        return undefined
    } catch {
        return undefined
    }
}

export const writeLaunchChoice = (choice: LaunchChoice): void => {
    try {
        localStorage.setItem(LAUNCH_KEY, choice)
    } catch {
    }
}
