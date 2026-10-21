export type GroundPoint = {
    x: number
    y: number
}

/** Одна ломаная в мировых `x`/`z`. */
export type GroundSeries = {
    x: ArrayLike<number>
    z: ArrayLike<number>
}

/**
 * Вписывает несколько ломаных в один прямоугольник.
 * Общая рамка нужна, чтобы короткий круг лёг на уже нарисованную трассу,
 * а не растянулся на всё полотно.
 * Ось `z` смотрит вверх, поэтому на экране она перевёрнута.
 */
export const fitFrame = (
    series: readonly GroundSeries[],
    width: number,
    height: number,
    padding: number
): GroundPoint[][] => {
    if (width <= padding * 2 || height <= padding * 2) {
        return series.map(() => [])
    }

    const raw = series.map(item => collect(item.x, item.z))
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const points of raw) {
        for (const point of points) {
            if (point.x < minX) minX = point.x
            if (point.x > maxX) maxX = point.x
            if (point.y < minY) minY = point.y
            if (point.y > maxY) maxY = point.y
        }
    }
    if (!Number.isFinite(minX)) return series.map(() => [])

    const spanX = Math.max(maxX - minX, 1e-6)
    const spanY = Math.max(maxY - minY, 1e-6)
    const scale = Math.min(
        (width - padding * 2) / spanX,
        (height - padding * 2) / spanY
    )
    const offsetX = (width - spanX * scale) / 2
    const offsetY = (height - spanY * scale) / 2

    return raw.map(points =>
        points.map(point => ({
            x: offsetX + (point.x - minX) * scale,
            y: offsetY + (point.y - minY) * scale,
        }))
    )
}

const collect = (x: ArrayLike<number>, z: ArrayLike<number>): GroundPoint[] => {
    const count = Math.min(x.length, z.length)
    const raw: GroundPoint[] = []
    for (let index = 0; index < count; index += 1) {
        const pointX = x[index]
        const pointY = -z[index]
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) continue
        raw.push({ x: pointX, y: pointY })
    }
    return raw
}
