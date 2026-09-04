import type { MaterialSpec, PropGeometry, PropRole, SceneProp } from './types.ts'

/**
 * The set of props something other than a human can add to the scene.
 *
 * The assistant picks a `CatalogKey`, never a URL or a geometry literal. That
 * is the whole point of the indirection: a model that could name its own glTF
 * path would eventually name one that 404s, and a model that could synthesise a
 * `PropGeometry` would eventually synthesise a 40-metre sofa. Here the only
 * thing it chooses is which of a fixed list to place and where.
 *
 * `height` is informational -- it is what the assistant reads to work out that
 * a vase goes 0.49 m up if it is meant to stand on the table. Nothing enforces
 * it; `clampToRoom` is the only hard constraint.
 */
export interface CatalogEntry {
  readonly key: string
  readonly label: string
  readonly description: string
  readonly geometry: PropGeometry
  readonly material: MaterialSpec
  readonly role: PropRole
  readonly footprintRadiusM: number
  /** Approximate size in metres, for the assistant's benefit. */
  readonly heightM: number
}

const matte = (color: string, roughness = 0.8): MaterialSpec => ({
  color,
  roughness,
  metalness: 0,
})

const gltf = (url: string): PropGeometry => ({ kind: 'gltf', url, keepMaterials: true })

