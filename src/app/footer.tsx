import { accLink } from "~/app/status"
import { t } from "~/i18n"

export function Footer() {
    return (
        <footer class="sticky bottom-0 z-20 flex h-9 shrink-0 items-center gap-3 border-t border-line bg-surface px-6 font-mono text-[11px] text-muted select-none">
            <span>
                {t("app.frequency")}{" "}
                <span class="text-secondary">{frequencyValue()}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
                {t("app.packet")}{" "}
                <span class="text-secondary">{packetValue()}</span>
            </span>
        </footer>
    )
}

function frequencyValue() {
    const hz = accLink().hz
    if (hz == null) return t("app.empty")
    return `${hz} ${t("app.hz")}`
}

function packetValue() {
    const packetId = accLink().packetId
    if (packetId == null) return t("app.empty")
    return `#${packetId}`
}
