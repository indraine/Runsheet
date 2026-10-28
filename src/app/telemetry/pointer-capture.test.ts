import { describe, expect, it } from "vitest"
import {
    popupBlocksCanvas,
    releaseHeldPointer,
} from "~/app/telemetry/pointer-capture"

const surface = (
    held: number | undefined,
    label: string,
    released: string[]
) => ({
    hasPointerCapture: (id: number) => id === held,
    releasePointerCapture: (id: number) => {
        released.push(`${label}:${id}`)
    },
})

describe("releaseHeldPointer", () => {
    it("releases the host and the canvas that still hold the pointer", () => {
        const released: string[] = []
        const canvas = surface(4, "canvas", released)
        const host = {
            ...surface(4, "host", released),
            querySelector: () => canvas,
        }
        releaseHeldPointer(host, 4)
        expect(released).toEqual(["host:4", "canvas:4"])
    })

    it("leaves a pointer the node does not hold", () => {
        const released: string[] = []
        const host = {
            ...surface(undefined, "host", released),
            querySelector: () => null,
        }
        releaseHeldPointer(host, 1)
        expect(released).toEqual([])
    })
})

describe("popupBlocksCanvas", () => {
    it("is true when a dialog or an open select is mounted", () => {
        expect(
            popupBlocksCanvas({
                querySelector: selector =>
                    selector.includes("[role='dialog']") ? {} : null,
            })
        ).toBe(true)
        expect(popupBlocksCanvas({ querySelector: () => null })).toBe(false)
    })
})
