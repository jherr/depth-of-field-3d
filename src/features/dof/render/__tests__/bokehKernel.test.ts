import { describe, expect, it } from 'vitest'
import {
  generateBokehKernel,
  kernelCentroid,
  kernelMaxRadius,
  polygonBoundaryRadius,
  roundnessForStopsDown,
} from '#/features/dof/render/bokehKernel.ts'

const points = (k: Float32Array): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let i = 0; i < k.length; i += 2) out.push([k[i]!, k[i + 1]!])
  return out
}

describe('polygonBoundaryRadius', () => {
  it('reaches 1 at a vertex and the apothem at an edge midpoint', () => {
    const blades = 6
    const step = (2 * Math.PI) / blades
    // Vertices sit at rotation + k*step.
    expect(polygonBoundaryRadius(blades, 0, 0)).toBeCloseTo(1, 12)
    expect(polygonBoundaryRadius(blades, step, 0)).toBeCloseTo(1, 12)
    // Edge midpoint is halfway between two vertices.
    expect(polygonBoundaryRadius(blades, step / 2, 0)).toBeCloseTo(Math.cos(Math.PI / blades), 12)
  })

  it('is periodic in the blade angle', () => {
    for (const blades of [5, 6, 7, 8, 9]) {
      const step = (2 * Math.PI) / blades
      for (const theta of [0.1, 0.7, 1.9, 4.2]) {
        expect(polygonBoundaryRadius(blades, theta, 0)).toBeCloseTo(
          polygonBoundaryRadius(blades, theta + step, 0),
          12,
        )
      }
    }
  })

  it('follows the rotation', () => {
    expect(polygonBoundaryRadius(8, 0.3, 0.3)).toBeCloseTo(polygonBoundaryRadius(8, 0, 0), 12)
  })

  it('is always 1 for a circular aperture', () => {
    for (const theta of [0, 0.5, 2, 5]) {
      expect(polygonBoundaryRadius(0, theta, 0)).toBe(1)
    }
  })

  it('approaches a circle as blade count grows', () => {
    const step = (2 * Math.PI) / 64
    expect(polygonBoundaryRadius(64, step / 2, 0)).toBeGreaterThan(0.998)
  })
})

describe('generateBokehKernel', () => {
  const opts = { samples: 64, blades: 8, roundness: 0, rotationRad: 0 }

  it('returns exactly the requested number of xy pairs', () => {
    for (const samples of [8, 16, 32, 64, 128]) {
      expect(generateBokehKernel({ ...opts, samples }).length).toBe(samples * 2)
    }
  })

  it('is deterministic', () => {
    const a = generateBokehKernel(opts)
    const b = generateBokehKernel(opts)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('never places a sample outside the unit disc', () => {
    for (const blades of [0, 5, 6, 7, 8, 9]) {
      for (const roundness of [0, 0.5, 1]) {
        const k = generateBokehKernel({ samples: 256, blades, roundness, rotationRad: 0.4 })
        expect(kernelMaxRadius(k)).toBeLessThanOrEqual(1 + 1e-6)
      }
    }
  })

  it('keeps every sample inside the aperture polygon when not rounded', () => {
    // The point of a straight-bladed lens: highlights are hard-edged n-gons.
    const rotationRad = 0.37
    for (const blades of [5, 6, 8, 9]) {
      const k = generateBokehKernel({ samples: 512, blades, roundness: 0, rotationRad })
      for (const [x, y] of points(k)) {
        const r = Math.hypot(x, y)
        const bound = polygonBoundaryRadius(blades, Math.atan2(y, x), rotationRad)
        expect(r).toBeLessThanOrEqual(bound + 1e-6)
      }
    }
  })

  it('is centred, so the blur does not drift the image', () => {
    for (const blades of [0, 6, 8, 9]) {
      const [cx, cy] = kernelCentroid(generateBokehKernel({ ...opts, samples: 256, blades }))
      expect(Math.abs(cx)).toBeLessThan(0.02)
      expect(Math.abs(cy)).toBeLessThan(0.02)
    }
  })

  it('samples the aperture by area, not by radius', () => {
    // A defocused point's PSF is the scaled indicator function of the exit
    // pupil, so samples must be uniform per unit AREA. Half the radius must
    // therefore contain about a quarter of the samples.
    for (const blades of [0, 6, 8]) {
      const k = generateBokehKernel({ samples: 4096, blades, roundness: 0, rotationRad: 0 })
      let inner = 0
      for (const [x, y] of points(k)) {
        const bound = polygonBoundaryRadius(blades, Math.atan2(y, x), 0)
        if (Math.hypot(x, y) <= 0.5 * bound) inner++
      }
      expect(inner / 4096).toBeCloseTo(0.25, 1)
    }
  })

  it('fills the unit circle when the aperture is circular', () => {
    const k = generateBokehKernel({ samples: 2048, blades: 0, roundness: 0, rotationRad: 0 })
    expect(kernelMaxRadius(k)).toBeGreaterThan(0.98)
  })

  it('expands a polygon toward a circle as roundness rises', () => {
    const hard = generateBokehKernel({ samples: 1024, blades: 6, roundness: 0, rotationRad: 0 })
    const soft = generateBokehKernel({ samples: 1024, blades: 6, roundness: 1, rotationRad: 0 })
    // A hexagon's area is less than the circumscribing circle's, so the hard
    // kernel's mean radius must be the smaller of the two.
    const meanR = (k: Float32Array): number =>
      points(k).reduce((a, [x, y]) => a + Math.hypot(x, y), 0) / (k.length / 2)
    expect(meanR(soft)).toBeGreaterThan(meanR(hard))
  })

  it('degrades to a single centred sample when asked for nothing', () => {
    expect(Array.from(generateBokehKernel({ ...opts, samples: 0 }))).toEqual([])
    expect(Array.from(generateBokehKernel({ ...opts, samples: 1 }))).toHaveLength(2)
  })
})

describe('roundnessForStopsDown', () => {
  it('is fully round wide open, because the diaphragm is retracted', () => {
    expect(roundnessForStopsDown(0, true)).toBeCloseTo(1, 6)
  })

  it('becomes polygonal as the blades emerge', () => {
    expect(roundnessForStopsDown(3, true)).toBeCloseTo(0, 6)
    expect(roundnessForStopsDown(1.25, true)).toBeGreaterThan(0)
    expect(roundnessForStopsDown(1.25, true)).toBeLessThan(1)
  })

  it('is never round for straight blades', () => {
    for (const stops of [0, 1, 3, 6]) {
      expect(roundnessForStopsDown(stops, false)).toBe(0)
    }
  })

  it('decreases monotonically with stopping down', () => {
    let prev = Infinity
    for (const stops of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4]) {
      const r = roundnessForStopsDown(stops, true)
      expect(r).toBeLessThanOrEqual(prev + 1e-12)
      prev = r
    }
  })
})
