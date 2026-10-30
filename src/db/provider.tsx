import {
    createContext,
    createEffect,
    createMemo,
    createResource,
    useContext,
    type Accessor,
    type ParentProps,
    type Resource,
} from "solid-js"
import { startAccFeed } from "~/ipc/listen"
import { openRunsheetDb, type RunsheetDatabase } from "~/db/schema"
import { SessionRepository } from "~/db/repository"

const DbContext = createContext<Resource<RunsheetDatabase>>()
const RepositoryContext =
    createContext<Accessor<SessionRepository | undefined>>()

async function openDatabase(): Promise<RunsheetDatabase> {
    const opened = await openRunsheetDb()
    try {
        const { seedReferenceLaps } = await import("~/db/reference-laps")
        await seedReferenceLaps(opened)
    } catch (error) {
        console.error(error)
    }
    if (import.meta.env.DEV) {
        const { seedDevDay } = await import("~/db/seed")
        await seedDevDay(opened)
    }
    return opened
}

export function DatabaseProvider(props: ParentProps) {
    const [database] = createResource(openDatabase)
    const repository = createMemo(() => {
        const opened = database()
        return opened ? new SessionRepository(opened) : undefined
    })

    return (
        <DbContext.Provider value={database}>
            <RepositoryContext.Provider value={repository}>
                <AccFeed />
                {props.children}
            </RepositoryContext.Provider>
        </DbContext.Provider>
    )
}

function AccFeed() {
    const repository = useSessionRepository()
    const feed = startAccFeed()
    createEffect(() => {
        const repo = repository()
        if (repo) feed.attach(repo)
    })
    return null
}

export function useDb(): Resource<RunsheetDatabase> {
    const database = useContext(DbContext)
    if (!database) {
        throw new Error("useDb must be called inside DatabaseProvider")
    }
    return database
}

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
