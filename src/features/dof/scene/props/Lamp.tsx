import { useMemo } from 'react'
import * as THREE from 'three'
import type { MaterialSpec } from '#/lib/scene/types.ts'

/** A floor lamp: a second bright practical, and it actually lights the room. */
export function Lamp({ heightM, material }: { heightM: number; material: MaterialSpec }) {
  const bodyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(material.color),
      roughness: material.roughness,
      metalness: material.metalness,
    })
    m.toneMapped = false
    return m
  }, [material])

  const shadeMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#f3e2c4',
      emissive: new THREE.Color(material.emissive ?? '#ffe6bd'),
      emissiveIntensity: material.emissiveIntensity ?? 12,
      roughness: 0.6,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    m.toneMapped = false
    return m
  }, [material])

  const h = heightM

  return (
    <group>
      <mesh material={bodyMaterial} position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.03, 24]} />
      </mesh>
      <mesh material={bodyMaterial} position={[0, h * 0.45, 0]}>
        <cylinderGeometry args={[0.013, 0.013, h * 0.9, 12]} />
      </mesh>
      <mesh material={shadeMaterial} position={[0, h - 0.1, 0]}>
        <cylinderGeometry args={[0.11, 0.17, 0.2, 28, 1, true]} />
      </mesh>
      <pointLight
        position={[0, h - 0.14, 0]}
        color={material.emissive ?? '#ffe6bd'}
        intensity={3.4}
        distance={7}
        decay={1.6}
      />
    </group>
  )
}
