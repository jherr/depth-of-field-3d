/**
 * Send a prompt to the in-app assistant and report what it did.
 *
 * `shoot.mjs` can click things, which is not enough here: exercising the
 * assistant means typing into a React-controlled textarea, submitting, and
 * then waiting an indeterminate time while the model calls tools and looks at
 * renders. This drives that end to end and prints the tool calls it made, the
 * text it wrote, and the simulator state afterwards -- so a run either
 * demonstrably moved the scene or demonstrably did not.
 *
 * Usage: node scripts/drive-chat.mjs "<prompt>" [out.png] [timeoutMs]
 */
import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const [prompt, out = '/tmp/dof-chat.png', timeoutRaw] = process.argv.slice(2)
if (!prompt) {
  console.error('usage: node scripts/drive-chat.mjs "<prompt>" [out.png] [timeoutMs]')
  process.exit(1)
}
const TIMEOUT_MS = Number(timeoutRaw ?? 180000)
const URL_ = 'http://localhost:3000/'
const PORT = 9334
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/dof-chat-profile',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--window-size=1600,1000',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const page = (await res.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
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
    logs.push({
      level: msg.params.type,
      text: (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '),
    })
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    logs.push({ level: 'exception', text: d.exception?.description ?? d.text ?? 'unknown' })
  }
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    logs.push({ level: 'http', text: `HTTP ${msg.params.response.status} ${msg.params.response.url}` })
  }
}

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed')
  }
  return r.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')
await send('Page.navigate', { url: URL_ })

// Wait for the scene, not just the document: the assistant's first act is
// usually to photograph a canvas that has to exist first.
for (let i = 0; i < 80; i++) {
  const ready = await evaluate(
    `!!document.querySelector('.chat-input') && document.querySelectorAll('canvas').length > 0`,
  )
  if (ready) break
  await sleep(500)
}
await sleep(3000)

/**
 * Type into the composer.
 *
 * Setting `.value` directly does not work on a React-controlled input: React
 * caches the previous value on the DOM node and the change event is discarded
 * as a no-op. Going through the native setter and then dispatching is the
 * standard way around that.
 */
await evaluate(`(() => {
  const el = document.querySelector('.chat-input')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(prompt)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)

await evaluate(`document.querySelector('.chat-composer').requestSubmit()`)

// Done when the Stop button is gone: it is rendered for exactly as long as the
// run is in flight, which covers tool calls too.
const started = Date.now()
let finished = false
while (Date.now() - started < TIMEOUT_MS) {
  await sleep(1000)
  const running = await evaluate(`!!document.querySelector('.chat-send.is-stop')`)
  if (!running && Date.now() - started > 4000) {
    finished = true
    break
  }
}

await sleep(1500)

const report = await evaluate(`JSON.stringify({
  tools: Array.from(document.querySelectorAll('.chat-tool')).map(t => ({
    name: t.querySelector('.chat-tool-name')?.innerText?.trim(),
    done: !!t.querySelector('.chat-tool-dot.is-done'),
    hasImage: !!t.querySelector('.chat-shot'),
  })),
  text: Array.from(document.querySelectorAll('.chat-text')).map(p => p.innerText.trim()),
  images: Array.from(document.querySelectorAll('.chat-shot')).map(img => ({
    w: img.naturalWidth, h: img.naturalHeight, bytes: img.src.length,
  })),
  error: document.querySelector('.chat-error')?.innerText ?? null,
  url: location.href,
  canvases: document.querySelectorAll('canvas').length,
})`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))

const parsed = JSON.parse(report)
console.log(finished ? 'RUN FINISHED' : 'RUN TIMED OUT')
console.log('\nTOOL CALLS')
for (const t of parsed.tools) {
  console.log(`  ${t.done ? '[done]' : '[....]'} ${t.name}${t.hasImage ? '  (image returned)' : ''}`)
}
console.log('\nIMAGES')
for (const i of parsed.images) {
  console.log(`  ${i.w}x${i.h}  ${(i.bytes / 1024).toFixed(0)} KB of base64`)
}
console.log('\nASSISTANT TEXT')
for (const t of parsed.text) console.log('  ' + t.replace(/\n/g, '\n  '))
if (parsed.error) console.log('\nCHAT ERROR\n  ' + parsed.error)
console.log('\nURL  ' + parsed.url)
console.log('CANVASES  ' + parsed.canvases)

const bad = logs.filter((l) => l.level === 'error' || l.level === 'exception' || l.level === 'http')
console.log(`\nCONSOLE  ${logs.length} entries, ${bad.length} errors`)
for (const l of bad.slice(0, 12)) console.log(`  [${l.level}] ${l.text.slice(0, 300)}`)
console.log(`\nscreenshot -> ${out}`)

ws.close()
chrome.kill()
