// Screenshots the real app on every route, at 375px and 1440px, in every theme
// preset, and checks what a screenshot alone would miss.
// Usage: node scripts/shoot-app.mjs [baseUrl] [outDir]
//   baseUrl defaults to http://localhost:3005, outDir to ./shots-app
// Per shot it reports fonts that did NOT load, sideways overflow and console
// errors. On /app it also opens a tile and checks the tile's sandboxed page
// received that preset's accent (the --pulse-* variables from withBridge).
// Drives Playwright's installed Chromium over raw CDP (no npm dependency).
// Exits 1 if anything failed; a check that could not run counts as a failure.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

const base = (process.argv[2] || 'http://localhost:3005').replace(/\/$/, '')
const out = process.argv[3] || 'shots-app'
mkdirSync(out, { recursive: true })
// ponytail: pinned build, change when Playwright's Chromium is updated
const chrome = join(homedir(), 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
if (!existsSync(chrome)) throw new Error('Chromium not found at ' + chrome)

// The presets and their accents, read from the code under test.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const accents = Object.fromEntries([...css.matchAll(/\[data-theme='([\w-]+)'\]\s*\{([^}]*)\}/g)].map(([, n, b]) => [n, b.match(/--accent:\s*(#[0-9a-fA-F]{6})/)?.[1]]))
const themes = Object.keys(accents)
if (themes.length < 5 || Object.values(accents).some((a) => !a)) throw new Error('could not read the presets from globals.css')

const routes = (process.env.ROUTES || '/,/app,/mentor').split(',')
const widths = [375, 1440]
let failures = 0
const fail = (msg) => { failures++; console.log('  FAIL ' + msg) }

const port = 9334
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pulse-app-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
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
  const waiting = new Map(), events = [], errors = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && waiting.has(d.id)) { const { r, j } = waiting.get(d.id); waiting.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result) }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text)
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '))
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''))
    else if (d.method) events.push(d.method)
  }
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; waiting.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })) })
  const evalJs = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.exceptionDetails) throw new Error('page script failed: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text))
    return res.result.value
  }
  // Poll the page for a condition; bounded, and it says what never happened.
  const waitFor = async (expr, what, ms = 15000) => {
    for (let t = 0; t < ms; t += 150) { if (await evalJs(expr)) return; await new Promise((r) => setTimeout(r, 150)) }
    throw new Error('timed out waiting for ' + what)
  }
  const go = async (url) => {
    events.length = 0
    await send('Page.navigate', { url })
    for (let i = 0; i < 200 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
    if (!events.includes('Page.loadEventFired')) throw new Error('page never loaded: ' + url)
  }
  const shoot = async (name, w, full = true) => {
    const { cssContentSize: s } = await send('Page.getLayoutMetrics')
    const h = full ? Math.min(Math.ceil(s.height), 6000) : 900
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } })
    writeFileSync(join(out, name), Buffer.from(shot.data, 'base64'))
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')

  for (const theme of themes) {
    for (const w of widths) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 })
      for (const route of routes) {
        // Same origin first, so the theme and "intro skipped" are stored before the real load.
        await go(base + '/manifest.webmanifest')
        await evalJs(`localStorage.setItem('pulse:theme', '${theme}'); localStorage.setItem('vitality:me:theme', '${theme}'); localStorage.setItem('vitality:me:onboarded', 'skip'); true`)
        errors.length = 0
        await go(base + route)
        const name = `${route === '/' ? 'landing' : route.slice(1)}-${theme}-${w}.png`
        try {
          await evalJs('document.fonts.ready.then(() => true)')
          if (route === '/app') await waitFor(`!!document.querySelector('[role=tablist]')`, 'the board to render')
          if (route === '/mentor') await waitFor(`!!document.querySelector('[aria-label="The answer"]')`, 'the mentor page to render')
          await waitFor(`document.documentElement.dataset.theme === '${theme}'`, `data-theme=${theme}`)
          await new Promise((r) => setTimeout(r, 1300)) // let the one-shot strip draw-in finish before the capture
          const r = await evalJs(`(() => {
            const used = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent && e.textContent.trim()).map((e) => { const s = getComputedStyle(e); return s.fontWeight + ' 16px ' + s.fontFamily.split(',')[0].trim() })
            const want = [...new Set(used)].filter((n) => !/system-ui|monospace|sans-serif/.test(n))
            return { n: want.length, missing: want.filter((n) => !document.fonts.check(n)), overflow: document.documentElement.scrollWidth - innerWidth }
          })()`)
          await shoot(name, w)
          const flags = []
          if (!r.n) flags.push('NO TEXT MEASURED')
          if (r.missing.length) flags.push('FONTS NOT LOADED: ' + r.missing.join(', '))
          if (r.overflow > 0) flags.push(`OVERFLOW ${r.overflow}px`)
          if (errors.length) flags.push('CONSOLE: ' + errors.slice(0, 3).join(' | '))
          console.log(`${name}  ${flags.join('  ') || 'ok'}`)
          if (flags.length) failures++

          // The tile recolours: open Train, read the srcdoc the board built.
          if (route === '/app') {
            await evalJs(`document.querySelector('[aria-label="Open Train"]').click(); true`)
            await waitFor(`!!document.querySelector('iframe[title="Train"]')`, 'the Train tile to open')
            const doc = await evalJs(`document.querySelector('iframe[title="Train"]').srcdoc`)
            const want = `--pulse-accent:${accents[theme]}`.toLowerCase()
            if (!doc.toLowerCase().replace(/\s/g, '').includes(want)) fail(`${theme}: tile did not get ${want}`)
            else console.log(`  tile ok: Train got ${want}`)
            await evalJs(`document.querySelector('[role=dialog][aria-label="Train"] button').click(); true`)
            // Every tile, on one light and one dark paper.
            if (theme === 'vellum' || theme === 'night') {
              const names = await evalJs(`[...document.querySelectorAll('button[aria-label^="Open "]')].map((b) => b.getAttribute('aria-label').slice(5)).filter((n) => n !== 'the mentor')`)
              if (names.length < 5) fail(`${theme}: only ${names.length} tiles to open`)
              for (const n of names) {
                await evalJs(`document.querySelector('[aria-label="Open ${n}"]').click(); true`)
                await waitFor(`!!document.querySelector('iframe[title="${n}"]')`, `the ${n} tile to open`)
                await new Promise((r) => setTimeout(r, 1500)) // the tile renders its own content after load
                await shoot(`tile-${n.toLowerCase()}-${theme}-${w}.png`, w, false)
                await evalJs(`document.querySelector('[role=dialog][aria-label="${n}"] button').click(); true`)
              }
            }
          }
        } catch (e) {
          fail(`${name}: ${e.message}`)
        }
      }
    }
  }
} finally {
  ws?.close()
  proc.kill()
}
console.log(failures ? `\n${failures} problem(s)` : '\nall checks passed')
process.exitCode = failures ? 1 : 0
