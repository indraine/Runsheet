import { describe, expect, it } from "vitest"
import { formatFileSize } from "./export-size"

const units = { b: "B", kb: "KB", mb: "MB" }

describe("file size", () => {
    it("picks the unit by magnitude", () => {
        expect(formatFileSize(512, units, "en")).toBe("512 B")
        expect(formatFileSize(152_549, units, "en")).toBe("149 KB")
        expect(formatFileSize(3_452_100, units, "en")).toBe("3.3 MB")
    })

    it("uses the locale's decimal mark", () => {
        expect(formatFileSize(3_452_100, units, "ru")).toBe("3,3 MB")
    })
})
