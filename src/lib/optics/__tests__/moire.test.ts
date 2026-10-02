import { describe, expect, it } from 'vitest'
import {
  MOIRE_MARGINAL_RATIO,
  MOIRE_SAFE_RATIO,
  assessMoire,
  fNumberForRatio,
  moireRisk,
  moireStrength,
  objectSpaceBlurMm,
} from '#/lib/optics/moire.ts'
import type { CocInputs } from '#/lib/optics/coc.ts'

// A live-events telephoto shot: 600 mm at f/4, focused on a presenter 34 m away
// with a 2.6 mm-pitch LED wall 4 m behind them. Worked by hand:
//   C_sensor = f^2/(N(s-f)) * (z-s)/z = 0.283643 mm
//   blur     = C_sensor * (z-f)/f    = 17.68 mm at the wall
//   ratio    = 17.68 / 2.6           = 6.80 pixels
const shot: CocInputs = { focalLengthMm: 600, fNumber: 4, focusDistanceM: 34 }
const wall = { distanceM: 38, pitchMm: 2.6 }

describe('objectSpaceBlurMm', () => {
  it('matches the hand-computed blur at the wall', () => {
    expect(objectSpaceBlurMm(shot, wall.distanceM)).toBeCloseTo(17.68, 1)
  })

  it('is zero when focus sits exactly on the wall', () => {
    expect(objectSpaceBlurMm({ ...shot, focusDistanceM: wall.distanceM }, wall.distanceM)).toBe(0)
  })

  it('grows as the aperture opens', () => {
    const wide = objectSpaceBlurMm({ ...shot, fNumber: 2.8 }, wall.distanceM)
    const stopped = objectSpaceBlurMm({ ...shot, fNumber: 11 }, wall.distanceM)
    expect(wide).toBeGreaterThan(stopped)
  })

  it('is inversely proportional to the f-number', () => {
    const atF2 = objectSpaceBlurMm({ ...shot, fNumber: 2 }, wall.distanceM)
    const atF8 = objectSpaceBlurMm({ ...shot, fNumber: 8 }, wall.distanceM)
    expect(atF2 / atF8).toBeCloseTo(4, 6)
  })

  it('grows as the focus pulls further in front of the wall', () => {
    const near = objectSpaceBlurMm({ ...shot, focusDistanceM: 30 }, wall.distanceM)
    const close = objectSpaceBlurMm({ ...shot, focusDistanceM: 37 }, wall.distanceM)
    expect(near).toBeGreaterThan(close)
  })

  it('degrades to zero rather than going negative for a nonsensical wall', () => {
    expect(objectSpaceBlurMm(shot, 0)).toBe(0)
    expect(objectSpaceBlurMm(shot, -5)).toBe(0)
    // Wall closer than the focal length: not a real shot.
    expect(objectSpaceBlurMm({ ...shot, focalLengthMm: 50 }, 0.02)).toBe(0)
  })
})

describe('moireRisk', () => {
  it('bands on the published ratio thresholds', () => {
    expect(moireRisk(MOIRE_SAFE_RATIO)).toBe('safe')
    expect(moireRisk(3)).toBe('safe')
    expect(moireRisk(MOIRE_MARGINAL_RATIO)).toBe('marginal')
    expect(moireRisk(1.5)).toBe('marginal')
    expect(moireRisk(0.5)).toBe('risk')
    expect(moireRisk(0)).toBe('risk')
  })
})

describe('moireStrength', () => {
  it('is full below the marginal ratio and gone at the safe ratio', () => {
    expect(moireStrength(0)).toBe(1)
    expect(moireStrength(MOIRE_MARGINAL_RATIO)).toBe(1)
    expect(moireStrength(MOIRE_SAFE_RATIO)).toBe(0)
    expect(moireStrength(5)).toBe(0)
  })

  it('fades linearly through the marginal band', () => {
    // Midway between marginal (1) and safe (2) is half strength.
    expect(moireStrength(1.5)).toBeCloseTo(0.5, 6)
  })

  it('is monotonically non-increasing with coverage', () => {
    let prev = moireStrength(0)
    for (let r = 0; r <= 3; r += 0.25) {
      const s = moireStrength(r)
      expect(s).toBeLessThanOrEqual(prev + 1e-9)
      prev = s
    }
  })
})

describe('assessMoire', () => {
  it('rates the worked example as safe', () => {
    const a = assessMoire(shot, wall)
    expect(a.blurMm).toBeCloseTo(17.68, 1)
    expect(a.ratio).toBeCloseTo(6.8, 1)
    expect(a.risk).toBe('safe')
  })

  it('reports the f-number you could stop down to and stay safe', () => {
    const a = assessMoire(shot, wall)
    // ratio 6.8 at f/4 reaches ratio 2 at f/(4 * 6.8/2) = f/13.6.
    expect(a.safeFNumber).toBeCloseTo(13.6, 1)
    // ...and focusing there really does land on the safe threshold.
    const atSafe = assessMoire({ ...shot, fNumber: a.safeFNumber! }, wall)
    expect(atSafe.ratio).toBeCloseTo(MOIRE_SAFE_RATIO, 6)
  })

  it('flags moiré risk when a short lens barely defocuses the wall', () => {
    // 35 mm at f/8 focused on a subject 3 m away, wall 1 m behind: a point on
    // the wall barely blurs relative to a 2.6 mm pitch.
    const a = assessMoire(
      { focalLengthMm: 35, fNumber: 8, focusDistanceM: 3 },
      { distanceM: 4, pitchMm: 2.6 },
    )
    expect(a.risk).toBe('risk')
    expect(a.ratio).toBeLessThan(MOIRE_MARGINAL_RATIO)
  })

  it('returns no safe f-number when focus sits on the wall', () => {
    const a = assessMoire({ ...shot, focusDistanceM: wall.distanceM }, wall)
    expect(a.ratio).toBe(0)
    expect(a.risk).toBe('risk')
    expect(a.safeFNumber).toBeNull()
  })
})

describe('fNumberForRatio', () => {
  it('is Infinity when there is no defocus to work with', () => {
    expect(fNumberForRatio({ ...shot, focusDistanceM: wall.distanceM }, wall, 2)).toBe(Infinity)
  })

  it('is Infinity for a degenerate target or pitch', () => {
    expect(fNumberForRatio(shot, { ...wall, pitchMm: 0 }, 2)).toBe(Infinity)
    expect(fNumberForRatio(shot, wall, 0)).toBe(Infinity)
  })
})
