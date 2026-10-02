import type { OpticsParams } from '#/lib/optics/params.ts'
import { DEFAULT_SCENE } from './defaultScene.ts'
import { LED_WALL_SCENE } from './ledWallScene.ts'
import type { SceneSpec, Vec3 } from './types.ts'

export type SceneId = 'living-room' | 'led-wall'

/**
 * Viewing hints a scene needs that are not part of its geometry.
 *
 * The living room is 9 m deep; the LED-wall stage is 80 m. A render far plane
 * and an orbit zoom range tuned for one would clip or strand the other, so each
 * scene carries its own. Kept here rather than on `SceneSpec` because they are
 * about how the cameras are set up to look at the scene, not what is in it.
 */
export interface SceneViewHints {
  /** Far plane for the physically-calibrated in-camera render camera, metres. */
  readonly cameraFarM: number
  /** Far plane for the orbit (third-person) camera, metres. */
  readonly orbitFarM: number
  /**
   * Where the orbit camera starts, in world metres.
   *
   * It matters for a large venue: the default close-in vantage that frames a
   * 9 m room leaves an 80 m stage looking at empty floor until you pull back, so
   * each scene opens from a distance that actually frames it.
   */
  readonly orbitStart: Vec3
  /** Where the orbit camera looks by default. */
  readonly orbitTarget: Vec3
  /** How far the orbit camera may be pulled back. */
  readonly orbitMaxDistance: number
}

export interface SceneDef {
  readonly id: SceneId
  readonly label: string
  readonly description: string
  readonly spec: SceneSpec
  readonly view: SceneViewHints
  /**
   * Optics to apply when this scene is selected, merged over the current
   * settings. A 45 m shot wants a long lens focused far away; arriving with a
   * 50 mm focused at 4 m would show an empty room, so the scene brings sensible
   * glass with it.
   */
  readonly suggestedOptics?: Partial<OpticsParams>
}

export const SCENE_DEFS: readonly SceneDef[] = [
  {
    id: 'living-room',
    label: 'Living room',
    description: 'The default interior: a subject 3 m away with props at the near and far limits.',
    spec: DEFAULT_SCENE,
    view: {
      cameraFarM: 40,
      orbitFarM: 120,
      orbitStart: [6.4, 3.6, 5.6],
      orbitTarget: [0, 1.05, 0.6],
      orbitMaxDistance: 30,
    },
  },
  {
    id: 'led-wall',
    label: 'LED wall stage',
    description:
      'A presenter in front of a video wall, shot on a long lens from the back of the venue. Built to answer: how shallow a depth of field throws the wall far enough out of focus to kill moiré?',
    spec: LED_WALL_SCENE,
    view: {
      cameraFarM: 90,
      orbitFarM: 400,
      // Well back and to the side, high enough to look down the whole throw from
      // the tripod to the wall rather than at the empty floor in front of it.
      orbitStart: [30, 16, 20],
      orbitTarget: [0, 3, -13],
      orbitMaxDistance: 160,
    },
    suggestedOptics: {
      lensId: 'cine-100-800',
      focalLengthMm: 600,
      fNumber: 4,
      focusDistanceM: 45,
      sensorId: 'ff',
    },
  },
]

const BY_ID = new Map(SCENE_DEFS.map((d) => [d.id, d]))

export const DEFAULT_SCENE_ID: SceneId = 'living-room'

export function getSceneDef(id: SceneId): SceneDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_SCENE_ID)!
}

export function getSceneSpec(id: SceneId): SceneSpec {
  return getSceneDef(id).spec
}

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && BY_ID.has(v as SceneId)
}
