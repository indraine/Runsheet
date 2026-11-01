"""Convert ACC MoTeC .ld laps into Runsheet reference laps (src/db/reference/*.json).

Usage: python3 scripts/ld-to-reference.py <folder with .ld files>

Each file is one lap. Output is a compact JSON per track and car: channels on a
4 m distance grid in Runsheet units (km/h, 0..1 pedals, ACC gear numbering).
MoTeC logs of ACC have no positions or lap distance, so the distance is the
integral of speed scaled to the centre line length of the track.
"""
import glob, json, math, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from ldparser import ldData

ROOT = os.path.join(os.path.dirname(__file__), "..")
GRID_M = 4.0
STEER_RAD_PER_DEG = -0.0049  # calibrated on Monza: user laps give ~0.12 rad per g

TRACKS = {  # venue in the .ld -> (Runsheet track code, centre line file)
    "brands_hatch": ("brands_hatch", "BrandsHatch"),
    "cota": ("cota", "Austin"),
    "donington": ("donington", "Donington"),
    "hungaroring": ("hungaroring", "Budapest"),
    "suzuka": ("suzuka", "Suzuka"),
    "zolder": ("zolder", "Zolder"),
    "imola": ("imola", "Imola"),
    "kyalami": ("kyalami", "Kyalami"),
    "laguna_seca": ("laguna_seca", "LagunaSeca"),
    "monza": ("monza", "Monza"),
    "nurburgring_24h": ("nurburgring_24h", "Nuerburgring24h"),
    "nurburgring": ("nurburgring", "Nuerburgring"),
    "paul_ricard": ("paul_ricard", "PaulRicard"),
    "red_bull_ring": ("red_bull_ring", "Spielberg"),
    "silverstone": ("silverstone", "Silverstone"),
    "spa": ("spa", "Spa"),
    "watkins_glen": ("watkins_glen", "WatkinsGlen"),
    "zandvoort": ("zandvoort", "Zandvoort"),
}
CARS = {
    "296 GT3": "ferrari_296_gt3",
    "M4 GT3": "bmw_m4_gt3",
    "Mustang GT3": "ford_mustang_gt3",
    "McLaren 720S GT3 Evo": "mclaren_720s_gt3_evo",
}


def centre_length(name):
    path = os.path.join(ROOT, "src/app/centerlines", name + ".csv")
    pts = [tuple(map(float, l.split(",")[:2])) for l in open(path) if l.strip() and not l.startswith("#")]
    return sum(math.hypot(pts[(i + 1) % len(pts)][0] - p[0], pts[(i + 1) % len(pts)][1] - p[1]) for i, p in enumerate(pts))


def resample(values, src_hz, dist, grid):
    """Linear interpolation of a channel recorded at src_hz onto the distance grid."""
    out, j, n = [], 0, len(values)
    for g in grid:
        t = g * 0  # placeholder to keep the loop explicit
        while j < len(dist) - 2 and dist[j + 1] < g:
            j += 1
        span = dist[j + 1] - dist[j]
        k = 0.0 if span <= 0 else min(1.0, max(0.0, (g - dist[j]) / span))
        # distance is defined per speed sample (60 Hz); map to this channel's index
        pos = (j + k) * src_hz / SPEED_HZ
        i = min(n - 1, int(pos))
        f = pos - i
        a, b = values[i], values[min(n - 1, i + 1)]
        out.append(a + (b - a) * f)
    return out


def best_lap_window(path):
    """Seconds (start, end) of the fastest lap between beacons of a multi-lap session, else None."""
    ldx = os.path.splitext(path)[0] + ".ldx"
    if not os.path.exists(ldx):
        return None
    times = sorted(float(t) / 1e6 for t in re.findall(r'ClassName="BCN"[^>]*Time="([^"]+)"', open(ldx).read()))
    if len(times) < 2:
        return None
    laps = [(times[i + 1] - times[i], times[i], times[i + 1]) for i in range(len(times) - 1)]
    _, a, b = min(laps)
    return a, b

