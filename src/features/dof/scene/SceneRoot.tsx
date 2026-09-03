import { useMemo } from 'react'
import { CAMERA_PROP_ID, DEFAULT_SCENE } from '#/lib/scene/defaultScene.ts'
import { applyLayout } from '#/lib/scene/layout.ts'
import type { SceneProp } from '#/lib/scene/types.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { PropView } from './PropView.tsx'
import type { DofBandInfo } from './PropView.tsx'
import { Room } from './props/Room.tsx'
import { useDragOnFloor } from './useDragOnFloor.ts'

/**
 * Builds the scene graph from scene data.
 *
 * Both views share this one graph, which is not just an optimisation: the
 * third-person view's in-focus slab is a *claim* about the in-camera image, so
 * the two must be looking at literally the same geometry for the claim to mean
 * anything.
 */
export function SceneRoot({
  derived,
  interactive,
  hideCameraRig,
}: {
  derived: DerivedOptics
  interactive: boolean
  /**
   * Omit the tripod and camera body.
   *
   * The render camera is placed at the rig's own optical axis, so from inside
   * the lens the rig's body, ball head and barrel all sit at or in front of the
   * near plane -- you would be photographing the inside of your own camera.
   */
  hideCameraRig: boolean
}) {
  const layout = useSimStore((s) => s.layout)
  const units = useSimStore((s) => s.units)
  const showRuler = useSimStore((s) => s.showRuler)

  const scene = useMemo(() => applyLayout(DEFAULT_SCENE, layout), [layout])

  const band: DofBandInfo = {
    nearLimitM: derived.dof.nearLimitM,
    farLimitM: derived.dof.farLimitM,
    focusDistanceM: derived.params.focusDistanceM,
    units,
  }

  const cameraTransform =
    scene.props.find((p) => p.id === CAMERA_PROP_ID)?.transform ?? {
      position: [0, 0, 0] as const,
      rotationY: 0,
      scale: 1,
    }

  return (
    <group>
      <Room room={scene.room} />

      {scene.props.map((prop) => {
        if (prop.role === 'cameraRig' && hideCameraRig) return null
        if (prop.role === 'ruler') {
          if (!showRuler) return null
          // The ruler is anchored to the camera rig and aimed along its optical
          // axis, so its ticks always read as true distance from the lens.
          return (
            <group
              key={prop.id}
              position={[
                cameraTransform.position[0] + prop.transform.position[0],
                prop.transform.position[1],
                cameraTransform.position[2] + prop.transform.position[2],
              ]}
              rotation={[0, cameraTransform.rotationY, 0]}
            >
              <PropView prop={prop} band={band} />
            </group>
          )
        }
        return <DraggableProp key={prop.id} prop={prop} band={band} interactive={interactive} />
      })}
    </group>
  )
}

function DraggableProp({
  prop,
  band,
  interactive,
}: {
  prop: SceneProp
  band: DofBandInfo
  interactive: boolean
}) {
  const hovered = useSimStore((s) => s.hoveredPropId === prop.id)
  const selected = useSimStore((s) => s.selectedPropId === prop.id)
  const enabled = interactive && prop.draggable

  const handlers = useDragOnFloor({
    propId: prop.id,
    enabled,
    footprintRadiusM: prop.footprintRadiusM,
    currentPosition: prop.transform.position,
  })

  const emphasised = interactive && (hovered || selected)

  return (
    <group
      position={prop.transform.position}
      rotation={[0, prop.transform.rotationY, 0]}
      scale={prop.transform.scale}
      {...(enabled ? handlers : {})}
    >
      <PropView prop={prop} band={band} />
      {emphasised && (
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[prop.footprintRadiusM * 0.92, prop.footprintRadiusM * 1.06, 40]}
          />
          <meshBasicMaterial
            color={selected ? '#ffc94d' : '#8fd9ff'}
            transparent
            opacity={selected ? 0.95 : 0.6}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}
