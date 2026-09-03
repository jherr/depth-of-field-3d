import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTICS,
  decodeCocCriterion,
  encodeCocCriterion,
  encodeOpticsParams,
  normalizeOpticsParams,
} from '#/lib/optics/params.ts'
import { LENS_PRESETS, getLens, maxApertureAt } from '#/lib/optics/lenses.ts'
import { SENSOR_FORMATS } from '#/lib/optics/formats.ts'
import { computeDof } from '#/lib/optics/dof.ts'
import { resolveCocLimitMm } from '#/lib/optics/formats.ts'

describe('normalizeOpticsParams is total', () => {
  const garbage: unknown[] = [
    undefined,
    null,
    {},
    0,
    'nonsense',
    [],
    { fNumber: 'banana' },
    { focalLengthMm: NaN },
    { focalLengthMm: Infinity },
    { focusDistanceM: -5 },
    { focusDistanceM: Infinity },
    { focusDistanceM: 0 },
    { sensorId: 'lol' },
    { lensId: 'does-not-exist' },
    { cocCriterion: 'nope' },
    { cocCriterion: { kind: 'renderPixels', px: -3 } },
    { diffraction: 'yes' },
    { focalLengthMm: -50, fNumber: -1, focusDistanceM: -1, sensorId: 42, lensId: null },
  ]

  it.each(garbage.map((g, i) => ({ i, g })))('survives garbage input #$i', ({ g }) => {
    const p = normalizeOpticsParams(g)
    expect(Number.isFinite(p.focalLengthMm)).toBe(true)
    expect(Number.isFinite(p.fNumber)).toBe(true)
    expect(Number.isFinite(p.focusDistanceM)).toBe(true)
    expect(p.focalLengthMm).toBeGreaterThan(0)
    expect(p.fNumber).toBeGreaterThan(0)
    expect(p.focusDistanceM).toBeGreaterThan(0)
    expect(SENSOR_FORMATS[p.sensorId]).toBeDefined()
    expect(getLens(p.lensId)).toBeDefined()
    expect(typeof p.diffraction).toBe('boolean')
  })

  it('never throws and never yields NaN depth of field', () => {
    for (const g of garbage) {
      const p = normalizeOpticsParams(g)
      const fmt = SENSOR_FORMATS[p.sensorId]
      const r = computeDof({
        focalLengthMm: p.focalLengthMm,
        fNumber: p.fNumber,
        focusDistanceM: p.focusDistanceM,
        cocLimitMm: resolveCocLimitMm(fmt, p.cocCriterion, 1080),
        diffraction: p.diffraction,
      })
      expect(Number.isNaN(r.nearLimitM)).toBe(false)
      expect(Number.isNaN(r.farLimitM)).toBe(false)
      expect(r.nearLimitM).toBeGreaterThan(0)
    }
  })

  it('accepts strings, because URL search params are always strings', () => {
    const p = normalizeOpticsParams({
      lensId: 'ef-70-200-2p8',
      focalLengthMm: '135',
      fNumber: '4',
      focusDistanceM: '7.5',
      sensorId: 'apsc-135',
      diffraction: 'false',
    })
    expect(p.focalLengthMm).toBe(135)
    expect(p.fNumber).toBe(4)
    expect(p.focusDistanceM).toBeCloseTo(7.5, 9)
    expect(p.sensorId).toBe('apsc-135')
    expect(p.diffraction).toBe(false)
  })

  it('clamps parameters to what the chosen lens can actually do', () => {
    const p = normalizeOpticsParams({
      lensId: 'ef-70-200-2p8',
      focalLengthMm: 24,
      fNumber: 1.2,
      focusDistanceM: 0.05,
    })
    const lens = getLens('ef-70-200-2p8')!
    expect(p.focalLengthMm).toBe(70)
    expect(p.fNumber).toBeGreaterThanOrEqual(maxApertureAt(lens, 70))
    expect(p.focusDistanceM).toBeGreaterThanOrEqual(lens.minFocusDistanceM)
  })

  it('is idempotent', () => {
    for (const lens of LENS_PRESETS) {
      const once = normalizeOpticsParams({ lensId: lens.id, focalLengthMm: 1, fNumber: 99 })
      expect(normalizeOpticsParams(once)).toEqual(once)
    }
  })

  it('round-trips its own encoding', () => {
    for (const lens of LENS_PRESETS) {
      const p = normalizeOpticsParams({
        lensId: lens.id,
        focalLengthMm: lens.focalRangeMm[1],
        fNumber: 5.6,
        focusDistanceM: 4.25,
        sensorId: 'mft',
        diffraction: false,
        cocCriterion: { kind: 'renderPixels', px: 2 },
      })
      expect(normalizeOpticsParams(encodeOpticsParams(p))).toEqual(p)
    }
  })

  it('preserves the defaults when given nothing', () => {
    expect(normalizeOpticsParams(undefined)).toEqual(DEFAULT_OPTICS)
  })
})

describe('DEFAULT_OPTICS', () => {
  it('is already normalized', () => {
    expect(normalizeOpticsParams(DEFAULT_OPTICS)).toEqual(DEFAULT_OPTICS)
  })

  it('defaults to the published CoC convention and diffraction on', () => {
    expect(DEFAULT_OPTICS.cocCriterion).toEqual({ kind: 'formatConvention' })
    expect(DEFAULT_OPTICS.diffraction).toBe(true)
  })
})

describe('CoC criterion encoding', () => {
  it.each([
    { kind: 'formatConvention' },
    { kind: 'diagonalDivisor', divisor: 1500 },
    { kind: 'absoluteMm', mm: 0.025 },
    { kind: 'renderPixels', px: 2 },
  ] as const)('round-trips $kind', (criterion) => {
    expect(decodeCocCriterion(encodeCocCriterion(criterion))).toEqual(criterion)
  })

  it('falls back to the format convention on garbage', () => {
    for (const g of [undefined, null, '', 'zzz', 'renderPixels:abc', 42, {}]) {
      expect(decodeCocCriterion(g)).toEqual({ kind: 'formatConvention' })
    }
  })
})
