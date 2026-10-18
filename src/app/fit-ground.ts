export type GroundPoint = {
    x: number
    y: number
}

/**
 * Вписывает землю `x`/`z` в прямоугольник.
 * Ось `z` смотрит вверх, поэтому на экране она перевёрнута.
 * Меньше двух точек — пустая линия.
 */
export const fitGround = (
    x: ArrayLike<number>,
    z: ArrayLike<number>,
    width: number,
    height: number,
    padding: number
): GroundPoint[] => {
    const count = Math.min(x.length, z.length)
    if (count < 2 || width <= padding * 2 || height <= padding * 2) return []

    const raw: GroundPoint[] = []
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (let index = 0; index < count; index += 1) {
        const pointX = x[index]
        const pointY = -z[index]
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) continue
        raw.push({ x: pointX, y: pointY })
        if (pointX < minX) minX = pointX
        if (pointX > maxX) maxX = pointX
        if (pointY < minY) minY = pointY
        if (pointY > maxY) maxY = pointY
    }
    if (raw.length < 2) return []

    const spanX = Math.max(maxX - minX, 1e-6)
    const spanY = Math.max(maxY - minY, 1e-6)
    const scale = Math.min(
        (width - padding * 2) / spanX,
        (height - padding * 2) / spanY
    )
    const offsetX = (width - spanX * scale) / 2
    const offsetY = (height - spanY * scale) / 2

    return raw.map(point => ({
        x: offsetX + (point.x - minX) * scale,
        y: offsetY + (point.y - minY) * scale,
    }))
}
