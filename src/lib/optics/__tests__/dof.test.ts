import { describe, expect, it } from 'vitest'
import {
  computeDof,
  diffractionLimitFNumber,
  farLimitM,
  hyperfocalDistanceM,
  nearLimitM,
} from '#/lib/optics/dof.ts'
import { SENSOR_FORMATS } from '#/lib/optics/formats.ts'

const geo = { cocLimitMm: 0.03, diffraction: false } as const

describe('hyperfocalDistanceM', () => {
  it('is f^2/(Nc) + f', () => {
    expect(hyperfocalDistanceM({ focalLengthMm: 50, fNumber: 2.8, ...geo })).toBeCloseTo(
      29.811905,
      6,
    )
    expect(hyperfocalDistanceM({ focalLengthMm: 35, fNumber: 8, ...geo })).toBeCloseTo(
      5.139167,
      6,
    )
  })

  it('rises with the square of focal length and falls with f-number', () => {
    const h50 = hyperfocalDistanceM({ focalLengthMm: 50, fNumber: 2.8, ...geo })
    const h100 = hyperfocalDistanceM({ focalLengthMm: 100, fNumber: 2.8, ...geo })
    expect(h100 / h50).toBeGreaterThan(3.9)
    expect(hyperfocalDistanceM({ focalLengthMm: 50, fNumber: 11, ...geo })).toBeLessThan(h50)
  })
})

// Fixtures derived independently, by solving c = f^2|z-s|/(N(s-f)z) for z,
// NOT via the Dn/Df closed form the implementation uses.
describe('published closed-form fixtures (full frame, c = 0.030)', () => {
  it.each([
    { f: 50, N: 2.8, s: 3, H: 29.811905, Dn: 2.729456, Df: 3.330077, total: 0.600621 },
    { f: 50, N: 1.4, s: 2, H: 59.573810, Dn: 1.936558, Df: 2.067739, total: 0.131181 },
    { f: 200, N: 2.8, s: 10, H: 476.390476, Dn: 9.798350, Df: 10.210124, total: 0.411774 },
    { f: 24, N: 4, s: 1.5, H: 4.824000, Dn: 1.147228, Df: 2.166065, total: 1.018837 },
  ])('$f mm at f/$N focused at $s m', ({ f, N, s, H, Dn, Df, total }) => {
    const r = computeDof({ focalLengthMm: f, fNumber: N, focusDistanceM: s, ...geo })
    expect(r.hyperfocalM).toBeCloseTo(H, 5)
    expect(r.nearLimitM).toBeCloseTo(Dn, 5)
    expect(r.farLimitM).toBeCloseTo(Df, 5)
    expect(r.totalDofM).toBeCloseTo(total, 5)
    expect(r.isBeyondHyperfocal).toBe(false)
  })
})

describe('analytic identities', () => {
  it.each([
    { f: 50, N: 2.8 },
    { f: 24, N: 4 },
    { f: 200, N: 2.8 },
    { f: 85, N: 1.2 },
  ])('focused at the hyperfocal distance, the near limit is exactly H/2 ($f mm f/$N)', ({ f, N }) => {
    const H = hyperfocalDistanceM({ focalLengthMm: f, fNumber: N, ...geo })
    const r = computeDof({ focalLengthMm: f, fNumber: N, focusDistanceM: H, ...geo })
    expect(r.nearLimitM).toBeCloseTo(H / 2, 9)
    expect(r.farLimitM).toBe(Infinity)
    expect(r.totalDofM).toBe(Infinity)
    expect(r.isBeyondHyperfocal).toBe(true)
  })

  it('gives an infinite far limit for every focus distance at or beyond hyperfocal', () => {
    const H = hyperfocalDistanceM({ focalLengthMm: 50, fNumber: 8, ...geo })
    for (const s of [H, H * 1.001, H * 2, H * 100]) {
      expect(farLimitM({ focalLengthMm: 50, fNumber: 8, focusDistanceM: s, ...geo })).toBe(Infinity)
    }
  })

  it('keeps the far limit finite just short of hyperfocal', () => {
    const H = hyperfocalDistanceM({ focalLengthMm: 50, fNumber: 8, ...geo })
    const df = farLimitM({ focalLengthMm: 50, fNumber: 8, focusDistanceM: H * 0.999, ...geo })
    expect(Number.isFinite(df)).toBe(true)
    expect(df).toBeGreaterThan(H)
  })

  it('drives the near limit toward f^2/(Nc) as focus goes to infinity', () => {
    const dn = nearLimitM({ focalLengthMm: 50, fNumber: 2.8, focusDistanceM: 1e6, ...geo })
    expect(dn).toBeCloseTo((50 * 50) / (2.8 * 0.03) / 1000, 2)
  })
})

