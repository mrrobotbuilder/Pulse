// Run: node --test lib/tiles/readyTiles.test.mjs
// Every ready-made tile must pass the same validator as an AI-written one, and
// its save shape must be one summarize() reads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { READY_TILES, readyTileHtml } from './readyTiles.ts'
import { checkTileHtml, isCustomTileId } from './tileCheck.ts'
import { summarize } from './tileStats.ts'

test('every ready tile has a unique custom id and passes the tile validator', () => {
  assert.ok(READY_TILES.length >= 10, 'expected a real catalog')
  assert.equal(new Set(READY_TILES.map((t) => t.id)).size, READY_TILES.length)
  for (const t of READY_TILES) {
    assert.ok(isCustomTileId(t.id), t.id)
    const r = checkTileHtml(readyTileHtml(t))
    assert.ok(r.ok, `${t.id}: ${r.reason}`)
  }
})

test('the saved shape gives a face number', () => {
  const s = summarize('custom-protein', { unit: 'g', entries: [{ at: new Date().toISOString(), value: 40 }] })
  assert.equal(s.value, '40')
  assert.equal(s.unit, 'g')
})
