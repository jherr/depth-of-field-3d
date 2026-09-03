import { describe, expect, it } from 'vitest'
import {
  applyLayout,
  clampToRoom,
  decodeLayout,
  encodeLayout,
  moveProp,
} from '#/lib/scene/layout.ts'
import { DEFAULT_SCENE, getProp } from '#/lib/scene/defaultScene.ts'

const room = DEFAULT_SCENE.room

describe('clampToRoom', () => {
  it('keeps a footprint fully inside the walls', () => {
    const [x, , z] = clampToRoom(room, 0.4, [999, 0, 999])
    expect(x).toBeCloseTo(room.widthM / 2 - 0.4, 9)
    expect(z).toBeCloseTo(room.depthM / 2 - 0.4, 9)
  })

  it('clamps the negative side too', () => {
    const [x, , z] = clampToRoom(room, 0.4, [-999, 0, -999])
    expect(x).toBeCloseTo(-(room.widthM / 2 - 0.4), 9)
    expect(z).toBeCloseTo(-(room.depthM / 2 - 0.4), 9)
  })

  it('leaves an interior position untouched', () => {
    expect(clampToRoom(room, 0.3, [1, 0, -2])).toEqual([1, 0, -2])
  })

  it('is idempotent', () => {
    const once = clampToRoom(room, 0.4, [50, 3, -50])
    expect(clampToRoom(room, 0.4, once)).toEqual(once)
  })

  it('keeps the object above the floor and below the ceiling', () => {
    expect(clampToRoom(room, 0.2, [0, -5, 0])[1]).toBe(0)
    expect(clampToRoom(room, 0.2, [0, 999, 0])[1]).toBeCloseTo(room.heightM, 9)
  })

  it('centres an object too large for the room instead of producing NaN', () => {
    const [x, , z] = clampToRoom(room, 999, [3, 0, 3])
    expect(x).toBe(0)
    expect(z).toBe(0)
  })

  it('never returns NaN', () => {
    for (const p of [[NaN, 0, 0], [0, NaN, 0], [Infinity, 0, -Infinity]] as const) {
      for (const n of clampToRoom(room, 0.3, p)) {
        expect(Number.isFinite(n)).toBe(true)
      }
    }
  })
})

describe('moveProp', () => {
  it('records a new position without mutating the input', () => {
    const before = {}
    const after = moveProp(before, 'subject', [1, 0, 2])
    expect(before).toEqual({})
    expect(after.subject?.position).toEqual([1, 0, 2])
  })

  it('preserves rotation and scale already present', () => {
    const l = moveProp({ subject: { position: [0, 0, 0], rotationY: 1.2, scale: 1.4 } }, 'subject', [3, 0, 4])
    expect(l.subject?.rotationY).toBe(1.2)
    expect(l.subject?.scale).toBe(1.4)
  })
})

describe('applyLayout', () => {
  it('returns the default scene unchanged for an empty layout', () => {
    expect(applyLayout(DEFAULT_SCENE, {})).toEqual(DEFAULT_SCENE)
  })

  it('overrides only the named prop', () => {
    const moved = applyLayout(DEFAULT_SCENE, { subject: { position: [1, 0, -1], rotationY: 0, scale: 1 } })
    expect(getProp(moved, 'subject')!.transform.position).toEqual([1, 0, -1])
    for (const p of moved.props) {
      if (p.id !== 'subject') {
        expect(p.transform).toEqual(getProp(DEFAULT_SCENE, p.id)!.transform)
      }
    }
  })

  it('ignores layout entries for props that do not exist', () => {
    const r = applyLayout(DEFAULT_SCENE, { ghost: { position: [0, 0, 0], rotationY: 0, scale: 1 } })
    expect(r.props.length).toBe(DEFAULT_SCENE.props.length)
  })
})

describe('layout encoding', () => {
  it('encodes nothing when nothing has moved', () => {
    expect(encodeLayout(DEFAULT_SCENE, {})).toBe('')
  })

  it('encodes only props that differ from the default', () => {
    const subjectDef = getProp(DEFAULT_SCENE, 'subject')!.transform
    const encoded = encodeLayout(DEFAULT_SCENE, {
      subject: { position: [1.2, 0, -2.5], rotationY: 0.5, scale: subjectDef.scale },
      // Unchanged from its own default, so it must not appear in the URL.
      tripod: getProp(DEFAULT_SCENE, 'tripod')!.transform,
    })
    expect(encoded).toContain('subject')
    expect(encoded).not.toContain('tripod')
  })

  it('round-trips positions to two decimals and rotation to three', () => {
    const layout = {
      subject: { position: [1.23, 0, -2.51] as const, rotationY: 0.785, scale: 1 },
      tripod: { position: [-0.5, 0, 3.1] as const, rotationY: -1.234, scale: 1 },
    }
    const back = decodeLayout(encodeLayout(DEFAULT_SCENE, layout))
    expect(back.subject!.position[0]).toBeCloseTo(1.23, 2)
    expect(back.subject!.position[2]).toBeCloseTo(-2.51, 2)
    expect(back.subject!.rotationY).toBeCloseTo(0.785, 3)
    expect(back.tripod!.position[2]).toBeCloseTo(3.1, 2)
    expect(back.tripod!.rotationY).toBeCloseTo(-1.234, 3)
  })

  it('decodes garbage to an empty layout instead of throwing', () => {
    for (const g of [undefined, null, '', 'zzz', 'subject:', 'subject:a,b,c', 42, {}, 'a:1,2']) {
      expect(decodeLayout(g)).toEqual({})
    }
  })

  it('survives a truncated or partially valid string', () => {
    const r = decodeLayout('subject:1,0,2,0|broken|tripod:x,y,z,w')
    expect(r.subject?.position).toEqual([1, 0, 2])
    expect(r.tripod).toBeUndefined()
  })
})
