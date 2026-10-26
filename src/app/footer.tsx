import { Show } from "solid-js"
import { ScaleControl } from "~/app/scale-control"
import { accLink } from "~/app/status"
import { t } from "~/i18n"

export function Footer() {
    const hz = () => accLink().hz
    const packetId = () => accLink().packetId
    const hasHz = () => hz() != null
    const hasPacket = () => packetId() != null

    return (
        <footer class="sticky bottom-0 z-20 flex h-9 shrink-0 items-center gap-3 border-t border-line bg-surface px-6 font-mono text-[11px] text-muted select-none">
            <Show when={hasHz()}>
                <span>
                    {t("app.frequency")}{" "}
                    <span class="text-secondary">
                        {hz()} {t("app.hz")}
                    </span>
                </span>
            </Show>
            <Show when={hasHz() && hasPacket()}>
                <span aria-hidden="true">·</span>
            </Show>
            <Show when={hasPacket()}>
                <span>
                    {t("app.packet")}{" "}
                    <span class="text-secondary">#{packetId()}</span>
                </span>
            </Show>
            <div class="ml-auto">
                <ScaleControl />
            </div>
        </footer>
    )
}
