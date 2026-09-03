import { DIFFRACTION_WAVELENGTH_NM, mToMm, mmToM } from './units.ts'

export interface CocInputs {
  readonly focalLengthMm: number
  readonly fNumber: number
  readonly focusDistanceM: number
}

/**
 * Signed diameter of the blur disc a point at `subjectDistanceM` projects onto
 * the sensor, in millimetres.
 *
 *     C = f^2 / (N (s - f))  *  (z - s) / z
 *
 * Negative in FRONT of the plane of focus, positive BEHIND it. The sign is
 * load-bearing: the shader uses it to split the near and far fields without a
 * second texture channel.
 *
 * Note that `C` depends on `(z - s) / z`, not on `z - s`. That single factor is
 * the whole reason depth of field is asymmetric about the focus plane, and it
 * means a subject at 1.5 m and one at 3.0 m blur identically when focus is at
 * 2 m.
 */
export function signedCocDiameterMm(i: CocInputs, subjectDistanceM: number): number {
  if (!(subjectDistanceM > 0)) return 0
  const f = i.focalLengthMm
  const s = mToMm(i.focusDistanceM)
  const z = mToMm(subjectDistanceM)
  const denom = i.fNumber * (s - f)
  // Focusing at or inside the focal length is not physical; real lenses forbid
  // it via their minimum focus distance. Degrade to "no blur" rather than NaN.
  if (!(denom > 0)) return 0
  return ((f * f) / denom) * ((z - s) / z)
}

export function cocDiameterMm(i: CocInputs, subjectDistanceM: number): number {
  return Math.abs(signedCocDiameterMm(i, subjectDistanceM))
}

/**
 * Diameter of the Airy disk, in millimetres: `2.44 * lambda * N`.
 *
 * This is the floor on sharpness that no amount of stopping down can beat. On
 * full frame it consumes the entire 0.030 mm budget by f/22.4; on Micro Four
 * Thirds by f/11.2. Omitting it makes a tool claim vast depth of field at f/32
 * where a real photograph is soft everywhere.
 */
export function airyDiameterMm(fNumber: number, wavelengthNm = DIFFRACTION_WAVELENGTH_NM): number {
  return 2.44 * (wavelengthNm * 1e-6) * fNumber
}

export function effectiveCocDiameterMm(
  i: CocInputs,
  subjectDistanceM: number,
  opts?: { diffraction?: boolean },
): number {
  const geo = cocDiameterMm(i, subjectDistanceM)
  if (opts?.diffraction === false) return geo
  return Math.hypot(geo, airyDiameterMm(i.fNumber))
}

/** Millimetres on the sensor to pixels in the render target. */
export function mmToRenderPixels(mm: number, sensorHeightMm: number, renderHeightPx: number): number {
  return mm * (renderHeightPx / sensorHeightMm)
}

/**
 * Blur RADIUS in render pixels -- what the gather kernel wants.
 * `signedCocDiameterMm` returns a diameter, so this halves it.
 */
export function cocRadiusPx(
  i: CocInputs,
  subjectDistanceM: number,
  sensorHeightMm: number,
  renderHeightPx: number,
): number {
  return mmToRenderPixels(cocDiameterMm(i, subjectDistanceM), sensorHeightMm, renderHeightPx) / 2
}

/**
 * The inverse of `signedCocDiameterMm`: the two distances at which the blur
 * disc reaches `cMm`.
 *
 * Solving `c = f^2|z-s| / (N(s-f)z)` for z gives
 * `z = f^2 s / (f^2 -/+ c N (s - f))`, so this is an independent derivation of
 * the near and far depth-of-field limits. `invariants.test.ts` asserts it
 * matches `dof.ts` to 1e-12 across the whole parameter space -- that agreement
 * is what lets the HUD numbers and the rendered blur be trusted together.
 */
export function distancesAtCocMm(i: CocInputs, cMm: number): { nearM: number; farM: number } {
  const f = i.focalLengthMm
  const s = mToMm(i.focusDistanceM)
  const a = f * f
  const b = cMm * i.fNumber * (s - f)
  const farDenom = a - b
  return {
    nearM: mmToM((a * s) / (a + b)),
    farM: farDenom <= 0 ? Infinity : mmToM((a * s) / farDenom),
  }
}