describe('monotonicity laws', () => {
  const base = { focalLengthMm: 50, fNumber: 2.8, ...geo }

  it('moves both limits outward as focus distance increases', () => {
    let prevNear = 0
    let prevFar = 0
    for (const s of [0.5, 1, 2, 3, 5, 10, 20]) {
      const r = computeDof({ ...base, focusDistanceM: s })
      expect(r.nearLimitM).toBeGreaterThan(prevNear)
      expect(r.farLimitM).toBeGreaterThan(prevFar)
      prevNear = r.nearLimitM
      prevFar = r.farLimitM
    }
  })

  it('widens depth of field as the aperture closes', () => {
    let prev = 0
    for (const N of [1.4, 2, 2.8, 4, 5.6, 8]) {
      const total = computeDof({ ...base, fNumber: N, focusDistanceM: 3 }).totalDofM
      expect(total).toBeGreaterThan(prev)
      prev = total
    }
  })

  it('narrows depth of field as focal length grows at a fixed distance', () => {
    let prev = Infinity
    for (const f of [24, 35, 50, 85, 135, 200]) {
      const total = computeDof({ ...base, focalLengthMm: f, focusDistanceM: 5 }).totalDofM
      expect(total).toBeLessThan(prev)
      prev = total
    }
  })

  it('reports more depth behind the subject than in front of it', () => {
    const r = computeDof({ ...base, focusDistanceM: 3 })
    expect(r.behindM).toBeGreaterThan(r.inFrontM)
    expect(r.inFrontM + r.behindM).toBeCloseTo(r.totalDofM, 9)
  })
})

describe('cross-format equivalence', () => {
  it('agrees between full frame and MFT at equivalent focal length and f-number', () => {
    const ffDof = computeDof({
      focalLengthMm: 50,
      fNumber: 2.8,
      focusDistanceM: 3,
      cocLimitMm: SENSOR_FORMATS.ff.cocLimitMm,
      diffraction: false,
    })
    const mftDof = computeDof({
      focalLengthMm: 25,
      fNumber: 1.4,
      focusDistanceM: 3,
      cocLimitMm: SENSOR_FORMATS.mft.cocLimitMm,
      diffraction: false,
    })
    expect(mftDof.nearLimitM).toBeCloseTo(ffDof.nearLimitM, 1)
    expect(mftDof.farLimitM).toBeCloseTo(ffDof.farLimitM, 1)
    expect(Math.abs(mftDof.totalDofM / ffDof.totalDofM - 1)).toBeLessThan(0.02)
  })

  it('gives a smaller format more depth of field at the same framing and f-number', () => {
    const totalFor = (id: 'ff' | 'apsc-135' | 'mft' | 'one-inch'): number => {
      const fmt = SENSOR_FORMATS[id]
      return computeDof({
        focalLengthMm: 50 / fmt.cropFactor, // same field of view
        fNumber: 4,
        focusDistanceM: 3,
        cocLimitMm: fmt.cocLimitMm,
        diffraction: false,
      }).totalDofM
    }
    expect(totalFor('apsc-135')).toBeGreaterThan(totalFor('ff'))
    expect(totalFor('mft')).toBeGreaterThan(totalFor('apsc-135'))
    expect(totalFor('one-inch')).toBeGreaterThan(totalFor('mft'))
  })
})

describe('diffraction', () => {
  it.each([
    { id: 'ff', N: 22.3547 },
    { id: 'apsc-16', N: 14.1580 },
    { id: 'mft', N: 11.1773 },
    { id: 'phone-1p28', N: 5.9613 },
  ] as const)('marks $id as diffraction limited at f/$N', ({ id, N }) => {
    expect(diffractionLimitFNumber(SENSOR_FORMATS[id].cocLimitMm)).toBeCloseTo(N, 3)
  })

  it('always reports less depth of field than the geometric model', () => {
    for (const N of [2.8, 4, 5.6, 8, 11, 16]) {
      const inputs = { focalLengthMm: 50, fNumber: N, focusDistanceM: 3, cocLimitMm: 0.03 }
      const withD = computeDof({ ...inputs, diffraction: true })
      const withoutD = computeDof({ ...inputs, diffraction: false })
      expect(withD.totalDofM).toBeLessThan(withoutD.totalDofM)
      expect(withD.geometric.nearLimitM).toBeCloseTo(withoutD.nearLimitM, 9)
      expect(withD.geometric.farLimitM).toBeCloseTo(withoutD.farLimitM, 9)
    }
  })

  it('collapses depth of field to nothing past the diffraction limit', () => {
    const r = computeDof({
      focalLengthMm: 50,
      fNumber: 32,
      focusDistanceM: 3,
      cocLimitMm: 0.03,
      diffraction: true,
    })
    expect(r.diffractionLimited).toBe(true)
    expect(r.totalDofM).toBe(0)
    expect(r.nearLimitM).toBeCloseTo(3, 9)
    expect(r.farLimitM).toBeCloseTo(3, 9)
    // the geometric numbers stay available for traceability
    expect(r.geometric.totalDofM).toBeGreaterThan(5)
  })

  it('is not diffraction limited wide open', () => {
    const r = computeDof({
      focalLengthMm: 50,
      fNumber: 1.4,
      focusDistanceM: 3,
      cocLimitMm: 0.03,
      diffraction: true,
    })
    expect(r.diffractionLimited).toBe(false)
    expect(r.airyDiameterMm).toBeLessThan(0.03)
  })

  it('shrinks total depth of field monotonically once past the limit', () => {
    let prev = Infinity
    for (const N of [22, 25, 29, 32, 45]) {
      const total = computeDof({
        focalLengthMm: 50,
        fNumber: N,
        focusDistanceM: 3,
        cocLimitMm: 0.03,
        diffraction: true,
      }).totalDofM
      expect(total).toBeLessThanOrEqual(prev)
      prev = total
    }
  })
})
