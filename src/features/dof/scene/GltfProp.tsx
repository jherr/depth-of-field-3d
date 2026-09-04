import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

/**
 * The GLTF path.
 *
 * Switching a prop from `{ kind: 'procedural' }` to `{ kind: 'gltf', url }` is
 * a one-line change to the scene data and nothing else notices.
 *
 * `normalizeToHeightM` rescales a loaded model to a known height, since the
 * optics care about real sizes and downloaded assets rarely agree on units --
 * the Poly Haven props are authored in metres and need none of it, the
 * Renderpeople scan is in centimetres and does.
 */
export function GltfProp({
  geometry,
  material,
}: {
  geometry: {
    url: string
    nodeName?: string
    normalizeToHeightM?: number
    keepMaterials?: boolean
  }
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

    // Materials in the scene data are authoritative by default, so the loaded
    // model is re-skinned rather than bringing its own look. `keepMaterials`
    // opts out for scanned assets, whose roughness and normal maps are the
    // detail the blur is meant to destroy. Shadow flags are set either way --
    // glTF carries no equivalent.
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!geometry.keepMaterials) child.material = material
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return clone
  }, [scene, geometry.nodeName, geometry.normalizeToHeightM, geometry.keepMaterials, material])

  return <primitive object={object} />
}
