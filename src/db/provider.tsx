import {
    createContext,
    createMemo,
    createResource,
    useContext,
    type Accessor,
    type ParentProps,
    type Resource,
} from "solid-js"
import { openRunsheetDb, type RunsheetDatabase } from "~/db/schema"
import { SessionRepository } from "~/db/repository"

const DbContext = createContext<Resource<RunsheetDatabase>>()
const RepositoryContext =
    createContext<Accessor<SessionRepository | undefined>>()

/** Dev builds fill an empty database once, before any screen reads it. */
async function openDatabase(): Promise<RunsheetDatabase> {
    const opened = await openRunsheetDb()
    if (import.meta.env.DEV) {
        const { seedDevDay } = await import("~/db/seed")
        await seedDevDay(opened)
    }
    return opened
}

/** Opens IndexedDB once. Screens read it with `useDb` and writes go through `useSessionRepository`. */
export function DatabaseProvider(props: ParentProps) {
    const [database] = createResource(openDatabase)
    const repository = createMemo(() => {
        const opened = database()
        return opened ? new SessionRepository(opened) : undefined
    })

    return (
        <DbContext.Provider value={database}>
            <RepositoryContext.Provider value={repository}>
                {props.children}
            </RepositoryContext.Provider>
        </DbContext.Provider>
    )
}

export function useDb(): Resource<RunsheetDatabase> {
    const database = useContext(DbContext)
    if (!database) {
        throw new Error("useDb must be called inside DatabaseProvider")
    }
    return database
}

/** One repository for the open database, so every screen sees the same `revision` signal. */
export function useSessionRepository(): Accessor<
    SessionRepository | undefined
> {
    const repository = useContext(RepositoryContext)
    if (!repository) {
        throw new Error(
            "useSessionRepository must be called inside DatabaseProvider"
        )
    }
    return repository
}
