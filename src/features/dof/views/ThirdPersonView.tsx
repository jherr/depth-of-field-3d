import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { fieldOfView } from '#/lib/optics/fov.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import { DEFAULT_SCENE } from '#/lib/scene/defaultScene.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { FrustumSlab } from './FrustumSlab.tsx'
import type { CameraPose } from './cameraRig.ts'

/**
 * Orbit view of the room, with the depth of field drawn in place.
 *
 * The overlay is parented to the camera rig's transform, so the pyramid and the
 * slab follow the tripod as it is dragged and rotated -- the visualisation is
 * attached to the camera rather than to the world.
 */
export function ThirdPersonView({
  derived,
  pose,
}: {
  derived: DerivedOptics
  pose: CameraPose
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const showFrustum = useSimStore((s) => s.showFrustum)
  const showDofVolume = useSimStore((s) => s.showDofVolume)
  const units = useSimStore((s) => s.units)

  // The orbit camera is a viewing tool, not the subject of the simulation, so
  // it uses a plain wide-ish FOV rather than the lens under test.
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 45
      camera.near = 0.05
      camera.far = 120
      camera.aspect = size.width / Math.max(1, size.height)
      camera.updateProjectionMatrix()
    }
  }, [camera, size.width, size.height])

  // The frustum drawing uses the SENSOR's field of view, which is the whole
  // point: this shape is a claim about what the in-camera view will show.
  const lensFov = useMemo(
    () => fieldOfView(derived.params.focalLengthMm, derived.sensor),
    [derived.params.focalLengthMm, derived.sensor],
  )

  // Clip the drawing at the far wall rather than letting an infinite far limit
  // run off to the horizon.
  const maxDrawM = useMemo(() => {
    const room = DEFAULT_SCENE.room
    const dx = pose.forward[0] === 0 ? Infinity : Math.abs((room.widthM / 2) / pose.forward[0])
    const dz = pose.forward[2] === 0 ? Infinity : Math.abs((room.depthM / 2) / pose.forward[2])
    return Math.max(1.5, Math.min(room.depthM, Math.min(dx, dz) + room.depthM / 2))
  }, [pose.forward])

  return (
    <>
      <OrbitControls
        makeDefault
        target={[0, 1.05, 0.6]}
        minDistance={1.2}
        maxDistance={30}
        maxPolarAngle={Math.PI * 0.495}
        enableDamping
        dampingFactor={0.08}
      />

      <group
        position={[pose.position[0], pose.position[1], pose.position[2]]}
        rotation={[0, pose.rotationY, 0]}
      >
        <FrustumSlab
          fov={lensFov}
          nearLimitM={derived.dof.nearLimitM}
          farLimitM={derived.dof.farLimitM}
          focusDistanceM={derived.params.focusDistanceM}
          maxDistanceM={maxDrawM}
          showFrustum={showFrustum}
          showVolume={showDofVolume}
          units={units}
        />
      </group>
    </>
  )
}
