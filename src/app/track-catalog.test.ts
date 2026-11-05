import { describe, expect, it } from "vitest"
import { boundariesFor, hasAsphalt } from "~/app/track-catalog"
import { trackCodes } from "~/i18n"

describe("track catalog", () => {
    it.each(trackCodes)("has bundled geometry for %s", code => {
        expect(hasAsphalt(code)).toBe(true)
        expect(boundariesFor(code)?.center.length).toBeGreaterThan(2)
    })
})
