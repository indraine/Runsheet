import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import {
    filterDump,
    formatMotecError,
    loadMotecLap,
    motecAvailable,
    parseDumpFile,
    useSessionRepository,
    type RunsheetDump,
    type SessionWrite,
} from "~/db"
import { groupByDay, type Session, type SessionType } from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { Button, cn } from "~/ui"

export type ImportFormat = "json" | "motec"

type Preview =
    | { kind: "json"; dump: RunsheetDump; fileName: string }
    | { kind: "motec"; write: SessionWrite; sampleRateHz: number }

export function ImportDialog(props: {
    onCancel: () => void
    onDone: () => void
}) {
    const repository = useSessionRepository()
    const [format, setFormat] = createSignal<ImportFormat>("json")
    const [preview, setPreview] = createSignal<Preview>()
    const [selected, setSelected] = createSignal(new Set<string>())
    const [busy, setBusy] = createSignal(false)
    const [error, setError] = createSignal<string>()
    let fileInput!: HTMLInputElement
    let closeButton: HTMLButtonElement | undefined

    const days = createMemo(() => {
        const current = preview()
        if (current?.kind !== "json") return []
        return groupByDay(current.dump.sessions)
    })

    const lapCountBySession = createMemo(() => {
        const current = preview()
        if (current?.kind !== "json") return new Map<string, number>()
        const counts = new Map<string, number>()
        for (const lap of current.dump.laps) {
            counts.set(lap.sessionId, (counts.get(lap.sessionId) ?? 0) + 1)
        }
        return counts
    })

    const selectedCount = createMemo(() => selected().size)
    const canImport = createMemo(() => {
        const current = preview()
        if (!current || busy()) return false
        if (current.kind === "motec") return true
        return selectedCount() > 0
    })

    const dismiss = () => {
        if (busy()) return
        props.onCancel()
    }

    const resetPreview = () => {
        setPreview(undefined)
        setSelected(new Set<string>())
        setError(undefined)
    }

    const chooseFormat = (next: ImportFormat) => {
        if (busy()) return
        if (next === "motec" && !motecAvailable()) return
        setFormat(next)
        resetPreview()
    }

    const chooseFile = () => {
        if (busy()) return
        setError(undefined)
        if (format() === "json") {
            fileInput.click()
            return
        }
        void loadMotecFile()
    }

    const loadJsonFile = async (file: File) => {
        setBusy(true)
        setError(undefined)
        try {
            const dump = await parseDumpFile(file)
            setPreview({ kind: "json", dump, fileName: file.name })
            setSelected(new Set(dump.sessions.map(session => session.id)))
        } catch (caught) {
            resetPreview()
            setError(
                caught instanceof Error ? caught.message : String(caught)
            )
        } finally {
            setBusy(false)
        }
    }

    const loadMotecFile = async () => {
        setBusy(true)
        setError(undefined)
        try {
            const write = await loadMotecLap()
            if (!write?.session || !write.lap || !write.trace) {
                setBusy(false)
                return
            }
            const sampleRateHz =
                write.trace.time.length > 1
                    ? Math.round(
                          ((write.trace.time.length - 1) * 1000) /
                              Math.max(
                                  1,
                                  (write.trace.time[write.trace.time.length - 1] ??
                                      0) - (write.trace.time[0] ?? 0)
                              )
                      )
                    : 20
            setPreview({ kind: "motec", write, sampleRateHz })
            setSelected(new Set([write.session.id]))
        } catch (caught) {
            resetPreview()
            const message =
                caught instanceof Error && caught.message === "motec.desktopOnly"
                    ? t("app.motecDesktopOnly")
                    : formatMotecError(caught, t("app.importMotecFailed"))
            setError(message)
        } finally {
            setBusy(false)
        }
    }

    const toggleSession = (sessionId: string) => {
        setSelected(current => {
            const next = new Set(current)
            if (next.has(sessionId)) next.delete(sessionId)
            else next.add(sessionId)
            return next
        })
    }

    const setDaySelected = (sessions: readonly Session[], on: boolean) => {
        setSelected(current => {
            const next = new Set(current)
            for (const session of sessions) {
                if (on) next.add(session.id)
                else next.delete(session.id)
            }
            return next
        })
    }

    const selectAll = () => {
        const current = preview()
        if (current?.kind !== "json") return
        setSelected(new Set(current.dump.sessions.map(session => session.id)))
    }

    const selectNone = () => setSelected(new Set<string>())

    const confirmImport = async () => {
        const repo = repository()
        const current = preview()
        if (!repo || !current || !canImport()) return
        setBusy(true)
        setError(undefined)
        try {
            if (current.kind === "json") {
                const filtered = filterDump(current.dump, selected())
                await repo.importAll(filtered)
                window.alert(
                    t("app.importJsonDone", {
                        sessions: filtered.sessions.length,
                        laps: filtered.laps.length,
                    })
                )
            } else {
                await repo.upsert(current.write)
                window.alert(t("app.importMotecDone"))
            }
            props.onDone()
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : String(caught)
            )
        } finally {
            setBusy(false)
        }
    }

    onMount(() => {
        closeButton?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss()
        }
        document.addEventListener("keydown", onKey)
        onCleanup(() => document.removeEventListener("keydown", onKey))
    })

    return (
        <div
            class="fixed-screen z-50 flex items-center justify-center bg-ink/30 px-6"
            onClick={dismiss}
        >
            <div
                class="flex max-h-[min(40rem,90vh)] w-full max-w-lg flex-col overflow-hidden rounded border border-line bg-surface text-ink shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-dialog-title"
                onClick={event => event.stopPropagation()}
            >
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json"
                    class="hidden"
                    onChange={event => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ""
                        if (file) void loadJsonFile(file)
                    }}
                />

                <div class="border-b border-line px-6 py-4">
                    <h2
                        id="import-dialog-title"
                        class="font-mono text-sm font-medium tracking-wide text-ink uppercase"
                    >
                        {t("app.importDialogTitle")}
                    </h2>
                    <p class="mt-2 font-mono text-sm leading-5 text-secondary">
                        {t("app.importDialogBody")}
                    </p>
                </div>

                <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    <fieldset class="space-y-2">
                        <legend class="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
                            {t("app.importFormat")}
                        </legend>
                        <label class={formatRowClass(format() === "json")}>
                            <input
                                type="radio"
                                name="import-format"
                                class="accent-accent"
                                checked={format() === "json"}
                                disabled={busy()}
                                onChange={() => chooseFormat("json")}
                            />
                            <span>{t("app.importFormatJson")}</span>
                        </label>
                        <label
                            class={cn(
                                formatRowClass(format() === "motec"),
                                !motecAvailable() && "opacity-50"
                            )}
                        >
                            <input
                                type="radio"
                                name="import-format"
                                class="accent-accent"
                                checked={format() === "motec"}
                                disabled={busy() || !motecAvailable()}
                                onChange={() => chooseFormat("motec")}
                            />
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span>{t("app.importFormatMotec")}</span>
                                <Show when={!motecAvailable()}>
                                    <span class="text-xs text-muted">
                                        {t("app.importMotecUnavailable")}
                                    </span>
                                </Show>
                            </span>
                        </label>
                    </fieldset>

                    <div class="flex flex-wrap items-center gap-2">
                        <Button
                            variant="secondary"
                            disabled={busy()}
                            onClick={chooseFile}
                        >
                            {t("app.importChooseFile")}
                        </Button>
                        <Show when={preview()}>
                            {current => (
                                <span class="min-w-0 truncate font-mono text-xs text-muted">
                                    {(() => {
                                        const loaded = current()
                                        return loaded.kind === "json"
                                            ? loaded.fileName
                                            : t("app.importMotecLoaded")
                                    })()}
                                </span>
                            )}
                        </Show>
                    </div>

                    <Show when={error()}>
                        {message => (
                            <p class="font-mono text-sm text-loss">{message()}</p>
                        )}
                    </Show>

                    <Show when={preview()?.kind === "json"}>
                        <div class="space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
                                    {t("app.importSelectSessions")}
                                </span>
                                <button
                                    type="button"
                                    class="font-mono text-xs text-accent underline-offset-2 hover:underline"
                                    disabled={busy()}
                                    onClick={selectAll}
                                >
                                    {t("app.importSelectAll")}
                                </button>
                                <button
                                    type="button"
                                    class="font-mono text-xs text-accent underline-offset-2 hover:underline"
                                    disabled={busy()}
                                    onClick={selectNone}
                                >
                                    {t("app.importSelectNone")}
                                </button>
                                <span class="ml-auto font-mono text-xs text-muted">
                                    {t("app.importSelectedCount", {
                                        n: selectedCount(),
                                    })}
                                </span>
                            </div>
                            <ul class="max-h-56 space-y-3 overflow-y-auto rounded border border-line bg-inset/40 p-2">
                                <For each={days()}>
                                    {day => {
                                        const dayIds = () =>
                                            day.sessions.map(session => session.id)
                                        const allOn = () =>
                                            dayIds().every(id => selected().has(id))
                                        const someOn = () =>
                                            dayIds().some(id => selected().has(id))
                                        return (
                                            <li class="space-y-1">
                                                <button
                                                    type="button"
                                                    class="flex w-full items-center gap-2 rounded px-1 py-1 text-left font-mono text-xs text-secondary hover:bg-inset"
                                                    disabled={busy()}
                                                    onClick={() =>
                                                        setDaySelected(
                                                            day.sessions,
                                                            !allOn()
                                                        )
                                                    }
                                                >
                                                    <span
                                                        class={cn(
                                                            "grid size-4 place-items-center rounded-sm border text-[10px]",
                                                            allOn()
                                                                ? "border-accent bg-accent text-surface"
                                                                : someOn()
                                                                  ? "border-accent text-accent"
                                                                  : "border-line text-transparent"
                                                        )}
                                                        aria-hidden="true"
                                                    >
                                                        {allOn()
                                                            ? "✓"
                                                            : someOn()
                                                              ? "–"
                                                              : ""}
                                                    </span>
                                                    <span>
                                                        {dayHeading(day.start)}
                                                    </span>
                                                </button>
                                                <ul class="space-y-0.5 pl-1">
                                                    <For each={day.sessions}>
                                                        {session => (
                                                            <li>
                                                                <label class="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 font-mono text-sm hover:bg-inset">
                                                                    <input
                                                                        type="checkbox"
                                                                        class="mt-0.5 accent-accent"
                                                                        checked={selected().has(
                                                                            session.id
                                                                        )}
                                                                        disabled={busy()}
                                                                        onChange={() =>
                                                                            toggleSession(
                                                                                session.id
                                                                            )
                                                                        }
                                                                    />
                                                                    <span class="min-w-0 flex-1">
                                                                        <span class="block truncate text-ink">
                                                                            {fmt.clock(
                                                                                session.startedAt
                                                                            )}{" "}
                                                                            ·{" "}
                                                                            {trackName(
                                                                                session.track
                                                                            )}{" "}
                                                                            ·{" "}
                                                                            {carName(
                                                                                session.car
                                                                            )}
                                                                        </span>
                                                                        <span class="block truncate text-xs text-muted">
                                                                            {sessionTypeLabel(
                                                                                session.type
                                                                            )}{" "}
                                                                            ·{" "}
                                                                            {t(
                                                                                "app.importLapCount",
                                                                                {
                                                                                    n:
                                                                                        lapCountBySession().get(
                                                                                            session.id
                                                                                        ) ??
                                                                                        0,
                                                                                }
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                </label>
                                                            </li>
                                                        )}
                                                    </For>
                                                </ul>
                                            </li>
                                        )
                                    }}
                                </For>
                            </ul>
                        </div>
                    </Show>

                    <Show
                        when={(() => {
                            const current = preview()
                            return current?.kind === "motec" ? current : undefined
                        })()}
                    >
                        {current => {
                            const motec = () => current()
                            const session = () => motec().write.session!
                            const lap = () => motec().write.lap!
                            return (
                                <div class="rounded border border-line bg-inset/40 px-3 py-3 font-mono text-sm">
                                    <p class="text-xs font-semibold tracking-wide text-muted uppercase">
                                        {t("app.importMotecPreview")}
                                    </p>
                                    <p class="mt-2 text-ink">
                                        {trackName(session().track)} ·{" "}
                                        {carName(session().car)}
                                    </p>
                                    <p class="mt-1 text-xs text-secondary">
                                        {session().driver || t("app.empty")} · L
                                        {lap().number}
                                        {lap().timeMs != null
                                            ? ` · ${fmt.lap(lap().timeMs!)}`
                                            : ""}
                                    </p>
                                    <p class="mt-1 text-xs text-muted">
                                        {t("app.importMotecRate", {
                                            hz: motec().sampleRateHz,
                                        })}
                                    </p>
                                </div>
                            )
                        }}
                    </Show>
                </div>

                <div class="flex justify-end gap-2 border-t border-line px-6 py-4">
                    <Button
                        ref={closeButton}
                        variant="secondary"
                        disabled={busy()}
                        onClick={dismiss}
                    >
                        {t("app.importDialogCancel")}
                    </Button>
                    <Button
                        disabled={!canImport()}
                        onClick={() => void confirmImport()}
                    >
                        {t("app.importDialogConfirm")}
                    </Button>
                </div>
            </div>
        </div>
    )
}

const formatRowClass = (active: boolean) =>
    cn(
        "flex cursor-pointer items-start gap-2 rounded border px-3 py-2 font-mono text-sm",
        active
            ? "border-accent/40 bg-accent/5 text-ink"
            : "border-line bg-inset/40 text-secondary"
    )

function dayHeading(start: number): string {
    return new Date(start).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    })
}

function sessionTypeLabel(type: SessionType): string {
    switch (type) {
        case "practice":
            return t("app.typePractice")
        case "qualifying":
            return t("app.typeQualifying")
        case "race":
            return t("app.typeRace")
        case "hotlap":
            return t("app.typeHotlap")
        case "hotstint":
            return t("app.typeHotstint")
        case "hotlapSuperpole":
            return t("app.typeHotlapSuperpole")
        case "timeAttack":
            return t("app.typeTimeAttack")
        case "drift":
            return t("app.typeDrift")
        case "drag":
            return t("app.typeDrag")
        case "unknown":
            return t("app.typeUnknown")
    }
}
