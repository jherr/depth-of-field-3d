import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { assessMoire, moireStrength } from '#/lib/optics/moire.ts'
import { composeScene } from '#/lib/scene/layout.ts'
import { getSceneSpec } from '#/lib/scene/scenes.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { axialDistanceM, cameraPoseFromLayout } from '#/features/dof/views/cameraRig.ts'

/**
 * A video LED wall: an emissive sunset gradient with a synthesized moiré
 * overlay.
 *
 * The gradient is what makes defocus legible (a flat colour looks the same sharp
 * or blurred). The moiré overlay is the point of the feature: colour-fringed
 * interference bands that fade in as the wall gets sharp enough to alias and
 * dissolve as it falls out of focus.
 *
 * That overlay is a STYLISED cue, not a real simulation. True LED-wall moiré is
 * a beat between the panel's pixel grid and the camera's photosites -- a
 * sampling artefact a rasteriser with its own pixel grid cannot reproduce. So
 * its strength is driven by the same blur-vs-pitch ratio the readout reports
 * (see moireStrength in lib/optics/moire.ts), not by the render's pixels, and it
 * is drawn as low-frequency warped bands that are stable rather than a
 * high-frequency grid that would itself alias on screen.
 *
 * Emissive-style (unlit) output with `toneMapped = false`, matching the rest of
 * the scene's lights, so it reads as a bright screen and survives the
 * post-process gather -- which is what actually blurs it when it is out of focus.
 */

// Bottom-to-top sunset ramp as sRGB 0..1, then converted to linear for the
// shader (which outputs linear colour; the pipeline encodes sRGB once, at the
// end). Brightness matches the previous emissive wall: linear gradient x 2.6.
const STOPS_SRGB: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0.0, [0.1, 0.27, 0.66]],
  [0.3, [0.38, 0.21, 0.6]],
  [0.56, [0.85, 0.23, 0.44]],
  [0.8, [0.96, 0.53, 0.19]],
  [1.0, [0.91, 0.3, 0.14]],
]

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

const STOP_COLORS = STOPS_SRGB.map(
  ([, c]) => new THREE.Vector3(srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])),
)
const STOP_POSITIONS = STOPS_SRGB.map(([t]) => t)

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColors[5];
  uniform float uStops[5];
  uniform float uBrightness;
  uniform float uMoire;    // 0..1 overlay strength
  uniform float uDensity;  // band density

  vec3 gradient(float t) {
    vec3 c = uColors[0];
    for (int i = 1; i < 5; i++) {
      c = mix(c, uColors[i], smoothstep(uStops[i - 1], uStops[i], t));
    }
    return c;
  }

  void main() {
    vec3 base = gradient(clamp(vUv.y, 0.0, 1.0)) * uBrightness;

    // Warped concentric interference field. Low frequency on purpose: a real
    // beat frequency would alias on screen, so this is the visible envelope.
    vec2 p = (vUv - 0.5) * vec2(1.9, 1.0);
    float warp = sin(p.x * 6.0) * 0.14 + sin(p.y * 4.5) * 0.11;
    float field = (length(p) + warp) * uDensity;

    // Per-channel phase offset mimics R/G/B subpixels aliasing differently,
    // which is what gives real LED moiré its colour fringing.
    vec3 bands = vec3(sin(field), sin(field + 2.094), sin(field + 4.189));
    bands = bands * 0.5 + 0.5;
    bands = smoothstep(0.22, 0.78, bands);

    vec3 moired = base * (0.5 + 1.0 * bands);
    vec3 color = mix(base, moired, clamp(uMoire, 0.0, 1.0));
    gl_FragColor = vec4(max(color, 0.0), 1.0);
  }
`

/** Overlay strength and band density for the current shot. */
function useMoireParams(): { strength: number; density: number } {
  const sceneId = useSimStore((s) => s.sceneId)
  const layout = useSimStore((s) => s.layout)
  const added = useSimStore((s) => s.added)
  const optics = useSimStore((s) => s.optics)
  const pitchMm = useSimStore((s) => s.ledWallPitchMm)

  return useMemo(() => {
    const scene = composeScene(added, layout, getSceneSpec(sceneId))
    const wall = scene.props.find(
      (p) => p.geometry.kind === 'procedural' && p.geometry.shape.type === 'ledWall',
    )
    if (!wall) return { strength: 0, density: 20 }
    const pose = cameraPoseFromLayout(layout, getSceneSpec(sceneId))
    const distanceM = axialDistanceM(pose, wall.transform.position)
    const a = assessMoire(
      {
        focalLengthMm: optics.focalLengthMm,
        fNumber: optics.fNumber,
        focusDistanceM: optics.focusDistanceM,
      },
      { distanceM, pitchMm },
    )
    // Coarser panels alias into coarser bands, so density tracks the pitch.
    const density = 20 * Math.min(1.8, Math.max(0.6, 2.6 / pitchMm))
    return { strength: moireStrength(a.ratio), density }
  }, [sceneId, layout, added, optics, pitchMm])
}

export function LedWall({
  widthM,
  heightM,
  emissiveIntensity = 2.6,
}: {
  widthM: number
  heightM: number
  emissiveIntensity?: number
}) {
  const { strength, density } = useMoireParams()
  // Read in useFrame via a ref so the eased value tracks the latest target.
  const target = useRef({ strength, density })
  target.current = { strength, density }

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uColors: { value: STOP_COLORS },
          uStops: { value: STOP_POSITIONS },
          uBrightness: { value: emissiveIntensity },
          uMoire: { value: 0 },
          uDensity: { value: density },
        },
        toneMapped: false,
      }),
    [emissiveIntensity, density],
  )

  // Ease the overlay in and out so it melts rather than snaps as the shot changes.
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 6)
    const u = material.uniforms
    u.uMoire.value += (target.current.strength - u.uMoire.value) * k
    u.uDensity.value = target.current.density
  })

  // The default plane normal is +Z, which faces the camera parked down +Z.
  return (
    <mesh material={material}>
      <planeGeometry args={[widthM, heightM]} />
    </mesh>
  )
}
