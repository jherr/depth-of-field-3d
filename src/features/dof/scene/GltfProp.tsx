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
    emissiveMaterials?: readonly string[]
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
    const emissive = new Set(geometry.emissiveMaterials ?? [])
    const glass: THREE.Object3D[] = []

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const loaded = child.material as THREE.Material

      if (!geometry.keepMaterials) {
        child.material = material
      } else if (emissive.has(loaded.name)) {
        // Named as a light source, so it survives the transparency rule below.
        // Bulbs are routinely authored as blended glass at low alpha -- the
        // floor lamp's is 31% -- and dropping one would delete the highlight
        // the prop was chosen for.
        child.material = lit(loaded, material)
      } else if (loaded.transparent) {
        // `MaterialSpec` forbids transparency outright; loaded models have to
        // obey the same rule, and they arrive not knowing it. A glazed picture
        // frame is the case that turns up in practice -- its glass pane is the
        // nearest surface but writes no useful depth, so the gather blurs it by
        // whatever is *behind* it and the artwork vanishes under a grey plate.
        glass.push(child)
        return
      }
      child.castShadow = true
      child.receiveShadow = true
    })

    // After the walk, not during: removing a child mid-traverse skips siblings.
    for (const pane of glass) pane.removeFromParent()
    return clone
  }, [
    scene,
    geometry.nodeName,
    geometry.normalizeToHeightM,
    geometry.keepMaterials,
    geometry.emissiveMaterials,
    material,
  ])

  return <primitive object={object} />
}

/**
 * A copy of a loaded material, emitting whatever the scene's `MaterialSpec`
 * says it should.
 *
 * Copied rather than mutated because `useGLTF` caches by URL and hands every
 * consumer the same material instances -- lighting one in place would light it
 * for the whole app, including any other prop sharing the model.
 *
 * `toneMapped = false` for the same reason as `useStandardMaterial`: tone
 * mapping happens once, at the end of the post chain. It matters more here,
 * since an emissive above 1.0 tone-mapped twice lands back under it and the
 * bokeh disappears -- which is the entire point of the highlight.
 */
function lit(loaded: THREE.Material, spec: THREE.Material) {
  const out = loaded.clone()
  if (out instanceof THREE.MeshStandardMaterial && spec instanceof THREE.MeshStandardMaterial) {
    out.emissive = spec.emissive.clone()
    out.emissiveIntensity = spec.emissiveIntensity
    out.emissiveMap = null
    out.toneMapped = false
    // Forced opaque: a lit bulb has to write depth or the gather has no
    // distance to blur it by, and a 31%-alpha highlight is 31% of a highlight.
    out.transparent = false
    out.opacity = 1
    out.depthWrite = true
  }
  return out
}
