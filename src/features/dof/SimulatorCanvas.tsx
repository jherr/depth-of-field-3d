import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { sensorAspect } from '#/lib/optics/formats.ts'
import { computeSensorViewport } from '#/lib/scene/viewport.ts'
import { getSceneDef, getSceneSpec } from '#/lib/scene/scenes.ts'
import type { DerivedOptics } from './state/derive.ts'
import type { Size } from './state/useElementSize.ts'
import { useSimStore } from './state/useSimStore.ts'
import { RoomEnvironment } from './scene/RoomEnvironment.tsx'
import { SceneRoot } from './scene/SceneRoot.tsx'
import { registerStageCanvas, unregisterStageCanvas } from './ai/snapshot.ts'
import { cameraPoseFromLayout } from './views/cameraRig.ts'
import { InCameraView } from './views/InCameraView.tsx'
import { ThirdPersonView } from './views/ThirdPersonView.tsx'
import { DofPipeline } from './render/useDofPipeline.tsx'

/**
 * One canvas, one scene, two camera rigs.
 *
 * In the in-camera view the canvas element itself is letterboxed to the
 * sensor's aspect ratio. That is deliberate rather than incidental: the
 * millimetres-on-sensor to pixels-on-screen conversion behind every blur radius
 * is only valid when the render target's aspect matches the sensor's, and
 * sizing the canvas is a far more robust way to guarantee that than scissoring
 * a viewport. It also means the HUD, which letterboxes with the same function,
 * lines up with the image exactly.
 */
export function SimulatorCanvas({
  derived,
  size,
  mode,
}: {
  derived: DerivedOptics
  size: Size
  mode: 'thirdPerson' | 'inCamera'
}) {
  const layout = useSimStore((s) => s.layout)
  const sceneId = useSimStore((s) => s.sceneId)
  const inCamera = mode === 'inCamera'

  const sceneDef = useMemo(() => getSceneDef(sceneId), [sceneId])
  const pose = useMemo(
    () => cameraPoseFromLayout(layout, getSceneSpec(sceneId)),
    [layout, sceneId],
  )

  const rect = useMemo(() => {
    if (!inCamera) return { left: 0, top: 0, width: size.width, height: size.height }
    const v = computeSensorViewport(size.width, size.height, sensorAspect(derived.sensor))
    return { left: v.x, top: v.y, width: v.width, height: v.height }
  }, [inCamera, size.width, size.height, derived.sensor])

  // The registry is keyed by mode and this stage owns its key while mounted.
  // Dropping it on unmount is what tells the snapshot tool that the view is
  // gone and has to be brought back before it can photograph anything -- but
  // only if this canvas is still the registered one, since a view change
  // remounts the replacement before this cleanup runs.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => () => unregisterStageCanvas(mode, canvasRef.current), [mode])

  if (rect.width < 2 || rect.height < 2) return null

  return (
    <Canvas
      style={{ position: 'absolute', ...rect }}
      // Keyed by scene so switching venue remounts with that venue's framing
      // rather than stranding the orbit camera at the previous scene's vantage.
      key={sceneId}
      /*
       * Default orbit vantage: outside the room, three-quarters on, high enough
       * to look down the optical axis. The room's walls are single-sided and
       * face inward, so viewing from outside reads as a cutaway -- which is
       * what you want from a diagnostic view. Placed roughly perpendicular to
       * the lens axis so the in-focus slab is seen edge-on and its depth is
       * actually judgeable. The vantage is per-scene; see SceneViewHints.
       */
      camera={{
        position: [sceneDef.view.orbitStart[0], sceneDef.view.orbitStart[1], sceneDef.view.orbitStart[2]],
        fov: 45,
        near: 0.05,
        far: sceneDef.view.orbitFarM,
      }}
      dpr={[1, 2]}
      shadows={false}
      gl={{
        // Anti-aliasing comes from supersampling in the post chain instead:
        // MSAA cannot be resolved correctly alongside a depth-texture gather.
        antialias: !inCamera,
        alpha: false,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
        // Log depth would break the linear-depth reconstruction the circle of
        // confusion pass depends on.
        logarithmicDepthBuffer: false,
        // Keeps the colour buffer readable after compositing, which is the only
        // way `toDataURL` returns anything but transparent pixels. The
        // assistant's snapshot tool depends on it; without it every capture
        // comes back blank. Costs a copy per frame on some drivers.
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl, scene }) => {
        canvasRef.current = gl.domElement
        registerStageCanvas(mode, gl.domElement)
        // Tone mapping and sRGB encoding happen exactly once, at the end of the
        // post chain. Letting three apply them per material would double up.
        gl.toneMapping = THREE.NoToneMapping
        gl.outputColorSpace = THREE.SRGBColorSpace
        scene.background = new THREE.Color('#0b0d10')
      }}
    >
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#cfe4ff', '#6b5a44', 0.5]} />
      <directionalLight position={[-2.4, 4.2, 2.2]} intensity={1.15} color="#fff4e2" />
      <directionalLight position={[3.0, 2.6, -3.4]} intensity={0.45} color="#cddcff" />

      <RoomEnvironment />
      <SceneRoot derived={derived} interactive={!inCamera} hideCameraRig={inCamera} />

      {inCamera ? (
        <>
          <InCameraView derived={derived} pose={pose} farM={sceneDef.view.cameraFarM} />
          <DofPipeline derived={derived} />
        </>
      ) : (
        <ThirdPersonView
          derived={derived}
          pose={pose}
          room={sceneDef.spec.room}
          view={sceneDef.view}
        />
      )}
    </Canvas>
  )
}

export default SimulatorCanvas
