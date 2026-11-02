// Run: node --test lib/googlehealthMap.test.mjs
// Samples copy the real Google Health key paths (checked 2026-11-02) with made-up values.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localParts, mapSleep, mapRestingHr, mapDailySteps, mapWalks, mergeVitals } from './googlehealthMap.ts'

const sleepPoint = (start, end, minutes, extra = {}) => ({
  name: 'users/1/dataTypes/sleep/dataPoints/1',
  sleep: {
    interval: { startTime: start, startUtcOffset: '3600s', endTime: end, endUtcOffset: '3600s' },
    metadata: { mainSleep: true },
    summary: { minutesAsleep: String(minutes) },
    ...extra,
  },
})

test('localParts applies the UTC offset and can cross midnight', () => {
  assert.deepEqual(localParts('2026-11-01T23:30:00Z', '3600s'), { date: '2026-11-02', hm: '00:30' })
  assert.deepEqual(localParts('2026-02-23T13:10:00Z', '-18000s'), { date: '2026-02-23', hm: '08:10' })
  assert.equal(localParts('nonsense', '0s'), null)
  assert.equal(localParts(undefined, undefined), null)
})

test('mapSleep keys by wake date, hours from minutesAsleep, bed/wake local', () => {
  const r = mapSleep([sleepPoint('2026-11-01T22:40:00Z', '2026-11-02T06:20:00Z', 420)])
  assert.deepEqual(r, { '2026-11-02': { sleepHours: 7, bed: '23:40', wake: '07:20' } })
})

test('mapSleep ignores naps, zero or missing minutes, bad shapes; keeps the longer main sleep', () => {
  const nap = sleepPoint('2026-11-02T12:00:00Z', '2026-11-02T12:30:00Z', 25)
  nap.sleep.metadata.mainSleep = false
  const short = sleepPoint('2026-11-01T23:00:00Z', '2026-11-02T01:00:00Z', 100)
  const long = sleepPoint('2026-11-02T02:00:00Z', '2026-11-02T08:00:00Z', 330)
  const empty = sleepPoint('2026-11-01T22:00:00Z', '2026-11-02T06:00:00Z', 0)
  const r = mapSleep([nap, short, long, empty, null, 5, {}, { sleep: {} }])
  assert.deepEqual(Object.keys(r), ['2026-11-02'])
  assert.equal(r['2026-11-02'].sleepHours, 5.5)
})

test('mapRestingHr parses string bpm and the date object', () => {
  const r = mapRestingHr([{ dailyRestingHeartRate: { date: { year: 2026, month: 11, day: 2 }, beatsPerMinute: '58' } }, { dailyRestingHeartRate: {} }, null])
  assert.deepEqual(r, { '2026-11-02': 58 })
})

test('mapDailySteps parses countSum strings and skips days with no value', () => {
  const day = (d, steps) => ({ civilStartTime: { date: { year: 2026, month: 11, day: d } }, ...(steps === undefined ? {} : { steps }) })
  const r = mapDailySteps([day(1, { countSum: '8421' }), day(2, { countSum: '0' }), day(3), day(4, {}), null])
  assert.deepEqual(r, { '2026-11-01': 8421, '2026-11-02': 0 })
})

test('mapWalks keeps WALKING only, converts units, dedupes, newest first', () => {
  const ex = (id, type, start, extra = {}) => ({
    name: `users/1/dataTypes/exercise/dataPoints/${id}`,
    exercise: {
      exerciseType: type,
      displayName: 'Walk',
      activeDuration: '900s',
      interval: { startTime: start, startUtcOffset: '3600s', endTime: start },
      metricsSummary: { distanceMillimeters: 1609344, steps: '2038', caloriesKcal: 16.4 },
      ...extra,
    },
  })
  const r = mapWalks([ex('a', 'WALKING', '2026-10-30T10:00:00Z'), ex('b', 'RUNNING', '2026-10-31T10:00:00Z'), ex('c', 'WALKING', '2026-11-01T10:00:00Z'), ex('c', 'WALKING', '2026-11-01T10:00:00Z'), null])
  assert.deepEqual(r.map((w) => w.id), ['c', 'a'])
  assert.deepEqual(r[0], { id: 'c', name: 'Walk', date: '2026-11-01', steps: 2038, distanceM: 1609, durationMin: 15, kcal: 16 })
})

test('mergeVitals: Fitbit overwrites what it measures, never feel or note, never mutates', () => {
  const existing = {
    need: 8,
    '2026-11-02': { sleepHours: 5, feel: 70, note: 'bad night', hrv: 40, whoopRecovery: 66, bed: '01:00', wake: '06:00' },
    '2026-11-01': { sleepHours: 6, feel: 50 },
  }
  const frozen = JSON.parse(JSON.stringify(existing))
  const merged = mergeVitals(existing, { '2026-11-02': { sleepHours: 7, bed: '23:40', wake: '07:20' } }, { '2026-11-02': 58 })
  assert.deepEqual(merged['2026-11-02'], { sleepHours: 7, bed: '23:40', wake: '07:20', feel: 70, note: 'bad night', hrv: 40, whoopRecovery: 66, rhr: 58 })
  assert.deepEqual(merged['2026-11-01'], existing['2026-11-01'])
  assert.equal(merged.need, 8)
  assert.deepEqual(existing, frozen, 'input must not be mutated (it may be frozen SDK data)')
})

test('mergeVitals copes with an empty tile ([]), null, and a night without resting HR', () => {
  const nights = { '2026-11-02': { sleepHours: 7, bed: '23:40', wake: '07:20' } }
  for (const empty of [[], null, undefined, 'x']) {
    assert.deepEqual(mergeVitals(empty, nights, {}), { '2026-11-02': { sleepHours: 7, bed: '23:40', wake: '07:20' } })
  }
})
