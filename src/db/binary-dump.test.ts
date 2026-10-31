import { describe, expect, it } from "vitest"
import {
    CHANNEL_SCALE,
    decodeBinaryDump,
    encodeBinaryDump,
    isBinaryDump,
} from "./binary-dump"
import { TRACE_CHANNELS } from "~/domain/trace"
import type { EncodedTrace, RunsheetDump } from "./transfer"

const makeTrace = (lapId: string, samples: number): EncodedTrace => {
    const trace = { lapId } as EncodedTrace
    for (const channel of TRACE_CHANNELS) {
        trace[channel] = Array.from({ length: samples }, (_, index) =>
            channel === "distance"
                ? index * 3.71
                : channel === "time"
                  ? index * 16
                  : channel === "gear"
                    ? 1 + (index % 6)
                    : Math.sin(index / 40) * (channel === "heading" ? 3 : 50)
        )
    }
    return trace
}

const dump = (traces: EncodedTrace[]): RunsheetDump =>
    ({
        format: "runsheet-dump",
        version: 1,
        dbVersion: 2,
        exportedAt: 1,
        sessions: [{ id: "s1", track: "monza" }],
        laps: [],
        traces,
    }) as unknown as RunsheetDump

describe("binary dump", () => {
    it("marks the file and reads it back within the channel steps", async () => {
        const source = dump([makeTrace("lap-a", 500), makeTrace("lap-b", 3)])
        const bytes = await encodeBinaryDump(source)
        expect(isBinaryDump(bytes)).toBe(true)

        const back = await decodeBinaryDump(bytes)
        expect(back.sessions).toEqual(source.sessions)
        expect(back.traces.map(trace => trace.lapId)).toEqual([
            "lap-a",
            "lap-b",
        ])
        for (const [index, trace] of back.traces.entries()) {
            for (const channel of TRACE_CHANNELS) {
                const original = source.traces[index]![channel]
                expect(trace[channel]).toHaveLength(original.length)
                const step = 0.5 / CHANNEL_SCALE[channel]
                original.forEach((value, at) => {
                    expect(
                        Math.abs((trace[channel][at] as number) - value)
                    ).toBeLessThanOrEqual(step + 1e-9)
                })
            }
        }
    })

    it("keeps whole channels such as gear and time exact", async () => {
        const source = dump([makeTrace("lap-a", 100)])
        const back = await decodeBinaryDump(await encodeBinaryDump(source))
        expect(back.traces[0]!.gear).toEqual(source.traces[0]!.gear)
        expect(back.traces[0]!.time).toEqual(source.traces[0]!.time)
    })

    it("is much smaller than the JSON", async () => {
        const source = dump([makeTrace("lap-a", 2000)])
        const bytes = await encodeBinaryDump(source)
        expect(bytes.length).toBeLessThan(JSON.stringify(source).length / 8)
    })

    it("rejects a foreign or truncated file", async () => {
        await expect(
            decodeBinaryDump(new TextEncoder().encode("{}"))
        ).rejects.toThrow()
        const bytes = await encodeBinaryDump(dump([makeTrace("lap-a", 50)]))
        await expect(decodeBinaryDump(bytes.subarray(0, 20))).rejects.toThrow()
    })
})
