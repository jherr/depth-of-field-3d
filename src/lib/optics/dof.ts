import { airyDiameterMm } from './coc.ts'
import { mToMm, mmToM } from './units.ts'

export interface DofInputs {
  readonly focalLengthMm: number
  readonly fNumber: number
  readonly focusDistanceM: number
  readonly cocLimitMm: number
  /** Default true. See `geometricBudgetMm` for why this stays closed-form. */
  readonly diffraction?: boolean
}

export interface DofLimits {
  readonly hyperfocalM: number
  readonly nearLimitM: number
  readonly farLimitM: number
  readonly totalDofM: number
}

export interface DofResult extends DofLimits {
  readonly inFrontM: number
  readonly behindM: number
  readonly isBeyondHyperfocal: boolean
  /** Diffraction alone already exceeds the acceptable CoC: nothing is sharp. */
  readonly diffractionLimited: boolean
  readonly airyDiameterMm: number
  /** How much of the CoC budget is left for geometric blur after diffraction. */
  readonly geometricBudgetMm: number
  /** Geometric-only values, always present, so the model stays traceable. */
  readonly geometric: DofLimits
}

/**
 * How much of the circle-of-confusion budget remains for defocus blur.
 *
 * Diffraction and defocus combine in quadrature, so the acceptable-sharpness
 * condition `sqrt(cGeo^2 + airy^2) = c` rearranges to
 * `cGeo = sqrt(c^2 - airy^2)`.
 *
 * That is worth stating plainly: diffraction does NOT force a numeric solver.
 * It simply shrinks the budget, and every closed-form depth-of-field
 * expression below keeps working unchanged. When `airy >= c` the budget is
 * zero and no distance is acceptably sharp at any focus setting.
 */
function geometricBudgetMm(cocLimitMm: number, airyMm: number, diffraction: boolean): number {
  if (!diffraction) return cocLimitMm
  return Math.sqrt(Math.max(0, cocLimitMm * cocLimitMm - airyMm * airyMm))
}

/** Relative slack for treating a focus distance as "at the hyperfocal point". */
const HYPERFOCAL_EPSILON = 1e-12

function limitsFromBudget(
  focalLengthMm: number,
  fNumber: number,
  focusDistanceM: number,
  budgetMm: number,
): DofLimits {
  const f = focalLengthMm
  const s = mToMm(focusDistanceM)

  if (!(budgetMm > 0)) {
    // No acceptable sharpness anywhere: the band collapses onto the focus plane.
    return {
      hyperfocalM: Infinity,
      nearLimitM: focusDistanceM,
      farLimitM: focusDistanceM,
      totalDofM: 0,
    }
  }

  const hMm = (f * f) / (fNumber * budgetMm) + f
  const nearMm = (s * (hMm - f)) / (hMm + s - 2 * f)
  const farDenomMm = hMm - s
  const farMm = farDenomMm <= hMm * HYPERFOCAL_EPSILON ? Infinity : (s * (hMm - f)) / farDenomMm

  return {
    hyperfocalM: mmToM(hMm),
    nearLimitM: mmToM(nearMm),
    farLimitM: farMm === Infinity ? Infinity : mmToM(farMm),
    totalDofM: farMm === Infinity ? Infinity : mmToM(farMm - nearMm),
  }
}

export function hyperfocalDistanceM(i: Omit<DofInputs, 'focusDistanceM'>): number {
  const airy = airyDiameterMm(i.fNumber)
  const budget = geometricBudgetMm(i.cocLimitMm, airy, i.diffraction !== false)
  if (!(budget > 0)) return Infinity
  return mmToM((i.focalLengthMm * i.focalLengthMm) / (i.fNumber * budget) + i.focalLengthMm)
}

export function nearLimitM(i: DofInputs): number {
  return computeDof(i).nearLimitM
}

export function farLimitM(i: DofInputs): number {
  return computeDof(i).farLimitM
}

export function computeDof(i: DofInputs): DofResult {
  const diffraction = i.diffraction !== false
  const airy = airyDiameterMm(i.fNumber)
  const budget = geometricBudgetMm(i.cocLimitMm, airy, diffraction)

  const limits = limitsFromBudget(i.focalLengthMm, i.fNumber, i.focusDistanceM, budget)
  const geometric = limitsFromBudget(i.focalLengthMm, i.fNumber, i.focusDistanceM, i.cocLimitMm)

  return {
    ...limits,
    inFrontM: i.focusDistanceM - limits.nearLimitM,
    behindM: limits.farLimitM === Infinity ? Infinity : limits.farLimitM - i.focusDistanceM,
    isBeyondHyperfocal: i.focusDistanceM >= limits.hyperfocalM * (1 - HYPERFOCAL_EPSILON),
    diffractionLimited: diffraction && airy >= i.cocLimitMm,
    airyDiameterMm: airy,
    geometricBudgetMm: budget,
    geometric,
  }
}

/** The f-number at which diffraction alone consumes the whole CoC budget. */
export function diffractionLimitFNumber(cocLimitMm: number): number {
  return cocLimitMm / airyDiameterMm(1)
}
