import { MM_PER_FOOT, MM_PER_INCH, MM_PER_M } from './units.ts'

export type UnitSystem = 'metric' | 'imperial'

export const INFINITY_GLYPH = '∞'
const NO_VALUE = '—'

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/**
 * Distances are stored in metres and formatted at the display layer only, so
 * switching unit systems can never affect the optics.
 */
export function formatDistance(metres: number, units: UnitSystem): string {
  if (metres === Infinity) return INFINITY_GLYPH
  if (!Number.isFinite(metres) || metres < 0) return NO_VALUE

  if (units === 'imperial') {
    const feet = (metres * MM_PER_M) / MM_PER_FOOT
    if (feet < 1) {
      const inches = (metres * MM_PER_M) / MM_PER_INCH
      return `${inches.toFixed(1)} in`
    }
    if (feet < 10) return `${feet.toFixed(2)} ft`
    if (feet < 100) return `${feet.toFixed(1)} ft`
    return `${feet.toFixed(0)} ft`
  }

  if (metres < 0.01) return `${(metres * MM_PER_M).toFixed(1)} mm`
  const cm = metres * 100
  if (cm < 100) return cm < 10 ? `${cm.toFixed(1)} cm` : `${cm.toFixed(0)} cm`
  if (metres < 10) return `${metres.toFixed(2)} m`
  if (metres < 100) return `${metres.toFixed(1)} m`
  return `${metres.toFixed(0)} m`
}

export function formatFNumber(fNumber: number): string {
  if (!Number.isFinite(fNumber)) return NO_VALUE
  return `f/${Number.isInteger(fNumber) ? fNumber : trimZeros(fNumber.toFixed(1))}`
}

export function formatFocalLength(focalLengthMm: number): string {
  if (!Number.isFinite(focalLengthMm)) return NO_VALUE
  return `${focalLengthMm.toFixed(0)}mm`
}

/** Millimetres on the sensor, at the precision that distinguishes CoC values. */
export function formatMm(mm: number): string {
  if (!Number.isFinite(mm)) return NO_VALUE
  return `${mm.toFixed(3)} mm`
}

export function formatStopsDifference(fNumber: number, wideOpen: number): string {
  if (!(fNumber > 0) || !(wideOpen > 0)) return NO_VALUE
  const stops = 2 * Math.log2(fNumber / wideOpen)
  const rounded = Math.round(stops * 3) / 3
  if (Math.abs(rounded) < 1 / 6) return 'wide open'
  const n = trimZeros(rounded.toFixed(1))
  return `${rounded > 0 ? '+' : ''}${n} stop${Math.abs(rounded) === 1 ? '' : 's'}`
}

/** Angle of view, for the HUD. */
export function formatDegrees(deg: number): string {
  if (!Number.isFinite(deg)) return NO_VALUE
  return `${deg.toFixed(1)}°`
}
