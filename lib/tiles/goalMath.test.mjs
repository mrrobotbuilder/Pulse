// Run: node --test lib/tiles/goalMath.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWeights, evenWeights, goalId } from './goalMath.ts'

const sum = (w) => Object.values(w).reduce((s, v) => s + v, 0)

test('normalizeWeights sums to exactly 100 in whole numbers', () => {
  for (const w of [{ a: 1, b: 1, c: 1 }, { a: 62, b: 8, c: 20, d: 10 }, { a: 3, b: 7 }, { a: 50, b: 50, c: 50 }, { a: 0.4, b: 0.3, c: 0.3 }]) {
    const n = normalizeWeights(w)
    assert.equal(sum(n), 100, JSON.stringify(w))
    assert.ok(Object.values(n).every(Number.isInteger))
  }
})

test('normalizeWeights keeps an already-100 goal as it is', () => {
  assert.deepEqual(normalizeWeights({ brand: 62, train: 8, vitals: 20, finance: 10 }), { brand: 62, train: 8, vitals: 20, finance: 10 })
})

test('normalizeWeights drops zeros and junk, and gives {} for nothing', () => {
  assert.deepEqual(normalizeWeights({ a: 0, b: 10 }), { b: 100 })
  assert.deepEqual(normalizeWeights({ a: NaN, b: -3, c: 0 }), {})
  assert.deepEqual(normalizeWeights({}), {})
})

test('evenWeights splits across every tile', () => {
  const w = evenWeights(['a', 'b', 'c'])
  assert.equal(sum(w), 100)
  assert.deepEqual(Object.keys(w).sort(), ['a', 'b', 'c'])
})

test('goalId is unique and never collides with overall', () => {
  assert.equal(goalId('Run a half marathon!', []), 'g-run-a-half-marathon')
  assert.equal(goalId('Run', ['g-run']), 'g-run-2')
  assert.equal(goalId('Overall', []), 'g-overall-2')
  assert.equal(goalId('***', []), 'g-goal')
})
