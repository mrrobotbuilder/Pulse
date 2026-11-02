// Run: node --test lib/watchStatus.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESYNC_AFTER_MS,
  EMPTY_WATCH_STATUS,
  resyncDue,
  parseWatchStatus,
  formatWhen,
  describeWatchStatus,
  describeSyncFailure,
} from './watchStatus.ts'

// Local-time constructors, so the tests hold in any time zone.
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0).toISOString()
const now = new Date(2026, 10, 2, 19, 24, 0)

test('resyncDue: first time, old enough, too soon, already running', () => {
  assert.equal(resyncDue(null, 1_000_000, false), true)
  assert.equal(resyncDue(1_000_000, 1_000_000 + RESYNC_AFTER_MS, false), true)
  assert.equal(resyncDue(1_000_000, 1_000_000 + RESYNC_AFTER_MS - 1, false), false)
  assert.equal(resyncDue(null, 1_000_000, true), false)
  assert.equal(resyncDue(1_000_000, 9_000_000, true), false)
})

test('parseWatchStatus: good note, missing, corrupt, wrong shapes', () => {
  const good = { okAt: at(2026, 11, 2, 15, 12), triedAt: at(2026, 11, 2, 19, 20), error: 'boom' }
  assert.deepEqual(parseWatchStatus(JSON.stringify(good)), good)
  assert.deepEqual(parseWatchStatus(null), EMPTY_WATCH_STATUS)
  assert.deepEqual(parseWatchStatus('{not json'), EMPTY_WATCH_STATUS)
  assert.deepEqual(parseWatchStatus('[]'), EMPTY_WATCH_STATUS)
  assert.deepEqual(parseWatchStatus(JSON.stringify({ okAt: 5, triedAt: 'nope', error: '' })), EMPTY_WATCH_STATUS)
})

test('formatWhen: clock today, date and clock on other days, zero padded', () => {
  assert.equal(formatWhen(at(2026, 11, 2, 15, 12), now), '15:12')
  assert.equal(formatWhen(at(2026, 11, 2, 7, 5), now), '07:05')
  assert.equal(formatWhen(at(2026, 11, 1, 23, 59), now), '1 Nov 23:59')
  assert.equal(formatWhen(at(2025, 11, 2, 15, 12), now), '2 Nov 15:12')
})

test('describeWatchStatus: never synced, failing after a good sync, healthy', () => {
  assert.deepEqual(describeWatchStatus(EMPTY_WATCH_STATUS, now), {
    times: 'No successful sync seen by this browser yet · no try yet',
    failure: null,
  })
  const failing = { okAt: at(2026, 11, 2, 15, 12), triedAt: at(2026, 11, 2, 19, 20), error: 'Fitbit sync failed (HTTP 502).' }
  assert.deepEqual(describeWatchStatus(failing, now), {
    times: 'Last successful sync 15:12 · last try 19:20',
    failure: 'Last try failed: Fitbit sync failed (HTTP 502).',
  })
  const healthy = { okAt: at(2026, 11, 2, 19, 20), triedAt: at(2026, 11, 2, 19, 20), error: null }
  assert.equal(describeWatchStatus(healthy, now).failure, null)
  const noisy = { ...failing, error: 'x'.repeat(500) }
  assert.equal(describeWatchStatus(noisy, now).failure.length, 'Last try failed: '.length + 200 + 1)
})

test('describeSyncFailure: timeout, plain error, non-error, empty message', () => {
  const timeout = new DOMException('signal timed out', 'TimeoutError')
  assert.match(describeSyncFailure(timeout), /longer than 60 seconds/)
  assert.equal(describeSyncFailure(new Error('Failed to fetch')), 'Failed to fetch')
  assert.equal(describeSyncFailure('plain'), 'plain')
  assert.equal(describeSyncFailure(new Error('')), 'Error')
})
