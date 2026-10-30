// Run: node --test lib/brandMerge.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeBrand, normHandle } from './brandMerge.ts'

const NOW = Date.UTC(2026, 9, 30, 12)
const HOUR = 36e5
const DAY = 864e5
const row = (t, followers, extra = {}) => ({ platform: 'x', handle: 'dario', t: new Date(t).toISOString(), followers, views: null, posts: null, ...extra })
const acct = (history) => ({ id: 'a1', platform: 'x', handle: '@Dario', history })

test('a hand-logged point is never dropped, however old', () => {
  const old = { t: NOW - 800 * DAY, count: 3 }
  const out = mergeBrand({ accounts: [acct([old])] }, [row(NOW, 200)], [], NOW)
  assert.deepEqual(out.accounts[0].history.map((p) => p.count), [3, 200])
})

test('a snapshot at the same t replaces the point instead of doubling it', () => {
  const out = mergeBrand({ accounts: [acct([{ t: NOW, count: 199 }])] }, [row(NOW, 200)], [], NOW)
  assert.equal(out.accounts[0].history.length, 1)
  assert.equal(out.accounts[0].history[0].count, 200)
})

test('merging the same rows twice changes nothing', () => {
  const once = mergeBrand({ accounts: [acct([])] }, [row(NOW, 200), row(NOW - HOUR, 199)], [], NOW)
  assert.deepEqual(mergeBrand(once, [row(NOW, 200), row(NOW - HOUR, 199)], [], NOW).accounts[0].history, once.accounts[0].history)
})

test('auto points stay hourly for 14 days, then the last of each day, then a year at most', () => {
  const rows = []
  for (let h = 0; h < 24 * 400; h += 1) rows.push(row(NOW - h * HOUR, 1000 - h))
  const hist = mergeBrand({ accounts: [acct([])] }, rows, [], NOW).accounts[0].history
  const recent = hist.filter((p) => p.t >= NOW - 14 * DAY)
  assert.equal(recent.length, 14 * 24 + 1)
  const older = hist.filter((p) => p.t < NOW - 14 * DAY)
  const days = older.map((p) => new Date(p.t).toISOString().slice(0, 10))
  assert.equal(new Set(days).size, days.length, 'one point per day')
  assert.ok(older.every((p) => new Date(p.t).getUTCHours() === 23 || p === older[older.length - 1]), 'the last check of the day')
  assert.ok(hist[0].t >= NOW - 365 * DAY)
  assert.ok(hist.length < 14 * 24 + 360)
})

test('thinning leaves hand points in among the auto ones', () => {
  const hand = { t: NOW - 30 * DAY + 5, count: 7 }
  const out = mergeBrand({ accounts: [acct([hand])] }, [row(NOW - 30 * DAY, 8), row(NOW - 30 * DAY + HOUR, 9)], [], NOW)
  assert.ok(out.accounts[0].history.includes(hand))
  assert.equal(out.accounts[0].history.filter((p) => p.auto).length, 1)
})

test('history comes back sorted and carries views and posts only when known', () => {
  const out = mergeBrand({ accounts: [acct([])] }, [row(NOW, 2, { views: 50, posts: 9 }), row(NOW - HOUR, 1, { views: 0 })], [], NOW)
  assert.deepEqual(out.accounts[0].history, [
    { t: NOW - HOUR, count: 1, views: 0, auto: 1 },
    { t: NOW, count: 2, views: 50, posts: 9, auto: 1 },
  ])
})

test('a disconnected account stays gone, and other keys survive', () => {
  const out = mergeBrand({ accounts: [], posts: [{ id: 'p' }], goal: { count: 5 } }, [row(NOW, 200)], [], NOW)
  assert.deepEqual(out, { accounts: [], posts: [{ id: 'p' }], goal: { count: 5 } })
})

test('the latest check is recorded, a failure keeps the history, and the input is not touched', () => {
  const input = { accounts: [acct([{ t: NOW - HOUR, count: 5 }])] }
  const frozen = JSON.stringify(input)
  const out = mergeBrand(input, [], [{ platform: 'x', handle: 'dario', ok: false, error: 'x_401' }], NOW)
  assert.deepEqual(out.accounts[0].check, { t: NOW, ok: false, error: 'x_401' })
  assert.equal(out.accounts[0].history.length, 1)
  assert.equal(JSON.stringify(input), frozen)
})

test('handles match without the @ and without case', () => {
  assert.equal(normHandle(' @@DarioG '), 'dariog')
})
