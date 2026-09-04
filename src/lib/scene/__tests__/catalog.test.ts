import { describe, expect, it } from 'vitest'
import { CATALOG, CATALOG_KEYS, instantiate } from '../catalog.ts'
import { composeScene } from '../layout.ts'
import { DEFAULT_SCENE } from '../defaultScene.ts'

/**
 * The catalogue is what the assistant is allowed to build with, so these are
 * less about the data structure than about the guarantees the tool relies on:
 * that an id is never reused, and that adding something cannot quietly replace
 * something already in the room.
 */
describe('catalog', () => {
  it('describes every entry, since the description is the model\'s only clue', () => {
    for (const key of CATALOG_KEYS) {
      const entry = CATALOG[key]
      expect(entry.description.length, `${key} needs a description`).toBeGreaterThan(20)
      expect(entry.footprintRadiusM).toBeGreaterThan(0)
      expect(entry.heightM).toBeGreaterThan(0)
    }
  })

  it('never collides with a default prop id', () => {
    const defaults = new Set(DEFAULT_SCENE.props.map((p) => p.id))
    for (const key of CATALOG_KEYS) {
      const prop = instantiate(key, [0, 0, 0], 0, defaults)
      expect(defaults.has(prop.id)).toBe(false)
    }
  })

  it('suffixes repeated copies rather than reusing an id', () => {
    const taken = new Set<string>()
    const ids = [0, 1, 2].map(() => {
      const prop = instantiate('vase', [0, 0, 0], 0, taken)
      taken.add(prop.id)
      return prop.id
    })

    expect(ids).toEqual(['vase', 'vase-2', 'vase-3'])
    expect(new Set(ids).size).toBe(3)
  })

  it('numbers the label to match the id', () => {
    const first = instantiate('vase', [0, 0, 0], 0, new Set())
    const second = instantiate('vase', [0, 0, 0], 0, new Set(['vase']))

    expect(first.label).toBe('Ceramic vase')
    expect(second.label).toBe('Ceramic vase 2')
  })

  it('converts degrees at the boundary, not inside the catalogue', () => {
    // instantiate takes radians; the tool layer is what parses degrees. This
    // pins that split so a future caller does not pass 90 and get 90 radians.
    const prop = instantiate('crate', [1, 0, 2], Math.PI / 2, new Set())
    expect(prop.transform.rotationY).toBeCloseTo(Math.PI / 2)
    expect(prop.transform.position).toEqual([1, 0, 2])
  })
})

describe('composeScene', () => {
  it('is the default scene when nothing has been added or moved', () => {
    expect(composeScene([], {})).toEqual(DEFAULT_SCENE)
  })

  it('appends added props without disturbing the defaults', () => {
    const extra = instantiate('crate', [1, 0, 1], 0, new Set())
    const scene = composeScene([extra], {})

    expect(scene.props).toHaveLength(DEFAULT_SCENE.props.length + 1)
    expect(scene.props.slice(0, DEFAULT_SCENE.props.length)).toEqual(DEFAULT_SCENE.props)
    expect(scene.props.at(-1)?.id).toBe(extra.id)
  })

  it('applies layout overrides to added props too', () => {
    const extra = instantiate('crate', [1, 0, 1], 0, new Set())
    const scene = composeScene([extra], {
      [extra.id]: { position: [-2, 0, -2], rotationY: 1, scale: 1 },
    })

    expect(scene.props.at(-1)?.transform.position).toEqual([-2, 0, -2])
  })

  it('leaves DEFAULT_SCENE itself untouched', () => {
    const before = DEFAULT_SCENE.props.length
    composeScene([instantiate('crate', [0, 0, 0], 0, new Set())], {})
    expect(DEFAULT_SCENE.props).toHaveLength(before)
  })
})
