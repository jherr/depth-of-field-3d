import type { UnitSystem } from '#/lib/optics/format.ts'
import { encodeOpticsParams, normalizeOpticsParams } from '#/lib/optics/params.ts'
import type { OpticsParams } from '#/lib/optics/params.ts'
import { decodeLayout } from '#/lib/scene/layout.ts'
import type { ViewMode } from './useSimStore.ts'

export interface SimSearch {
  readonly lens: string
  readonly f: number
  readonly N: number
  readonly s: number
  readonly sensor: string
  readonly coc: string
  readonly diff: number
  readonly view: ViewMode
  readonly units: UnitSystem
  readonly layout: string
}

/**
 * `validateSearch` for the simulator route.
 *
 * Total by construction: it clamps rather than throwing. These values come out
 * of a URL that may be stale, hand-edited, or produced by an older build of
 * this app, and the right response to a nonsense link is a working simulator
 * with sane defaults, not an error boundary.
 *
 * IMPORTANT: this module is imported at the top level of the route, which the
 * server does evaluate. It must never pull in three.js or anything else that
 * needs a browser.
 */
export function normalizeSimSearch(raw: Record<string, unknown>): SimSearch {
  const optics = normalizeOpticsParams(raw)
  const encoded = encodeOpticsParams(optics)
  return {
    lens: String(encoded.lens),
    f: Number(encoded.f),
    N: Number(encoded.N),
    s: Number(encoded.s),
    sensor: String(encoded.sensor),
    coc: String(encoded.coc),
    diff: Number(encoded.diff),
    view: raw.view === 'inCamera' ? 'inCamera' : 'thirdPerson',
    units: raw.units === 'imperial' ? 'imperial' : 'metric',
    layout: typeof raw.layout === 'string' ? raw.layout : '',
  }
}

export function opticsFromSearch(search: SimSearch): OpticsParams {
  return normalizeOpticsParams(search)
}

export function layoutFromSearch(search: SimSearch) {
  return decodeLayout(search.layout)
}
