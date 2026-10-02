import { signedCocDiameterMm } from './coc.ts'
import type { CocInputs } from './coc.ts'
import { mToMm } from './units.ts'

/**
 * Will a camera see moiré on an LED wall, and how far out of focus does the
 * wall have to be to stop it?
 *
 * Moiré on an LED wall is aliasing: the regular grid of LED pixels, imaged onto
 * the regular grid of sensor photosites, beats into a low-frequency pattern
 * whenever the pixel grid lands near or above the sensor's Nyquist frequency.
 * Defocus is the lever the camera operator actually has -- throwing the wall out
 * of focus is a low-pass filter, and once the defocus blur disc is wider than
 * one LED pixel the grid is smeared below the frequency that aliases.
 *
 * So the whole question reduces to one comparison, both quantities measured in
 * real-world millimetres AT THE WALL:
 *
 *     defocus blur diameter   vs.   LED pixel pitch
 *
 * This module computes the blur, divides by the pitch, and reports how many LED
 * pixels the blur spans. That ratio is the single number a lighting or camera
 * designer needs while laying a shot out in CAD.
 */

export type MoireRisk = 'safe' | 'marginal' | 'risk'

export interface LedWallSpec {
  /** Axial distance from the lens to the LED wall, metres. */
  readonly distanceM: number
  /** LED pixel pitch: centre-to-centre spacing of the emitters, millimetres. */
  readonly pitchMm: number
}

export interface MoireAssessment {
  /** Object-space defocus blur diameter at the wall, millimetres. */
  readonly blurMm: number
  readonly pitchMm: number
  /** `blurMm / pitchMm`: how many LED pixels one blur disc covers. */
  readonly ratio: number
  readonly risk: MoireRisk
  /**
   * The f-number you could stop down to and still stay out of moiré at this
   * geometry, or `null` if even wide open cannot clear it (the only fixes left
   * are a longer lens, a closer focus, or moving the camera).
   *
   * Stopping down shrinks the blur, so this is an upper bound: anything wider
   * than this is also safe.
   */
  readonly safeFNumber: number | null
}

/**
 * Blur spans at least this many LED pixels -> the grid is low-passed away and
 * moiré is suppressed. Covering a full pixel (ratio 1) is the theoretical floor;
 * requiring two gives the margin real footage needs once the Bayer colour grid
 * and lens aberrations are in play.
 */
export const MOIRE_SAFE_RATIO = 2
/** Below this the blur is narrower than one pixel and moiré is likely. */
export const MOIRE_MARGINAL_RATIO = 1

/**
 * Diameter of the defocus blur disc a point on the wall projects back onto the
 * wall plane, in real-world millimetres.
 *
 * The renderer and the HUD both work from `signedCocDiameterMm`, which is the
 * blur measured ON THE SENSOR. A point at distance `z` images at magnification
 * `f / (z - f)`, so dividing the sensor-side blur by that magnification --
 * multiplying by `(z - f) / f` -- rephrases it as a size at the wall, which is
 * the only frame in which it is comparable to an LED pixel pitch.
 *
 * Diffraction is deliberately excluded: it is fixed by the f-number and tiny at
 * the apertures this tool lives in, and defocus is the lever being designed
 * around.
 */
export function objectSpaceBlurMm(i: CocInputs, wallDistanceM: number): number {
  if (!(wallDistanceM > 0)) return 0
  const z = mToMm(wallDistanceM)
  const f = i.focalLengthMm
  // A wall at or inside the focal length is not a real shot; degrade to no blur
  // rather than a negative magnification.
  if (!(z > f)) return 0
  const cSensor = Math.abs(signedCocDiameterMm(i, wallDistanceM))
  return (cSensor * (z - f)) / f
}

export function moireRisk(ratio: number): MoireRisk {
  if (ratio >= MOIRE_SAFE_RATIO) return 'safe'
  if (ratio >= MOIRE_MARGINAL_RATIO) return 'marginal'
  return 'risk'
}

/**
 * How strongly to draw the synthesized moiré overlay on the wall, 0..1.
 *
 * This is the visual twin of the risk bands: full strength while the blur is
 * narrower than one LED pixel (the wall is sharp enough to alias), fading to
 * nothing by the time the blur spans the safe number of pixels (the wall is
 * defocused enough that the grid is gone). It is a stylised cue, not a sampled
 * beat frequency -- a rasteriser cannot reproduce the real sensor/LED interference
 * -- so it is tied to the same ratio the readout reports rather than to the
 * render's own pixels.
 */
export function moireStrength(ratio: number): number {
  if (!(ratio > 0)) return 1
  if (ratio >= MOIRE_SAFE_RATIO) return 0
  if (ratio <= MOIRE_MARGINAL_RATIO) return 1
  return (MOIRE_SAFE_RATIO - ratio) / (MOIRE_SAFE_RATIO - MOIRE_MARGINAL_RATIO)
}

/**
 * The f-number at which the blur spans exactly `targetRatio` LED pixels.
 *
 * Blur is proportional to `1 / N` (the f-number enters the circle of confusion
 * only through the aperture diameter `f / N`), so the blur at `N = 1` fixes the
 * whole curve: `N = blur(1) / (pitch * targetRatio)`. Returns `Infinity` when
 * the geometry gives no blur at all (focus sitting on the wall), meaning no
 * aperture can help.
 */
export function fNumberForRatio(
  i: CocInputs,
  wall: LedWallSpec,
  targetRatio: number,
): number {
  if (!(wall.pitchMm > 0) || !(targetRatio > 0)) return Infinity
  const blurAtF1 = objectSpaceBlurMm({ ...i, fNumber: 1 }, wall.distanceM)
  if (!(blurAtF1 > 0)) return Infinity
  return blurAtF1 / (wall.pitchMm * targetRatio)
}

export function assessMoire(i: CocInputs, wall: LedWallSpec): MoireAssessment {
  const blurMm = objectSpaceBlurMm(i, wall.distanceM)
  const pitchMm = wall.pitchMm
  const ratio = pitchMm > 0 ? blurMm / pitchMm : 0
  const safeN = fNumberForRatio(i, wall, MOIRE_SAFE_RATIO)
  return {
    blurMm,
    pitchMm,
    ratio,
    risk: moireRisk(ratio),
    safeFNumber: Number.isFinite(safeN) ? safeN : null,
  }
}
