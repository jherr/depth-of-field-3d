import { useMemo } from 'react'
import * as THREE from 'three'
import type { MaterialSpec } from '#/lib/scene/types.ts'

/**
 * A string of small bright bulbs behind the subject.
 *
 * These exist to make bokeh legible. A defocused point source spreads its
 * energy over the whole blur disc, so its brightness falls as 1/(pi r^2) --
 * which means a source at normal exposure just fades into grey. Only emitters
 * well above 1.0 survive the spread as recognisable discs with the shape of
 * the aperture.
 *
 * They are also small: a source has to be smaller than its own blur disc for
 * the disc's shape (and therefore the blade count) to be visible at all.
 */
export function BokehLights({
  count,
  spreadM,
  heightM,
  material,
}: {
  count: number
  spreadM: number
  heightM: number
  material: MaterialSpec
}) {
  const bulbMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(material.color),
      emissive: new THREE.Color(material.emissive ?? '#ffd9a0'),
      emissiveIntensity: material.emissiveIntensity ?? 20,
      roughness: 0.35,
      metalness: 0,
    })
    m.toneMapped = false
    return m
  }, [material])

  const wireMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.7, metalness: 0.1 })
    m.toneMapped = false
    return m
  }, [])

  const bulbs = useMemo(() => {
    const out: Array<[number, number, number]> = []
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1)
      const x = (t - 0.5) * spreadM
      // A shallow catenary, and a little depth variation so the discs sit at a
      // range of distances and therefore a range of sizes.
      const sag = Math.sin(t * Math.PI) * 0.16
      const z = Math.sin(t * Math.PI * 2.0) * 0.42
      out.push([x, heightM - sag, z])
    }
    return out
  }, [count, spreadM, heightM])

  return (
    <group>
      {bulbs.map((p, i) => (
        <group key={i} position={p}>
          <mesh material={bulbMaterial}>
            <sphereGeometry args={[0.022, 18, 14]} />
          </mesh>
          <mesh material={wireMaterial} position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.03, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