def convert(path):
    global SPEED_HZ
    data = ldData.fromfile(path)
    window = best_lap_window(path)
    if window:
        for c in data.channs:
            c._data = c.data[int(window[0] * c.freq):int(window[1] * c.freq)]
    venue = (data.head.venue or "").lower()
    if venue not in TRACKS:
        return None
    car = CARS.get(data.head.event.venue.vehicle.id) if data.head.event and data.head.event.venue and data.head.event.venue.vehicle else None
    if car is None:
        return None
    track, centre = TRACKS[venue]
    ch = {c.name: c for c in data.channs}
    speed = [v * 3.6 for v in ch["SPEED"].data]
    SPEED_HZ = ch["SPEED"].freq
    cum = [0.0]
    for v in speed[:-1]:
        cum.append(cum[-1] + v / 3.6 / SPEED_HZ)
    length = centre_length(centre)
    scale = length / cum[-1]
    dist = [d * scale for d in cum]
    grid = [i * GRID_M for i in range(int(dist[-1] // GRID_M) + 1)]

    def get(name, hz_of=None):
        return resample(ch[name].data, ch[name].freq, dist, grid)

    time_ms = [round(g / dist[-1] * (len(speed) / SPEED_HZ) * 1000) for g in grid]
    # time follows the integrated distance exactly, not the linear guess above
    time_ms = [round(v * 1000 / SPEED_HZ * 1.0) for v in resample([i for i in range(len(speed))], SPEED_HZ, dist, grid)]
    out = {
        "distance": grid,
        "time": time_ms,
        "speed": get("SPEED"),
        "throttle": get("THROTTLE"),
        "brake": get("BRAKE"),
        "steer": get("STEERANGLE"),
        "gear": get("GEAR"),
        "gLong": get("G_LON"),
        "gLat": get("G_LAT"),
        "pressureFl": get("TYRE_PRESS_LF"),
        "pressureFr": get("TYRE_PRESS_RF"),
        "pressureRl": get("TYRE_PRESS_LR"),
        "pressureRr": get("TYRE_PRESS_RR"),
        "brakeTempFl": get("BRAKE_TEMP_LF"),
        "brakeTempFr": get("BRAKE_TEMP_RF"),
        "rpm": get("RPMS"),
    }
    out["speed"] = [v * 3.6 for v in out["speed"]]
    out["throttle"] = [v / 100 for v in out["throttle"]]
    out["brake"] = [v / 100 for v in out["brake"]]
    out["steer"] = [v * STEER_RAD_PER_DEG for v in out["steer"]]
    out["gear"] = [round(v) + 1 for v in out["gear"]]
    out["rpm"] = [round(v) for v in out["rpm"]]
    for k in ("brakeTempFl", "brakeTempFr"):
        out[k] = [round(v) for v in out[k]]
    for k in ("speed", "gLong", "gLat", "pressureFl", "pressureFr", "pressureRl", "pressureRr"):
        out[k] = [round(v, 1 if k == "speed" else 2) for v in out[k]]
    out["steer"] = [round(v, 3) for v in out["steer"]]
    out["throttle"] = [round(v, 2) for v in out["throttle"]]
    out["brake"] = [round(v, 2) for v in out["brake"]]
    out["distance"] = [round(v, 1) for v in grid]
    return {
        "track": track,
        "car": car,
        "driver": data.head.driver or None,
        "recordedAt": int(data.head.datetime.timestamp() * 1000),
        "timeMs": round(len(speed) / SPEED_HZ * 1000),
        "maxSpeed": round(max(speed), 1),
        "lengthM": round(dist[-1]),
        "channels": out,
    }


if __name__ == "__main__":
    src = sys.argv[1]
    dest = os.path.join(ROOT, "src/db/reference")
    os.makedirs(dest, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(src, "*.ld"))):
        result = convert(path)
        if result is None:
            print("skip", os.path.basename(path))
            continue
        name = "%s-%s.json" % (result["track"], result["car"])
        with open(os.path.join(dest, name), "w") as f:
            json.dump(result, f, separators=(",", ":"))
        print(name, result["timeMs"], "ms", result["lengthM"], "m", len(result["channels"]["distance"]), "points")
