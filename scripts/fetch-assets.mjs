/**
 * Fetches the scene's 3D assets into `public/models/`.
 *
 * The binaries are not committed. Two reasons, and only one of them is size:
 * the Poly Haven props are CC0 and could be committed, but the Renderpeople
 * scan is licensed for use, not redistribution, so it must be fetched by
 * whoever runs the app rather than shipped in the repo.
 *
 * Runs on `pnpm install` via the postinstall hook, and by hand as `pnpm
 * assets`. As a postinstall step it is deliberately best-effort: every asset is
 * cached, so a repeat install makes no network calls at all, and a fetch that
 * fails (offline, a host 403, a flaky CI box) warns rather than failing the
 * install. Set `SKIP_ASSET_FETCH=1` to opt out entirely.
 *
 * Usage: node scripts/fetch-assets.mjs [--force]
 */
import { mkdir, writeFile, rm, readFile, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const exec = promisify(execFile)
const ROOT = 'public/models'
const FORCE = process.argv.includes('--force')

/**
 * Poly Haven props, at 2k.
 *
 * 2k rather than 4k on purpose: the gather kernel samples a downsampled colour
 * buffer, so texel detail past roughly screen resolution cannot survive into
 * the blur anyway. 4k would quadruple the download to buy nothing visible.
 */
const POLYHAVEN = [
  'sofa_03',
  'gothic_coffee_table',
  'gallinera_table',
  'antique_ceramic_vase_01',
  'carved_wooden_elephant',
  'modern_ceiling_lamp_01',
  'fancy_picture_frame_01',
  'hanging_picture_frame_02',
]
const RES = '2k'

/**
 * Poly Haven CC0 surface textures for the room shell, at 2k.
 *
 * The floor and walls used to be hand-drawn canvas textures with a colour map
 * and nothing else. But a colour map cannot carry the microrelief that defocus
 * has to destroy -- a flat-shaded surface looks identical at f/1.2 and f/16, so
 * the whole point of the scene is lost on its two largest surfaces. Real PBR
 * scans bring a normal and roughness map, which is where the effect lives.
 *
 * `arm` packs ambient-occlusion in R and roughness in G, exactly the channels
 * three.js reads for aoMap and roughnessMap, so one file feeds both. `nor_gl`
 * is the OpenGL-convention normal map three.js expects. Colour is `diff`.
 */
const POLYHAVEN_TEX = ['wood_floor', 'beige_wall_001']
const TEX_MAPS = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm' }

const PERSON_ZIP = 'https://renderpeople.com/sample/free/rp_posed_00178_29_GLB.zip'

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** curl rather than fetch: both hosts 403 the default Node user agent. */
async function get(url, dest) {
  const args = ['-sfL', '-A', 'Mozilla/5.0', '-e', 'https://renderpeople.com/free-3d-people/', url]
  if (dest) {
    await mkdir(dirname(dest), { recursive: true })
    args.push('-o', dest)
    await exec('curl', args)
    return null
  }
  const { stdout } = await exec('curl', args, { maxBuffer: 1 << 28, encoding: 'buffer' })
  return stdout
}

async function fetchPolyHaven(slug) {
  const dir = join(ROOT, slug)
  if (!FORCE && (await exists(dir))) return `${slug}: cached`

  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${slug}`)).toString())
  const entry = files.gltf[RES].gltf
  const targets = { [entry.url.split('/').pop()]: entry.url }
  for (const [rel, info] of Object.entries(entry.include ?? {})) targets[rel] = info.url
  for (const [rel, url] of Object.entries(targets)) await get(url, join(dir, rel))
  return `${slug}: ${Object.keys(targets).length} files`
}

async function fetchPolyHavenTexture(slug) {
  const dir = join(ROOT, '..', 'textures', slug)
  if (!FORCE && (await exists(dir))) return `${slug}: cached`

  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${slug}`)).toString())
  let n = 0
  for (const [suffix, key] of Object.entries(TEX_MAPS)) {
    const entry = files[key]?.[RES]?.jpg
    if (!entry) continue
    await get(entry.url, join(dir, `${slug}_${suffix}_${RES}.jpg`))
    n++
  }
  return `${slug} (texture): ${n} maps`
}

/**
 * The Renderpeople GLB ships with only its base colour map wired up, but the
 * zip also carries normal and roughness maps as loose JPEGs. Those two are the
 * whole point of using a scan here -- skin and fabric microdetail is what the
 * defocus blur has to destroy for the effect to read -- so they get attached
 * to the material before the file is written into `public/`.
 */
async function fetchPerson() {
  const out = join(ROOT, 'person', 'person.glb')
  if (!FORCE && (await exists(out))) return 'person: cached'

  const tmp = 'node_modules/.cache/renderpeople'
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  await get(PERSON_ZIP, join(tmp, 'person.zip'))
  await exec('unzip', ['-o', '-q', join(tmp, 'person.zip'), '-d', tmp])

  const io = new NodeIO()
  const doc = await io.read(join(tmp, 'rp_posed_00178_29.glb'))
  const material = doc.getRoot().listMaterials()[0]

  const attach = async (file, set) => {
    const texture = doc
      .createTexture(file)
      .setImage(await readFile(join(tmp, 'tex', file)))
      .setMimeType('image/jpeg')
    set(texture)
  }
  await attach('rp_posed_00178_29_normals.jpg', (t) => material.setNormalTexture(t))
  // glTF packs roughness in G and metalness in B. The source map is greyscale,
  // so B carries roughness too -- harmless, because metallicFactor is 0 and
  // metalness is the product of the two.
  await attach('rp_posed_00178_29_roughness.jpg', (t) => material.setMetallicRoughnessTexture(t))
  material.setRoughnessFactor(1).setMetallicFactor(0)

  // The scan ships 4K supersampled maps, which is three JPEG decodes and
  // ~10 MB before the first frame -- and pointless here, because the gather
  // samples a downsampled colour buffer and cannot resolve that detail anyway.
  // 2k WebP matches the props and cuts the download by roughly 10x.
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90 }),
  )

  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, await io.writeBinary(doc))
  await rm(tmp, { recursive: true, force: true })
  return 'person: rebuilt with normal + roughness maps'
}

const POSTINSTALL = process.env.npm_lifecycle_event === 'postinstall'

if (POSTINSTALL && process.env.SKIP_ASSET_FETCH) {
  console.log('fetch-assets: skipped (SKIP_ASSET_FETCH set). Run `pnpm assets` when you need the models.')
  process.exit(0)
}

try {
  const results = await Promise.all([
    ...POLYHAVEN.map(fetchPolyHaven),
    ...POLYHAVEN_TEX.map(fetchPolyHavenTexture),
    fetchPerson(),
  ])
  for (const r of results) console.log(r)
} catch (err) {
  // A postinstall must never break the install. The assets are only needed to
  // run the app, not to build or test it, so warn and let it succeed -- the
  // user can retry with `pnpm assets` once the network or host cooperates.
  if (!POSTINSTALL) throw err
  console.warn(`fetch-assets: could not fetch the 3D assets (${err.message}).`)
  console.warn('Run `pnpm assets` before `pnpm dev` once you are online.')
}
