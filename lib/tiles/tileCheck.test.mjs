// Run: node --test lib/tiles/tileCheck.test.mjs
// The validator every AI-written tile passes before it is stored: each way a
// tile could reach outside its frame (or break inside it) must be refused, a
// normal tile must pass, and hostile input must not hang it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkTileHtml, customTileId, isCustomTileId, MAX_TILE_BYTES } from './tileCheck.ts'

const GOOD = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Water</title>
<style>body{background:var(--pulse-bg,#EEF1F4);color:var(--pulse-text,#16233B)} .i{background:url(data:image/png;base64,AAAA)}</style>
</head><body>
<h1>Water</h1><button id="add">+1 glass</button><p id="n"></p>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
<script>
let data = { unit: 'glasses', entries: [] }
const draw = () => { document.getElementById('n').textContent = data.entries.length + ' today' }
Pulse.load().then((d) => { if (d && Array.isArray(d.entries)) data = d; draw() })
document.getElementById('add').onclick = async () => { data.entries.push({ at: new Date().toISOString(), value: 1 }); await Pulse.save(data); draw() }
setTimeout(draw, 10)
</script>
</body></html>`

const swap = (a, b) => GOOD.replace(a, b)
const inject = (s) => GOOD.replace('</body>', s + '</body>')
const reason = (html) => {
  const r = checkTileHtml(html)
  return r.ok ? 'ok' : r.reason
}

test('a normal tile passes', () => {
  assert.equal(reason(GOOD), 'ok')
})

test('an external script is refused, however it is written', () => {
  for (const s of [
    '<script src="https://cdn.example.com/chart.js"></script>',
    "<script src='//cdn.example.com/x.js'></script>",
    '<script type="module" src="/local.js"></script>',
    '<SCRIPT SRC=https://evil.example/x.js></SCRIPT>',
  ]) assert.equal(reason(inject(s)), 'external_script', s)
})

test('anything pointing at another origin is refused', () => {
  for (const s of [
    '<img src="https://evil.example/p.gif">',
    '<img src=http://evil.example/p.gif>',
    '<img srcset="https://evil.example/a.png 2x">',
    '<a href="https://example.com">more</a>',
    '<svg><use xlink:href="https://evil.example/s.svg#a"/></svg>',
    '<video poster="//evil.example/p.jpg"></video>',
    '<div style="background:url(https://evil.example/b.png)"></div>',
    "<div style=\"background:url( '//evil.example/b.png')\"></div>",
    '<style>@import "x.css";</style>',
  ]) assert.equal(reason(inject(s)), 'external_resource', s)
})

test('tags that load or navigate are refused', () => {
  for (const s of [
    '<link rel="stylesheet" href="data:text/css,">',
    '<iframe srcdoc="x"></iframe>',
    '<object data="x"></object>',
    '<embed>',
    '<base href="/">',
    '<form><input></form>',
    '<meta http-equiv="refresh" content="0;url=/x">',
  ]) assert.equal(reason(inject(s)), 'blocked_tag', s)
})

test('network calls, navigation, storage and eval in script are refused', () => {
  const cases = {
    network_call: ['fetch("/x")', 'new XMLHttpRequest()', 'new WebSocket("wss://x")', 'navigator.sendBeacon("/x")', 'import("./x.js")', 'new Worker("w.js")'],
    navigation: ['location = "/x"', 'location.href = "/x"', 'window.location.assign("/x")', 'location.replace("/x")', 'window.open("/x")'],
    storage: ['localStorage.setItem("a", 1)', 'sessionStorage.clear()', 'indexedDB.open("x")', 'document.cookie = "a=1"'],
    eval: ['eval("1")', 'new Function("return 1")', 'setTimeout("draw()", 10)'],
  }
  for (const [why, list] of Object.entries(cases)) for (const s of list) assert.equal(reason(inject(`<script>${s}</script>`)), why, s)
})

test('reading location is fine; only leaving is refused', () => {
  assert.equal(reason(inject('<script>const here = location.hash; if (location.href === "x") {}</script>')), 'ok')
})

test('a tile that never saves or never loads is refused', () => {
  assert.equal(reason(GOOD.replace('await Pulse.save(data)', 'void 0')), 'no_bridge')
  assert.equal(reason(GOOD.replace('Pulse.load()', 'Promise.resolve()')), 'no_bridge')
})

test('a script that does not parse is refused', () => {
  assert.equal(reason(inject('<script>const = ;</script>')), 'script_syntax')
  assert.equal(reason(inject('<script>import x from "y"</script>')), 'script_syntax')
  assert.equal(reason(GOOD.replace('</script>', '')), 'unclosed_script')
})

test('it must be a whole document, and not too big', () => {
  assert.equal(reason('<div>hi</div>'), 'not_a_document')
  assert.equal(reason(GOOD.replace('<!doctype html>', '')), 'not_a_document')
  assert.equal(reason(GOOD + '<script>fetch("/x")</script>'), 'not_a_document')
  assert.equal(reason(inject('<!--' + 'x'.repeat(MAX_TILE_BYTES) + '-->')), 'too_big')
  assert.equal(reason(inject('<!--' + 'é'.repeat(MAX_TILE_BYTES / 2) + '-->')), 'too_big', 'counted in bytes, not characters')
  assert.equal(reason(null), 'not_text')
})

test('hostile input stays fast (every pattern is linear)', () => {
  const n = MAX_TILE_BYTES - 200
  for (const filler of ['<meta ', '<script ', 'src=', 'url(', ' ', 'location', '<script>', 'src= ', 'url( "']) {
    const html = '<!doctype html><html><body>' + filler.repeat(Math.floor(n / filler.length)) + '</body></html>'
    const t0 = performance.now()
    checkTileHtml(html)
    const ms = performance.now() - t0
    // A quadratic pattern ([^>]* in place of [^<>]*) takes ~250 ms here even with
    // the 60 KB cap; the linear ones take ~1 ms.
    assert.ok(ms < 100, `"${filler}" x many took ${Math.round(ms)} ms`)
  }
})

test('custom ids', () => {
  assert.equal(customTileId('Water intake!', []), 'custom-water-intake')
  assert.equal(customTileId('Water intake', ['custom-water-intake']), 'custom-water-intake-2')
  assert.equal(customTileId('###', []), 'custom-tile')
  assert.ok(isCustomTileId(customTileId('A'.repeat(200), [])))
  for (const bad of ['custom-', 'custom-A', 'custom-a b', 'train', 'custom--x', 'custom-x-', '_config', 'custom-' + 'a'.repeat(41)]) assert.equal(isCustomTileId(bad), false, bad)
})
