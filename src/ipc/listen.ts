import { Channel, invoke, isTauri } from "@tauri-apps/api/core"
import { applyAccLink, publishLiveClock, type AccLink } from "~/app/status"
import type { SessionRepository } from "~/db"
import { createAccIngest } from "~/ipc/ingest"
import {
    liveClockFromStatus,
    packetRate,
    parseAccStatus,
    type AccStatus,
    type RateMark,
} from "~/ipc/status"

export type AccFeed = {
    attach: (repo: SessionRepository) => void
    stop: () => void
}

let feed: AccFeed | undefined

export const startAccFeed = (): AccFeed => {
    if (!isTauri()) {
        return { attach: () => undefined, stop: () => undefined }
    }
    if (!feed) {
        feed = createFeed()
    }
    return feed
}

const createFeed = (): AccFeed => {
    const ingest = createAccIngest()
    let repo: SessionRepository | undefined
    let queuedStatus: AccStatus | undefined
    let queuedPacket: ArrayBuffer | undefined
    let mark: RateMark | undefined

    const applyUi = (status: AccStatus): void => {
        applyAccLink(linkOf(status))
        publishLiveClock(liveClockFromStatus(status))
        const current = repo
        if (!current) {
            queuedStatus = status
            return
        }
        void ingest.applyStatus(current, status).catch(report)
    }

    const statusChannel = new Channel<unknown>(message => {
        const status = parseAccStatus(message)
        if (!status) return
        applyUi(status)
    })

    const lapChannel = new Channel<unknown>(message => {
        const buffer = bytesOf(message)
        if (!buffer) return
        const current = repo
        if (!current) {
            queuedPacket = buffer
            return
        }
        void ingest.applyPacket(current, buffer).catch(report)
    })

    void invoke("listen_laps", { channel: lapChannel }).catch(report)
    void invoke("listen_status", { channel: statusChannel }).catch(report)

    const attach = (next: SessionRepository): void => {
        repo = next
        const status = queuedStatus
        const packet = queuedPacket
        queuedStatus = undefined
        queuedPacket = undefined
        if (status) {
            applyAccLink(linkOf(status))
            void ingest.applyStatus(next, status).catch(report)
        }
        if (packet) void ingest.applyPacket(next, packet).catch(report)
    }

    const linkOf = (status: AccStatus): AccLink => {
        if (status.link !== "linked") {
            mark = undefined
            return {
                linked: false,
                presence: status.presence,
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

    return { attach, stop: () => undefined }
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
