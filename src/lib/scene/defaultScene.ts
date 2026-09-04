import type { MaterialSpec, SceneProp, SceneSpec } from './types.ts'

/**
 * The default room.
 *
 * Laid out to be useful rather than pretty: the camera sits at one end looking
 * down -Z, the subject stands 3 m away, and everything else is placed so the
 * near and far focus limits fall on something you can actually judge sharpness
 * against.
 *
 * Two design constraints worth knowing before moving anything:
 *
 * 1. The scene MUST contain bright emissive sources. Bokeh only becomes visible
 *    when a highlight's energy exceeds 1.0 and survives being spread across the
 *    blur disc. The bulb string, the lamp and the window exist for that reason.
 * 2. The depth ruler and focus chart are measurement instruments, not
 *    decoration. They are what let you confirm the rendered blur agrees with
 *    the numbers in the HUD.
 */

const matte = (color: string, roughness = 0.8): MaterialSpec => ({
  color,
  roughness,
  metalness: 0,
})

export const CAMERA_PROP_ID = 'tripod'
export const SUBJECT_PROP_ID = 'subject'

const props: readonly SceneProp[] = [
  {
    id: CAMERA_PROP_ID,
    label: 'Camera on tripod',
    role: 'cameraRig',
    geometry: { kind: 'procedural', shape: { type: 'tripodCamera', columnHeightM: 1.45 } },
    transform: { position: [0, 0, 4.2], rotationY: 0, scale: 1 },
    material: { color: '#23262b', roughness: 0.45, metalness: 0.65 },
    draggable: true,
    footprintRadiusM: 0.45,
  },
  {
    id: SUBJECT_PROP_ID,
    label: 'Subject',
    role: 'subject',
    // A photogrammetry scan rather than the procedural mannequin. Skin and
    // fabric microdetail is the point: it is the high-frequency content the
    // blur has to destroy, and it is what makes the plane of focus land
    // visibly on a face rather than somewhere vague on a smooth capsule.
    // Authored in centimetres, hence the normalisation.
    geometry: {
      kind: 'gltf',
      url: '/models/person/person.glb',
      normalizeToHeightM: 1.72,
      keepMaterials: true,
    },
    // The scan already faces +Z, which is where the camera is. The procedural
    // mannequin this replaced needed Math.PI to turn around; this does not.
    transform: { position: [0, 0, 0.2], rotationY: 0, scale: 1 },
    material: { color: '#c8b9a8', roughness: 0.62, metalness: 0.02 },
    draggable: true,
    footprintRadiusM: 0.35,
  },
  {
    id: 'chart-near',
    label: 'Focus chart (near)',
    role: 'chart',
    geometry: {
      kind: 'procedural',
      shape: { type: 'focusChart', widthM: 0.5, heightM: 0.36, tiltDeg: 20, pattern: 'slantedEdge' },
    },
    transform: { position: [-0.95, 0.75, 1.35], rotationY: 0.28, scale: 1 },
    material: matte('#f2f2ef', 0.9),
    draggable: true,
    footprintRadiusM: 0.3,
  },
  {
    id: 'chart-far',
    label: 'Focus chart (far)',
    role: 'chart',
    geometry: {
      kind: 'procedural',
      shape: { type: 'focusChart', widthM: 0.5, heightM: 0.36, tiltDeg: 0, pattern: 'siemensStar' },
    },
    transform: { position: [1.05, 0.8, -1.6], rotationY: -0.22, scale: 1 },
    material: matte('#f2f2ef', 0.9),
    draggable: true,
    footprintRadiusM: 0.3,
  },
  {
    id: 'ruler',
    label: 'Depth ruler',
    role: 'ruler',
    // Anchored to the camera rig at render time so its ticks always read as
    // true axial distance from the lens.
    geometry: { kind: 'procedural', shape: { type: 'depthRuler', lengthM: 7.5, tickSpacingM: 0.5 } },
    transform: { position: [0.75, 0.005, 0], rotationY: 0, scale: 1 },
    material: matte('#d8d4cb', 0.85),
    draggable: false,
    footprintRadiusM: 0.1,
  },
  {
    id: 'bulbs',
    label: 'Bulb string',
    role: 'lights',
    geometry: {
      kind: 'procedural',
      shape: { type: 'bokehLights', count: 14, spreadM: 4.2, heightM: 1.9 },
    },
    transform: { position: [0, 0, -2.9], rotationY: 0, scale: 1 },
    material: {
      color: '#1a1a1a',
      roughness: 0.3,
      metalness: 0,
      emissive: '#ffd9a0',
      // Far above 1.0 on purpose: see the note at the top of this file.
      emissiveIntensity: 26,
    },
    draggable: true,
    footprintRadiusM: 0.2,
  },
  {
    id: 'lamp',
    label: 'Practical lamp',
    role: 'lights',
    geometry: { kind: 'procedural', shape: { type: 'lamp', heightM: 1.55 } },
    transform: { position: [-1.85, 0, -0.9], rotationY: 0.4, scale: 1 },
    material: {
      color: '#2b2b2b',
      roughness: 0.5,
      metalness: 0.3,
      emissive: '#ffe6bd',
      emissiveIntensity: 14,
    },
    draggable: true,
    footprintRadiusM: 0.3,
  },
  {
    id: 'chrome',
    label: 'Chrome sphere',
    role: 'prop',
    geometry: { kind: 'procedural', shape: { type: 'sphere', radius: 0.11 } },
    transform: { position: [1.16, 0.6, -0.63], rotationY: 0, scale: 1 },
    material: { color: '#e9edf0', roughness: 0.04, metalness: 1 },
    draggable: true,
    footprintRadiusM: 0.12,
  },
  {
    id: 'table',
    label: 'Table',
    role: 'prop',
    geometry: { kind: 'gltf', url: '/models/gallinera_table/gallinera_table_2k.gltf', keepMaterials: true },
    transform: { position: [0.95, 0, -0.55], rotationY: 0.08, scale: 1 },
    material: matte('#6b4b32', 0.66),
    draggable: true,
    footprintRadiusM: 0.5,
  },
  {
    id: 'vase',
    label: 'Ceramic vase',
    role: 'prop',
    geometry: {
      kind: 'gltf',
      url: '/models/antique_ceramic_vase_01/antique_ceramic_vase_01_2k.gltf',
      keepMaterials: true,
    },
    // Stands on the table: 0.49 m is the table's height, measured off the asset.
    transform: { position: [0.79, 0.49, -0.47], rotationY: -0.5, scale: 1 },
    draggable: true,
    material: matte('#cbbfae', 0.55),
    footprintRadiusM: 0.14,
  },
  {
    id: 'sofa',
    label: 'Sofa',
    role: 'prop',
    geometry: { kind: 'gltf', url: '/models/sofa_03/sofa_03_2k.gltf', keepMaterials: true },
    transform: { position: [-1.25, 0, -2.3], rotationY: 0.34, scale: 1 },
    material: matte('#6d6357', 0.9),
    draggable: true,
    footprintRadiusM: 1.4,
  },
  {
    id: 'coffee-table',
    label: 'Coffee table',
    role: 'prop',
    geometry: {
      kind: 'gltf',
      url: '/models/gothic_coffee_table/gothic_coffee_table_2k.gltf',
      keepMaterials: true,
    },
    transform: { position: [-1.05, 0, -1.15], rotationY: 0.34, scale: 1 },
    material: matte('#4a3a2c', 0.6),
    draggable: true,
    footprintRadiusM: 0.75,
  },
  {
    id: 'elephant',
    label: 'Carved elephant',
    role: 'prop',
    geometry: {
      kind: 'gltf',
      url: '/models/carved_wooden_elephant/carved_wooden_elephant_2k.gltf',
      keepMaterials: true,
    },
    // 10 cm tall, on the coffee table. Small, densely carved and off the
    // subject's plane, so it reads as sharp or soft well before the eye can
    // judge the same thing on a larger prop.
    transform: { position: [-0.78, 0.56, -1.02], rotationY: 2.1, scale: 1 },
    material: matte('#5a4432', 0.62),
    draggable: true,
    footprintRadiusM: 0.08,
  },
  {
    id: 'crate-near',
    label: 'Crate (near)',
    role: 'prop',
    geometry: { kind: 'procedural', shape: { type: 'box', size: [0.42, 0.42, 0.42] } },
    transform: { position: [-1.15, 0.21, 2.1], rotationY: 0.55, scale: 1 },
    material: matte('#8a7350', 0.72),
    draggable: true,
    footprintRadiusM: 0.32,
  },
  {
    id: 'crate-far',
    label: 'Crate (far)',
    role: 'prop',
    geometry: { kind: 'procedural', shape: { type: 'box', size: [0.55, 0.55, 0.55] } },
    transform: { position: [-1.5, 0.275, -3.5], rotationY: -0.3, scale: 1 },
    material: matte('#7c6a4d', 0.72),
    draggable: true,
    footprintRadiusM: 0.4,
  },
  {
    id: 'column',
    label: 'Column',
    role: 'prop',
    geometry: { kind: 'procedural', shape: { type: 'cylinder', radius: 0.18, height: 2.7 } },
    transform: { position: [2.2, 1.35, -1.9], rotationY: 0, scale: 1 },
    material: matte('#cfc7b8', 0.85),
    draggable: true,
    footprintRadiusM: 0.2,
  },
  {
    id: 'window',
    label: 'Window',
    role: 'architecture',
    geometry: { kind: 'procedural', shape: { type: 'box', size: [1.6, 1.35, 0.06] } },
    transform: { position: [-1.0, 1.5, -4.45], rotationY: 0, scale: 1 },
    material: {
      color: '#0a0a0a',
      roughness: 1,
      metalness: 0,
      emissive: '#dceeff',
      emissiveIntensity: 9,
    },
    draggable: false,
    footprintRadiusM: 0.1,
  },
]

export const DEFAULT_SCENE: SceneSpec = {
  room: {
    widthM: 6,
    depthM: 9,
    heightM: 2.9,
    floor: matte('#8e7f6d', 0.74),
    walls: matte('#b9b3a6', 0.92),
    ceiling: matte('#d5d1c7', 0.95),
  },
  props,
}

export function getProp(scene: SceneSpec, id: string): SceneProp | undefined {
  return scene.props.find((p) => p.id === id)
}

export function draggableProps(scene: SceneSpec): readonly SceneProp[] {
  return scene.props.filter((p) => p.draggable)
}
