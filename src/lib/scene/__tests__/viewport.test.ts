import { describe, expect, it } from 'vitest'
import { computeSensorViewport } from '#/lib/scene/viewport.ts'

describe('computeSensorViewport', () => {
  it('letterboxes when the container is wider than the sensor', () => {
    const v = computeSensorViewport(1600, 900, 1.5)
    expect(v.height).toBe(900)
    expect(v.width).toBe(1350)
    expect(v.x).toBe(125)
    expect(v.y).toBe(0)
  })

  it('pillarboxes when the container is taller than the sensor', () => {
    const v = computeSensorViewport(900, 1200, 1.5)
    expect(v.width).toBe(900)
    expect(v.height).toBe(600)
    expect(v.x).toBe(0)
    expect(v.y).toBe(300)
  })

  it('fills exactly when the aspects match', () => {
    const v = computeSensorViewport(1500, 1000, 1.5)
    expect(v).toEqual({ x: 0, y: 0, width: 1500, height: 1000 })
  })

  it('preserves the sensor aspect ratio to within a pixel', () => {
    for (const aspect of [1.5, 4 / 3, 43.8 / 32.9, 1]) {
      for (const [w, h] of [
        [1920, 1080],
        [800, 1400],
        [1000, 1000],
        [377, 911],
      ]) {
        const v = computeSensorViewport(w!, h!, aspect)
        expect(v.width / v.height).toBeCloseTo(aspect, 6)
        expect(v.width).toBeLessThanOrEqual(w!)
        expect(v.height).toBeLessThanOrEqual(h!)
      }
    }
  })

  it('stays centred', () => {
    const v = computeSensorViewport(1600, 900, 4 / 3)
    expect(v.x * 2 + v.width).toBeCloseTo(1600, 6)
    expect(v.y * 2 + v.height).toBeCloseTo(900, 6)
  })

  it('never returns NaN or negative values for degenerate containers', () => {
    for (const [w, h] of [
      [0, 0],
      [0, 500],
      [500, 0],
      [-100, -100],
      [NaN, 500],
    ]) {
      const v = computeSensorViewport(w!, h!, 1.5)
      for (const n of [v.x, v.y, v.width, v.height]) {
        expect(Number.isFinite(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('falls back to the container when the aspect is nonsense', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const v = computeSensorViewport(800, 600, bad)
      expect(Number.isFinite(v.width)).toBe(true)
      expect(v.width).toBeGreaterThan(0)
    }
  })
})
