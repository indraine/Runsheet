/** Read a `#rrggbb` CSS custom property as a Pixi color integer. */
export const cssColor = (name: string, fallback: number): number => {
    if (typeof document === "undefined") return fallback
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return Number.parseInt(raw.slice(1), 16)
    return fallback
}
