import type * as THREE from 'three'

/**
 * Camera on a tripod.
 *
 * The lens points down -Z at zero rotation, matching the three.js camera
 * convention, so the rig and the render camera share one rotation value.
 * `columnHeightM` is the optical axis height: the render camera is placed at
 * exactly this height, so what you see on the tripod is where the picture is
 * taken from.
 */
export function TripodCamera({
  columnHeightM,
  material,
  lensLengthM = 0.14,
}: {
  columnHeightM: number
  material: THREE.Material
  lensLengthM?: number
}) {
  const h = columnHeightM
  // Legs run from a shared apex just under the head down to splayed feet on the
  // floor. Solving for the orientation (rather than eyeballing a tilt) is what
  // makes the tops actually meet the column instead of floating beside it.
  const apexY = h * 0.86
  const footR = h * 0.34
  const legLength = Math.hypot(apexY, footR)
  const legTilt = -Math.atan2(footR, apexY)
  const legs = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]

  return (
    <group>
      {legs.map((a, i) => (
        <group key={i} rotation={[0, a, 0]}>
          <mesh
            material={material}
            position={[0, apexY / 2, footR / 2]}
            rotation={[legTilt, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.011, 0.017, legLength, 12]} />
          </mesh>
          {/* foot */}
          <mesh material={material} position={[0, 0.012, footR]} castShadow>
            <cylinderGeometry args={[0.022, 0.016, 0.024, 10]} />
          </mesh>
        </group>
      ))}

      {/* shoulder casting where the legs meet */}
      <mesh material={material} position={[0, apexY, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.026, 0.05, 16]} />
      </mesh>
      {/* centre column up to the head */}
      <mesh material={material} position={[0, (apexY + h - 0.08) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, h - 0.08 - apexY, 16]} />
      </mesh>
      {/* ball head */}
      <mesh material={material} position={[0, h - 0.075, 0]} castShadow>
        <sphereGeometry args={[0.038, 20, 14]} />
      </mesh>
      <mesh material={material} position={[0, h - 0.038, 0]} castShadow>
        <boxGeometry args={[0.075, 0.014, 0.075]} />
      </mesh>

      {/* body */}
      <mesh material={material} position={[0, h, 0]} castShadow>
        <boxGeometry args={[0.145, 0.104, 0.08]} />
      </mesh>
      {/* pentaprism hump */}
      <mesh material={material} position={[0, h + 0.066, 0.005]} castShadow>
        <boxGeometry args={[0.054, 0.034, 0.052]} />
      </mesh>
      {/* lens barrel, pointing down -Z */}
      <mesh
        material={material}
        position={[0, h, -0.038 - lensLengthM / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.036, 0.04, lensLengthM, 28]} />
      </mesh>
      {/* front element */}
      <mesh
        material={material}
        position={[0, h, -0.04 - lensLengthM]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.033, 0.033, 0.008, 28]} />
      </mesh>
    </group>
  )
}
