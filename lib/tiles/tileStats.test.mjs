// Run: node --test lib/tiles/tileStats.test.mjs
// Each summarizer gets a real saved sample (in its tile's own save shape) plus
// empty, null and a wrong shape. Wrong input must give null, never a throw.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, dayKey, todayDigest } from './tileStats.ts'

const NOW = new Date(2026, 9, 28, 14, 0) // Wed 28 Oct 2026, 14:00 local
const at = (d, h = 18) => new Date(2026, 9, d, h).getTime()
const day = (d) => dayKey(new Date(2026, 9, d))

const SAMPLES = {
  train: {
    exercises: ['Bench', 'Squat'],
    log: {
      Bench: [{ w: 80, r: 5, at: at(26) }, { w: 82.5, r: 3, at: at(26) }, { w: 90, r: 1, at: at(20) }],
      Squat: [{ w: 82.5, r: 5, at: at(26) }],
    },
    session: null,
    sessions: [],
  },
  fuel: { water: { [day(28)]: 5, [day(27)]: 8 } },
  vitals: { [day(27)]: { sleepHours: 6, feel: 45 }, [day(28)]: { sleepHours: 7.5, feel: 82 } },
  walks: {
    walks: [
      { id: 'a', date: day(27), steps: 8000, distanceM: 6100, durationMin: 70, kcal: 300, name: 'Park' },
      { id: 'b', date: day(26), steps: 4310, distanceM: 3200, durationMin: 35, kcal: 150, name: 'Shop' },
      { id: 'c', date: day(25), steps: 9999, distanceM: 7000, durationMin: 80, kcal: 320, name: 'Last Sunday' },
    ],
    syncedAt: '2026-10-28T10:00:00.000Z',
  },
  brand: {
    accounts: [
      { id: 'a1', platform: 'tiktok', handle: '@me', history: [{ t: at(10), count: 10000 }, { t: at(28, 9), count: 12100 }] },
      { id: 'a2', platform: 'youtube', handle: '@me', history: [{ t: at(27), count: 300 }] },
    ],
  },
  finance: {
    accounts: [{ id: 'a', name: 'Bank', balance: 40000 }],
    holdings: [{ id: 'h', symbol: 'AAPL', shares: 40, price: 205 }],
    subs: [{ id: 's', name: 'Netflix', amount: 15 }, { id: 't', name: 'Gym', amount: 27 }],
    history: [{ t: at(1), value: 40000 }, { t: at(28), value: 48200 }],
  },
  peak: { weightKg: 80, whoop: { recovery: 70 }, logs: [], events: [], taps: [] },
}

const EXPECTED = {
  train: { value: '82.5×5', unit: 'best set', sub: 'Squat · Mon' },
  fuel: { value: '5', unit: 'glasses', sub: 'of 8 today' },
  vitals: { value: '7h 30m', unit: 'sleep', sub: 'recovery 87%' },
  walks: { value: '12,310', unit: 'steps', sub: '2 walks · 9.3 km this week' },
  brand: { value: '12K', unit: 'followers', sub: '+2,100 this week' },
  finance: { value: '$48,200', unit: 'net worth', sub: '$42/mo subs' },
  peak: null,
}

test('real samples give the planned headline', () => {
  for (const id of Object.keys(SAMPLES)) assert.deepEqual(summarize(id, SAMPLES[id], NOW), EXPECTED[id], id)
})

test('empty, null and nothing-saved give null', () => {
  for (const id of Object.keys(SAMPLES)) {
    for (const d of [undefined, null, [], {}]) assert.equal(summarize(id, d, NOW), null, `${id} ${JSON.stringify(d)}`)
  }
  assert.equal(summarize('walks', { walks: [] }, NOW), null)
  assert.equal(summarize('brand', { accounts: [{ platform: 'x', handle: 'a', history: [] }] }, NOW), null)
})

test('wrong shapes give null and log, never throw', () => {
  const errors = []
  const orig = console.error
  console.error = (...a) => errors.push(a)
  try {
    const wrong = ['oops', 42, true, [1, 2], { log: 'x', water: 3, walks: 'no', accounts: 7, holdings: {} }]
    for (const id of ['train', 'fuel', 'vitals', 'walks', 'brand', 'finance']) {
      for (const d of wrong) assert.equal(summarize(id, d, NOW), null, `${id} ${JSON.stringify(d)}`)
    }
    assert.equal(summarize('nope', SAMPLES.train, NOW), null)
  } finally {
    console.error = orig
  }
  assert.ok(errors.length >= 30, `expected logged errors, got ${errors.length}`)
})

test('edge cases', () => {
  // nothing logged today still reads as a real 0 against the goal
  assert.deepEqual(summarize('fuel', { water: { [day(27)]: 3 } }, NOW), { value: '0', unit: 'glasses', sub: 'of 8 today' })
  // older vitals day carries its date
  assert.equal(summarize('vitals', { [day(20)]: { sleepHours: 8, feel: 95 } }, NOW).sub, 'recovery 97% · Oct 20')
  // an only-youtube board says subs; no week-old point falls back to the account count
  assert.deepEqual(summarize('brand', { accounts: [SAMPLES.brand.accounts[1]] }, NOW), { value: '300', unit: 'subs', sub: '1 account' })
  // finance with no subs shows the change since day one
  assert.equal(summarize('finance', { ...SAMPLES.finance, subs: [] }, NOW).sub, '▲ $8,200 since day one')
})

test('an AI-written tile (custom-*): newest value, how many, or just "logged"', () => {
  const data = { unit: 'glasses', entries: [{ at: new Date(2026, 9, 27, 9).toISOString(), value: 2 }, { at: new Date(2026, 9, 28, 9).toISOString(), value: 3.25 }] }
  assert.deepEqual(summarize('custom-water', data, NOW), { value: '3.3', unit: 'glasses', sub: '2 logged · last today' })
  assert.deepEqual(summarize('custom-water', { unit: 'x', entries: [{ value: 1 }] }, NOW), { value: '1', unit: 'x', sub: '1 logged' })
  assert.equal(summarize('custom-water', { unit: 'x', entries: [] }, NOW), null)
  assert.equal(summarize('custom-water', { entries: [{ value: 'a lot' }] }, NOW), null)
  assert.deepEqual(summarize('custom-water', { glasses: 4 }, NOW), { value: 'Logged', unit: '', sub: 'open to see it' })
  for (const empty of [[], null, {}]) assert.equal(summarize('custom-water', empty, NOW), null)
  assert.equal(summarize('notcustom', data, NOW), null)
})

test('the today digest: date, goal, one line per slot, "no data yet" for missing or broken', () => {
  const out = todayDigest(
    ['fuel', 'vitals', 'finance'],
    [{ id: 'custom-water', name: 'Water' }, { id: 'custom-mood', name: null }],
    { fuel: { water: { [day(28)]: 3 } }, finance: 'not an object', 'custom-water': { unit: 'glasses', entries: [{ value: 2 }] } },
    'Get lean and famous',
    NOW,
  )
  assert.equal(out, [
    'Today: Wed 28 Oct 2026 (Europe/Stockholm)',
    'Overall goal: Get lean and famous',
    'Fuel: 3 glasses (of 8 today)',
    'Vitals: no data yet',
    'Finance: no data yet',
    'Water: 2 glasses (1 logged)',
    'custom-mood: no data yet',
  ].join('\n'))
  assert.equal(todayDigest([], [], {}, null, NOW), 'Today: Wed 28 Oct 2026 (Europe/Stockholm)')
})
