import { Channel, invoke, isTauri } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { accLink, setAccLink, type AccLink } from "~/app/status"
import type { SessionRepository } from "~/db"
import { createAccIngest } from "~/ipc/ingest"
import {
    ACC_STATUS_EVENT,
    packetRate,
    parseAccStatus,
    type AccStatus,
    type RateMark,
} from "~/ipc/status"

/** Подписка, которую можно остановить вместе с окном. */
export type AccFeed = {
    attach: (repo: SessionRepository) => void
    stop: () => void
}

/**
 * Слушает `acc-status` и канал пачек.
 * Вне Tauri ничего не делает: в браузере остаётся dev-сид.
 * Последний статус и последняя пачка дожидаются открытия базы.
 */
export const startAccFeed = (): AccFeed => {
    if (!isTauri()) {
        return { attach: () => undefined, stop: () => undefined }
    }

    const ingest = createAccIngest()
    let repo: SessionRepository | undefined
    let queuedStatus: AccStatus | undefined
    let queuedPacket: ArrayBuffer | undefined
    let mark: RateMark | undefined
    let stopped = false
    let unlisten: UnlistenFn | undefined

    const channel = new Channel<unknown>(message => {
        const buffer = bytesOf(message)
        if (!buffer) return
        const current = repo
        if (!current) {
            queuedPacket = buffer
            return
        }
        void ingest.applyPacket(current, buffer).catch(report)
    })

    void invoke("listen_laps", { channel }).catch(report)
    void listen(ACC_STATUS_EVENT, event => {
        const status = parseAccStatus(event.payload)
        if (!status) return
        publishLink(status)
        const current = repo
        if (!current) {
            queuedStatus = status
            return
        }
        void ingest.applyStatus(current, status).catch(report)
    })
        .then(stop => {
            if (stopped) stop()
            else unlisten = stop
        })
        .catch(report)

    const attach = (next: SessionRepository): void => {
        repo = next
        const status = queuedStatus
        const packet = queuedPacket
        queuedStatus = undefined
        queuedPacket = undefined
        if (status) void ingest.applyStatus(next, status).catch(report)
        if (packet) void ingest.applyPacket(next, packet).catch(report)
    }

    const stop = (): void => {
        stopped = true
        unlisten?.()
        unlisten = undefined
    }

    const publishLink = (status: AccStatus): void => {
        const next = linkOf(status)
        const current = accLink()
        if (
            current.linked === next.linked &&
            current.presence === next.presence &&
            current.hz === next.hz &&
            current.packetId === next.packetId &&
            current.sessionId === next.sessionId
        ) {
            return
        }
        setAccLink(next)
    }

    const linkOf = (status: AccStatus): AccLink => {
        if (status.link !== "linked") {
            mark = undefined
            return {
                linked: false,
                presence:
                    status.presence === "session" ? "menu" : status.presence,
                hz: null,
                packetId: null,
                sessionId: null,
            }
        }

        const packetId = status.packetId
        let hz: number | null = null
        if (packetId == null) {
            mark = undefined
        } else {
            const rate = packetRate(mark, Date.now(), packetId)
            mark = rate.mark
            hz = rate.hz
        }
        return {
            linked: true,
            presence: status.presence,
            hz,
            packetId,
            sessionId: status.session?.id ?? null,
        }
    }

    return { attach, stop }
}

const bytesOf = (message: unknown): ArrayBuffer | undefined => {
    if (message instanceof ArrayBuffer) return message
    if (ArrayBuffer.isView(message)) {
        const view = new Uint8Array(
            message.buffer,
            message.byteOffset,
            message.byteLength
        )
        const copy = new Uint8Array(view.byteLength)
        copy.set(view)
        return copy.buffer
    }
    return undefined
}

const report = (error: unknown): void => {
    console.error(error)
}
