import * as THREE from 'three'

/**
 * Procedural textures for the room.
 *
 * These are not decoration. Defocus blur is only visible where there is
 * high-frequency detail to destroy -- a flat-coloured wall looks identical at
 * f/1.2 and f/16. Every surface in this scene therefore carries fine detail,
 * and the focus charts carry deliberately hostile detail so the exact plane of
 * focus is easy to locate by eye.
 *
 * Textures are cached and never disposed: there is a fixed, small number of
 * them and they live as long as the page.
 */

const cache = new Map<string, THREE.Texture>()

function make(
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  configure?: (t: THREE.Texture) => void,
): THREE.Texture {
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  configure?.(texture)
  cache.set(key, texture)
  return texture
}

/** Fine speckle, for the floor: lots of detail at many scales. */
export function floorTexture(): THREE.Texture {
  return make('floor', 512, (ctx, s) => {
    ctx.fillStyle = '#8a7c6a'
    ctx.fillRect(0, 0, s, s)
    // Plank seams
    const plank = s / 8
    ctx.strokeStyle = 'rgba(40,30,20,0.55)'
    ctx.lineWidth = 2
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * plank)
      ctx.lineTo(s, i * plank)
      ctx.stroke()
    }
    // Grain
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      const a = 0.03 + Math.random() * 0.12
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(60,44,28,${a})` : `rgba(210,190,160,${a})`
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1)
    }
  })
}

/** Subtle plaster with a fine grid, so walls still show defocus. */
export function wallTexture(): THREE.Texture {
  return make('wall', 512, (ctx, s) => {
    ctx.fillStyle = '#bdb7aa'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 14000; i++) {
      const a = 0.02 + Math.random() * 0.07
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(90,85,75,${a})`
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
    }
    ctx.strokeStyle = 'rgba(120,112,98,0.22)'
    ctx.lineWidth = 1
    const cell = s / 16
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cell, 0)
      ctx.lineTo(i * cell, s)
      ctx.moveTo(0, i * cell)
      ctx.lineTo(s, i * cell)
      ctx.stroke()
    }
  })
}

export type ChartPattern = 'slantedEdge' | 'siemensStar' | 'checker'

/**
 * Lens-test charts.
 *
 * A slanted edge is the standard MTF target: its diagonal boundary makes the
 * transition from sharp to soft obvious at a glance. A Siemens star converges
 * toward its centre, so the radius at which the spokes stop resolving is a
 * direct read of the blur diameter. The checker gives a repeating reference.
 */
export function chartTexture(pattern: ChartPattern): THREE.Texture {
  return make(
    `chart-${pattern}`,
    1024,
    (ctx, s) => {
      ctx.fillStyle = '#f6f6f4'
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = '#141414'

      if (pattern === 'slantedEdge') {
        // A 5-degree slanted edge, plus converging bar groups.
        ctx.save()
        ctx.translate(s * 0.5, s * 0.5)
        ctx.rotate((5 * Math.PI) / 180)
        ctx.fillRect(0, -s, s, 2 * s)
        ctx.restore()
        for (let g = 0; g < 7; g++) {
          const barW = 2 + g * 3
          const y = s * 0.06 + g * (s * 0.055)
          for (let x = 0; x < s * 0.42; x += barW * 2) {
            ctx.fillRect(s * 0.03 + x, y, barW, s * 0.038)
          }
        }
      } else if (pattern === 'siemensStar') {
        const spokes = 36
        ctx.save()
        ctx.translate(s / 2, s / 2)
        for (let i = 0; i < spokes; i++) {
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.arc(0, 0, s * 0.47, (i * 2 * Math.PI) / spokes, ((i * 2 + 1) * Math.PI) / spokes)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
        ctx.strokeStyle = '#141414'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        const n = 16
        const c = s / n
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            if ((x + y) % 2 === 0) ctx.fillRect(x * c, y * c, c, c)
          }
        }
      }
    },
    (t) => {
      t.wrapS = THREE.ClampToEdgeWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.anisotropy = 16
    },
  )
}

/** Numbered band for the depth ruler, so tick distances are readable. */
export function rulerTexture(ticks: number): THREE.Texture {
  return make(
    `ruler-${ticks}`,
    2048,
    (ctx, s) => {
      ctx.fillStyle = '#e8e4da'
      ctx.fillRect(0, 0, s, s)
      const step = s / ticks
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < ticks; i++) {
        const x = i * step
        const major = i % 2 === 0
        ctx.fillStyle = major ? '#1d1d1d' : '#6a6a6a'
        ctx.fillRect(x, 0, major ? 5 : 3, major ? s * 0.42 : s * 0.24)
        if (major) {
          ctx.font = `bold ${Math.round(s * 0.3)}px ui-monospace, monospace`
          ctx.fillText(String(i / 2), x + step, s * 0.7)
        }
      }
    },
    (t) => {
      t.wrapS = THREE.ClampToEdgeWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.anisotropy = 16
    },
  )
}
