import { describe, expect, it } from 'vitest'
import {
  LENS_PRESETS,
  THIRD_STOPS,
  clampToLens,
  getLens,
  isPrime,
  maxApertureAt,
  snapToStop,
} from '#/lib/optics/lenses.ts'
import { SENSOR_FORMATS } from '#/lib/optics/formats.ts'

describe('THIRD_STOPS', () => {
  it('runs from f/1.0 to f/32 in ascending order', () => {
    expect(THIRD_STOPS[0]).toBe(1)
    expect(THIRD_STOPS.at(-1)).toBe(32)
    for (let i = 1; i < THIRD_STOPS.length; i++) {
      expect(THIRD_STOPS[i]).toBeGreaterThan(THIRD_STOPS[i - 1]!)
    }
  })

  it('doubles the aperture area every three stops', () => {
    // Each third-stop multiplies the f-number by 2^(1/6), so three of them
    // give 2^(1/2) -- a full stop.
    for (const n of [1, 2, 2.8, 4, 5.6, 8, 11]) {
      const i = THIRD_STOPS.indexOf(n)
      expect(i).toBeGreaterThanOrEqual(0)
      const threeUp = THIRD_STOPS[i + 3]
      if (threeUp !== undefined) {
        expect(threeUp / n).toBeCloseTo(Math.SQRT2, 1)
      }
    }
  })
})

describe('snapToStop', () => {
  it('leaves an exact stop alone', () => {
    expect(snapToStop(2.8, THIRD_STOPS)).toBe(2.8)
    expect(snapToStop(2.0, THIRD_STOPS)).toBe(2.0)
  })

  it('snaps to the nearest available stop', () => {
    expect(snapToStop(2.75, THIRD_STOPS)).toBe(2.8)
    expect(snapToStop(1.45, THIRD_STOPS)).toBe(1.4)
  })

  it('clamps outside the range', () => {
    expect(snapToStop(0.5, THIRD_STOPS)).toBe(1)
    expect(snapToStop(64, THIRD_STOPS)).toBe(32)
  })
})

describe('the lens catalog', () => {
  it('is internally consistent', () => {
    for (const lens of LENS_PRESETS) {
      const [wide, tele] = lens.focalRangeMm
      expect(wide).toBeLessThanOrEqual(tele)
      expect(lens.maxApertureWide).toBeLessThanOrEqual(lens.minAperture)
      expect(lens.maxApertureTele).toBeLessThanOrEqual(lens.minAperture)
      expect(lens.apertureBlades === 0 || lens.apertureBlades >= 5).toBe(true)
      expect(lens.nativeFormats.length).toBeGreaterThan(0)
      for (const id of lens.nativeFormats) {
        expect(SENSOR_FORMATS[id]).toBeDefined()
      }
    }
  })

  it('never allows focus closer than the thin-lens model permits', () => {
    // The formulas need s > f. A minimum focus distance that violated this
    // would produce negative blur diameters.
    for (const lens of LENS_PRESETS) {
      expect(lens.minFocusDistanceM * 1000).toBeGreaterThan(lens.focalRangeMm[1] * 1.05)
    }
  })

  it('has unique ids', () => {
    const ids = LENS_PRESETS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes a straight-bladed lens so polygonal bokeh is demonstrable', () => {
    expect(LENS_PRESETS.some((l) => !l.bladesAreRounded && l.apertureBlades > 0)).toBe(true)
  })

  it('includes a fixed-aperture phone lens with a circular opening', () => {
    expect(LENS_PRESETS.some((l) => l.apertureBlades === 0)).toBe(true)
  })
})

describe('isPrime', () => {
  it('is true only when the focal range is a single value', () => {
    for (const lens of LENS_PRESETS) {
      expect(isPrime(lens)).toBe(lens.focalRangeMm[0] === lens.focalRangeMm[1])
    }
  })
})

