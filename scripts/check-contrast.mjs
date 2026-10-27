// Checks every theme preset in app/globals.css for readable contrast.
// Usage: node scripts/check-contrast.mjs
// Text pairs need 4.5:1, the focus ring 3:1 (WCAG 1.4.3 / 1.4.11).
// A preset missing a token, or holding a value that is not an opaque #rrggbb,
// is NOT MEASURABLE and fails. So does a file with fewer presets than THEMES
// in lib/theme.ts names.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const themeSrc = readFileSync(new URL('../lib/theme.ts', import.meta.url), 'utf8')
const expected = [...themeSrc.matchAll(/\{ id: '([\w-]+)'/g)].map((m) => m[1])
if (!expected.length) throw new Error('could not read THEMES from lib/theme.ts')

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const PAIRS = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5],
  ['gold', 'bg', 4.5], ['gold', 'surface', 4.5],
  ['accent', 'bg', 4.5], ['accent', 'surface', 4.5], ['accent-ink', 'accent', 4.5],
  ['signal', 'bg', 4.5], ['signal', 'surface', 4.5],
  ['focus', 'bg', 3], ['focus', 'surface', 3],
]

let failed = 0
const seen = new Set()
for (const [, sel, body] of css.matchAll(/((?:[^{}]*\[data-theme='[\w-]+'\]))\s*\{([^}]*)\}/g)) {
  const name = sel.match(/\[data-theme='([\w-]+)'\]/)[1]
  seen.add(name)
  const t = Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))
  const bad = [], unknown = []
  let worst = Infinity
  for (const [fg, bg, min] of PAIRS) {
    if (!/^#[0-9a-f]{6}$/i.test(t[fg] ?? '') || !/^#[0-9a-f]{6}$/i.test(t[bg] ?? '')) { unknown.push(`${fg}/${bg}`); continue }
    const r = ratio(t[fg], t[bg])
    worst = Math.min(worst, r / min)
    if (r < min) bad.push(`${fg} on ${bg} ${r.toFixed(2)} < ${min}`)
  }
  if (unknown.length || bad.length) failed++
  console.log(name.padEnd(10), unknown.length ? `NOT MEASURABLE (${unknown.join(', ')})` : bad.length ? `FAIL ${bad.join('; ')}` : `ok (${PAIRS.length} pairs, tightest at ${worst.toFixed(2)}x its minimum)`)
}
for (const id of expected) if (!seen.has(id)) { console.log(id.padEnd(10), 'NOT MEASURABLE (no block in globals.css)'); failed++ }
console.log(`\n${seen.size} presets checked, ${failed} not passing`)
process.exitCode = failed ? 1 : 0
