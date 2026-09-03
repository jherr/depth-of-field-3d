import { describe, expect, it } from 'vitest'
import { SENSOR_FORMATS } from '#/lib/optics/formats.ts'
import {
  fieldOfView,
  frameHalfExtentsAtDistance,
  threeVFovDeg,
} from '#/lib/optics/fov.ts'

const ff = SENSOR_FORMATS.ff

describe('fieldOfView', () => {
  it('feeds three.js the sensor gate, not the 35mm film width', () => {
    const fov = fieldOfView(50, ff)
    expect(fov.filmGauge).toBe(36)
    expect(fov.aspect).toBeCloseTo(1.5, 12)
  })

  // Published angles of view for full frame. External validation.
  it.each([
    { f: 24, vFov: 53.1301, hFov: 73.7398, diag: 84.0627, published: 84 },
    { f: 50, vFov: 26.9914, hFov: 39.5978, diag: 46.793003, published: 46.8 },
    { f: 85, vFov: 16.0718, hFov: 23.913168, diag: 28.558322, published: 28.5 },
    { f: 200, vFov: 6.8671, hFov: 10.2856, diag: 12.346968, published: 12.3 },
  ])('matches the published angle of view at $f mm', ({ f, vFov, hFov, diag, published }) => {
    const r = fieldOfView(f, ff)
    expect(r.vFovDeg).toBeCloseTo(vFov, 3)
    expect(r.hFovDeg).toBeCloseTo(hFov, 3)
    expect(r.diagFovDeg).toBeCloseTo(diag, 3)
    expect(r.diagFovDeg).toBeCloseTo(published, 0)
  })

  it('is always ordered vertical < horizontal < diagonal on a landscape sensor', () => {
    for (const f of [14, 24, 35, 50, 85, 135, 200, 400]) {
      const r = fieldOfView(f, ff)
      expect(r.vFovDeg).toBeLessThan(r.hFovDeg)
      expect(r.hFovDeg).toBeLessThan(r.diagFovDeg)
    }
  })

  it('gives a crop sensor a narrower view than full frame at the same focal length', () => {
    expect(fieldOfView(50, SENSOR_FORMATS.mft).diagFovDeg).toBeLessThan(
      fieldOfView(50, ff).diagFovDeg,
    )
  })

  it('matches full frame when a crop focal length is divided by the crop factor', () => {
    const mft = SENSOR_FORMATS.mft
    const equivalent = 50 / mft.cropFactor
    expect(fieldOfView(equivalent, mft).diagFovDeg).toBeCloseTo(
      fieldOfView(50, ff).diagFovDeg,
      6,
    )
  })
})

describe('threeVFovDeg', () => {
  it('reproduces our own vertical FOV when given the correct film gauge', () => {
    expect(threeVFovDeg(50, 36, 1.5)).toBeCloseTo(fieldOfView(50, ff).vFovDeg, 10)
  })

  it("does NOT match when left at three.js's default gauge of 35", () => {
    // This assertion exists to document why filmGauge must be set explicitly.
    // Leaving three.js's default is a silent 2.7% field-of-view error.
    expect(threeVFovDeg(50, 35, 1.5)).toBeCloseTo(26.268045, 4)
    expect(Math.abs(threeVFovDeg(50, 35, 1.5) - fieldOfView(50, ff).vFovDeg)).toBeGreaterThan(0.7)
  })

  it('uses the larger sensor dimension as the gauge, so portrait aspect still works', () => {
    // aspect < 1 => three divides by 1, so filmHeight === filmGauge
    expect(threeVFovDeg(50, 36, 0.667)).toBeCloseTo(
      (2 * Math.atan(0.5 * 36 / 50) * 180) / Math.PI,
      10,
    )
  })
})

describe('frameHalfExtentsAtDistance', () => {
  it('spans the sensor exactly at the focal length away for a 1:1 pinhole check', () => {
    const fov = fieldOfView(50, ff)
    const { halfWidthM, halfHeightM } = frameHalfExtentsAtDistance(fov, 1)
    // half-extent / distance === tan(halfFov)
    expect(halfHeightM).toBeCloseTo(Math.tan((fov.vFovDeg * Math.PI) / 360), 10)
    expect(halfWidthM).toBeCloseTo(Math.tan((fov.hFovDeg * Math.PI) / 360), 10)
  })

  it('scales linearly with distance', () => {
    const fov = fieldOfView(35, ff)
    const a = frameHalfExtentsAtDistance(fov, 2)
    const b = frameHalfExtentsAtDistance(fov, 6)
    expect(b.halfWidthM / a.halfWidthM).toBeCloseTo(3, 10)
    expect(b.halfHeightM / a.halfHeightM).toBeCloseTo(3, 10)
  })

  it('preserves the sensor aspect ratio at any distance', () => {
    const fov = fieldOfView(85, SENSOR_FORMATS.mft)
    for (const d of [0.5, 3, 40]) {
      const { halfWidthM, halfHeightM } = frameHalfExtentsAtDistance(fov, d)
      expect(halfWidthM / halfHeightM).toBeCloseTo(fov.aspect, 10)
    }
  })
})
