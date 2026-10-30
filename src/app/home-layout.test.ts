import { describe, expect, it } from "vitest"
import {
    DEFAULT_LAYOUT,
    MAX_SPLIT,
    MIN_SPLIT,
    clampSplit,
    homeLayout,
    setHomeSplit,
    showRightPane,
    toggleHomePane,
    parseHomeLayout,
    toggleExpanded,
} from "~/app/home-layout"

describe("clampSplit", () => {
    it("keeps a value inside the range", () => {
        expect(clampSplit(0.4)).toBe(0.4)
    })

    it("pulls a value back to the nearest edge", () => {
        expect(clampSplit(0.01)).toBe(MIN_SPLIT)
        expect(clampSplit(0.99)).toBe(MAX_SPLIT)
    })

    it("gives the default for a value that is not a number", () => {
        expect(clampSplit(Number.NaN)).toBe(DEFAULT_LAYOUT.split)
        expect(clampSplit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_LAYOUT.split)
    })
})

describe("parseHomeLayout", () => {
    it("gives the default when nothing is stored", () => {
        expect(parseHomeLayout(null)).toEqual(DEFAULT_LAYOUT)
    })

    it("gives the default for broken JSON or a wrong shape", () => {
        expect(parseHomeLayout("{")).toEqual(DEFAULT_LAYOUT)
        expect(parseHomeLayout("[1]")).toEqual(DEFAULT_LAYOUT)
        expect(parseHomeLayout("7")).toEqual(DEFAULT_LAYOUT)
        expect(parseHomeLayout("null")).toEqual(DEFAULT_LAYOUT)
    })

    it("reads a stored layout", () => {
        expect(parseHomeLayout('{"split":0.4,"expanded":"left"}')).toEqual({
            split: 0.4,
            expanded: "left",
        })
    })

    it("fixes each bad field on its own", () => {
        expect(parseHomeLayout('{"split":"wide","expanded":"right"}')).toEqual({
            split: DEFAULT_LAYOUT.split,
            expanded: "right",
        })
        expect(parseHomeLayout('{"split":2,"expanded":"up"}')).toEqual({
            split: MAX_SPLIT,
            expanded: "none",
        })
    })
})

describe("toggleExpanded", () => {
    it("expands a pane and restores it on the second toggle", () => {
        expect(toggleExpanded("none", "left")).toBe("left")
        expect(toggleExpanded("left", "left")).toBe("none")
    })

    it("moves the expansion to the other pane", () => {
        expect(toggleExpanded("left", "right")).toBe("right")
    })
})

describe("showRightPane", () => {
    it("returns the expanded table to an even split", () => {
        setHomeSplit(0.4)
        toggleHomePane("left")
        expect(homeLayout().expanded).toBe("left")
        showRightPane()
        expect(homeLayout()).toEqual({ split: 0.5, expanded: "none" })
    })

    it("leaves the other layouts alone", () => {
        setHomeSplit(0.4)
        showRightPane()
        expect(homeLayout()).toEqual({ split: 0.4, expanded: "none" })
        toggleHomePane("right")
        showRightPane()
        expect(homeLayout().expanded).toBe("right")
        toggleHomePane("right")
    })
})
