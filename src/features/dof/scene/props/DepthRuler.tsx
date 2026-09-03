import { useMemo } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import { DOF_COLORS } from '#/features/dof/views/dofColors.ts'

/**
 * A ruler running away from the camera along its optical axis, with ticks every
 * `tickSpacingM` labelled in metres from the lens.
 *
 * This is the instrument that makes the whole tool checkable: focus on the
 * 3.0 m tick and the photograph must go soft exactly where the HUD says the
 * near and far limits are. If they disagree, something is wrong -- and you can
 * see it rather than having to trust the readout.
 *
 * Rendered as discrete tick plates rather than a texture so the labels stay
 * legible at any focal length, and so the depth-of-field band can be drawn
 * directly onto it.
 */
export function DepthRuler({
  lengthM,
  tickSpacingM,
  nearLimitM,
  farLimitM,
  focusDistanceM,
  units,
}: {
  lengthM: number
  tickSpacingM: number
  nearLimitM: number
  farLimitM: number
  focusDistanceM: number
  units: 'metric' | 'imperial'
}) {
  const railMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ded9ce', roughness: 0.8, metalness: 0 })
    m.toneMapped = false
    return m
  }, [])

  const ticks = useMemo(() => {
    const out: Array<{ d: number; major: boolean }> = []
    for (let d = tickSpacingM; d <= lengthM + 1e-6; d += tickSpacingM) {
      out.push({ d, major: Math.abs((d / tickSpacingM) % 2) < 1e-6 })
    }
    return out
  }, [lengthM, tickSpacingM])

  const inBand = (d: number): boolean => d >= nearLimitM && d <= farLimitM

  // The ruler runs from the camera toward -Z, so distance maps to -d.
  return (
    <group>
      <mesh material={railMaterial} position={[0, 0.006, -lengthM / 2]}>
        <boxGeometry args={[0.1, 0.012, lengthM]} />
      </mesh>

      {/* the in-focus span, painted straight onto the rail */}
      {Number.isFinite(farLimitM) && farLimitM > nearLimitM && (
        <mesh
          position={[0, 0.014, -(nearLimitM + Math.min(farLimitM, lengthM)) / 2]}
        >
          <boxGeometry
            args={[0.104, 0.004, Math.max(0.002, Math.min(farLimitM, lengthM) - nearLimitM)]}
          />
          <meshBasicMaterial color={DOF_COLORS.slab} toneMapped={false} />
        </mesh>
      )}
      {!Number.isFinite(farLimitM) && nearLimitM < lengthM && (
        <mesh position={[0, 0.014, -(nearLimitM + lengthM) / 2]}>
          <boxGeometry args={[0.104, 0.004, Math.max(0.002, lengthM - nearLimitM)]} />
          <meshBasicMaterial color={DOF_COLORS.infinite} toneMapped={false} />
        </mesh>
      )}

      {ticks.map(({ d, major }) => (
        <group key={d} position={[0, 0, -d]}>
          <mesh position={[0, 0.016, 0]}>
            <boxGeometry args={[major ? 0.12 : 0.07, 0.004, 0.012]} />
            <meshBasicMaterial
              color={inBand(d) ? '#1b1b1b' : '#8c8578'}
              toneMapped={false}
            />
          </mesh>
          {major && (
            <Text
              position={[0.115, 0.02, 0]}
              rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
              fontSize={0.075}
              color={inBand(d) ? '#101010' : '#6f685c'}
              anchorX="center"
              anchorY="middle"
            >
              {units === 'metric' ? `${d.toFixed(1)}` : `${(d / 0.3048).toFixed(0)}'`}
            </Text>
          )}
        </group>
      ))}

      {/* the exact plane of focus */}
      {focusDistanceM <= lengthM && (
        <mesh position={[0, 0.019, -focusDistanceM]}>
          <boxGeometry args={[0.14, 0.005, 0.016]} />
          <meshBasicMaterial color={DOF_COLORS.focusPlane} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}
