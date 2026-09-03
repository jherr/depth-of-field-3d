import { CAMERA_PROP_ID, DEFAULT_SCENE, getProp } from '#/lib/scene/defaultScene.ts'
import { applyLayout } from '#/lib/scene/layout.ts'
import type { Layout } from '#/lib/scene/layout.ts'
import type { Vec3 } from '#/lib/scene/types.ts'

export interface CameraPose {
  /** Optical centre of the lens, in world metres. */
  readonly position: Vec3
  readonly rotationY: number
  /** Unit forward vector, matching three's -Z convention. */
  readonly forward: Vec3
}

/**
 * Where the picture is taken from.
 *
 * Derived from the tripod prop so there is exactly one source of truth: the
 * tripod you see in the third-person view IS the camera whose image the
 * in-camera view renders. Height comes from the rig's column, so the optical
 * axis sits where the model's lens is.
 */
export function cameraPoseFromLayout(layout: Layout): CameraPose {
  const scene = applyLayout(DEFAULT_SCENE, layout)
  const rig = getProp(scene, CAMERA_PROP_ID)
  const t = rig?.transform ?? { position: [0, 0, 0] as Vec3, rotationY: 0, scale: 1 }
  const shape = rig?.geometry.kind === 'procedural' ? rig.geometry.shape : undefined
  const columnHeightM = shape?.type === 'tripodCamera' ? shape.columnHeightM : 1.45

  const rotationY = t.rotationY
  return {
    position: [t.position[0], t.position[1] + columnHeightM, t.position[2]],
    rotationY,
    // A three.js camera at rotation.y = 0 looks down -Z.
    forward: [-Math.sin(rotationY), 0, -Math.cos(rotationY)],
  }
}

/** Axial distance from the lens to a world point, along the optical axis. */
export function axialDistanceM(pose: CameraPose, point: Vec3): number {
  const dx = point[0] - pose.position[0]
  const dy = point[1] - pose.position[1]
  const dz = point[2] - pose.position[2]
  return dx * pose.forward[0] + dy * pose.forward[1] + dz * pose.forward[2]
}
