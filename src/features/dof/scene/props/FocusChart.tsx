import { useMemo } from 'react'
import * as THREE from 'three'
import { chartTexture } from '../textures.ts'
import type { ChartPattern } from '../textures.ts'

/**
 * A lens-test target on a small stand.
 *
 * `tiltDeg` leans the chart away from the camera so a single chart spans a
 * range of distances: the height at which it stops being sharp is a direct
 * read of where the depth of field ends. That is the same trick used to check
 * autofocus calibration on a real body.
 */
export function FocusChart({
  widthM,
  heightM,
  tiltDeg,
  pattern,
  standMaterial,
}: {
  widthM: number
  heightM: number
  tiltDeg: number
  pattern: ChartPattern
  standMaterial: THREE.Material
}) {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: chartTexture(pattern),
      roughness: 0.85,
      metalness: 0,
      side: THREE.FrontSide,
    })
    m.toneMapped = false
    return m
  }, [pattern])

  const tilt = (tiltDeg * Math.PI) / 180

  return (
    <group>
      <group rotation={[-tilt, 0, 0]}>
        <mesh material={material} castShadow>
          <planeGeometry args={[widthM, heightM]} />
        </mesh>
        {/* backing board, so the chart is not a one-sided sliver */}
        <mesh material={standMaterial} position={[0, 0, -0.008]}>
          <boxGeometry args={[widthM * 1.06, heightM * 1.06, 0.014]} />
        </mesh>
      </group>
      {/* stand */}
      <mesh material={standMaterial} position={[0, -heightM / 2 - 0.02, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.04, 10]} />
      </mesh>
    </group>
  )
}
