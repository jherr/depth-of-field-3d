import type { SensorFormatId } from './formats.ts'

/**
 * Aperture values in third-stop increments, f/1.0 to f/32.
 * Each step multiplies the f-number by roughly 2^(1/6).
 */
export const THIRD_STOPS: readonly number[] = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11,
  13, 14, 16, 18, 20, 22, 25, 29, 32,
]

export interface LensPreset {
  readonly id: string
  readonly label: string
  /** `[wide, tele]`; equal values mean a prime. */
  readonly focalRangeMm: readonly [number, number]
  readonly maxApertureWide: number
  /** Equal to `maxApertureWide` for a constant-aperture design. */
  readonly maxApertureTele: number
  readonly minAperture: number
  /** Diaphragm blade count. 0 means a fixed, always-circular opening. */
  readonly apertureBlades: number
  readonly bladesAreRounded: boolean
  readonly minFocusDistanceM: number
  readonly nativeFormats: readonly SensorFormatId[]
}

const FF: readonly SensorFormatId[] = ['mf-4433', 'ff', 'apsc-135', 'apsc-16']
const CROP: readonly SensorFormatId[] = ['apsc-135', 'apsc-16', 'mft']

/**
 * Blade counts and minimum focus distances are taken from published
 * manufacturer specifications. They drive the bokeh polygon, so they are worth
 * re-checking against a current spec sheet before trusting the shape of a
 * highlight -- see the open items in the design notes.
 */
export const LENS_PRESETS: readonly LensPreset[] = [
  {
    id: 'ef-14-2p8',
    label: '14mm f/2.8 ultra-wide',
    focalRangeMm: [14, 14],
    maxApertureWide: 2.8,
    maxApertureTele: 2.8,
    minAperture: 22,
    apertureBlades: 6,
    bladesAreRounded: false,
    minFocusDistanceM: 0.2,
    nativeFormats: FF,
  },
  {
    id: 'art-35-1p4',
    label: '35mm f/1.4 Art',
    focalRangeMm: [35, 35],
    maxApertureWide: 1.4,
    maxApertureTele: 1.4,
    minAperture: 16,
    apertureBlades: 9,
    bladesAreRounded: true,
    minFocusDistanceM: 0.3,
    nativeFormats: FF,
  },
  {
    id: 'ef-50-1p4',
    label: '50mm f/1.4 standard prime',
    focalRangeMm: [50, 50],
    maxApertureWide: 1.4,
    maxApertureTele: 1.4,
    minAperture: 22,
    apertureBlades: 8,
    bladesAreRounded: true,
    minFocusDistanceM: 0.45,
    nativeFormats: FF,
  },
  {
    id: 'helios-44-2-58-2',
    label: 'Helios 44-2 58mm f/2',
    focalRangeMm: [58, 58],
    maxApertureWide: 2,
    maxApertureTele: 2,
    minAperture: 16,
    // Straight blades: the classic hard-edged octagonal bokeh. This preset
    // exists so the polygonal aperture path is visible, not theoretical.
    apertureBlades: 8,
    bladesAreRounded: false,
    minFocusDistanceM: 0.5,
    nativeFormats: FF,
  },
  {
    id: 'rf-85-1p2',
    label: '85mm f/1.2 portrait',
    focalRangeMm: [85, 85],
    maxApertureWide: 1.2,
    maxApertureTele: 1.2,
    minAperture: 16,
    apertureBlades: 9,
    bladesAreRounded: true,
    minFocusDistanceM: 0.85,
    nativeFormats: FF,
  },
  {
    id: 'ef-100-2p8-macro',
    label: '100mm f/2.8 macro',
    focalRangeMm: [100, 100],
    maxApertureWide: 2.8,
    maxApertureTele: 2.8,
    minAperture: 32,
    apertureBlades: 9,
    bladesAreRounded: true,
    minFocusDistanceM: 0.3,
    nativeFormats: FF,
  },
  {
    id: 'ef-400-2p8',
    label: '400mm f/2.8 super-telephoto',
    focalRangeMm: [400, 400],
    maxApertureWide: 2.8,
    maxApertureTele: 2.8,
    minAperture: 32,
    apertureBlades: 9,
    bladesAreRounded: true,
    minFocusDistanceM: 2.5,
    nativeFormats: FF,
  },
  {
    id: 'ef-24-70-2p8',
    label: '24-70mm f/2.8 standard zoom',
    focalRangeMm: [24, 70],
    maxApertureWide: 2.8,
    maxApertureTele: 2.8,
    minAperture: 22,
    apertureBlades: 9,
    bladesAreRounded: true,
    minFocusDistanceM: 0.38,
    nativeFormats: FF,
  },
  {
    id: 'ef-70-200-2p8',
    label: '70-200mm f/2.8 telephoto zoom',
    focalRangeMm: [70, 200],
    maxApertureWide: 2.8,
    maxApertureTele: 2.8,
    minAperture: 32,
    apertureBlades: 8,
    bladesAreRounded: true,
    minFocusDistanceM: 1.2,
    nativeFormats: FF,
  },
  {
    id: 'rf-24-105-4-7p1',
    label: '24-105mm f/4-7.1 kit zoom',
    focalRangeMm: [24, 105],
    maxApertureWide: 4,
    maxApertureTele: 7.1,
    minAperture: 29,
    apertureBlades: 7,
    bladesAreRounded: true,
    minFocusDistanceM: 0.4,
    nativeFormats: FF,
  },
  {
    id: 'mft-25-1p4',
    label: '25mm f/1.4 (MFT normal)',
    focalRangeMm: [25, 25],
    maxApertureWide: 1.4,
    maxApertureTele: 1.4,
    minAperture: 16,
    apertureBlades: 7,
    bladesAreRounded: true,
    minFocusDistanceM: 0.3,
    nativeFormats: CROP,
  },
  {
    id: 'gf-110-2',
    label: '110mm f/2 (medium format)',
    focalRangeMm: [110, 110],
    maxApertureWide: 2,
    maxApertureTele: 2,
    minAperture: 22,
    apertureBlades: 9,
    bladesAreRounded: true,
    minFocusDistanceM: 0.9,
    nativeFormats: ['mf-4433'],
  },
  {
    id: 'phone-6p8-1p78',
    label: 'Phone 6.8mm f/1.78 (24mm equiv.)',
    focalRangeMm: [6.8, 6.8],
    maxApertureWide: 1.78,
    maxApertureTele: 1.78,
    // A phone lens has no diaphragm at all: the aperture is fixed.
    minAperture: 1.78,
    apertureBlades: 0,
    bladesAreRounded: true,
    minFocusDistanceM: 0.08,
    nativeFormats: ['phone-1p28'],
  },
]

