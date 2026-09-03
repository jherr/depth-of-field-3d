import type * as THREE from 'three'

/**
 * The subject: an artist's-mannequin stand-in built from primitives.
 *
 * Proportioned from a total height rather than hard-coded, and deliberately
 * given depth -- an outstretched forearm sits well in front of the torso, so a
 * shallow depth of field visibly falls off across the body itself. A flat
 * cut-out would hide the effect the tool exists to show.
 */
export function Mannequin({ heightM, material }: { heightM: number; material: THREE.Material }) {
  const h = heightM
  const headR = h * 0.0745
  const torsoH = h * 0.30
  const legH = h * 0.46
  const hipY = legH
  const shoulderY = hipY + torsoH

  return (
    <group>
      {/* legs */}
      <mesh material={material} position={[-h * 0.055, legH / 2, 0]} castShadow>
        <capsuleGeometry args={[h * 0.043, legH * 0.72, 8, 16]} />
      </mesh>
      <mesh material={material} position={[h * 0.055, legH / 2, 0]} castShadow>
        <capsuleGeometry args={[h * 0.043, legH * 0.72, 8, 16]} />
      </mesh>

      {/* pelvis + torso */}
      <mesh material={material} position={[0, hipY + h * 0.02, 0]} castShadow>
        <sphereGeometry args={[h * 0.075, 24, 16]} />
      </mesh>
      <mesh material={material} position={[0, hipY + torsoH * 0.55, 0]} castShadow>
        <capsuleGeometry args={[h * 0.088, torsoH * 0.62, 8, 24]} />
      </mesh>

      {/* shoulders */}
      <mesh material={material} position={[0, shoulderY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[h * 0.038, h * 0.20, 6, 16]} />
      </mesh>

      {/* left arm hangs down */}
      <mesh material={material} position={[-h * 0.135, shoulderY - h * 0.11, 0]} castShadow>
        <capsuleGeometry args={[h * 0.031, h * 0.17, 6, 16]} />
      </mesh>
      <mesh material={material} position={[-h * 0.135, shoulderY - h * 0.28, 0]} castShadow>
        <capsuleGeometry args={[h * 0.026, h * 0.15, 6, 16]} />
      </mesh>

      {/* right arm reaches forward: this is what makes shallow focus obvious */}
      <mesh
        material={material}
        position={[h * 0.135, shoulderY - h * 0.09, h * 0.05]}
        rotation={[Math.PI * 0.16, 0, 0]}
        castShadow
      >
        <capsuleGeometry args={[h * 0.031, h * 0.17, 6, 16]} />
      </mesh>
      <mesh
        material={material}
        position={[h * 0.135, shoulderY - h * 0.19, h * 0.24]}
        rotation={[Math.PI * 0.46, 0, 0]}
        castShadow
      >
        <capsuleGeometry args={[h * 0.026, h * 0.16, 6, 16]} />
      </mesh>
      <mesh material={material} position={[h * 0.135, shoulderY - h * 0.215, h * 0.35]} castShadow>
        <sphereGeometry args={[h * 0.032, 20, 14]} />
      </mesh>

      {/* neck + head */}
      <mesh material={material} position={[0, shoulderY + h * 0.035, 0]} castShadow>
        <cylinderGeometry args={[h * 0.026, h * 0.03, h * 0.05, 16]} />
      </mesh>
      <mesh material={material} position={[0, shoulderY + h * 0.035 + headR, 0]} castShadow>
        <sphereGeometry args={[headR, 32, 24]} />
      </mesh>
      {/* nose, so head orientation is readable and there is a near-field detail */}
      <mesh material={material} position={[0, shoulderY + h * 0.035 + headR, headR * 0.92]} castShadow>
        <sphereGeometry args={[headR * 0.19, 12, 10]} />
      </mesh>
    </group>
  )
}
