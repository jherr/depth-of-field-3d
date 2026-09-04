import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { ContentPart } from '@tanstack/ai'
import { CATALOG, CATALOG_KEYS } from '#/lib/scene/catalog.ts'
import type { CatalogKey } from '#/lib/scene/catalog.ts'
import { DEFAULT_SCENE } from '#/lib/scene/defaultScene.ts'
import { composeScene } from '#/lib/scene/layout.ts'
import { LENS_PRESETS } from '#/lib/optics/lenses.ts'
import { SENSOR_FORMAT_LIST } from '#/lib/optics/formats.ts'
import { deriveOptics } from '#/features/dof/state/derive.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { captureStage } from './snapshot.ts'
import type { StageMode } from './snapshot.ts'

/**
 * The tools the assistant drives the simulator with.
 *
 * Every one of them executes in the browser, not on the server. That is forced
 * rather than chosen: the authoritative scene lives in a Zustand store in the
 * tab, and the thing worth photographing is a WebGL canvas in the tab. A server
 * tool would have nothing to read and nothing to look at.
 *
 * So the server route contributes no implementations at all -- it declares the
 * same definitions so the model knows the shapes, and `mergeAgentTools` pairs
 * them with the client handlers the request carries.
 */

/**
 * A point in the room.
 *
 * An object rather than a `[x, y, z]` tuple, for two reasons. Anthropic rejects
 * the JSON Schema zod emits for a tuple -- `items: false` alongside
 * `prefixItems` -- with a bare "input_schema is invalid". And named fields are
 * simply harder for a model to fill in the wrong order than three bare numbers.
 */
const vec3 = z
  .object({
    x: z.number().describe('Left/right. -3 is the left wall, +3 the right.'),
    y: z.number().describe('Height above the floor. 0 is the floor.'),
    z: z.number().describe('Depth. The camera is at +4.2; -4.5 is the far wall.'),
  })
  .describe('A point in the room, in metres.')

type Vec3Arg = z.infer<typeof vec3>
const toVec = (v: Vec3Arg) => [v.x, v.y, v.z] as [number, number, number]

// ---------------------------------------------------------------------------
// Reading the scene
// ---------------------------------------------------------------------------

const propSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotationYDeg: z.number(),
  /** Axial distance from the lens, which is what the DOF numbers are about. */
  distanceFromCameraM: z.number(),
  addedThisSession: z.boolean(),
})

export const describeSceneToolDef = toolDefinition({
  name: 'describeScene',
  description:
    'Read the current state of the room: every prop with its id and position, the camera settings, and the resulting depth of field. Call this before moving or changing anything, so the ids and distances you use are real.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    room: z.object({ widthM: z.number(), depthM: z.number(), heightM: z.number() }),
    camera: z.object({
      lens: z.string(),
      focalLengthMm: z.number(),
      fNumber: z.number(),
      focusDistanceM: z.number(),
      sensor: z.string(),
      positionM: z.tuple([z.number(), z.number(), z.number()]),
    }),
    depthOfField: z.object({
      nearLimitM: z.number(),
      farLimitM: z.number(),
      totalM: z.number(),
      hyperfocalM: z.number(),
    }),
    props: z.array(propSchema),
    view: z.string(),
  }),
})

// ---------------------------------------------------------------------------
// Changing the scene
// ---------------------------------------------------------------------------

export const addPropToolDef = toolDefinition({
  name: 'addProp',
  description:
    `Add a prop to the room. Choose from a fixed catalogue: ${CATALOG_KEYS.map(
      (k) => `"${k}" (${CATALOG[k].description})`,
    ).join('; ')}. The room is 6 m wide (x -3..3) and 9 m deep (z -4.5..4.5); the camera is at z=+4.2 looking toward -z, so smaller z is further away.`,
  inputSchema: z.object({
    kind: z.enum(CATALOG_KEYS as [CatalogKey, ...Array<CatalogKey>]),
    position: vec3,
    rotationYDeg: z
      .number()
      .default(0)
      .describe('Yaw in degrees. 0 faces the camera; positive turns anticlockwise seen from above.'),
  }),
  outputSchema: z.object({
    id: z.string().describe('The id assigned, which may be suffixed if a copy already existed.'),
    label: z.string(),
    position: z.tuple([z.number(), z.number(), z.number()]).describe('After clamping into the room.'),
  }),
})

export const movePropToolDef = toolDefinition({
  name: 'moveProp',
  description:
    'Move and/or turn a prop that is already in the room. Use describeScene first to get its id. Positions are clamped to stay inside the walls.',
  inputSchema: z.object({
    id: z.string(),
    position: vec3.optional().describe('Omit to leave the position alone and only turn the prop.'),
    rotationYDeg: z.number().optional().describe('Omit to leave the rotation alone.'),
  }),
  outputSchema: z.object({
    id: z.string(),
    position: z.tuple([z.number(), z.number(), z.number()]),
    rotationYDeg: z.number(),
    distanceFromCameraM: z.number(),
  }),
})