export const CATALOG = {
  sofa: {
    key: 'sofa',
    label: 'Sofa',
    description: 'A large patterned three-seat sofa. Floor-standing.',
    geometry: gltf('/models/sofa_03/sofa_03_2k.gltf'),
    material: matte('#6d6357', 0.9),
    role: 'prop',
    footprintRadiusM: 1.4,
    heightM: 0.85,
  },
  table: {
    key: 'table',
    label: 'Table',
    description: 'A carved wooden side table, 0.49 m high. Things stand on it.',
    geometry: gltf('/models/gallinera_table/gallinera_table_2k.gltf'),
    material: matte('#6b4b32', 0.66),
    role: 'prop',
    footprintRadiusM: 0.5,
    heightM: 0.49,
  },
  coffeeTable: {
    key: 'coffeeTable',
    label: 'Coffee table',
    description: 'A gothic coffee table, 0.56 m high.',
    geometry: gltf('/models/gothic_coffee_table/gothic_coffee_table_2k.gltf'),
    material: matte('#4a3a2c', 0.6),
    role: 'prop',
    footprintRadiusM: 0.75,
    heightM: 0.56,
  },
  vase: {
    key: 'vase',
    label: 'Ceramic vase',
    description: 'A blue-and-white antique vase, 0.4 m tall. Usually put on a table.',
    geometry: gltf('/models/antique_ceramic_vase_01/antique_ceramic_vase_01_2k.gltf'),
    material: matte('#cbbfae', 0.55),
    role: 'prop',
    footprintRadiusM: 0.14,
    heightM: 0.4,
  },
  elephant: {
    key: 'elephant',
    label: 'Carved elephant',
    description:
      'A densely carved wooden elephant, only 0.1 m tall. Small and detailed, so it reads as sharp or soft well before a larger prop does.',
    geometry: gltf('/models/carved_wooden_elephant/carved_wooden_elephant_2k.gltf'),
    material: matte('#5a4432', 0.62),
    role: 'prop',
    footprintRadiusM: 0.08,
    heightM: 0.1,
  },
  painting: {
    key: 'painting',
    label: 'Framed painting',
    description:
      'A gilt-framed landscape, 0.6 m wide. Hangs on a wall -- set y to about 1.55 and put it against one.',
    geometry: gltf('/models/fancy_picture_frame_01/fancy_picture_frame_01_2k.gltf'),
    material: matte('#8a6a3a', 0.5),
    role: 'prop',
    footprintRadiusM: 0.32,
    heightM: 0.46,
  },
  picture: {
    key: 'picture',
    label: 'Hanging picture',
    description: 'A framed photograph, 0.75 m wide. Hangs on a wall like the painting.',
    geometry: gltf('/models/hanging_picture_frame_02/hanging_picture_frame_02_2k.gltf'),
    material: matte('#4a3f34', 0.6),
    role: 'prop',
    footprintRadiusM: 0.38,
    heightM: 0.5,
  },
  ceilingLamp: {
    key: 'ceilingLamp',
    label: 'Ceiling lamp',
    description:
      'A pendant lamp with a glowing globe. A strong bokeh source. Hangs from the 2.9 m ceiling, so set y to about 1.73.',
    geometry: {
      kind: 'gltf',
      url: '/models/modern_ceiling_lamp_01/modern_ceiling_lamp_01_2k.gltf',
      keepMaterials: true,
      emissiveMaterials: ['modern_ceiling_globe', 'modern_ceiling_lamp_01_glass'],
    },
    material: {
      color: '#1a1a1a',
      roughness: 0.3,
      metalness: 0,
      emissive: '#ffd9a0',
      emissiveIntensity: 26,
    },
    role: 'lights',
    footprintRadiusM: 0.24,
    heightM: 0.95,
  },
  floorLamp: {
    key: 'floorLamp',
    label: 'Arc floor lamp',
    description:
      'A 2 m arc lamp reaching 1.78 m sideways, with a lit bulb under the shade. Its origin is mid-arc, so the base sits 0.89 m to one side and the bulb 0.89 m to the other.',
    geometry: {
      kind: 'gltf',
      url: '/models/floor_lamp/floor_lamp.glb',
      keepMaterials: true,
      emissiveMaterials: ['EnvironmentAmbientLight'],
    },
    material: {
      color: '#2b2b2b',
      roughness: 0.5,
      metalness: 0.3,
      emissive: '#ffe6bd',
      emissiveIntensity: 14,
    },
    role: 'lights',
    footprintRadiusM: 0.9,
    heightM: 2.04,
  },
  chromeSphere: {
    key: 'chromeSphere',
    label: 'Chrome sphere',
    description:
      'A mirror-finish ball, 0.22 m across. Its specular highlights break into individual bokeh discs, which makes it the best single test of aperture shape.',
    geometry: { kind: 'procedural', shape: { type: 'sphere', radius: 0.11 } },
    material: { color: '#e9edf0', roughness: 0.04, metalness: 1 },
    role: 'prop',
    footprintRadiusM: 0.12,
    heightM: 0.22,
  },
  crate: {
    key: 'crate',
    label: 'Crate',
    description:
      'A plain 0.5 m wooden box. Untextured, so it is a poor subject for judging defocus -- useful mainly as a stand or an occluder.',
    geometry: { kind: 'procedural', shape: { type: 'box', size: [0.5, 0.5, 0.5] } },
    material: matte('#8a7350', 0.72),
    role: 'prop',
    footprintRadiusM: 0.36,
    heightM: 0.5,
  },
  focusChart: {
    key: 'focusChart',
    label: 'Focus chart',
    description:
      'A Siemens-star resolution target on a stand, 0.8 m to the centre. A measurement instrument: put one at a distance to read sharpness there directly.',
    geometry: {
      kind: 'procedural',
      shape: { type: 'focusChart', widthM: 0.5, heightM: 0.36, tiltDeg: 0, pattern: 'siemensStar' },
    },
    material: matte('#f2f2ef', 0.9),
    role: 'chart',
    footprintRadiusM: 0.3,
    heightM: 0.36,
  },
} as const satisfies Record<string, CatalogEntry>

export type CatalogKey = keyof typeof CATALOG

export const CATALOG_KEYS = Object.keys(CATALOG) as Array<CatalogKey>

/**
 * Build a placeable prop from a catalog entry.
 *
 * The id has to be unique against everything already in the scene, including
 * other copies of the same entry, so the caller passes the ids already taken
 * rather than this guessing from a counter that resets on reload.
 */
export function instantiate(
  key: CatalogKey,
  position: readonly [number, number, number],
  rotationY: number,
  taken: ReadonlySet<string>,
): SceneProp {
  const entry = CATALOG[key]
  let id: string = key
  let copy = 1
  for (let n = 2; taken.has(id); n++) {
    id = `${key}-${n}`
    copy = n
  }

  return {
    id,
    // Numbered to match the id, so "move vase-2" is unambiguous in a sidebar
    // that would otherwise show two rows both labelled "Ceramic vase".
    label: copy === 1 ? entry.label : `${entry.label} ${copy}`,
    role: entry.role,
    geometry: entry.geometry,
    transform: { position: [position[0], position[1], position[2]], rotationY, scale: 1 },
    material: entry.material,
    draggable: true,
    footprintRadiusM: entry.footprintRadiusM,
  }
}
