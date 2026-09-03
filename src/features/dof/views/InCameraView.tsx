import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import type { CameraPose } from './cameraRig.ts'

/** Tight clip range: the whole scene is one room, so this maximises depth precision. */
export const CAMERA_NEAR_M = 0.05
export const CAMERA_FAR_M = 40

/**
 * The physically calibrated render camera.
 *
 * Field of view is never set directly. It comes from `filmGauge` plus
 * `setFocalLength`, so a 50mm lens on full frame gives exactly 39.6 degrees
 * horizontally because that is what the geometry says -- not because a number
 * was tuned until it looked right.
 *
 * `filmGauge` must be the sensor's larger dimension. three.js defaults it to
 * 35, which is wrong for "35mm format" (the image gate is 36x24) and silently
 * costs 2.7% of the field of view.
 */
export function InCameraView({
  derived,
  pose,
}: {
  derived: DerivedOptics
  pose: CameraPose
}) {
  const set = useThree((s) => s.set)
  const defaultCamera = useThree((s) => s.camera)

  const camera = useMemo(() => new THREE.PerspectiveCamera(), [])

  useLayoutEffect(() => {
    camera.filmGauge = derived.fov.filmGauge
    // The sensor's aspect, not the canvas's. The canvas is letterboxed to match,
    // which is what keeps the millimetres-to-pixels conversion valid.
    camera.aspect = derived.fov.aspect
    camera.near = CAMERA_NEAR_M
    camera.far = CAMERA_FAR_M
    camera.setFocalLength(derived.params.focalLengthMm)
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    camera.rotation.set(0, pose.rotationY, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }, [camera, derived.fov, derived.params.focalLengthMm, pose])

  useEffect(() => {
    const previous = defaultCamera
    set({ camera })
    return () => set({ camera: previous })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, set])

  return null
}
