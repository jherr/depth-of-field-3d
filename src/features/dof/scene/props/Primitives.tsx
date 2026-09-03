import { useMemo } from 'react'
import * as THREE from 'three'
import type { MaterialSpec } from '#/lib/scene/types.ts'

/**
 * Materials are built from the scene's `MaterialSpec` rather than inline JSX so
 * that emissive intensity above 1.0 survives -- which the bokeh depends on.
 *
 * `toneMapped = false` because tone mapping and sRGB encoding happen exactly
 * once, at the end of the post-process chain. Letting three tone-map per
 * material would apply it twice.
 */
export function useStandardMaterial(spec: MaterialSpec, map?: THREE.Texture | null) {
  return useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
      map: map ?? null,
    })
    if (spec.emissive) {
      m.emissive = new THREE.Color(spec.emissive)
      m.emissiveIntensity = spec.emissiveIntensity ?? 1
    }
    m.toneMapped = false
    return m
  }, [spec, map])
}

export function Box({ size, material }: { size: readonly [number, number, number]; material: THREE.Material }) {
  return (
    <mesh material={material} castShadow receiveShadow>
      <boxGeometry args={[size[0], size[1], size[2]]} />
    </mesh>
  )
}

export function Cylinder({
  radius,
  height,
  material,
}: {
  radius: number
  height: number
  material: THREE.Material
}) {
  return (
    <mesh material={material} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 32]} />
    </mesh>
  )
}

export function Sphere({ radius, material }: { radius: number; material: THREE.Material }) {
  return (
    <mesh material={material} castShadow receiveShadow>
      <sphereGeometry args={[radius, 48, 32]} />
    </mesh>
  )
}
