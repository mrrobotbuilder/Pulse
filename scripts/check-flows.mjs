// Walks the board's flows in a real browser and checks each one landed.
// Usage: node scripts/check-flows.mjs [baseUrl]   (default http://localhost:3005)
//   1. First visit: the intro appears, is filled in, picks the Night theme,
//      and builds a board from the answers (the gold goal becomes the dream).
//   2. The theme picker in the gear: every preset paints the page, and the
//      choice survives a reload.
//   3. The gem's pause button pauses, and says so.
//   4. A keyboard focus ring is 2px solid in --focus.
// Drives Playwright's installed Chromium over raw CDP. Exits 1 on any failure.
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

const base = (process.argv[2] || 'http://localhost:3005').replace(/\/$/, '')
const shotDir = process.env.SHOTS // optional: also save a screenshot of the intro and the Theme room
const chrome = join(homedir(), 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
if (!existsSync(chrome)) throw new Error('Chromium not found at ' + chrome)
const themes = [...readFileSync(new URL('../lib/theme.ts', import.meta.url), 'utf8').matchAll(/\{ id: '([\w-]+)'/g)].map((m) => m[1])
if (themes.length < 5) throw new Error('could not read THEMES from lib/theme.ts')

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++ }

const port = 9335
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pulse-flow-'))}`, 'about:blank'], { stdio: 'ignore' })
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
  const js = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.exceptionDetails) throw new Error('page script failed: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text))
    return res.result.value
  }
  const waitFor = async (expr, what, ms = 20000) => {
    for (let t = 0; t < ms; t += 150) { if (await js(expr)) return true; await new Promise((r) => setTimeout(r, 150)) }
    throw new Error('timed out waiting for ' + what)
  }
  const go = async (url) => {
    events.length = 0
    await send('Page.navigate', { url })
    for (let i = 0; i < 200 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
    if (!events.includes('Page.loadEventFired')) throw new Error('page never loaded: ' + url)
  }
  // React controlled inputs need the native setter plus an input event.
  const type = (sel, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)});
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  const click = (expr) => js(`(() => { const el = ${expr}; if (!el) throw new Error('nothing to click: ' + ${JSON.stringify(expr)}); el.click(); return true })()`)
  const snap = async (name) => {
    if (!shotDir) return
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(shotDir, name), Buffer.from(shot.data, 'base64'))
  }
  const byText = (tag, text) => `[...document.querySelectorAll('${tag}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

  // ── 1. first visit ──
  await go(base + '/manifest.webmanifest')
  await js('localStorage.clear(); true')
  await go(base + '/app')
  await waitFor(`!!document.querySelector('[aria-label="Personalize your dashboard"]')`, 'the intro to appear')
  ok(true, 'intro appears on a first visit')
  const dream = 'Run a sub-two-hour half marathon by May'
  await type('#ob-name', 'Testa')
  await click(byText('button', 'Next'))
  await type('#ob-dream', dream)
  await click(byText('button', 'Next'))
  await click(byText('button.chip', 'Strength'))
  await click(byText('button.chip', 'Health'))
  await waitFor(`document.querySelectorAll('[id^="ob-t-"]').length === 2`, 'two target fields')
  const ids = await js(`[...document.querySelectorAll('[id^="ob-t-"]')].map((e) => '#' + e.id)`)
  for (const s of ids) await type(s, 'Run 5 km three times a week')
  await click(byText('button', 'Next'))
  await click(`document.querySelector('[role=radiogroup][aria-label="Top priority"] button')`)
  await click(byText('button', 'Next'))
  await click(`document.querySelector('[role=radio][data-theme="night"]')`)
  ok(await js(`document.documentElement.dataset.theme === 'night'`), 'picking Night in the intro previews it live')
  await snap('flow-intro-look.png')
  await click(byText('button', 'Next'))
  events.length = 0
  await click(byText('button', 'Build my Pulse'))
  for (let i = 0; i < 300 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
  ok(events.includes('Page.loadEventFired'), 'building reloads the board')
  await waitFor(`!!document.querySelector('[role=tablist][aria-label=Goals]')`, 'the built board')
  const first = await js(`document.querySelector('[role=tablist][aria-label=Goals] button').textContent`)
  ok(first !== 'A jacked, famous YouTuber' && first.length > 0, `the gold goal is the visitor's own: "${first}"`)
  ok(await js(`document.documentElement.dataset.theme === 'night' && localStorage.getItem('vitality:me:theme') === 'night'`), 'the intro saved the Night theme for this user')
  ok(await js(`!document.querySelector('[aria-label="Personalize your dashboard"]')`), 'the intro does not come back')

  // ── 2. theme picker ──
  await click(`document.querySelector('button[aria-label=Settings]')`)
  await waitFor(`!!document.querySelector('[role=radiogroup][aria-label=Theme]')`, 'the Theme room')
  await snap('flow-theme-room.png')
  for (const t of themes) {
    await click(`document.querySelector('[role=radiogroup][aria-label=Theme] [data-theme="${t}"]')`)
    // The body fades between papers (0.3 s), so wait for it to land on this preset's --bg.
    const painted = `(() => { const h = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); const n = parseInt(h.slice(1), 16); return getComputedStyle(document.body).backgroundColor === 'rgb(' + [n >> 16, (n >> 8) & 255, n & 255].join(', ') + ')' })()`
    let landed = true
    try { await waitFor(painted, `the ${t} paper`, 3000) } catch { landed = false }
    const r = await js(`({ html: document.documentElement.dataset.theme, checked: document.querySelector('[role=radiogroup][aria-label=Theme] [aria-checked=true]')?.dataset.theme, bg: getComputedStyle(document.body).backgroundColor })`)
    ok(landed && r.html === t && r.checked === t, `preset ${t}: body painted ${r.bg}, option checked`)
  }
  await go(base + '/app')
  await waitFor(`!!document.querySelector('[role=tablist][aria-label=Goals]')`, 'the board after reload')
  ok(await js(`document.documentElement.dataset.theme === '${themes.at(-1)}'`), `the last pick (${themes.at(-1)}) survives a reload`)
  await go(base + '/')
  ok(await js(`document.documentElement.dataset.theme === '${themes.at(-1)}'`), 'the landing page paints the same theme before React (pre-paint script)')

  // ── 3. gem pause ──
  await go(base + '/app')
  await waitFor(`!!document.querySelector('button[aria-label="Pause the gem"]')`, 'the pause button')
  await click(`document.querySelector('button[aria-label="Pause the gem"]')`)
  ok(await js(`document.querySelector('button[aria-label="Play the gem"]')?.getAttribute('aria-pressed') === 'true' && localStorage.getItem('pulse:gem-paused') === '1'`), 'the gem pauses and remembers it')

  // ── 4. focus ring ──
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  const ring = await js(`(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); return { tag: el.tagName, style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, focus: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim() } })()`)
  ok(ring && ring.style === 'solid' && ring.width === '2px', `keyboard focus ring: ${JSON.stringify(ring)}`)
} finally {
  ws?.close()
  proc.kill()
}
console.log(failures ? `\n${failures} failed` : '\nall flows passed')
process.exitCode = failures ? 1 : 0
