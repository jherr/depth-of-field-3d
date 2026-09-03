/**
 * End-to-end check of the "2 rendered pixels" sharpness criterion.
 *
 * With that criterion selected, the depth-of-field limits are DEFINED as the
 * distances where the rendered blur reaches 2 pixels across. So the blur the
 * renderer produces at exactly the reported near and far limits must be a
 * 1-pixel radius. If it is, then the frustum slab in the third-person view, the
 * numbers in the HUD and the actual pixels in the photograph are provably the
 * same calculation.
 */
import { spawn } from 'node:child_process'

const PORT = 9335
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const url = process.argv[2]

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/dof-cdp-2px',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-sync', '--disable-background-networking',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--window-size=1500,950', '--force-device-scale-factor=1', 'about:blank',
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
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
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
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = id++
  pending.set(i, { resolve, reject })
  ws.send(JSON.stringify({ id: i, method, params }))
})

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url })
await sleep(9000)

const res = await send('Runtime.evaluate', {
  expression: `(() => {
    const p = window.__dofProbe
    if (!p) return JSON.stringify({ error: 'probe not installed' })
    const o = p.optics()
    return JSON.stringify({
      optics: o,
      stats: p.stats(),
      radiusAtNear: p.cpuRadiusAt(o.nearLimitM),
      radiusAtFar: Number.isFinite(o.farLimitM) ? p.cpuRadiusAt(o.farLimitM) : null,
      radiusAtFocus: p.cpuRadiusAt(o.focusDistanceM),
    })
  })()`,
  returnByValue: true,
})
ws.close()
chrome.kill('SIGKILL')

const d = JSON.parse(res.result.value)
if (d.error) { console.error('FAIL:', d.error); process.exit(1) }

const px = d.optics.criterion?.px
console.log('criterion        ', JSON.stringify(d.optics.criterion))
console.log('render buffer    ', `${d.stats.renderWidthPx}x${d.stats.renderHeightPx} ss=${d.stats.supersample}`)
console.log('full-res height  ', Math.round(d.stats.renderHeightPx / d.stats.supersample), 'px')
console.log('CoC limit        ', d.optics.cocLimitMm.toFixed(6), 'mm')
console.log('near / focus / far', d.optics.nearLimitM.toFixed(4), d.optics.focusDistanceM.toFixed(4), d.optics.farLimitM)
console.log('')
console.log('blur radius at near limit ', d.radiusAtNear.toFixed(5), 'px')
console.log('blur radius at far limit  ', d.radiusAtFar === null ? 'n/a (infinite)' : d.radiusAtFar.toFixed(5) + ' px')
console.log('blur radius at focus      ', d.radiusAtFocus.toFixed(5), 'px')

if (typeof px !== 'number') {
  console.error('\nFAIL: expected the renderPixels criterion to be active')
  process.exit(1)
}
const want = px / 2 // the criterion is a diameter; the gather works in radii
const checks = [['near', d.radiusAtNear]]
if (d.radiusAtFar !== null) checks.push(['far', d.radiusAtFar])
let ok = true
for (const [name, got] of checks) {
  const err = Math.abs(got - want)
  const pass = err < 0.01
  ok = ok && pass
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} limit: ${got.toFixed(5)}px vs expected ${want}px (delta ${err.toFixed(6)})`)
}
process.exit(ok ? 0 : 1)
