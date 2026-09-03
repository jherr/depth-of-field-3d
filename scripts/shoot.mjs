/**
 * Screenshot + console capture over the Chrome DevTools Protocol.
 *
 * Exists because `chrome --headless --screenshot --virtual-time-budget` never
 * settles against a Vite dev server: the HMR websocket keeps the page from
 * ever reaching network idle. Driving CDP directly also surfaces console
 * errors and uncaught exceptions, which is what actually tells us whether the
 * WebGL scene came up.
 *
 * Usage: node scripts/shoot.mjs <url> <out.png> [waitMs] [clickSelectorsCsv]
 */
import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const [url, out, waitMsRaw, actionsRaw] = process.argv.slice(2)
const waitMs = Number(waitMsRaw ?? 6000)
const PORT = 9333
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/dof-cdp-profile`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--window-size=1500,950',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // Chrome not listening yet.
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never came up')
}

const target = await findTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let nextId = 1
const pending = new Map()
const logs = []

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
      .join(' ')
    logs.push({ level: msg.params.type, text })
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    logs.push({
      level: 'exception',
      text: d.exception?.description ?? d.text ?? 'unknown exception',
    })
  }
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    logs.push({
      level: 'http',
      text: `HTTP ${msg.params.response.status} ${msg.params.response.url}`,
    })
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push({ level: msg.params.entry.level, text: msg.params.entry.text })
  }
}

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Network.enable')
await send('Page.navigate', { url })
await sleep(waitMs)

// Optional interactions: comma-separated CSS selectors to click, in order.
if (actionsRaw) {
  for (const sel of actionsRaw.split(',')) {
    await send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(sel.trim())})?.click()`,
    })
    await sleep(1200)
  }
  await sleep(800)
}

const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    canvases: document.querySelectorAll('canvas').length,
    hasWebGL: (() => { const c = document.querySelector('canvas'); if (!c) return false;
      try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })(),
    stageText: document.querySelector('.sim-stage')?.innerText?.slice(0, 200) ?? '',
    readout: Array.from(document.querySelectorAll('.sim-readout tr')).map(r => r.innerText.replace(/\\s+/g,' ').trim()),
    hudTop: document.querySelector('.hud-bar.is-top')?.innerText?.replace(/\\s+/g,' ').trim() ?? '',
    hudBottom: document.querySelector('.hud-bar.is-bottom')?.innerText?.replace(/\\s+/g,' ').trim() ?? '',
    url: location.href,
  })`,
  returnByValue: true,
})

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))

console.log('PROBE ' + probe.result.value)
const bad = logs.filter(
  (l) =>
    ['error', 'exception', 'http'].includes(l.level) &&
    !/DevTools|favicon|Autofill|deprecated|third-party cookie/i.test(l.text),
)
console.log(`\nLOGS total=${logs.length} errors=${bad.length}`)
for (const l of bad.slice(0, 20)) console.log(`  [${l.level}] ${l.text.slice(0, 500)}`)
const warns = logs.filter((l) => l.level === 'warning' && /three|webgl|shader|R3F/i.test(l.text))
for (const l of warns.slice(0, 8)) console.log(`  [warn] ${l.text.slice(0, 300)}`)

ws.close()
chrome.kill('SIGKILL')
process.exit(bad.length > 0 ? 1 : 0)
