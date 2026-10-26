import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import { TRACE_CHANNELS, type Lap, type Session, type Trace } from "~/domain"

export const DB_NAME = "runsheet"
export const DB_VERSION = 2

export interface RunsheetSchema extends DBSchema {
    sessions: {
        key: string
        value: Session
    }
    laps: {
        key: string
        value: Lap
        indexes: { sessionId: string }
    }
    lap_telemetry: {
        key: string
        value: Trace
    }
}

export type RunsheetDatabase = IDBPDatabase<RunsheetSchema>

export function openRunsheetDb(
    name: string = DB_NAME
): Promise<RunsheetDatabase> {
    return openDB<RunsheetSchema>(name, DB_VERSION, {
        async upgrade(db, oldVersion, _newVersion, transaction) {
            if (oldVersion < 1) {
                db.createObjectStore("sessions", { keyPath: "id" })
                const laps = db.createObjectStore("laps", { keyPath: "id" })
                laps.createIndex("sessionId", "sessionId")
                db.createObjectStore("lap_telemetry", { keyPath: "lapId" })
                return
            }
            if (oldVersion < 2) {
                const next = db.createObjectStore("lap_telemetry", {
                    keyPath: "lapId",
                })
                const legacy = transaction as unknown as {
                    objectStore(name: "traces"): {
                        getAll(): Promise<Trace[]>
                    }
                }
                const rows = await legacy.objectStore("traces").getAll()
                await Promise.all(rows.map(row => next.put(normalizeTrace(row))))
                ;(
                    db as unknown as { deleteObjectStore(name: string): void }
                ).deleteObjectStore("traces")
            }
        },
    })
}

/** Fill channels added after v1 dumps / stores (e.g. `gear`). */
export function normalizeTrace(trace: Trace): Trace {
    const count = trace.distance?.length ?? 0
    const next = { lapId: trace.lapId } as Trace
    for (const channel of TRACE_CHANNELS) {
        const samples = trace[channel]
        if (samples instanceof Float32Array && samples.length === count) {
            next[channel] = samples
        } else if (
            Array.isArray(samples) &&
            (samples as number[]).length === count
        ) {
            next[channel] = Float32Array.from(samples as number[])
        } else {
            next[channel] = new Float32Array(count)
        }
    }
    return next
}
