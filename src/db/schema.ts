import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { Lap, Session, Trace } from "~/domain"

export const DB_NAME = "runsheet"
export const DB_VERSION = 1

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
    traces: {
        key: string
        value: Trace
    }
}

export type RunsheetDatabase = IDBPDatabase<RunsheetSchema>

/** Opens version 1. `traces` is keyed by `lapId` because each lap has one document. */
export function openRunsheetDb(
    name: string = DB_NAME
): Promise<RunsheetDatabase> {
    return openDB<RunsheetSchema>(name, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (oldVersion < 1) {
                db.createObjectStore("sessions", { keyPath: "id" })
                const laps = db.createObjectStore("laps", { keyPath: "id" })
                laps.createIndex("sessionId", "sessionId")
                db.createObjectStore("traces", { keyPath: "lapId" })
            }
        },
    })
}
