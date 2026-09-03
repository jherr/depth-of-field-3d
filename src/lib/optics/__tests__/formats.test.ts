import { describe, expect, it } from 'vitest'
import {
  SENSOR_FORMATS,
  cocLimitFromDiagonal,
  diagonalMm,
  resolveCocLimitMm,
  sensorAspect,
} from '#/lib/optics/formats.ts'
import type { SensorFormatId } from '#/lib/optics/formats.ts'

const ALL_IDS: SensorFormatId[] = [
  'mf-4433',
  'ff',
  'apsc-135',
  'apsc-16',
  'mft',
  'one-inch',
  'phone-1p28',
]

describe('diagonalMm', () => {
  it('computes the full-frame diagonal from 36x24', () => {
    expect(diagonalMm({ widthMm: 36, heightMm: 24 })).toBeCloseTo(43.2666, 4)
  })
})

describe('sensorAspect', () => {
  it('is 3:2 for full frame and 4:3 for micro four thirds', () => {
    expect(sensorAspect(SENSOR_FORMATS.ff)).toBeCloseTo(1.5, 10)
    expect(sensorAspect(SENSOR_FORMATS.mft)).toBeCloseTo(17.3 / 13.0, 10)
  })
})

describe('SENSOR_FORMATS', () => {
  it('exposes every format keyed by its own id', () => {
    for (const id of ALL_IDS) {
      expect(SENSOR_FORMATS[id].id).toBe(id)
    }
  })

  it('uses published CoC conventions, not diagonal/1500', () => {
    // The whole point of ERROR 2 in the plan: full frame must be 0.030, the
    // number every published DOF table uses, not the 0.0288 that d/1500 gives.
    expect(SENSOR_FORMATS.ff.cocLimitMm).toBe(0.03)
    expect(SENSOR_FORMATS['apsc-135'].cocLimitMm).toBe(0.02)
    expect(SENSOR_FORMATS['apsc-16'].cocLimitMm).toBe(0.019)
    expect(SENSOR_FORMATS.mft.cocLimitMm).toBe(0.015)
    expect(SENSOR_FORMATS['one-inch'].cocLimitMm).toBe(0.011)
    expect(SENSOR_FORMATS['mf-4433'].cocLimitMm).toBe(0.037)
    expect(SENSOR_FORMATS['phone-1p28'].cocLimitMm).toBe(0.008)
  })

  it('derives crop factor from the full-frame diagonal', () => {
    expect(SENSOR_FORMATS.ff.cropFactor).toBeCloseTo(1.0, 6)
    expect(SENSOR_FORMATS['apsc-135'].cropFactor).toBeCloseTo(1.5339, 3)
    expect(SENSOR_FORMATS.mft.cropFactor).toBeCloseTo(1.9994, 3)
    expect(SENSOR_FORMATS['mf-4433'].cropFactor).toBeCloseTo(0.7898, 3)
    expect(SENSOR_FORMATS['phone-1p28'].cropFactor).toBeCloseTo(3.5406, 3)
  })

  it('orders CoC limits the same way it orders sensor sizes', () => {
    const bySize = [...ALL_IDS].sort(
      (a, b) => diagonalMm(SENSOR_FORMATS[a]) - diagonalMm(SENSOR_FORMATS[b]),
    )
    const byCoc = [...ALL_IDS].sort(
      (a, b) => SENSOR_FORMATS[a].cocLimitMm - SENSOR_FORMATS[b].cocLimitMm,
    )
    expect(byCoc).toEqual(bySize)
  })
})

describe('cocLimitFromDiagonal', () => {
  it('defaults to the diagonal/1500 convention', () => {
    expect(cocLimitFromDiagonal(43.2666)).toBeCloseTo(0.028844, 6)
  })

  it('accepts an alternative divisor', () => {
    expect(cocLimitFromDiagonal(43.2666, 1730)).toBeCloseTo(0.025010, 6)
  })
})

describe('resolveCocLimitMm', () => {
  const renderHeightPx = 1080

  it('returns the published convention by default', () => {
    expect(
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'formatConvention' }, renderHeightPx),
    ).toBe(0.03)
  })

  it('computes from the diagonal when asked', () => {
    expect(
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'diagonalDivisor', divisor: 1500 }, renderHeightPx),
    ).toBeCloseTo(0.028844, 6)
  })

  it('passes an absolute value straight through', () => {
    expect(
      resolveCocLimitMm(SENSOR_FORMATS.mft, { kind: 'absoluteMm', mm: 0.012 }, renderHeightPx),
    ).toBe(0.012)
  })

  it('converts a rendered-pixel budget into millimetres on the sensor', () => {
    // This is the criterion that makes the DOF slab boundary land exactly where
    // the on-screen blur reaches N pixels.
    expect(
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'renderPixels', px: 2 }, 1080),
    ).toBeCloseTo((2 * 24) / 1080, 12)
    expect(
      resolveCocLimitMm(SENSOR_FORMATS.mft, { kind: 'renderPixels', px: 2 }, 1080),
    ).toBeCloseTo((2 * 13.0) / 1080, 12)
  })

  it('never returns a non-positive or non-finite limit', () => {
    const bad = [
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'absoluteMm', mm: 0 }, 1080),
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'absoluteMm', mm: -1 }, 1080),
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'renderPixels', px: 2 }, 0),
      resolveCocLimitMm(SENSOR_FORMATS.ff, { kind: 'diagonalDivisor', divisor: 0 }, 1080),
    ]
    for (const c of bad) {
      expect(Number.isFinite(c)).toBe(true)
      expect(c).toBeGreaterThan(0)
    }
  })
})
