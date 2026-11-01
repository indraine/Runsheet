import { createSignal, onCleanup, onMount } from "solid-js"
import { t } from "~/i18n"
import { Button } from "~/ui"

/**
 * Asks before a recorded session is removed.
 *
 * The «don't ask again» box is handed to `onConfirm`; the caller stores it
 * only when the user actually deletes, so cancelling never changes the habit.
 */
export function DeleteSessionDialog(props: {
    onCancel: () => void
    onConfirm: (remember: boolean) => Promise<void>
}) {
    const [remember, setRemember] = createSignal(false)
    const [deleting, setDeleting] = createSignal(false)
    let cancel: HTMLButtonElement | undefined

    const dismiss = () => {
        if (deleting()) return
        props.onCancel()
    }

    const confirm = () => {
        if (deleting()) return
        setDeleting(true)
        void props.onConfirm(remember()).finally(() => setDeleting(false))
    }

    onMount(() => {
        cancel?.focus()
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
                class="w-full max-w-md rounded border border-line bg-surface p-6 text-ink shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-session-title"
                aria-describedby="delete-session-body"
                onClick={event => event.stopPropagation()}
            >
                <h2
                    id="delete-session-title"
                    class="text-sm font-medium tracking-wide text-ink uppercase"
                >
                    {t("app.deleteSessionTitle")}
                </h2>
                <p
                    id="delete-session-body"
                    class="mt-3 text-sm leading-5 text-secondary"
                >
                    {t("app.deleteSessionBody")}
                </p>
                <label class="mt-4 flex cursor-pointer items-center gap-2 text-sm text-secondary select-none">
                    <input
                        type="checkbox"
                        class="size-4 cursor-pointer accent-[var(--accent)]"
                        checked={remember()}
                        onChange={event =>
                            setRemember(event.currentTarget.checked)
                        }
                    />
                    {t("app.deleteSessionRemember")}
                </label>
                <div class="mt-5 flex justify-end gap-2">
                    <Button
                        ref={cancel}
                        variant="secondary"
                        disabled={deleting()}
                        onClick={dismiss}
                    >
                        {t("app.deleteSessionCancel")}
                    </Button>
                    <Button
                        variant="danger"
                        disabled={deleting()}
                        onClick={confirm}
                    >
                        {t("app.deleteSessionConfirm")}
                    </Button>
                </div>
            </div>
        </div>
    )
}
