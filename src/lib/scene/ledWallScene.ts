import { CAMERA_PROP_ID, SUBJECT_PROP_ID } from './defaultScene.ts'
import type { MaterialSpec, SceneProp, SceneSpec } from './types.ts'

/**
 * A live-events LED-wall stage.
 *
 * This is the scene the whole moiré feature exists for: a presenter standing a
 * few metres in front of a large video wall, shot on a long lens from the back
 * of the venue. The question it answers is Christopher Wintz's -- how shallow
 * does the depth of field have to be to throw the wall far enough out of focus
 * that its pixel grid stops beating against the camera sensor?
 *
 * It is laid out at real venue scale (metres), which is why it is a separate
 * scene rather than the living room enlarged: the camera sits ~45 m back, far
 * past anything the 6 x 9 m room could hold. The LED wall carries its pixel
 * pitch as data so the moiré readout has a single source of truth for it; see
 * `ledWall` in scene/types.ts.
 */

const matte = (color: string, roughness = 0.85): MaterialSpec => ({
  color,
  roughness,
  metalness: 0,
})

/** Shared so the readout and the assistant can find the wall without guessing. */
export const LED_WALL_PROP_ID = 'led-wall'

const props: readonly SceneProp[] = [
  {
    id: CAMERA_PROP_ID,
    label: 'Camera on tripod',
    role: 'cameraRig',
    geometry: { kind: 'procedural', shape: { type: 'tripodCamera', columnHeightM: 1.45 } },
    // 45 m back from the presenter, looking down -Z at the wall. A broadcast
    // long lens frames a person tightly from here, which is the real shot.
    transform: { position: [0, 0, 11], rotationY: 0, scale: 1 },
    material: { color: '#23262b', roughness: 0.45, metalness: 0.65 },
    draggable: true,
    footprintRadiusM: 0.45,
  },
  {
    id: SUBJECT_PROP_ID,
    label: 'Presenter',
    role: 'subject',
    geometry: {
      kind: 'gltf',
      url: '/models/person/person.glb',
      normalizeToHeightM: 1.78,
      keepMaterials: true,
    },
    // 3 m in front of the wall, facing the camera down +Z.
    transform: { position: [0, 0, -34], rotationY: 0, scale: 1 },
    material: { color: '#c8b9a8', roughness: 0.62, metalness: 0.02 },
    draggable: true,
    footprintRadiusM: 0.35,
  },
  {
    id: LED_WALL_PROP_ID,
    label: 'LED wall',
    role: 'lights',
    // 16 x 9 m panel, 2.6 mm pitch -- a common rental-grade fine-pitch wall.
    // Centre at 4.5 m so it stands on the floor and rises to 9 m.
    geometry: {
      kind: 'procedural',
      shape: { type: 'ledWall', widthM: 16, heightM: 9, pixelPitchMm: 2.6 },
    },
    transform: { position: [0, 4.5, -37], rotationY: 0, scale: 1 },
    // The look comes entirely from the emissive gradient the LedWall component
    // builds; this material is only here to satisfy the SceneProp shape.
    material: { color: '#000000', roughness: 1, metalness: 0 },
    draggable: false,
    footprintRadiusM: 0.4,
  },
  {
    id: 'ruler',
    label: 'Depth ruler',
    role: 'ruler',
    // Anchored to the camera at render time; long enough to reach the wall.
    geometry: { kind: 'procedural', shape: { type: 'depthRuler', lengthM: 50, tickSpacingM: 5 } },
    transform: { position: [1.4, 0.005, 0], rotationY: 0, scale: 1 },
    material: matte('#d8d4cb', 0.85),
    draggable: false,
    footprintRadiusM: 0.1,
  },
]

export const LED_WALL_SCENE: SceneSpec = {
  room: {
    widthM: 26,
    depthM: 80,
    heightM: 12,
    floor: matte('#2a2a2e', 0.9),
    walls: matte('#1d1f24', 0.95),
    ceiling: matte('#0b0d12', 1),
  },
  props,
}
