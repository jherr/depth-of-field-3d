/**
 * Aperture sampling pattern for the bokeh gather.
 *
 * This module is pure on purpose. A fragment shader cannot be unit tested, but
 * the sampling pattern it consumes can be -- so the geometry that decides the
 * SHAPE of every out-of-focus highlight is verified on the CPU, and the shader
 * is left with nothing but the loop.
 *
 * The physical justification for area-uniform polygon sampling: a defocused
 * point's point-spread function IS the scaled indicator function of the exit
 * pupil. So sampling the aperture polygon uniformly per unit area is correct
 * optics, not an aesthetic choice.
 */

export interface BokehKernelOptions {
  readonly samples: number
  /** Diaphragm blade count. 0 means a circular aperture. */
  readonly blades: number
  /** 0 = hard polygon, 1 = circle. */
  readonly roundness: number
  readonly rotationRad: number
}

/** Radius of a unit-circumradius regular polygon's boundary at angle `theta`. */
export function polygonBoundaryRadius(blades: number, thetaRad: number, rotationRad: number): number {
  if (blades < 3) return 1
  const step = (2 * Math.PI) / blades
  const half = step / 2
  // Fold the angle into one blade sector, measured from the edge's midpoint.
  let local = (thetaRad - rotationRad) % step
  if (local < 0) local += step
  return Math.cos(half) / Math.cos(local - half)
}

/** Deterministic low-discrepancy sequence, so the kernel never shimmers. */
function halton(index: number, base: number): number {
  let f = 1
  let r = 0
  let i = index
  while (i > 0) {
    f /= base
    r += f * (i % base)
    i = Math.floor(i / base)
  }
  return r
}

export function generateBokehKernel(o: BokehKernelOptions): Float32Array {
  const samples = Math.max(0, Math.floor(o.samples))
  const out = new Float32Array(samples * 2)
  if (samples === 0) return out

  const blades = o.blades >= 3 ? Math.floor(o.blades) : 0
  const roundness = Math.min(1, Math.max(0, o.roundness))

  for (let i = 0; i < samples; i++) {
    // Stratify by blade sector, and index the Halton sequence by the sample's
    // position WITHIN its sector rather than by `i`.
    //
    // Indexing by `i` looks fine but silently biases the kernel: base-2 Halton
    // correlates with `i % blades` whenever the blade count shares a factor
    // with 2 or 3, which covers 6, 8 and 9. The result is an off-centre disc
    // that drags the whole image sideways as it blurs.
    const tri = blades === 0 ? 0 : i % blades
    const seq = blades === 0 ? i : Math.floor(i / blades)
    const u1 = halton(seq + 1, 2)
    const u2 = halton(seq + 1, 3)
    let x: number
    let y: number

    if (blades === 0) {
      // Area-uniform in the unit disc: radius goes as sqrt(u).
      const r = Math.sqrt(u1)
      const a = 2 * Math.PI * u2
      x = r * Math.cos(a)
      y = r * Math.sin(a)
    } else {
      // Split the n-gon into n equal-area triangles from the centre and cycle
      // through them, so every blade sector gets the same sample count.
      const step = (2 * Math.PI) / blades
      const a0 = o.rotationRad + tri * step
      const a1 = a0 + step
      // Uniform point in triangle (origin, V0, V1).
      const su = Math.sqrt(u1)
      const w1 = su * (1 - u2)
      const w2 = su * u2
      x = w1 * Math.cos(a0) + w2 * Math.cos(a1)
      y = w1 * Math.sin(a0) + w2 * Math.sin(a1)
    }

    if (roundness > 0 && blades !== 0) {
      // Push samples out toward the circumscribing circle. This intentionally
      // trades exact area-uniformity for the real behaviour of curved blades.
      const bound = polygonBoundaryRadius(blades, Math.atan2(y, x), o.rotationRad)
      const scale = 1 + roundness * (1 / bound - 1)
      x *= scale
      y *= scale
    }

    out[i * 2] = x
    out[i * 2 + 1] = y
  }

  return out
}

export function kernelCentroid(k: Float32Array): readonly [number, number] {
  const n = k.length / 2
  if (n === 0) return [0, 0]
  let sx = 0
  let sy = 0
  for (let i = 0; i < k.length; i += 2) {
    sx += k[i]!
    sy += k[i + 1]!
  }
  return [sx / n, sy / n]
}

export function kernelMaxRadius(k: Float32Array): number {
  let max = 0
  for (let i = 0; i < k.length; i += 2) {
    max = Math.max(max, Math.hypot(k[i]!, k[i + 1]!))
  }
  return max
}

/**
 * How circular the opening is, given how far the lens is stopped down.
 *
 * Curved ("rounded") blades are fully retracted wide open, so the opening is
 * the round lens barrel itself. Stop down and the blade edges emerge and the
 * highlight turns polygonal. Straight blades are polygonal at every setting.
 */
export function roundnessForStopsDown(stopsDown: number, bladesAreRounded: boolean): number {
  if (!bladesAreRounded) return 0
  const t = Math.min(1, Math.max(0, stopsDown / 2.5))
  // smoothstep, so the transition has no visible corner
  return 1 - t * t * (3 - 2 * t)
}
