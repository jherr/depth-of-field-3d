/**
 * Prepares a downloaded Sketchfab model for `public/models/`.
 *
 * Unlike everything in `fetch-assets.mjs`, these two assets ARE committed. Poly
 * Haven has an API and stable URLs, so fetching is free; Sketchfab needs an
 * authenticated session, so a fetch script would just break for anyone else.
 * Both models are licensed for redistribution with credit, so the repo carries
 * them and `.gitignore` has matching exceptions.
 *
 * Committing a binary means committing something nobody can diff, so the
 * transform that produced it lives here rather than in a shell history. Point
 * it at a fresh download and you get the same file back.
 *
 * Usage: node scripts/vendor-asset.mjs <source.glb> <slug> [--measure]
 *
 * `--measure` reports the bounding box and mesh names without writing, which is
 * how the numbers below were arrived at.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune, quantize, textureCompress, weld } from '@gltf-transform/functions'
import sharp from 'sharp'

const ROOT = 'public/models'

/**
 * Per-asset surgery, keyed by slug.
 *
 * Neither model arrives usable. Both are authored in units nothing downstream
 * should have to know about, both are oriented for a turntable rather than a
 * room, and the lamp ships standing on its own ground plane. Fixing that here
 * rather than in `defaultScene.ts` keeps two invariants the scene relies on: a
 * prop in `public/models` is in metres, and it faces +Z, which is where the
 * camera is.
 *
 * - `drop` -- nodes to delete before anything else.
 * - `unitScale` -- source units to metres. Measured, not guessed: the window's
 *   curtain rod sits at 79 units, which is 2.0 m in inches and an absurd 0.79 m
 *   in centimetres, so the window is in inches. The lamp's discarded ground
 *   plane is 334 units across, which is a 3.3 m studio floor in centimetres.
 * - `rotateYDeg` -- bake-time yaw. The window is modelled facing +X.
 */
const RECIPES = {
  window: {
    // `Room` sounds like it would collide with the real room, but it is an
    // empty container holding the frame, rod and curtains. Nothing to drop.
    drop: [],
    unitScale: 0.0254,
    // Curtains hang on the +X side, so +X is the room side. Yawing -90 sends
    // +X to +Z.
    rotateYDeg: -90,
  },
  floor_lamp: {
    // `Plane001` is the ground plane's node and `FLOOR` its child; the studio
    // floor would z-fight with the room's. The ambient-light empty is a
    // Sketchfab export artifact.
    drop: ['Plane001', 'FLOOR', 'EnvironmentAmbientLight'],
    unitScale: 0.01,
    rotateYDeg: 0,
  },
}

