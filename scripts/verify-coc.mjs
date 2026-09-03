/**
 * Runtime verification that the shader and the optics module agree.
 *
 * Samples a grid of pixels across the in-camera view. For each one the GPU
 * reports the blur radius it computed AND the world depth it derived it from;
 * the CPU then independently computes what the radius should be at that depth
 * using the same pure functions that produce the HUD's numbers.
 *
 * This is the check that makes the project's central claim testable: if these
 * two ever disagree, the photograph is lying about the readout.
 */
import { spawn } from 'node:child_process'

const PORT = 9334
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const url = process.argv[2]

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/dof-cdp-verify',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1500,950',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  } catch {}
  if (!target) await sleep(250)
}
if (!target) {
  console.error('Chrome never came up')
  process.exit(2)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = id++
    pending.set(i, { resolve, reject })
    ws.send(JSON.stringify({ id: i, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url })
await sleep(9000)

const result = await send('Runtime.evaluate', {
  expression: `(() => {
    const p = window.__dofProbe;
    if (!p) return JSON.stringify({ error: 'probe not installed' });
    const rows = [];
    for (let gy = 1; gy <= 7; gy++) {
      for (let gx = 1; gx <= 7; gx++) {
        const r = p.probe(gx / 8, gy / 8);
        if (!r) continue;
        if (r.error) { rows.push(r); continue; }
        if (r.cpuCocRadiusPx > 0.05) { r.absErrorPx = Math.abs(r.gpuCocRadiusPx - r.cpuCocRadiusPx); rows.push(r); }
      }
    }
    return JSON.stringify({ stats: p.stats(), rows });
  })()`,
  returnByValue: true,
})

ws.close()
chrome.kill('SIGKILL')

const data = JSON.parse(result.result.value)
if (data.error) {
  console.error('FAIL:', data.error)
  process.exit(1)
}

const { stats, rows } = data
console.log(
  `render ${stats.renderWidthPx}x${stats.renderHeightPx} ss=${stats.supersample} ` +
    `kernel=${stats.kernelSamples} clamped=${stats.cocClamped}`,
)
console.log(`\nsamples with measurable blur: ${rows.length}`)
console.log('  depth(m)   GPU r(px)   CPU r(px)   rel.err     abs.err(px)')
const errors = []
for (const r of rows.filter((x) => !x.error).slice(0, 14)) {
  console.log(
    `  ${r.linearDepthM.toFixed(3).padStart(8)}  ${r.gpuCocRadiusPx.toFixed(3).padStart(9)}  ` +
      `${r.cpuCocRadiusPx.toFixed(3).padStart(9)}  ${(r.relativeError * 100).toFixed(3).padStart(7)}%  ` +
      `${r.absErrorPx.toFixed(5).padStart(9)}`,
  )
}
const probeErrors = rows.filter((r) => r.error)
if (probeErrors.length) {
  console.error('probe errors:', [...new Set(probeErrors.map((r) => r.error))].join(' | '))
}
for (const r of rows) if (!r.error && !r.clamped) errors.push(r.relativeError)

if (errors.length === 0) {
  console.log('\nNo unclamped samples to judge.')
  process.exit(1)
}
const good = rows.filter((r) => !r.error && !r.clamped)
const worst = Math.max(...errors)
const mean = errors.reduce((a, b) => a + b, 0) / errors.length
const worstAbs = Math.max(...good.map((r) => r.absErrorPx))
console.log(`\nrelative error: worst ${(worst * 100).toFixed(4)}%  mean ${(mean * 100).toFixed(4)}%`)
console.log(`absolute error: worst ${worstAbs.toFixed(5)} px`)

/*
 * Combined absolute + relative tolerance, the numpy-allclose convention:
 *
 *     |gpu - cpu| <= atol + rtol * |cpu|
 *
 * A pure relative test is the wrong measure here. Right at the plane of focus
 * the true radius approaches zero, so any fixed absolute error becomes an
 * arbitrarily large percentage of it -- at 85mm f/1.2 there are pixels with a
 * true radius of 0.05px, where eight thousandths of a pixel reads as 16%.
 *
 * The residual itself comes from the verification channel, not the render
 * path: the probe reads back a half-float target, so the depth it reports is
 * quantised, and the CPU then computes its expected radius from that quantised
 * value while the GPU used the full-precision one. The rendered blur is
 * unaffected.
 *
 * atol is set well below what any gather kernel can resolve.
 */
const ATOL_PX = 0.02
const RTOL = 0.01
const violations = good.filter(
  (r) => r.absErrorPx > ATOL_PX + RTOL * r.cpuCocRadiusPx,
)
console.log(`tolerance: |dGPU - dCPU| <= ${ATOL_PX} px + ${RTOL * 100}% of radius`)
for (const v of violations.slice(0, 5)) {
  console.log(
    `  VIOLATION depth ${v.linearDepthM.toFixed(3)}m  gpu ${v.gpuCocRadiusPx.toFixed(4)}  ` +
      `cpu ${v.cpuCocRadiusPx.toFixed(4)}  abs ${v.absErrorPx.toFixed(5)}`,
  )
}
const pass = violations.length === 0
console.log(
  pass
    ? `PASS  all ${good.length} samples within tolerance`
    : `FAIL  ${violations.length} of ${good.length} samples outside tolerance`,
)
process.exit(pass ? 0 : 1)
