// Walks the board's flows in a real browser and checks each one landed.
// Usage: node scripts/check-flows.mjs [baseUrl]   (default http://localhost:3005)
//   1. The deep intro: three made-up people each get a different board; a reload
//      mid-intro keeps the answers; the text caps; skip and redo; keyboard only.
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

  // ── 1. the deep intro (Stage 4) ──
  const INTRO = `document.querySelector('[aria-label="Personalize your dashboard"]')`
  const fresh = async () => {
    await go(base + '/manifest.webmanifest')
    await js('localStorage.clear(); true')
    await go(base + '/app')
    await waitFor(`!!${INTRO}`, 'the intro to appear')
  }
  const chip = (group, text) => click(`[...document.querySelectorAll('#ob-${group} button, [aria-label="${group}"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`)
  const next = () => click(byText('button', 'Next'))
  const STEPNO = `(${INTRO}?.querySelector('.ann')?.textContent.match(/Step (\\d+) of/) || [])[1] | 0`
  const stepNo = () => js(STEPNO)
  const store = (name) => js(`JSON.parse(localStorage.getItem('vitality:me:${name}') || 'null')`)
  const built = async () => {
    events.length = 0
    await click(byText('button', 'Build my Pulse'))
    for (let i = 0; i < 300 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
    if (!events.includes('Page.loadEventFired')) throw new Error('building did not reload the board')
    await waitFor(`!!document.querySelector('[role=tablist][aria-label=Goals]') && !!document.querySelector('[data-slot]')`, 'the built board')
    return {
      gold: await js(`document.querySelector('[role=tablist][aria-label=Goals] button').textContent`),
      order: await store('eq:order'),
      removed: await store('eq:removed'),
      firstTile: await js(`document.querySelector('[data-slot]').dataset.slot`),
      shown: await js(`[...document.querySelectorAll('[data-slot]')].map((e) => e.dataset.slot)`),
      theme: await js(`localStorage.getItem('vitality:me:theme')`),
      intro: await js(`!!${INTRO}`),
    }
  }
  // One step function per screen, so a persona can stop and reload between them.
  const steps = (p) => [
    async () => { await type('#ob-name', p.name); await next() },
    async () => { await type('#ob-goal', p.goal); await next() },
    async () => { if (p.work) await chip('work', p.work); await next() },
    async () => { if (p.freq) await chip('trainFreq', p.freq); for (const k of p.kinds || []) await chip('trainKinds', k); await next() },
    async () => {
      if (p.sleep) await chip('sleepQuality', String(p.sleep))
      if (p.energy) await chip('energy', String(p.energy))
      for (const d of p.devices || []) await chip('devices', d)
      await next()
    },
    async () => {
      for (const [label, id, text] of p.life || []) { await chip('Parts of life', label); await type('#ob-life-' + id, text) }
      await next()
    },
    async () => { await chip('boardSize', p.size); await next() },
    async () => {
      for (const v of p.vibes || []) await chip('vibes', v)
      await click(p.theme === 'auto' ? byText('#ob-theme button', 'Let it pick') : `document.querySelector('#ob-theme [data-theme="${p.theme}"]')`)
      await next()
    },
  ]
  const personas = [
    {
      who: 'lifter', name: 'Maja', size: 'Tiny', vibes: ['Intense'], theme: 'auto', freq: '5+', kinds: ['Weights'], devices: ['WHOOP'], sleep: 4, energy: 4,
      goal: 'Deadlift 180 kg and squat 140 kg by June. I lifted for years, stopped when my job got busy, and I want my strength back before I turn 35.',
    },
    {
      who: 'office sleeper', name: 'Erik', size: 'Tiny', vibes: ['Calm'], theme: 'auto', work: 'Desk', freq: 'Never', devices: ['Apple Watch'], sleep: 2, energy: 2,
      life: [['Mind and focus', 'mind', 'Less doomscrolling at night.']],
      goal: 'Sleep better and stop feeling tired at my desk every afternoon. I want energy left for my kids in the evening; no gym, I just never go.',
    },
    {
      who: 'creator', name: 'Noor', size: 'Show everything', vibes: ['Playful'], theme: 'night', freq: '1–2', kinds: ['Running'], sleep: 3,
      life: [['Content or audience', 'content', 'Two videos a week, every week.'], ['Money', 'money', 'Pay my rent from the channel by next year.']],
      goal: 'Reach 100k subscribers on YouTube by next summer. I post cooking videos; my views die every time I miss a week of uploads.',
    },
  ]
  const boards = {}
  for (const p of personas) {
    await fresh()
    const run = steps(p)
    for (let i = 0; i < run.length; i++) {
      await run[i]()
      if (p.who === 'office sleeper' && i === 2) {
        // Reload in the middle: the step and every answer so far must survive.
        await go(base + '/app')
        await waitFor(`!!${INTRO}`, 'the intro after a reload')
        ok((await stepNo()) === 4, `a reload mid-intro reopens the same step (step ${await stepNo()})`)
        await click(byText('button', 'Back')); await click(byText('button', 'Back'))
        ok((await js(`document.querySelector('#ob-goal')?.value`)) === p.goal, 'a reload mid-intro keeps the goal text')
        await next(); await next()
      }
    }
    ok((await stepNo()) === 9, `${p.who}: reached the review step`)
    const b = await built()
    boards[p.who] = b
    console.log(`     ${p.who}: gold "${b.gold}", order ${b.order?.join(',')}, hidden [${b.removed?.join(',')}], theme ${b.theme}`)
    const first = p.goal.split(/(?<=[.!?])\s/)[0]
    ok(!b.intro && b.gold.length > 0 && first.startsWith(b.gold.replace(/…$/, '')), `${p.who}: the gold goal is the first sentence of their goal ("${b.gold}")`)
    ok(Array.isArray(b.order) && b.firstTile === b.order.find((id) => b.shown.includes(id)), `${p.who}: the board's first tile follows the saved order (${b.firstTile})`)
  }
  const { lifter, 'office sleeper': office, creator } = boards
  ok(lifter.firstTile === 'train' && lifter.theme === 'blueprint', 'lifter: Train first, intense vibe picked Blueprint')
  ok(['brand', 'finance'].every((id) => lifter.removed.includes(id) && !lifter.shown.includes(id)), 'lifter (focused): Brand and Finance are hidden')
  ok(office.firstTile !== 'train' && office.firstTile === 'vitals' && office.theme === 'sage', `office sleeper: not Train first (${office.firstTile}), calm vibe picked Sage`)
  ok(creator.firstTile === 'brand' && creator.removed.length === 0 && creator.theme === 'night', 'creator: Brand first, nothing hidden, the picked Night theme kept')
  const sig = (b) => JSON.stringify([b.shown, b.theme])
  ok(new Set(Object.values(boards).map(sig)).size === 3, 'the three people got three different boards')

  // The text caps: one box stops at 2,000; over 8,000 in total blocks Next.
  await fresh()
  await type('#ob-name', 'Cap')
  await next()
  await type('#ob-goal', 'g'.repeat(2500))
  ok((await js(`document.querySelector('#ob-goal').value.length`)) === 2000, 'a text box stops at 2,000 characters')
  await type('#ob-other', 'o'.repeat(2000))
  await next()
  await type('#ob-day', 'd'.repeat(2000))
  await next()
  await type('#ob-train-notes', 't'.repeat(2000))
  await type('#ob-injuries', 'i'.repeat(100))
  ok(await js(`${byText('button', 'Next')}.disabled && !!document.querySelector('[role=alert]')?.textContent.includes('Over the 8,000')`), 'over 8,000 characters in total blocks Next and says why')
  await type('#ob-injuries', '')
  ok(await js(`!${byText('button', 'Next')}.disabled`), 'back under the total, Next works again')

  // Skip, then redo from the gear (the redo starts from the saved answers).
  await fresh()
  await click(byText('button', 'Skip'))
  ok(await js(`!${INTRO} && localStorage.getItem('vitality:me:onboarded') === 'skip'`), 'skip closes the intro')
  await go(base + '/app')
  await waitFor(`!!document.querySelector('[data-slot]')`, 'the demo board')
  ok(await js(`!${INTRO}`), 'a skipped intro stays closed after a reload')
  await click(`document.querySelector('button[aria-label=Settings]')`)
  await click(byText('[role=tab]', 'Make it yours'))
  events.length = 0
  await click(byText('button', 'Redo the interview'))
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
  await waitFor(`!!${INTRO}`, 'the intro after redo')
  ok((await stepNo()) === 1, 'redo opens the intro at step 1')

  // Keyboard only: Tab / Shift+Tab to move, typing, Space on chips, Enter on buttons.
  await fresh()
  const key = async (k, shift = false) => {
    const map = { Tab: [9, 'Tab', ''], Enter: [13, 'Enter', '\r'], ' ': [32, 'Space', ' '] }
    const [code, c, text] = map[k]
    const mod = shift ? 8 : 0
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: c, windowsVirtualKeyCode: code, text: text || undefined, modifiers: mod })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: c, windowsVirtualKeyCode: code, modifiers: mod })
  }
  const focusOn = async (test, shift = false) => {
    for (let i = 0; i < 120; i++) {
      if (await js(`(() => { const el = document.activeElement; return !!el && (${test}) })()`)) return
      await key('Tab', shift)
    }
    throw new Error('keyboard never reached: ' + test)
  }
  const isBtn = (t) => `el.tagName === 'BUTTON' && el.textContent.trim().startsWith(${JSON.stringify(t)})`
  const kNext = async () => {
    const n = await stepNo()
    await focusOn(isBtn('Next'))
    await key('Enter')
    await waitFor(`(${STEPNO}) === ${n + 1}`, 'Enter on Next to reach step ' + (n + 1), 3000)
  }
  await focusOn(`el.id === 'ob-name'`)
  await send('Input.insertText', { text: 'Kim' })
  await kNext()
  await focusOn(`el.id === 'ob-goal'`, true)
  await send('Input.insertText', { text: 'Learn Spanish well enough to talk with my in-laws by Christmas.' })
  await kNext() // days
  await kNext() // body
  await focusOn(isBtn('3–4'), true)
  await key(' ')
  ok(await js(`document.activeElement.getAttribute('aria-checked') === 'true'`), 'Space picks a radio chip')
  const chipRing = await js(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth })()`)
  ok(chipRing === 'solid 2px', `a focused chip shows the 2px focus ring (${chipRing})`)
  await kNext() // recovery
  await kNext() // life
  await focusOn(isBtn('Learning'), true)
  await key(' ')
  await focusOn(`el.id === 'ob-life-learning'`)
  await send('Input.insertText', { text: 'Hold a 20-minute conversation in Spanish.' })
  await kNext() // track
  await kNext() // look
  await kNext() // review
  await focusOn(isBtn('Build my Pulse'))
  events.length = 0
  await key('Enter')
  for (let i = 0; i < 300 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100))
  await waitFor(`!!document.querySelector('[role=tablist][aria-label=Goals]')`, 'the keyboard-built board')
  const kGoals = await js(`[...document.querySelectorAll('[role=tablist][aria-label=Goals] button')].map((b) => b.textContent)`)
  ok(kGoals[0].startsWith('Learn Spanish') && kGoals.some((t) => t.startsWith('Hold a 20-minute')), `keyboard-only run builds a board: ${JSON.stringify(kGoals)}`)

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
