import {
    computeTrackBoundaries,
    parseTrackCsv,
    type TrackBoundaries,
} from "~/app/track-surface"

const FILE_BY_TRACK: Record<string, string> = {
    barcelona: "Catalunya",
    brands_hatch: "BrandsHatch",
    cota: "Austin",
    donington: "Donington",
    hungaroring: "Budapest",
    imola: "Imola",
    indianapolis: "Indianapolis",
    kyalami: "Kyalami",
    laguna_seca: "LagunaSeca",
    misano: "Misano",
    monza: "Monza",
    mount_panorama: "MountPanorama",
    nurburgring: "Nuerburgring",
    nurburgring_24h: "Nuerburgring24h",
    oulton_park: "OultonPark",
    paul_ricard: "PaulRicard",
    red_bull_ring: "Spielberg",
    silverstone: "Silverstone",
    snetterton: "Snetterton",
    spa: "Spa",
    suzuka: "Suzuka",
    valencia: "Valencia",
    watkins_glen: "WatkinsGlen",
    zandvoort: "Zandvoort",
    zolder: "Zolder",
}

const csvByPath = import.meta.glob(
    "./centerlines/*.csv",
    { eager: true, query: "?raw", import: "default" }
) as Record<string, string>

const csvByFile = new Map<string, string>()
for (const [path, csv] of Object.entries(csvByPath)) {
    const file = path
        .split("/")
        .pop()
        ?.replace(/\.csv$/u, "")
    if (file) csvByFile.set(file, csv)
}

const cache = new Map<string, TrackBoundaries>()

export const asphaltTracks = (): readonly string[] => Object.keys(FILE_BY_TRACK)

export const hasAsphalt = (track: string): boolean =>
    FILE_BY_TRACK[track] !== undefined && csvByFile.has(FILE_BY_TRACK[track])

export const boundariesFor = (track: string): TrackBoundaries | undefined => {
    const file = FILE_BY_TRACK[track]
    const source = file ? csvByFile.get(file) : undefined
    if (!source) return undefined
    const cached = cache.get(track)
    if (cached) return cached
    const bounds = computeTrackBoundaries(parseTrackCsv(source))
    cache.set(track, bounds)
    return bounds
}
