import { diagonalMm, sensorAspect } from './formats.ts'
import type { SensorFormat } from './formats.ts'
import { radToDeg } from './units.ts'

export interface FovResult {
  readonly vFovDeg: number
  readonly hFovDeg: number
  readonly diagFovDeg: number
  /**
   * Feed straight into `THREE.PerspectiveCamera.filmGauge`.
   *
   * three.js treats `filmGauge` as the sensor's LARGER dimension and defaults
   * it to 35 -- which is wrong for "35mm format", whose image gate is 36x24.
   * Accepting that default is a silent 2.7% field-of-view error.
   */
  readonly filmGauge: number
  /** Feed into `THREE.PerspectiveCamera.aspect`. Sensor aspect, not canvas aspect. */
  readonly aspect: number
}

const halfAngleDeg = (extentMm: number, focalLengthMm: number): number =>
  radToDeg(Math.atan(0.5 * extentMm / focalLengthMm))

export function fieldOfView(focalLengthMm: number, fmt: SensorFormat): FovResult {
  return {
    vFovDeg: 2 * halfAngleDeg(fmt.heightMm, focalLengthMm),
    hFovDeg: 2 * halfAngleDeg(fmt.widthMm, focalLengthMm),
    diagFovDeg: 2 * halfAngleDeg(diagonalMm(fmt), focalLengthMm),
    filmGauge: Math.max(fmt.widthMm, fmt.heightMm),
    aspect: sensorAspect(fmt),
  }
}

/**
 * Reimplementation of `THREE.PerspectiveCamera.setFocalLength` so a unit test
 * can prove our FOV and three's agree -- and prove they disagree when the film
 * gauge is left at its default.
 */
export function threeVFovDeg(focalLengthMm: number, filmGauge: number, aspect: number): number {
  const filmHeight = filmGauge / Math.max(aspect, 1)
  return radToDeg(2 * Math.atan(0.5 * filmHeight / focalLengthMm))
}

/** Half-size of the framed rectangle at a given distance, in metres. */
export function frameHalfExtentsAtDistance(
  fov: FovResult,
  distanceM: number,
): { halfWidthM: number; halfHeightM: number } {
  const halfHeightM = distanceM * Math.tan((fov.vFovDeg * Math.PI) / 360)
  return { halfHeightM, halfWidthM: halfHeightM * fov.aspect }
}
