/**
 * Tailwind classes per compare slot. Class names are written out in full so
 * the Tailwind scanner can see them.
 */
export type LapTone = {
    text: string
    dot: string
    soft: string
    checked: string
}

const LAP_TONES: readonly LapTone[] = [
    {
        text: "text-lap-a",
        dot: "bg-lap-a",
        soft: "bg-lap-a/15",
        checked:
            "data-[state=checked]:bg-lap-a/15 data-[state=checked]:text-lap-a",
    },
    {
        text: "text-lap-b",
        dot: "bg-lap-b",
        soft: "bg-lap-b/15",
        checked:
            "data-[state=checked]:bg-lap-b/15 data-[state=checked]:text-lap-b",
    },
    {
        text: "text-lap-c",
        dot: "bg-lap-c",
        soft: "bg-lap-c/15",
        checked:
            "data-[state=checked]:bg-lap-c/15 data-[state=checked]:text-lap-c",
    },
    {
        text: "text-lap-d",
        dot: "bg-lap-d",
        soft: "bg-lap-d/15",
        checked:
            "data-[state=checked]:bg-lap-d/15 data-[state=checked]:text-lap-d",
    },
]

/**
 * Classes for a compare slot. Index `0` is the baseline.
 *
 * @example
 * ```ts
 * lapTone(1).text // "text-lap-b"
 * ```
 */
export const lapTone = (index: number): LapTone =>
    LAP_TONES[Math.max(0, Math.min(index, LAP_TONES.length - 1))] ??
    LAP_TONES[0]!
