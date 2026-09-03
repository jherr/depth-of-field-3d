import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

/**
 * A procedural environment map for the room.
 *
 * Metals are pure reflection: without something to reflect, a chrome sphere
 * with metalness 1 renders black. Rather than downloading an HDRI, this paints
 * a crude equirectangular map of the room -- dark walls, a bright window, warm
 * bulbs overhead -- and runs it through PMREM.
 *
 * The highlights this produces are not just cosmetic. Small, very bright
 * specular points are the best bokeh sources in the scene: they are the
 * features whose blur discs actually show the shape of the aperture.
 */
export function RoomEnvironment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    // Floor-to-ceiling gradient.
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
    g.addColorStop(0, '#8e97a5')
    g.addColorStop(0.45, '#5d6068')
    g.addColorStop(0.55, '#4a4238')
    g.addColorStop(1, '#241d16')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Bright window.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(canvas.width * 0.44, canvas.height * 0.3, canvas.width * 0.13, canvas.height * 0.22)
    ctx.fillStyle = 'rgba(220,238,255,0.85)'
    ctx.fillRect(canvas.width * 0.41, canvas.height * 0.27, canvas.width * 0.19, canvas.height * 0.28)

    // Warm practicals.
    for (const [x, y, r] of [
      [0.16, 0.36, 26],
      [0.72, 0.34, 20],
      [0.88, 0.4, 14],
    ] as const) {
      const rg = ctx.createRadialGradient(
        canvas.width * x,
        canvas.height * y,
        0,
        canvas.width * x,
        canvas.height * y,
        r,
      )
      rg.addColorStop(0, '#fff3dd')
      rg.addColorStop(1, 'rgba(255,214,150,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(canvas.width * x, canvas.height * y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const t = new THREE.CanvasTexture(canvas)
    t.mapping = THREE.EquirectangularReflectionMapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const target = pmrem.fromEquirectangular(texture)
    scene.environment = target.texture
    scene.environmentIntensity = 0.85
    pmrem.dispose()
    return () => {
      scene.environment = null
      target.dispose()
    }
  }, [gl, scene, texture])

  return null
}