const [source, slug] = process.argv.slice(2)
const measureOnly = process.argv.includes('--measure')
if (!source || !slug) {
  console.error('usage: node scripts/vendor-asset.mjs <source.glb> <slug> [--measure]')
  process.exit(1)
}
const recipe = RECIPES[slug]
if (!recipe) {
  console.error(`no recipe for "${slug}" -- known: ${Object.keys(RECIPES).join(', ')}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Bounds
//
// Node scales and rotations matter -- the lamp is Collada Z-up, righted by a
// quaternion on its root, and hangs the whole hierarchy under a 0.888 scale --
// so this walks the graph accumulating transforms. Reading accessor min/max
// directly would report local space and get both the height and the axes wrong.
// ---------------------------------------------------------------------------

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Column-major TRS for a node, matching glTF's matrix convention. */
function trs(node) {
  const [x, y, z, w] = node.getRotation()
  const [sx, sy, sz] = node.getScale()
  const [tx, ty, tz] = node.getTranslation()
  const r = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ]
  return [
    r[0] * sx, r[1] * sx, r[2] * sx, 0,
    r[3] * sy, r[4] * sy, r[5] * sy, 0,
    r[6] * sz, r[7] * sz, r[8] * sz, 0,
    tx, ty, tz, 1,
  ]
}

function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}

const apply = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

function measure(root) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  const visit = (node, parent) => {
    const m = multiply(parent, trs(node))
    const mesh = node.getMesh()
    for (const prim of mesh ? mesh.listPrimitives() : []) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const lo = pos.getMinNormalized([])
      const hi = pos.getMaxNormalized([])
      // Every corner, because a rotation can put any of them at an extreme.
      for (let c = 0; c < 8; c++) {
        const p = apply(m, [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]])
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], p[i])
          max[i] = Math.max(max[i], p[i])
        }
      }
    }
    for (const child of node.listChildren()) visit(child, m)
  }

  for (const scene of root.listScenes()) for (const n of scene.listChildren()) visit(n, IDENTITY)
  return { min, max, size: max.map((v, i) => v - min[i]) }
}

// ---------------------------------------------------------------------------

const io = new NodeIO()
const doc = await io.read(source)
const root = doc.getRoot()

let dropped = 0
for (const node of root.listNodes()) {
  // Re-check the name each pass: disposing a parent can already have taken a
  // listed child with it.
  if (node.isDisposed() || !recipe.drop.includes(node.getName())) continue
  node.dispose()
  dropped++
}
await doc.transform(prune())

const raw = measure(root)
const fmt = (b) =>
  `${b.size.map((v) => v.toFixed(3)).join(' x ')}  (y ${b.min[1].toFixed(3)}..${b.max[1].toFixed(3)})`

if (measureOnly) {
  console.log(`${slug}: dropped ${dropped} node(s)`)
  console.log(`  raw     ${fmt(raw)}`)
  console.log(`  metres  ${raw.size.map((v) => (v * recipe.unitScale).toFixed(3)).join(' x ')}`)
  console.log(`  meshes  ${root.listMeshes().map((m) => m.getName()).join(', ')}`)
  process.exit(0)
}

/**
 * Wrap everything in one node carrying the yaw, the unit scale, and an offset
 * that centres the model horizontally and drops its base to y=0.
 *
 * The scene positions props by their footprint, so an asset whose origin sat at
 * its centre of mass would need an unexplainable y-offset at every use site.
 * Two passes: set rotation and scale, re-measure through them, then translate.
 */
const k = recipe.unitScale
const theta = (recipe.rotateYDeg * Math.PI) / 180
const lift = doc
  .createNode(`${slug}_root`)
  .setRotation([0, Math.sin(theta / 2), 0, Math.cos(theta / 2)])
  .setScale([k, k, k])

for (const scene of root.listScenes()) {
  for (const node of scene.listChildren()) {
    scene.removeChild(node)
    lift.addChild(node)
  }
  scene.addChild(lift)
}

const placed = measure(root)
lift.setTranslation([
  -(placed.min[0] + placed.max[0]) / 2,
  -placed.min[1],
  -(placed.min[2] + placed.max[2]) / 2,
])

// 2k WebP, matching the Poly Haven props. The gather samples a downsampled
// colour buffer, so the lamp's 4k maps cannot resolve into the blur anyway.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90 }),
)

/**
 * Geometry, last, because `quantize` rewrites node transforms and would
 * invalidate the measurement above.
 *
 * The window is 220k triangles of untextured curtain and would otherwise be
 * 5.4 MB of committed binary. Quantizing positions to 14 bits is ~0.1 mm on a
 * 1.75 m frame, well under anything the gather can resolve. Deliberately no
 * `simplify()`: the curtain folds are the only high-frequency detail this model
 * has, and decimating them would defeat the reason for using it.
 */
const metres = measure(root)
await doc.transform(dedup(), weld(), quantize())

const out = join(ROOT, slug, `${slug}.glb`)
await mkdir(join(ROOT, slug), { recursive: true })
await writeFile(out, await io.writeBinary(doc))

console.log(`${slug}: dropped ${dropped} node(s), yaw ${recipe.rotateYDeg}, scale x${k}`)
console.log(`  raw     ${fmt(raw)}`)
console.log(`  metres  ${fmt(metres)}`)
console.log(`  -> ${out}`)
