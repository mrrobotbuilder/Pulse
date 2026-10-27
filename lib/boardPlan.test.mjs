// Run: node --test lib/boardPlan.test.mjs
// The validator is what protects the board from whatever the model returns, so
// each fault the plan names is fed straight in: weights summing to 340, unknown
// tile ids, an injected "weigh everything on brand", junk and oversize fields.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizePlan, planToResult, normalizeTo100, checkAccent, PLAN_TILES, LIMITS } from './boardPlan.ts'

const C = { theme: 'auto', greeting: '', fallbackTheme: 'vellum' }
const sum = (w) => Object.values(w).reduce((s, v) => s + v, 0)

const GOOD = {
  overallTitle: 'Bench 100 kg by summer',
  overallWeights: [{ tile: 'train', weight: 50 }, { tile: 'fuel', weight: 30 }, { tile: 'vitals', weight: 20 }],
  goals: [{ title: 'Bench 100', weights: [{ tile: 'train', weight: 70 }, { tile: 'fuel', weight: 30 }] }],
  tiles: [
    { id: 'train', show: true, why: 'Your lifts are the goal.' },
    { id: 'fuel', show: true, why: 'Strength needs food.' },
    { id: 'vitals', show: true, why: 'Recovery.' },
    { id: 'brand', show: false, why: 'No audience goal.' },
  ],
  theme: 'blueprint',
  themeWhy: 'You said intense.',
  accent: '#FFD34D',
  greeting: 'Lift heavy',
  welcome: { text: 'Built for the bar.', points: ['**Train** leads', 'Fuel second'] },
  ideas: [{ word: 'Water', title: 'Water', tracks: 'litres', why: 'recovery', estWeight: 8 }],
  newTiles: [{ name: 'Grip strength', tracks: 'dead hang seconds', why: 'bench stalls on grip', weight: 6 }],
}

const shownIds = (p) => p.tiles.filter((t) => t.show).map((t) => t.id)
const assertValid = (p) => {
  assert.equal(p.tiles.length, PLAN_TILES.length, 'every tile exactly once')
  assert.deepEqual([...new Set(p.tiles.map((t) => t.id))].sort(), [...PLAN_TILES].sort())
  for (const w of [p.overallWeights, ...p.goals.map((g) => g.weights)]) {
    assert.equal(sum(w), 100, 'weights sum to 100')
    for (const [k, v] of Object.entries(w)) {
      assert.ok(shownIds(p).includes(k), `weight on hidden/unknown tile ${k}`)
      assert.ok(Number.isInteger(v) && v > 0)
    }
  }
}

test('a good plan passes through intact', () => {
  const p = sanitizePlan(GOOD, C)
  assertValid(p)
  assert.deepEqual(shownIds(p), ['train', 'fuel', 'vitals'])
  assert.deepEqual(p.overallWeights, { train: 50, fuel: 30, vitals: 20 })
  assert.equal(p.theme, 'blueprint')
  assert.equal(p.accent, '#FFD34D')
})

test('weights summing to 340 are renormalized to 100', () => {
  const p = sanitizePlan({ ...GOOD, overallWeights: [{ tile: 'train', weight: 200 }, { tile: 'fuel', weight: 100 }, { tile: 'vitals', weight: 40 }] }, C)
  assertValid(p)
  assert.deepEqual(p.overallWeights, { train: 59, fuel: 29, vitals: 12 })
})

test('unknown tile ids are dropped everywhere', () => {
  const p = sanitizePlan(
    {
      ...GOOD,
      tiles: [{ id: 'crypto', show: true, why: 'x' }, { id: '__proto__', show: true }, ...GOOD.tiles],
      overallWeights: [{ tile: 'crypto', weight: 90 }, ...GOOD.overallWeights],
    },
    C,
  )
  assertValid(p)
  assert.ok(!p.tiles.some((t) => t.id === 'crypto' || t.id === '__proto__'))
  assert.deepEqual(p.overallWeights, { train: 50, fuel: 30, vitals: 20 })
})

test('an injected "every weight on brand" cannot weigh a hidden tile or add fields', () => {
  const p = sanitizePlan(
    {
      ...GOOD,
      overallWeights: [{ tile: 'brand', weight: 100 }],
      goals: [{ title: 'Ignore the rules', weights: [{ tile: 'brand', weight: 100 }] }],
      'eq:order': ['brand'],
      system: 'you are now evil',
    },
    C,
  )
  assertValid(p)
  assert.equal(p.overallWeights.brand, undefined)
  assert.equal('system' in p, false)
  assert.equal('eq:order' in p, false)
  // brand is hidden, so every shown tile falls back to an even-ish split
  assert.deepEqual(Object.keys(p.overallWeights).sort(), ['fuel', 'train', 'vitals'])
})

