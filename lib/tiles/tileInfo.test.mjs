// Run: node --test lib/tiles/tileInfo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileInfo, setCustomTileIds, TILE_INFO, READY_HATCH } from './tileInfo.ts'

test('core and ready tiles all have different hatches', () => {
  const fixed = [...Object.keys(TILE_INFO).filter((id) => id !== 'vee'), ...Object.keys(READY_HATCH)].map((id) => tileInfo(id).hatch)
  assert.equal(new Set(fixed).size, fixed.length)
  assert.ok(!fixed.includes('h0'))
})

test('AI tiles get distinct spares that no fixed tile uses', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `custom-thing-${i}`)
  setCustomTileIds([...ids, 'custom-protein'])
  const hatches = ids.map((id) => tileInfo(id).hatch)
  assert.equal(new Set(hatches).size, 20)
  const fixed = new Set([...Object.values(TILE_INFO).map((t) => t.hatch), ...Object.values(READY_HATCH)])
  assert.ok(hatches.every((h) => !fixed.has(h)))
  assert.equal(tileInfo('custom-protein').hatch, READY_HATCH['custom-protein'])
})

test('an AI tile keeps its hatch when an unrelated tile is added', () => {
  setCustomTileIds(['custom-sugar-free-streak'])
  const before = tileInfo('custom-sugar-free-streak').hatch
  setCustomTileIds(['custom-sugar-free-streak', 'custom-zzz'])
  const after = tileInfo('custom-sugar-free-streak').hatch
  assert.equal(after, before)
  assert.notEqual(tileInfo('custom-zzz').hatch, after)
})
