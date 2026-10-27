// Screenshots every design mockup in docs/design at 375px and 1440px.
// Usage: node docs/design/shoot.mjs [a-drafting ...]
// Drives Playwright's installed Chromium over raw CDP (no npm dependency).
// Also reports, per shot: fonts that did NOT load, and horizontal overflow.
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'shots')
mkdirSync(out, { recursive: true })
// ponytail: pinned build, change when Playwright's Chromium is updated
const chrome = join(homedir(), 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
if (!existsSync(chrome)) throw new Error('Chromium not found at ' + chrome)

const only = process.argv.slice(2)
const files = readdirSync(here).filter((f) => /^[a-z]-.*\.html$/.test(f)).filter((f) => !only.length || only.some((o) => f.startsWith(o)))
if (!files.length) throw new Error('no mockups matched ' + only.join(' '))
const jobs = files.flatMap((f) => [
  ...['landing', 'intro', 'board'].flatMap((view) => [375, 1440].map((w) => ({ f, view, w }))),
  { f, view: 'presets', w: 1440 },
])

const port = 9333
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pulse-shoot-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
let ws
try {
  let page
  for (let i = 0; i < 50 && !page; i++) {
    try { page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json() } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  if (!page) throw new Error('Chromium did not open its debug port')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const waiting = new Map(), events = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && waiting.has(d.id)) { const { r, j } = waiting.get(d.id); waiting.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result) }
    else if (d.method) events.push(d.method)
  }
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; waiting.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })) })
  const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
  await send('Page.enable')

  for (const { f, view, w } of jobs) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 })
    events.length = 0
    const url = `${pathToFileURL(join(here, f)).href}?view=${view}&shot=1`
    await send('Page.navigate', { url })
    for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
    if (!events.includes('Page.loadEventFired')) throw new Error('page never loaded: ' + url)
    const report = await evalJs(`document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1400))).then(() => {
      const used = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent && !e.closest('.mockbar') && e.textContent.trim()).map((e) => { const s = getComputedStyle(e); return s.fontWeight + ' 16px "' + s.fontFamily.split(',')[0].replace(/["']/g, '').trim() + '"' })
      const want = [...new Set(used)].filter((n) => !/system-ui|monospace|sans-serif/.test(n))
      if (!want.length) return { missing: ['NOTHING MEASURED'], overflow: 0 }
      return { missing: want.filter((n) => !document.fonts.check(n)), overflow: document.documentElement.scrollWidth - innerWidth }
    })`)
    const { cssContentSize: s } = await send('Page.getLayoutMetrics')
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.ceil(s.height), scale: 1 } })
    const name = `${f.replace('.html', '')}-${view}-${w}.png`
    writeFileSync(join(out, name), Buffer.from(shot.data, 'base64'))
    const flags = [report.missing.length ? 'FONTS NOT LOADED: ' + report.missing.join(', ') : '', report.overflow > 0 ? `OVERFLOW ${report.overflow}px` : ''].filter(Boolean)
    console.log(`${name}  ${w}x${Math.ceil(s.height)}  ${flags.join('  ') || 'ok'}`)
  }
} finally {
  ws?.close()
  proc.kill()
}
