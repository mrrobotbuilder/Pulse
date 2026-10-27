// Checks every theme preset in the design mockups for readable contrast.
// Usage: node docs/design/check-contrast.mjs
// Text pairs need 4.5:1, the focus ring 3:1 (WCAG 1.4.3 / 1.4.11).
// Tokens are read from the mockup files themselves. A preset missing a token,
// or holding a value that is not an opaque #rrggbb, is NOT MEASURABLE and fails.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const BASE = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5],
  ['gold', 'bg', 4.5], ['gold', 'surface', 4.5],
  ['accent', 'bg', 4.5], ['accent-ink', 'accent', 4.5],
  ['focus', 'bg', 3], ['focus', 'surface', 3],
]

let failed = 0, presets = 0
const files = readdirSync(here).filter((f) => /^[a-z]-.*\.html$/.test(f))
if (!files.length) throw new Error('no mockups found in ' + here)
for (const f of files) {
  const src = readFileSync(join(here, f), 'utf8')
  const blocks = [...src.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)]
  if (!blocks.length) { console.log(`${f}: NOT MEASURABLE (no presets found)`); failed++; continue }
  for (const [, name, body] of blocks) {
    presets++
    const t = Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))
    const pairs = [...BASE]
    for (const k of Object.keys(t)) if (k.startsWith('t-')) pairs.push(['text', k, 4.5])
    if ('mentor-bg' in t || 'mentor-text' in t) pairs.push(['mentor-text', 'mentor-bg', 4.5])
    const bad = [], unknown = []
    let worst = Infinity
    for (const [fg, bg, min] of pairs) {
      if (!/^#[0-9a-f]{6}$/i.test(t[fg] ?? '') || !/^#[0-9a-f]{6}$/i.test(t[bg] ?? '')) { unknown.push(`${fg}/${bg}`); continue }
      const r = ratio(t[fg], t[bg])
      worst = Math.min(worst, r / min)
      if (r < min) bad.push(`${fg} on ${bg} ${r.toFixed(2)} < ${min}`)
    }
    const verdict = unknown.length ? `NOT MEASURABLE (${unknown.join(', ')})` : bad.length ? `FAIL ${bad.join('; ')}` : `ok (${pairs.length} pairs, tightest at ${worst.toFixed(2)}x its minimum)`
    if (unknown.length || bad.length) failed++
    console.log(`${f.padEnd(18)} ${name.padEnd(10)} ${verdict}`)
  }
}
console.log(`\n${presets} presets checked, ${failed} not passing`)
process.exitCode = failed ? 1 : 0
