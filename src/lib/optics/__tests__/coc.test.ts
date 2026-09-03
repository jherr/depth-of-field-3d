import { describe, expect, it } from 'vitest'
import {
  airyDiameterMm,
  cocDiameterMm,
  cocRadiusPx,
  distancesAtCocMm,
  effectiveCocDiameterMm,
  mmToRenderPixels,
  signedCocDiameterMm,
} from '#/lib/optics/coc.ts'

const fast = { focalLengthMm: 50, fNumber: 1.4, focusDistanceM: 2 }

describe('signedCocDiameterMm', () => {
  it('is zero exactly at the plane of focus', () => {
    expect(signedCocDiameterMm(fast, 2)).toBe(0)
  })

  it('is negative in front of focus and positive behind it', () => {
    expect(signedCocDiameterMm(fast, 1.5)).toBeLessThan(0)
    expect(signedCocDiameterMm(fast, 3)).toBeGreaterThan(0)
  })

  it('depends only on |z-s|/z, so 1.5 m and 3.0 m blur equally at 2 m focus', () => {
    // Both have |z-s|/z = 1/3. This encodes the near/far asymmetry of depth of
    // field and would catch any sign error or a 1/z that should be 1/s.
    expect(signedCocDiameterMm(fast, 1.5)).toBeCloseTo(-0.305250305, 9)
    expect(signedCocDiameterMm(fast, 3.0)).toBeCloseTo(0.305250305, 9)
  })

  it('grows as the aperture opens', () => {
    const wide = signedCocDiameterMm({ ...fast, fNumber: 1.4 }, 3)
    const stopped = signedCocDiameterMm({ ...fast, fNumber: 11 }, 3)
    expect(wide).toBeGreaterThan(stopped)
  })

  it('grows with the square of focal length at fixed f-number', () => {
    const a = signedCocDiameterMm({ focalLengthMm: 50, fNumber: 2.8, focusDistanceM: 5 }, 10)
    const b = signedCocDiameterMm({ focalLengthMm: 100, fNumber: 2.8, focusDistanceM: 5 }, 10)
    expect(b / a).toBeGreaterThan(3.5)
  })

  it('returns 0 for a subject at or behind the camera', () => {
    expect(signedCocDiameterMm(fast, 0)).toBe(0)
    expect(signedCocDiameterMm(fast, -3)).toBe(0)
  })

  it('approaches a finite limit as the subject goes to infinity', () => {
    const far = signedCocDiameterMm(fast, 1e9)
    expect(Number.isFinite(far)).toBe(true)
    // limit is f^2 / (N (s - f)) as z -> inf
    expect(far).toBeCloseTo((50 * 50) / (1.4 * (2000 - 50)), 6)
  })
})

describe('cocDiameterMm', () => {
  it('is the unsigned magnitude', () => {
    expect(cocDiameterMm(fast, 1.5)).toBeCloseTo(0.305250305, 9)
    expect(cocDiameterMm(fast, 3.0)).toBeCloseTo(0.305250305, 9)
  })
})

describe('airyDiameterMm', () => {
  it.each([
    { N: 8, mm: 0.010736 },
    { N: 16, mm: 0.021472 },
    { N: 22, mm: 0.029524 },
  ])('is 2.44*lambda*N at f/$N', ({ N, mm }) => {
    expect(airyDiameterMm(N)).toBeCloseTo(mm, 6)
  })

  it('scales linearly with f-number', () => {
    expect(airyDiameterMm(22) / airyDiameterMm(11)).toBeCloseTo(2, 12)
  })

  it('accepts an alternate wavelength', () => {
    expect(airyDiameterMm(8, 450)).toBeLessThan(airyDiameterMm(8, 650))
  })
})

describe('effectiveCocDiameterMm', () => {
  it('equals the geometric value when diffraction is off', () => {
    expect(effectiveCocDiameterMm(fast, 3, { diffraction: false })).toBeCloseTo(0.305250305, 9)
  })

  it('is never smaller than the geometric value when diffraction is on', () => {
    for (const z of [0.5, 1, 1.9, 2, 2.1, 5, 50]) {
      expect(effectiveCocDiameterMm(fast, z, { diffraction: true })).toBeGreaterThanOrEqual(
        cocDiameterMm(fast, z) - 1e-12,
      )
    }
  })

  it('is exactly the Airy diameter at the plane of focus', () => {
    // Geometric blur is zero there, so diffraction is all that is left.
    const stopped = { focalLengthMm: 50, fNumber: 16, focusDistanceM: 2 }
    expect(effectiveCocDiameterMm(stopped, 2, { diffraction: true })).toBeCloseTo(
      airyDiameterMm(16),
      12,
    )
  })

  it('combines in quadrature', () => {
    const geo = cocDiameterMm(fast, 3)
    const airy = airyDiameterMm(1.4)
    expect(effectiveCocDiameterMm(fast, 3, { diffraction: true })).toBeCloseTo(
      Math.hypot(geo, airy),
      12,
    )
  })
})

describe('mmToRenderPixels', () => {
  it('scales millimetres on the sensor by pixels per millimetre', () => {
    expect(mmToRenderPixels(0.305250305, 24, 1080)).toBeCloseTo(0.305250305 * 45, 9)
  })
})

describe('cocRadiusPx', () => {
  it('is half the diameter, converted to render pixels', () => {
    // The fixture the runtime GPU probe is checked against.
    expect(cocRadiusPx(fast, 3, 24, 1080)).toBeCloseTo(6.868131865, 6)
  })

  it('is a radius, not a diameter', () => {
    const diameterPx = mmToRenderPixels(cocDiameterMm(fast, 3), 24, 1080)
    expect(cocRadiusPx(fast, 3, 24, 1080)).toBeCloseTo(diameterPx / 2, 12)
  })
})

describe('distancesAtCocMm', () => {
  it('inverts signedCocDiameterMm on both sides of focus', () => {
    const c = 0.03
    const { nearM, farM } = distancesAtCocMm(fast, c)
    expect(cocDiameterMm(fast, nearM)).toBeCloseTo(c, 12)
    expect(cocDiameterMm(fast, farM)).toBeCloseTo(c, 12)
  })

  it('brackets the focus distance', () => {
    const { nearM, farM } = distancesAtCocMm(fast, 0.03)
    expect(nearM).toBeLessThan(2)
    expect(farM).toBeGreaterThan(2)
  })

  it('returns an infinite far distance once the budget reaches past the hyperfocal', () => {
    // At f/8, 35 mm, focused at the hyperfocal distance, the far root diverges.
    const atH = { focalLengthMm: 35, fNumber: 8, focusDistanceM: 5.139166666666667 }
    expect(distancesAtCocMm(atH, 0.03).farM).toBe(Infinity)
  })
})