describe('maxApertureAt', () => {
  it('is constant across the range for a constant-aperture zoom', () => {
    const lens = getLens('ef-70-200-2p8')!
    expect(maxApertureAt(lens, 70)).toBeCloseTo(2.8, 6)
    expect(maxApertureAt(lens, 135)).toBeCloseTo(2.8, 6)
    expect(maxApertureAt(lens, 200)).toBeCloseTo(2.8, 6)
  })

  it('ramps from wide to tele on a variable-aperture zoom', () => {
    const lens = getLens('rf-24-105-4-7p1')!
    expect(maxApertureAt(lens, 24)).toBeCloseTo(lens.maxApertureWide, 6)
    expect(maxApertureAt(lens, 105)).toBeCloseTo(lens.maxApertureTele, 6)
    const mid = maxApertureAt(lens, 50)
    expect(mid).toBeGreaterThan(lens.maxApertureWide)
    expect(mid).toBeLessThan(lens.maxApertureTele)
  })

  it('is monotonically non-decreasing with focal length', () => {
    for (const lens of LENS_PRESETS) {
      const [wide, tele] = lens.focalRangeMm
      let prev = 0
      for (let t = 0; t <= 1; t += 0.1) {
        const n = maxApertureAt(lens, wide + (tele - wide) * t)
        expect(n).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = n
      }
    }
  })

  it('clamps focal lengths outside the range', () => {
    const lens = getLens('rf-24-105-4-7p1')!
    expect(maxApertureAt(lens, 10)).toBeCloseTo(maxApertureAt(lens, 24), 9)
    expect(maxApertureAt(lens, 500)).toBeCloseTo(maxApertureAt(lens, 105), 9)
  })

  it('returns the fixed value for a prime at any focal length', () => {
    const lens = getLens('helios-44-2-58-2')!
    expect(maxApertureAt(lens, 58)).toBeCloseTo(2, 9)
    expect(maxApertureAt(lens, 20)).toBeCloseTo(2, 9)
  })
})

describe('clampToLens', () => {
  it('pulls the focal length into range', () => {
    const lens = getLens('ef-70-200-2p8')!
    expect(clampToLens(lens, { focalLengthMm: 24, fNumber: 4, focusDistanceM: 5 }).focalLengthMm).toBe(70)
    expect(clampToLens(lens, { focalLengthMm: 400, fNumber: 4, focusDistanceM: 5 }).focalLengthMm).toBe(200)
  })

  it('rejects an aperture wider than the lens can open', () => {
    const lens = getLens('ef-70-200-2p8')!
    const r = clampToLens(lens, { focalLengthMm: 200, fNumber: 2.0, focusDistanceM: 5 })
    expect(r.fNumber).toBeGreaterThanOrEqual(2.8)
  })

  it('respects the aperture ramp of a variable-aperture zoom', () => {
    const lens = getLens('rf-24-105-4-7p1')!
    // f/4 is available at 24 mm but not at 105 mm.
    expect(clampToLens(lens, { focalLengthMm: 24, fNumber: 4, focusDistanceM: 3 }).fNumber).toBe(4)
    expect(
      clampToLens(lens, { focalLengthMm: 105, fNumber: 4, focusDistanceM: 3 }).fNumber,
    ).toBeGreaterThan(4)
  })

  it('never allows focus closer than the minimum focus distance', () => {
    const lens = getLens('ef-70-200-2p8')!
    expect(
      clampToLens(lens, { focalLengthMm: 200, fNumber: 4, focusDistanceM: 0.1 }).focusDistanceM,
    ).toBeCloseTo(lens.minFocusDistanceM, 9)
  })

  it('snaps the aperture onto a real third-stop', () => {
    const lens = getLens('ef-70-200-2p8')!
    expect(THIRD_STOPS).toContain(
      clampToLens(lens, { focalLengthMm: 100, fNumber: 5.3, focusDistanceM: 5 }).fNumber,
    )
  })

  it('produces values that satisfy the thin-lens requirement for every lens', () => {
    for (const lens of LENS_PRESETS) {
      for (const focalLengthMm of [0, lens.focalRangeMm[0], lens.focalRangeMm[1], 9999]) {
        const r = clampToLens(lens, { focalLengthMm, fNumber: 0.5, focusDistanceM: 0 })
        expect(r.focusDistanceM * 1000).toBeGreaterThan(r.focalLengthMm)
        expect(r.fNumber).toBeGreaterThan(0)
        expect(Number.isFinite(r.focusDistanceM)).toBe(true)
      }
    }
  })
})