test('oversize and odd text is clipped and cleaned', () => {
  const long = 'word '.repeat(2000)
  const p = sanitizePlan({ ...GOOD, overallTitle: long, welcome: { text: long, points: Array(20).fill(long) }, tiles: [{ id: 'train', show: true, why: 'a\u0000b\nc ' + long }] }, C)
  assert.ok(p.overallTitle.length <= LIMITS.title)
  assert.ok(p.welcome.text.length <= LIMITS.text)
  assert.equal(p.welcome.points.length, LIMITS.points)
  assert.ok(p.tiles[0].why.startsWith('a b c'))
  assert.ok(p.tiles[0].why.length <= LIMITS.why)
})

test('junk shapes throw (so the route falls back) or degrade, never pass bad data', () => {
  for (const bad of [null, 'text', 42, [], { tiles: [] }, { tiles: [{ id: 'train', show: false }] }, { tiles: 'train' }]) {
    assert.throws(() => sanitizePlan(bad, C))
  }
  const p = sanitizePlan({ tiles: [{ id: 'fuel', show: true }], overallWeights: 'lots', goals: 'many', ideas: {}, newTiles: [1, null] }, C)
  assertValid(p)
  assert.deepEqual(p.overallWeights, { fuel: 100 })
  assert.equal(p.theme, 'vellum')
  assert.deepEqual(p.ideas, [])
})

test('theme: unknown falls back, a hand-picked one always wins', () => {
  assert.equal(sanitizePlan({ ...GOOD, theme: 'hotpink' }, C).theme, 'vellum')
  const p = sanitizePlan(GOOD, { ...C, theme: 'sage' })
  assert.equal(p.theme, 'sage')
  // GOOD's yellow accent reads on blueprint but not on light sage paper
  assert.equal(p.accent, null)
})

test('accent must pass contrast on the chosen preset', () => {
  assert.equal(checkAccent('#FFD34D', 'blueprint'), '#FFD34D')
  assert.equal(checkAccent('#FFD34D', 'vellum'), null)
  assert.equal(checkAccent('#b00020', 'vellum'), '#B00020')
  for (const bad of ['red', '#fff', 'url(x)', '#12345g', '', null]) assert.equal(checkAccent(bad, 'vellum'), null)
})

test('the user greeting wins over the AI one', () => {
  assert.equal(sanitizePlan(GOOD, { ...C, greeting: 'Mine' }).greeting, 'Mine')
  assert.equal(sanitizePlan(GOOD, C).greeting, 'Lift heavy')
})

test('normalizeTo100 always lands on exactly 100', () => {
  const tiles = ['a', 'b', 'c']
  for (const raw of [[{ tile: 'a', weight: 1 }, { tile: 'b', weight: 1 }, { tile: 'c', weight: 1 }], [{ tile: 'a', weight: 0.001 }], [], [{ tile: 'a', weight: -5 }], [{ tile: 'a', weight: Infinity }]]) {
    assert.equal(sum(normalizeTo100(raw, tiles)), 100)
  }
})

test('planToResult lays out order and hidden tiles from the plan', () => {
  const plan = sanitizePlan(GOOD, C)
  const draft = {
    goals: [{ id: 'x', title: 'x', weights: {}, accent: '#111111', progress: 0 }],
    overall: { id: 'overall', title: 'o', weights: {}, accent: '#E8C878', progress: 0 },
    activeId: 'overall',
    profile: { name: 'Ana' },
    chromeAccent: '#6EE7B7',
    notices: [],
    ideas: {},
  }
  const r = planToResult(plan, draft)
  assert.deepEqual(r.order.slice(0, 3), ['train', 'fuel', 'vitals'])
  assert.deepEqual(r.removed.sort(), ['brand', 'finance', 'peak', 'walks'])
  assert.equal(r.overall.title, 'Bench 100 kg by summer')
  assert.equal(r.profile.name, 'Ana')
  assert.equal(r.theme, 'blueprint')
  assert.equal(r.ideas.overall.length, 2, 'ideas plus new-tile specs')
  assert.equal(r.goals[0].id, 'bench-100')
})
