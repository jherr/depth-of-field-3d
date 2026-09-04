import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { RoomSpec } from '#/lib/scene/types.ts'

/**
 * Floor, four walls and a ceiling.
 *
 * Built from single-sided planes facing inward rather than an inverted box, so
 * the orbit camera can sit outside a wall and still see in.
 *
 * The floor and walls carry real Poly Haven PBR scans (colour + normal +
 * roughness), not flat colours. That is the whole reason they are here: defocus
 * is only visible where there is high-frequency relief to destroy, and a normal
 * and roughness map is exactly that relief. A flat-shaded floor renders
 * identically at f/1.2 and f/16. The maps win outright -- `color` is left white
 * and `roughness` at 1 so the scan defines the look, the same "loaded materials
 * win" rule the scanned props follow. The ceiling stays a flat colour: it is
 * out of shot in the in-camera view and rarely in focus in the diagram, so it
 * carries no detail worth the two extra texture fetches.
 */
const FLOOR = '/textures/wood_floor/wood_floor'
const WALL = '/textures/beige_wall_001/beige_wall_001'

/** Clone the shared maps so a surface can set its own tiling without touching
 *  the others, then build a PBR material the scan drives. */
function surfaceMaterial(
  maps: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture },
  repeatX: number,
  repeatY: number,
): THREE.MeshStandardMaterial {
  const tile = (src: THREE.Texture) => {
    const t = src.clone()
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeatX, repeatY)
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }
  const m = new THREE.MeshStandardMaterial({
    map: tile(maps.map),
    normalMap: tile(maps.normalMap),
    roughnessMap: tile(maps.roughnessMap),
    roughness: 1,
    metalness: 0,
  })
  m.toneMapped = false
  return m
}

export function Room({ room }: { room: RoomSpec }) {
  const { widthM: w, depthM: d, heightM: h } = room

  const floorMaps = useTexture({
    map: `${FLOOR}_diff_2k.jpg`,
    normalMap: `${FLOOR}_nor_gl_2k.jpg`,
    roughnessMap: `${FLOOR}_arm_2k.jpg`,
  })
  const wallMaps = useTexture({
    map: `${WALL}_diff_2k.jpg`,
    normalMap: `${WALL}_nor_gl_2k.jpg`,
    roughnessMap: `${WALL}_arm_2k.jpg`,
  })

  // One tile per ~2 m of floor and ~1.5 m of wall: enough grain for defocus to
  // bite into without the plank pattern reading as a printed sheet.
  const floorMaterial = useMemo(() => surfaceMaterial(floorMaps, w / 2, d / 2), [floorMaps, w, d])

  const walls = useMemo(
    () => ({
      // back and front share a width; left and right share the depth.
      backFront: surfaceMaterial(wallMaps, w / 1.5, h / 1.5),
      leftRight: surfaceMaterial(wallMaps, d / 1.5, h / 1.5),
      ceiling: (() => {
        const m = new THREE.MeshStandardMaterial({
          color: new THREE.Color(room.ceiling.color),
          roughness: room.ceiling.roughness,
          metalness: 0,
        })
        m.toneMapped = false
        return m
      })(),
    }),
    [wallMaps, w, d, h, room.ceiling],
  )

  return (
    <group>
      <mesh material={floorMaterial} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>

      {/* back wall, behind the subject */}
      <mesh material={walls.backFront} position={[0, h / 2, -d / 2]} receiveShadow>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* wall behind the camera */}
      <mesh material={walls.backFront} position={[0, h / 2, d / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh
        material={walls.leftRight}
        position={[-w / 2, h / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[d, h]} />
      </mesh>
      <mesh
        material={walls.leftRight}
        position={[w / 2, h / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[d, h]} />
      </mesh>
      <mesh material={walls.ceiling} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
      </mesh>
    </group>
  )
}
