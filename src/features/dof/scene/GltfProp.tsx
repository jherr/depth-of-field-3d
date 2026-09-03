import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

/**
 * The GLTF path.
 *
 * Nothing in the default scene uses it yet, but it exists so switching a prop
 * from `{ kind: 'procedural' }` to `{ kind: 'gltf', url }` is genuinely a
 * one-line change rather than a refactor. `normalizeToHeightM` rescales a
 * loaded model to a known height, since the optics care about real sizes and
 * downloaded assets rarely agree on units.
 */
export function GltfProp({
  geometry,
  material,
}: {
  geometry: { url: string; nodeName?: string; normalizeToHeightM?: number }
  material: THREE.Material
}) {
  const { scene } = useGLTF(geometry.url)

  const object = useMemo(() => {
    const source = geometry.nodeName ? scene.getObjectByName(geometry.nodeName) : scene
    const clone = (source ?? scene).clone(true)

    if (geometry.normalizeToHeightM !== undefined) {
      const box = new THREE.Box3().setFromObject(clone)
      const height = box.max.y - box.min.y
      if (height > 1e-6) {
        const k = geometry.normalizeToHeightM / height
        clone.scale.multiplyScalar(k)
      }
    }

    // Materials in the scene data are authoritative, so the loaded model is
    // re-skinned rather than bringing its own look.
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return clone
  }, [scene, geometry.nodeName, geometry.normalizeToHeightM, material])

  return <primitive object={object} />
}
