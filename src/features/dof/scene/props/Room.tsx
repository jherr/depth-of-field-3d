import { useMemo } from 'react'
import * as THREE from 'three'
import type { RoomSpec } from '#/lib/scene/types.ts'
import { floorTexture, wallTexture } from '../textures.ts'

/**
 * Floor, four walls and a ceiling.
 *
 * Built from single-sided planes facing inward rather than an inverted box, so
 * the orbit camera can sit outside a wall and still see in. Textures repeat at
 * roughly one tile per half metre, which keeps enough detail on every surface
 * for defocus to be visible.
 */
export function Room({ room }: { room: RoomSpec }) {
  const { widthM: w, depthM: d, heightM: h } = room

  const floorMaterial = useMemo(() => {
    const map = floorTexture()
    const t = map.clone()
    t.needsUpdate = true
    t.repeat.set(w / 2, d / 2)
    const m = new THREE.MeshStandardMaterial({
      map: t,
      color: new THREE.Color(room.floor.color),
      roughness: room.floor.roughness,
      metalness: 0,
    })
    m.toneMapped = false
    return m
  }, [w, d, room.floor])

  const wallMaterialFor = (repeatX: number, repeatY: number): THREE.MeshStandardMaterial => {
    const t = wallTexture().clone()
    t.needsUpdate = true
    t.repeat.set(repeatX, repeatY)
    const m = new THREE.MeshStandardMaterial({
      map: t,
      color: new THREE.Color(room.walls.color),
      roughness: room.walls.roughness,
      metalness: 0,
    })
    m.toneMapped = false
    return m
  }

  const walls = useMemo(
    () => ({
      back: wallMaterialFor(w / 1.5, h / 1.5),
      front: wallMaterialFor(w / 1.5, h / 1.5),
      left: wallMaterialFor(d / 1.5, h / 1.5),
      right: wallMaterialFor(d / 1.5, h / 1.5),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, d, h, room.walls, room.ceiling],
  )

  return (
    <group>
      <mesh material={floorMaterial} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>

      {/* back wall, behind the subject */}
      <mesh material={walls.back} position={[0, h / 2, -d / 2]} receiveShadow>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* wall behind the camera */}
      <mesh material={walls.front} position={[0, h / 2, d / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh
        material={walls.left}
        position={[-w / 2, h / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[d, h]} />
      </mesh>
      <mesh
        material={walls.right}
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
