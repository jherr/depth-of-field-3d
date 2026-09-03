export interface SensorViewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const EMPTY: SensorViewport = { x: 0, y: 0, width: 0, height: 0 }

/**
 * The letterboxed rectangle, inside a container, that has exactly the sensor's
 * aspect ratio.
 *
 * Shared by the render pipeline and the HUD, and that sharing is the point:
 * the millimetres-to-pixels conversion behind every blur radius is only valid
 * if the render target's aspect matches the sensor's, and the HUD's frame lines
 * only match the image if both are derived from the same rectangle.
 */
export function computeSensorViewport(
  containerWidthPx: number,
  containerHeightPx: number,
  sensorAspect: number,
): SensorViewport {
  const cw = Number.isFinite(containerWidthPx) && containerWidthPx > 0 ? containerWidthPx : 0
  const ch = Number.isFinite(containerHeightPx) && containerHeightPx > 0 ? containerHeightPx : 0
  if (cw === 0 || ch === 0) return EMPTY

  const aspect =
    Number.isFinite(sensorAspect) && sensorAspect > 0 ? sensorAspect : cw / ch

  if (cw / ch > aspect) {
    const width = ch * aspect
    return { x: (cw - width) / 2, y: 0, width, height: ch }
  }
  const height = cw / aspect
  return { x: 0, y: (ch - height) / 2, width: cw, height }
}
