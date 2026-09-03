/**
 * The scene as data.
 *
 * Views, controls and the optics module never see `PropGeometry`. That is the
 * seam that makes procedural primitives swappable for loaded GLTF models later:
 * change one prop's `geometry` and only `PropView` notices.
 *
 * World units are metres, y is up, and y = 0 is the floor.
 */

export type Vec3 = readonly [number, number, number]

export interface PropTransform {
  readonly position: Vec3
  readonly rotationY: number
  readonly scale: number
}

export type ProceduralShape =
  | { readonly type: 'box'; readonly size: Vec3 }
  | { readonly type: 'cylinder'; readonly radius: number; readonly height: number }
  | { readonly type: 'sphere'; readonly radius: number }
  | { readonly type: 'mannequin'; readonly heightM: number }
  | {
      readonly type: 'focusChart'
      readonly widthM: number
      readonly heightM: number
      readonly tiltDeg: number
      readonly pattern: 'slantedEdge' | 'siemensStar' | 'checker'
    }
  | { readonly type: 'depthRuler'; readonly lengthM: number; readonly tickSpacingM: number }
  | { readonly type: 'tripodCamera'; readonly columnHeightM: number }
  | {
      readonly type: 'bokehLights'
      readonly count: number
      readonly spreadM: number
      readonly heightM: number
    }
  | { readonly type: 'lamp'; readonly heightM: number }

export type PropGeometry =
  | { readonly kind: 'procedural'; readonly shape: ProceduralShape }
  | {
      readonly kind: 'gltf'
      readonly url: string
      readonly nodeName?: string
      readonly normalizeToHeightM?: number
    }

export interface MaterialSpec {
  readonly color: string
  readonly roughness: number
  readonly metalness: number
  readonly emissive?: string
  /**
   * Allowed to exceed 1.0, and often must.
   *
   * Bokeh is only visible when a point source's energy survives being spread
   * over the blur disc. Values of 8-50 are normal for the practical lights in
   * this scene; without them the blur reads as a grey smudge.
   */
  readonly emissiveIntensity?: number
  /**
   * Deliberately impossible.
   *
   * A single-layer depth buffer records the occluder behind glass, not the
   * glass, so a post-process gather cannot blur transparency correctly. The
   * type system encodes the constraint so nobody has to rediscover it.
   */
  readonly transparent?: never
}

export type PropRole =
  | 'subject'
  | 'prop'
  | 'cameraRig'
  | 'chart'
  | 'ruler'
  | 'lights'
  | 'architecture'

export interface SceneProp {
  readonly id: string
  readonly label: string
  readonly role: PropRole
  readonly geometry: PropGeometry
  readonly transform: PropTransform
  readonly material: MaterialSpec
  readonly draggable: boolean
  /** XZ footprint radius in metres, used to keep props inside the walls. */
  readonly footprintRadiusM: number
}

export interface RoomSpec {
  readonly widthM: number
  readonly depthM: number
  readonly heightM: number
  readonly floor: MaterialSpec
  readonly walls: MaterialSpec
  readonly ceiling: MaterialSpec
}

export interface SceneSpec {
  readonly room: RoomSpec
  readonly props: readonly SceneProp[]
}