export const removePropToolDef = toolDefinition({
  name: 'removeProp',
  description:
    'Remove a prop that was added during this session. Props from the default room cannot be removed, only moved.',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ id: z.string(), removed: z.boolean(), reason: z.string().optional() }),
})

// ---------------------------------------------------------------------------
// Changing the camera
// ---------------------------------------------------------------------------

export const setCameraToolDef = toolDefinition({
  name: 'setCamera',
  description:
    `Change the camera. Every field is optional; supply only what you want to change. Lenses: ${LENS_PRESETS.map(
      (l) => `"${l.id}" (${l.label})`,
    ).join(', ')}. Sensors: ${SENSOR_FORMAT_LIST.map((f) => `"${f.id}" (${f.label})`).join(', ')}. Focal length and aperture are clamped to what the chosen lens can actually do, so read the result back rather than assuming.`,
  inputSchema: z.object({
    lensId: z.string().optional(),
    focalLengthMm: z.number().optional(),
    fNumber: z.number().optional().describe('The f-stop. Smaller is a wider aperture and less depth of field.'),
    focusDistanceM: z.number().optional(),
    sensorId: z.string().optional(),
    /** The tripod is a prop, so moving the camera body is moving a prop. */
    positionM: vec3.optional().describe('Move the tripod. y is ignored; the rig always stands on the floor.'),
  }),
  outputSchema: z.object({
    lens: z.string(),
    focalLengthMm: z.number(),
    fNumber: z.number(),
    focusDistanceM: z.number(),
    sensor: z.string(),
    depthOfField: z.object({
      nearLimitM: z.number(),
      farLimitM: z.number(),
      totalM: z.number(),
    }),
  }),
})

export const focusOnToolDef = toolDefinition({
  name: 'focusOn',
  description:
    'Focus the lens on a named prop, by setting the focus distance to that prop\'s axial distance from the camera. Easier and more accurate than computing the distance yourself.',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    id: z.string(),
    focusDistanceM: z.number(),
    depthOfField: z.object({ nearLimitM: z.number(), farLimitM: z.number(), totalM: z.number() }),
  }),
})

// ---------------------------------------------------------------------------
// Looking
// ---------------------------------------------------------------------------

export const snapshotToolDef = toolDefinition({
  name: 'snapshot',
  description:
    'Take a picture of the app and look at it. "inCamera" is the photograph itself, with the depth-of-field blur applied — use it to judge what is sharp and what the bokeh looks like. "thirdPerson" is the diagram view of the room from outside, showing where everything is standing. If the requested view is not on screen the app switches to the split view to bring it up.',
  inputSchema: z.object({
    view: z.enum(['inCamera', 'thirdPerson']),
  }),
})

export const TOOL_DEFS = [
  describeSceneToolDef,
  addPropToolDef,
  movePropToolDef,
  removePropToolDef,
  setCameraToolDef,
  focusOnToolDef,
  snapshotToolDef,
]

// ---------------------------------------------------------------------------
// Browser implementations
// ---------------------------------------------------------------------------

const DEG = 180 / Math.PI
const toRad = (deg: number) => deg / DEG
const round = (n: number, places = 3) => Number(n.toFixed(places))
const roundVec = (v: readonly [number, number, number]) =>
  [round(v[0], 2), round(v[1], 2), round(v[2], 2)] as [number, number, number]

function currentScene() {
  const s = useSimStore.getState()
  return composeScene(s.added, s.layout)
}

function derived() {
  const s = useSimStore.getState()
  return deriveOptics(s.optics, s.renderHeightPx)
}

/** Axial distance along the optical axis, matching what the DOF maths uses. */
function distanceFromCamera(position: readonly [number, number, number]): number {
  const scene = currentScene()
  const rig = scene.props.find((p) => p.id === 'tripod')
  const t = rig?.transform.position ?? [0, 0, 4.2]
  const rotationY = rig?.transform.rotationY ?? 0
  const forward = [-Math.sin(rotationY), 0, -Math.cos(rotationY)] as const
  const d = [position[0] - t[0], 0, position[2] - t[2]] as const
  return round(Math.abs(d[0] * forward[0] + d[2] * forward[2]), 2)
}

function dofSummary() {
  const d = derived()
  return {
    nearLimitM: round(d.dof.nearLimitM, 2),
    farLimitM: round(d.dof.farLimitM, 2),
    totalM: round(d.dof.farLimitM - d.dof.nearLimitM, 2),
  }
}

const describeScene = describeSceneToolDef.client(() => {
  const s = useSimStore.getState()
  const scene = currentScene()
  const d = derived()
  const addedIds = new Set(s.added.map((p) => p.id))
  const rig = scene.props.find((p) => p.id === 'tripod')

  return {
    room: {
      widthM: scene.room.widthM,
      depthM: scene.room.depthM,
      heightM: scene.room.heightM,
    },
    camera: {
      lens: d.lens.label,
      focalLengthMm: d.params.focalLengthMm,
      fNumber: d.params.fNumber,
      focusDistanceM: d.params.focusDistanceM,
      sensor: d.sensor.label,
      positionM: roundVec(rig?.transform.position ?? [0, 0, 4.2]),
    },
    depthOfField: {
      ...dofSummary(),
      hyperfocalM: round(d.dof.hyperfocalM, 2),
    },
    props: scene.props.map((p) => ({
      id: p.id,
      label: p.label,
      role: p.role,
      position: roundVec(p.transform.position),
      rotationYDeg: round(p.transform.rotationY * DEG, 1),
      distanceFromCameraM: distanceFromCamera(p.transform.position),
      addedThisSession: addedIds.has(p.id),
    })),
    view: s.view,
  }
})

