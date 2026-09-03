import { describe, expect, it } from 'vitest'
import { cocDiameterMm, distancesAtCocMm } from '#/lib/optics/coc.ts'
import { computeDof } from '#/lib/optics/dof.ts'
import { SENSOR_FORMAT_LIST } from '#/lib/optics/formats.ts'

/**
 * The central claim of this project: the numbers in the HUD and the blur in the
 * shader are ONE equation solved in two directions.
 *
 * `computeDof` walks forward, producing the near and far limits from the
 * closed-form depth-of-field expressions. `cocDiameterMm` walks backward,
 * asking how large the blur disc actually is at a given distance. If the two
 * ever disagree, the photograph and the readout are lying about each other.
 */

const FOCAL_LENGTHS = [14, 24, 35, 50, 85, 100, 135, 200, 400]
const F_NUMBERS = [1.0, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22]
const FOCUS_DISTANCES_M = [0.3, 0.5, 1, 2, 3, 5, 10, 25, 100, 1000]

interface Case {
  focalLengthMm: number
  fNumber: number
  focusDistanceM: number
  cocLimitMm: number
}

function* cases(): Generator<Case> {
  for (const fmt of SENSOR_FORMAT_LIST) {
    for (const focalLengthMm of FOCAL_LENGTHS) {
      for (const fNumber of F_NUMBERS) {
        for (const focusDistanceM of FOCUS_DISTANCES_M) {
          // The thin-lens model requires the subject to be outside the focal
          // length. Real lenses enforce this via their minimum focus distance.
          if (focusDistanceM * 1000 < focalLengthMm * 1.05) continue
          yield { focalLengthMm, fNumber, focusDistanceM, cocLimitMm: fmt.cocLimitMm }
        }
      }
    }
  }
}

describe('the depth-of-field limits are the circle of confusion solved for c', () => {
  for (const diffraction of [false, true]) {
    it(`holds across the whole parameter space (diffraction: ${diffraction})`, () => {
      let checked = 0
      for (const c of cases()) {
        const r = computeDof({ ...c, diffraction })
        if (r.diffractionLimited) continue

        // The blur at the near limit must be exactly the acceptable limit.
        const atNear = cocDiameterMm(c, r.nearLimitM)
        const budget = diffraction
          ? Math.sqrt(Math.max(0, c.cocLimitMm ** 2 - r.airyDiameterMm ** 2))
          : c.cocLimitMm
        expect(Math.abs(atNear - budget) / budget).toBeLessThan(1e-9)

        if (Number.isFinite(r.farLimitM)) {
          const atFar = cocDiameterMm(c, r.farLimitM)
          expect(Math.abs(atFar - budget) / budget).toBeLessThan(1e-9)
        }
        checked++
      }
      // Guard against the loop silently skipping everything.
      expect(checked).toBeGreaterThan(4000)
    })
  }

  it('agrees with the independent inverse solver in both directions', () => {
    let checked = 0
    for (const c of cases()) {
      const r = computeDof({ ...c, diffraction: false })
      const { nearM, farM } = distancesAtCocMm(c, c.cocLimitMm)
      expect(Math.abs(nearM - r.nearLimitM) / r.nearLimitM).toBeLessThan(1e-12)
      if (Number.isFinite(r.farLimitM)) {
        expect(Math.abs(farM - r.farLimitM) / r.farLimitM).toBeLessThan(1e-12)
      } else {
        expect(farM).toBe(Infinity)
      }
      checked++
    }
    expect(checked).toBeGreaterThan(4000)
  })

  it('never produces NaN, negative, or out-of-order limits anywhere', () => {
    for (const c of cases()) {
      for (const diffraction of [false, true]) {
        const r = computeDof({ ...c, diffraction })
        expect(Number.isNaN(r.nearLimitM)).toBe(false)
        expect(Number.isNaN(r.farLimitM)).toBe(false)
        expect(Number.isNaN(r.hyperfocalM)).toBe(false)
        expect(r.nearLimitM).toBeGreaterThan(0)
        expect(r.nearLimitM).toBeLessThanOrEqual(c.focusDistanceM + 1e-9)
        expect(r.farLimitM).toBeGreaterThanOrEqual(c.focusDistanceM - 1e-9)
        expect(r.nearLimitM).toBeLessThanOrEqual(r.farLimitM)
      }
    }
  })
})
