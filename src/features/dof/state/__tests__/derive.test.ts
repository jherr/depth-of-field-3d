import { describe, expect, it } from 'vitest'
import { deriveOptics } from '#/features/dof/state/derive.ts'
import { DEFAULT_OPTICS, normalizeOpticsParams } from '#/lib/optics/params.ts'
import { LENS_PRESETS } from '#/lib/optics/lenses.ts'
import { SENSOR_FORMAT_LIST } from '#/lib/optics/formats.ts'
import { cocRadiusPx } from '#/lib/optics/coc.ts'

describe('deriveOptics', () => {
  it('bundles the lens, sensor and depth of field for the default setup', () => {
    const d = deriveOptics(DEFAULT_OPTICS, 1080)
    expect(d.lens.id).toBe(DEFAULT_OPTICS.lensId)
    expect(d.sensor.id).toBe('ff')
    expect(d.cocLimitMm).toBe(0.03)
    // Brackets the focus distance, whatever the default happens to be.
    expect(d.dof.nearLimitM).toBeLessThan(DEFAULT_OPTICS.focusDistanceM)
    expect(d.dof.farLimitM).toBeGreaterThan(DEFAULT_OPTICS.focusDistanceM)
  })

  it('reports the 35mm-equivalent focal length', () => {
    const ff = deriveOptics(normalizeOpticsParams({ ...DEFAULT_OPTICS, sensorId: 'ff' }), 1080)
    expect(ff.equivalentFocalMm).toBeCloseTo(50, 6)

    const mft = deriveOptics(
      normalizeOpticsParams({ lensId: 'mft-25-1p4', focalLengthMm: 25, sensorId: 'mft' }),
      1080,
    )
    expect(mft.equivalentFocalMm).toBeCloseTo(50, 0)
  })

  it('makes the depth-of-field boundary land exactly at the requested pixel blur', () => {
    // The criterion that proves the picture and the numbers are one calculation:
    // at the near and far limits, the rendered blur radius must be exactly
    // half the requested pixel budget (the budget is a diameter).
    const px = 2
    const d = deriveOptics(
      normalizeOpticsParams({
        ...DEFAULT_OPTICS,
        cocCriterion: { kind: 'renderPixels', px },
        diffraction: false,
      }),
      1080,
    )
    const at = (z: number): number =>
      cocRadiusPx(
        {
          focalLengthMm: d.params.focalLengthMm,
          fNumber: d.params.fNumber,
          focusDistanceM: d.params.focusDistanceM,
        },
        z,
        d.sensor.heightMm,
        1080,
      )
    expect(at(d.dof.nearLimitM)).toBeCloseTo(px / 2, 6)
    expect(at(d.dof.farLimitM)).toBeCloseTo(px / 2, 6)
  })

  it('reports the focus datum measured from the sensor plane as well as the lens', () => {
    const d = deriveOptics(DEFAULT_OPTICS, 1080)
    // s + fs/(s-f), always further than the lens-plane distance
    expect(d.fromSensorPlaneM).toBeGreaterThan(d.params.focusDistanceM)
  })

  it('says a lens is wide open when it is', () => {
    const d = deriveOptics(
      normalizeOpticsParams({ lensId: 'ef-50-1p4', focalLengthMm: 50, fNumber: 1.4 }),
      1080,
    )
    expect(d.stopsDown).toBeCloseTo(0, 6)
    expect(d.roundness).toBeCloseTo(1, 6)
  })

  it('turns rounded blades polygonal once stopped down', () => {
    const d = deriveOptics(
      normalizeOpticsParams({ lensId: 'ef-50-1p4', focalLengthMm: 50, fNumber: 8 }),
      1080,
    )
    expect(d.stopsDown).toBeGreaterThan(2.5)
    expect(d.roundness).toBeCloseTo(0, 6)
  })

  it('produces finite, ordered results for every lens and sensor combination', () => {
    for (const lens of LENS_PRESETS) {
      for (const sensor of SENSOR_FORMAT_LIST) {
        for (const fNumber of [1, 2.8, 8, 22]) {
          const d = deriveOptics(
            normalizeOpticsParams({
              lensId: lens.id,
              focalLengthMm: lens.focalRangeMm[1],
              fNumber,
              focusDistanceM: 3,
              sensorId: sensor.id,
            }),
            1080,
          )
          expect(Number.isFinite(d.dof.nearLimitM)).toBe(true)
          expect(d.dof.nearLimitM).toBeGreaterThan(0)
          expect(d.dof.nearLimitM).toBeLessThanOrEqual(d.dof.farLimitM)
          expect(Number.isFinite(d.fov.vFovDeg)).toBe(true)
          expect(d.fov.vFovDeg).toBeGreaterThan(0)
          expect(Number.isFinite(d.equivalentFocalMm)).toBe(true)
        }
      }
    }
  })

  it('changes the CoC limit when the render height changes, but only for the pixel criterion', () => {
    const pixels = normalizeOpticsParams({
      ...DEFAULT_OPTICS,
      cocCriterion: { kind: 'renderPixels', px: 2 },
    })
    expect(deriveOptics(pixels, 1080).cocLimitMm).not.toBeCloseTo(
      deriveOptics(pixels, 2160).cocLimitMm,
      6,
    )
    expect(deriveOptics(DEFAULT_OPTICS, 1080).cocLimitMm).toBe(
      deriveOptics(DEFAULT_OPTICS, 2160).cocLimitMm,
    )
  })
})