const addProp = addPropToolDef.client((args) => {
  const store = useSimStore.getState()
  const id = store.addProp(args.kind, toVec(args.position), toRad(args.rotationYDeg ?? 0))
  const placed = useSimStore.getState().added.find((p) => p.id === id)
  return {
    id,
    label: placed?.label ?? id,
    position: roundVec(placed?.transform.position ?? toVec(args.position)),
  }
})

const moveProp = movePropToolDef.client((args) => {
  const scene = currentScene()
  const prop = scene.props.find((p) => p.id === args.id)
  if (!prop) {
    throw new Error(
      `no prop with id "${args.id}". Call describeScene to see what is actually in the room.`,
    )
  }

  const store = useSimStore.getState()
  if (args.position) store.dragPropTo(args.id, toVec(args.position), prop.footprintRadiusM)
  if (args.rotationYDeg !== undefined) {
    store.rotatePropTo(args.id, toRad(args.rotationYDeg), prop.transform.position)
  }

  const after = currentScene().props.find((p) => p.id === args.id)!
  return {
    id: args.id,
    position: roundVec(after.transform.position),
    rotationYDeg: round(after.transform.rotationY * DEG, 1),
    distanceFromCameraM: distanceFromCamera(after.transform.position),
  }
})

const removeProp = removePropToolDef.client((args) => {
  const removed = useSimStore.getState().removeProp(args.id)
  return {
    id: args.id,
    removed,
    ...(removed
      ? {}
      : {
          reason: DEFAULT_SCENE.props.some((p) => p.id === args.id)
            ? 'that prop is part of the default room, so it can be moved but not removed'
            : 'no prop with that id',
        }),
  }
})

const setCamera = setCameraToolDef.client((args) => {
  const store = useSimStore.getState()

  // Lens first: switching lens re-clamps focal length and aperture, so doing it
  // after would silently discard whatever else this call asked for.
  if (args.lensId) store.setLens(args.lensId)

  const patch: Record<string, unknown> = {}
  if (args.focalLengthMm !== undefined) patch.focalLengthMm = args.focalLengthMm
  if (args.fNumber !== undefined) patch.fNumber = args.fNumber
  if (args.focusDistanceM !== undefined) patch.focusDistanceM = args.focusDistanceM
  if (args.sensorId !== undefined) patch.sensorId = args.sensorId
  if (Object.keys(patch).length > 0) store.patchOptics(patch)

  if (args.positionM) {
    const rig = currentScene().props.find((p) => p.id === 'tripod')
    store.dragPropTo('tripod', [args.positionM.x, 0, args.positionM.z], rig?.footprintRadiusM ?? 0.45)
  }

  const d = derived()
  return {
    lens: d.lens.label,
    focalLengthMm: d.params.focalLengthMm,
    fNumber: d.params.fNumber,
    focusDistanceM: d.params.focusDistanceM,
    sensor: d.sensor.label,
    depthOfField: dofSummary(),
  }
})

const focusOn = focusOnToolDef.client((args) => {
  const prop = currentScene().props.find((p) => p.id === args.id)
  if (!prop) {
    throw new Error(
      `no prop with id "${args.id}". Call describeScene to see what is actually in the room.`,
    )
  }
  const focusDistanceM = distanceFromCamera(prop.transform.position)
  useSimStore.getState().patchOptics({ focusDistanceM })

  return { id: args.id, focusDistanceM, depthOfField: dofSummary() }
})

/**
 * Returns content parts rather than a plain object, which is what makes the
 * image visible to the model instead of being stringified into the transcript.
 */
const snapshot = snapshotToolDef.client(async (args): Promise<Array<ContentPart>> => {
  const shot = await captureStage(args.view as StageMode)
  const d = derived()

  const caption =
    args.view === 'inCamera'
      ? `The photograph as the camera sees it, ${shot.width}x${shot.height}. ${d.params.focalLengthMm}mm at f/${d.params.fNumber}, focused at ${d.params.focusDistanceM} m, so everything from ${dofSummary().nearLimitM} m to ${dofSummary().farLimitM} m should read as sharp.`
      : `The room seen from outside, ${shot.width}x${shot.height}. The translucent slab is the depth of field and the tripod is the camera.`

  return [
    { type: 'text', content: caption },
    { type: 'image', source: { type: 'data', value: shot.base64, mimeType: 'image/png' } },
  ]
})

export const SIM_TOOLS = [
  describeScene,
  addProp,
  moveProp,
  removeProp,
  setCamera,
  focusOn,
  snapshot,
]
