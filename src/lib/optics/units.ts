/**
 * Unit discipline for the optics module.
 *
 * The thin-lens formulas contain terms like `(s - f)` that mix a subject
 * distance with a focal length. If `s` is in metres and `f` in millimetres
 * that subtraction is meaningless (and usually negative), so **every optics
 * function works in millimetres internally** and converts at its boundary.
 * Metre-typed values only appear in function parameter names ending in `M`.
 */

export const MM_PER_M = 1000
export const MM_PER_INCH = 25.4
export const MM_PER_FOOT = 304.8

/** Diagonal of the 36x24 mm image gate, the reference for crop factor. */
export const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24)

/** Wavelength used for the Airy disk, mid-visible green. */
export const DIFFRACTION_WAVELENGTH_NM = 550

export const mToMm = (m: number): number => m * MM_PER_M
export const mmToM = (mm: number): number => mm / MM_PER_M

export const mToFeet = (m: number): number => (m * MM_PER_M) / MM_PER_FOOT
export const feetToM = (ft: number): number => (ft * MM_PER_FOOT) / MM_PER_M
export const mToInches = (m: number): number => (m * MM_PER_M) / MM_PER_INCH

export const degToRad = (deg: number): number => (deg * Math.PI) / 180
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI

/** Clamp that also swallows NaN, returning `lo`. Used by the total normalizers. */
export function clampFinite(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo
  return Math.min(hi, Math.max(lo, value))
}
