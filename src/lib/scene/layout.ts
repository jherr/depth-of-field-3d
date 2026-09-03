import { getProp } from './defaultScene.ts'
import type { PropTransform, RoomSpec, SceneSpec, Vec3 } from './types.ts'

/** Per-prop transform overrides, keyed by prop id. */
export type Layout = Readonly<Record<string, PropTransform>>

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback)

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Keep a prop's footprint inside the walls, on the floor, and under the
 * ceiling. Props too wide for the room are centred rather than producing an
 * inverted range.
 */
export function clampToRoom(room: RoomSpec, footprintRadiusM: number, p: Vec3): Vec3 {
  const r = Math.max(0, finite(footprintRadiusM))
  const halfW = room.widthM / 2 - r
  const halfD = room.depthM / 2 - r
  return [
    halfW <= 0 ? 0 : clamp(finite(p[0]), -halfW, halfW),
    clamp(finite(p[1]), 0, room.heightM),
    halfD <= 0 ? 0 : clamp(finite(p[2]), -halfD, halfD),
  ]
}

export function moveProp(layout: Layout, id: string, position: Vec3): Layout {
  const prev = layout[id]
  return {
    ...layout,
    [id]: { position, rotationY: prev?.rotationY ?? 0, scale: prev?.scale ?? 1 },
  }
}

export function rotateProp(layout: Layout, id: string, rotationY: number, fallback: Vec3): Layout {
  const prev = layout[id]
  return {
    ...layout,
    [id]: { position: prev?.position ?? fallback, rotationY, scale: prev?.scale ?? 1 },
  }
}

export function applyLayout(scene: SceneSpec, layout: Layout): SceneSpec {
  if (Object.keys(layout).length === 0) return scene
  let changed = false
  const props = scene.props.map((p) => {
    const override = layout[p.id]
    if (!override) return p
    changed = true
    return { ...p, transform: { ...p.transform, ...override } }
  })
  return changed ? { ...scene, props } : scene
}

const POSITION_DECIMALS = 2
const ROTATION_DECIMALS = 3

function sameTransform(a: PropTransform, b: PropTransform): boolean {
  return (
    a.position[0].toFixed(POSITION_DECIMALS) === b.position[0].toFixed(POSITION_DECIMALS) &&
    a.position[1].toFixed(POSITION_DECIMALS) === b.position[1].toFixed(POSITION_DECIMALS) &&
    a.position[2].toFixed(POSITION_DECIMALS) === b.position[2].toFixed(POSITION_DECIMALS) &&
    a.rotationY.toFixed(ROTATION_DECIMALS) === b.rotationY.toFixed(ROTATION_DECIMALS)
  )
}

/**
 * Encode only the props that actually differ from the default scene, so a
 * shared link stays short and readable until the user starts rearranging.
 */
export function encodeLayout(scene: SceneSpec, layout: Layout): string {
  const parts: string[] = []
  for (const [id, t] of Object.entries(layout)) {
    const base = getProp(scene, id)
    if (!base || sameTransform(base.transform, t)) continue
    const [x, y, z] = t.position
    parts.push(
      `${id}:${x.toFixed(POSITION_DECIMALS)},${y.toFixed(POSITION_DECIMALS)},${z.toFixed(
        POSITION_DECIMALS,
      )},${t.rotationY.toFixed(ROTATION_DECIMALS)}`,
    )
  }
  return parts.join('|')
}

export function decodeLayout(raw: unknown): Layout {
  if (typeof raw !== 'string' || raw === '') return {}
  const out: Record<string, PropTransform> = {}
  for (const part of raw.split('|')) {
    const sep = part.indexOf(':')
    if (sep <= 0) continue
    const id = part.slice(0, sep)
    const nums = part
      .slice(sep + 1)
      .split(',')
      .map(Number)
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) continue
    out[id] = {
      position: [nums[0]!, nums[1]!, nums[2]!],
      rotationY: nums[3]!,
      scale: 1,
    }
  }
  return out
}