const BY_ID = new Map(LENS_PRESETS.map((l) => [l.id, l]))

export function getLens(id: string): LensPreset | undefined {
  return BY_ID.get(id)
}

export function isPrime(lens: LensPreset): boolean {
  return lens.focalRangeMm[0] === lens.focalRangeMm[1]
}

export function clampFocalLength(lens: LensPreset, focalLengthMm: number): number {
  const [wide, tele] = lens.focalRangeMm
  if (!Number.isFinite(focalLengthMm)) return wide
  return Math.min(tele, Math.max(wide, focalLengthMm))
}

/**
 * Widest available aperture at a given focal length.
 *
 * Variable-aperture zooms follow `N(fl) = Nwide * (fl / flWide)^k`, the
 * sub-linear entrance-pupil growth model, with `k` fixed by the published wide
 * and tele values. Real lenses step discretely at focal lengths the
 * manufacturer does not publish, so treat intermediate values as an
 * approximation of the ramp rather than a specification.
 */
export function maxApertureAt(lens: LensPreset, focalLengthMm: number): number {
  const [wide, tele] = lens.focalRangeMm
  if (isPrime(lens) || lens.maxApertureWide === lens.maxApertureTele) return lens.maxApertureWide
  const fl = clampFocalLength(lens, focalLengthMm)
  const k = Math.log(lens.maxApertureTele / lens.maxApertureWide) / Math.log(tele / wide)
  return lens.maxApertureWide * Math.pow(fl / wide, k)
}

export function snapToStop(fNumber: number, stops: readonly number[]): number {
  if (stops.length === 0) return fNumber
  if (!Number.isFinite(fNumber)) return stops[0]!
  let best = stops[0]!
  let bestDelta = Math.abs(fNumber - best)
  for (const s of stops) {
    const d = Math.abs(fNumber - s)
    if (d < bestDelta) {
      best = s
      bestDelta = d
    }
  }
  return best
}

/**
 * The stops this lens actually offers at this focal length.
 *
 * The wide-open value is included even when it is not a standard third-stop,
 * because a lens's maximum aperture is a physical fact about the barrel and
 * f/1.78 is a real setting on a phone.
 */
export function availableStops(lens: LensPreset, focalLengthMm: number): readonly number[] {
  const maxAp = maxApertureAt(lens, focalLengthMm)
  const inRange = THIRD_STOPS.filter((s) => s >= maxAp - 1e-9 && s <= lens.minAperture + 1e-9)
  const hasMax = inRange.some((s) => Math.abs(s - maxAp) < 1e-6)
  return hasMax ? inRange : [maxAp, ...inRange]
}

export interface LensBoundParams {
  readonly focalLengthMm: number
  readonly fNumber: number
  readonly focusDistanceM: number
}

/** Longest focus distance the tool will model, metres. */
export const MAX_FOCUS_DISTANCE_M = 1000

export function clampToLens(lens: LensPreset, p: LensBoundParams): LensBoundParams {
  const focalLengthMm = clampFocalLength(lens, p.focalLengthMm)
  const fNumber = snapToStop(p.fNumber, availableStops(lens, focalLengthMm))
  const focusDistanceM = Number.isFinite(p.focusDistanceM)
    ? Math.min(MAX_FOCUS_DISTANCE_M, Math.max(lens.minFocusDistanceM, p.focusDistanceM))
    : lens.minFocusDistanceM
  return { focalLengthMm, fNumber, focusDistanceM }
}

/** How many stops down from wide open, for the rounded-blade bokeh model. */
export function stopsDownFromWideOpen(lens: LensPreset, focalLengthMm: number, fNumber: number): number {
  const maxAp = maxApertureAt(lens, focalLengthMm)
  if (!(maxAp > 0) || !(fNumber > 0)) return 0
  return Math.max(0, 2 * Math.log2(fNumber / maxAp))
}
