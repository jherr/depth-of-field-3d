import { FULL_FRAME_DIAGONAL_MM } from './units.ts'

export type SensorFormatId =
  | 'mf-4433'
  | 'ff'
  | 'apsc-135'
  | 'apsc-16'
  | 'mft'
  | 'one-inch'
  | 'phone-1p28'

export interface SensorFormat {
  readonly id: SensorFormatId
  readonly label: string
  readonly shortLabel: string
  readonly widthMm: number
  readonly heightMm: number
  /**
   * Acceptable circle of confusion, in millimetres on the sensor.
   *
   * This is a **published convention, deliberately not computed** from
   * `diagonal / 1500`. Every DOF table and calculator in circulation uses the
   * rounded values below (full frame is 0.030, not the 0.0288 that d/1500
   * gives), and a 3-6% disagreement with PhotoPills is the kind of thing this
   * tool's audience notices immediately.
   */
  readonly cocLimitMm: number
  readonly cropFactor: number
}

/** How the acceptable circle of confusion is chosen. User-selectable. */
export type CocCriterion =
  | { readonly kind: 'formatConvention' }
  | { readonly kind: 'diagonalDivisor'; readonly divisor: number }
  | { readonly kind: 'absoluteMm'; readonly mm: number }
  /**
   * Sets `c` so the depth-of-field boundary lands exactly where the rendered
   * blur reaches `px` pixels. This is what makes the slab, the photograph and
   * the numbers demonstrably one calculation.
   */
  | { readonly kind: 'renderPixels'; readonly px: number }

export function diagonalMm(f: Pick<SensorFormat, 'widthMm' | 'heightMm'>): number {
  return Math.hypot(f.widthMm, f.heightMm)
}

export function sensorAspect(f: Pick<SensorFormat, 'widthMm' | 'heightMm'>): number {
  return f.widthMm / f.heightMm
}

export function cocLimitFromDiagonal(diagMm: number, divisor = 1500): number {
  return diagMm / divisor
}

function defineFormat(
  id: SensorFormatId,
  label: string,
  shortLabel: string,
  widthMm: number,
  heightMm: number,
  cocLimitMm: number,
): SensorFormat {
  return {
    id,
    label,
    shortLabel,
    widthMm,
    heightMm,
    cocLimitMm,
    cropFactor: FULL_FRAME_DIAGONAL_MM / Math.hypot(widthMm, heightMm),
  }
}

export const SENSOR_FORMATS: Readonly<Record<SensorFormatId, SensorFormat>> = {
  'mf-4433': defineFormat('mf-4433', 'Medium format 44x33', 'MF 44x33', 43.8, 32.9, 0.037),
  ff: defineFormat('ff', 'Full frame 36x24', 'Full frame', 36, 24, 0.03),
  'apsc-135': defineFormat('apsc-135', 'APS-C 1.5x (Nikon / Sony)', 'APS-C 1.5x', 23.5, 15.6, 0.02),
  'apsc-16': defineFormat('apsc-16', 'APS-C 1.6x (Canon)', 'APS-C 1.6x', 22.3, 14.9, 0.019),
  mft: defineFormat('mft', 'Micro Four Thirds', 'MFT', 17.3, 13.0, 0.015),
  'one-inch': defineFormat('one-inch', '1 inch type', '1"', 13.2, 8.8, 0.011),
  'phone-1p28': defineFormat('phone-1p28', 'Phone 1/1.28 inch', 'Phone', 9.8, 7.3, 0.008),
}

export const SENSOR_FORMAT_LIST: readonly SensorFormat[] = [
  SENSOR_FORMATS['mf-4433'],
  SENSOR_FORMATS.ff,
  SENSOR_FORMATS['apsc-135'],
  SENSOR_FORMATS['apsc-16'],
  SENSOR_FORMATS.mft,
  SENSOR_FORMATS['one-inch'],
  SENSOR_FORMATS['phone-1p28'],
]

export function isSensorFormatId(v: unknown): v is SensorFormatId {
  return typeof v === 'string' && v in SENSOR_FORMATS
}

/** Smallest CoC we will ever report, so downstream division is always safe. */
const MIN_COC_MM = 1e-6

export function resolveCocLimitMm(
  fmt: SensorFormat,
  criterion: CocCriterion,
  renderHeightPx: number,
): number {
  const raw = ((): number => {
    switch (criterion.kind) {
      case 'formatConvention':
        return fmt.cocLimitMm
      case 'diagonalDivisor':
        return cocLimitFromDiagonal(diagonalMm(fmt), criterion.divisor)
      case 'absoluteMm':
        return criterion.mm
      case 'renderPixels':
        return (criterion.px * fmt.heightMm) / renderHeightPx
    }
  })()
  return Number.isFinite(raw) && raw > MIN_COC_MM ? raw : fmt.cocLimitMm
}
