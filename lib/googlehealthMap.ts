/**
 * Google Health (Fitbit) data points → the shapes the Vitals and Walks tiles save.
 * Pure functions, no I/O, so they run in the server route and in tests.
 *
 * Field names are from Google's reference for users.dataTypes.dataPoints and the
 * dailyRollUp method, checked against a real account on 2026-11-02. int64 values
 * arrive as STRINGS, so every number goes through toInt/toNum first.
 */

export interface Walk {
  id: string
  name: string
  date: string // YYYY-MM-DD, local to where the walk happened
  steps: number
  distanceM: number
  durationMin: number
  kcal: number
}

export interface Night {
  sleepHours: number
  bed: string // HH:MM local
  wake: string // HH:MM local
}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

function toNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: unknown, m: unknown, d: unknown): string | null => {
  const [yy, mm, dd] = [toNum(y), toNum(m), toNum(d)]
  return yy && mm && dd ? `${yy}-${pad(mm)}-${pad(dd)}` : null
}

/** "2026-02-23T13:10:00Z" + "-18000s" → local date and HH:MM. Null if unreadable. */
export function localParts(iso: unknown, offset: unknown): { date: string; hm: string } | null {
  if (typeof iso !== 'string') return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const off = typeof offset === 'string' ? toNum(offset.replace(/s$/, '')) : null
  const shifted = new Date(ms + (off ?? 0) * 1000).toISOString() // UTC fields now read as local time
  return { date: shifted.slice(0, 10), hm: shifted.slice(11, 16) }
}

/**
 * Main sleeps keyed by WAKE date (the Vitals tile keeps last night under today's date).
 * Naps (mainSleep false) are ignored; two main sleeps on one wake date keep the longer.
 */
export function mapSleep(points: unknown[]): Record<string, Night> {
  const out: Record<string, Night & { _min: number }> = {}
  for (const p of points) {
    const s = isObj(p) && isObj(p.sleep) ? p.sleep : null
    if (!s || !isObj(s.interval)) continue
    if (isObj(s.metadata) && s.metadata.mainSleep === false) continue
    const minutes = isObj(s.summary) ? toNum(s.summary.minutesAsleep) : null
    const start = localParts(s.interval.startTime, s.interval.startUtcOffset)
    const end = localParts(s.interval.endTime, s.interval.endUtcOffset)
    if (minutes == null || minutes <= 0 || !start || !end) continue
    if (out[end.date] && out[end.date]._min >= minutes) continue
    out[end.date] = { sleepHours: Math.round((minutes / 60) * 100) / 100, bed: start.hm, wake: end.hm, _min: minutes }
  }
  return Object.fromEntries(Object.entries(out).map(([k, { _min, ...night }]) => [k, night]))
}

/** daily-resting-heart-rate points → { 'YYYY-MM-DD': bpm }. */
export function mapRestingHr(points: unknown[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of points) {
    const r = isObj(p) && isObj(p.dailyRestingHeartRate) ? p.dailyRestingHeartRate : null
    if (!r || !isObj(r.date)) continue
    const date = ymd(r.date.year, r.date.month, r.date.day)
    const bpm = toNum(r.beatsPerMinute)
    if (date && bpm != null && bpm > 0) out[date] = Math.round(bpm)
  }
  return out
}

/** dailyRollUp(steps) rollupDataPoints → { 'YYYY-MM-DD': all-day steps }. Days with no value are left out. */
export function mapDailySteps(rollups: unknown[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of rollups) {
    if (!isObj(p) || !isObj(p.civilStartTime) || !isObj(p.civilStartTime.date) || !isObj(p.steps)) continue
    const d = p.civilStartTime.date
    const date = ymd(d.year, d.month, d.day)
    const n = toNum(p.steps.countSum)
    if (date && n != null) out[date] = Math.round(n)
  }
  return out
}

/** WALKING exercises → the Walks tile's walk rows, newest first. */
export function mapWalks(points: unknown[]): Walk[] {
  const seen = new Set<string>()
  const walks: Walk[] = []
  for (const p of points) {
    const e = isObj(p) && isObj(p.exercise) ? p.exercise : null
    if (!e || e.exerciseType !== 'WALKING' || !isObj(e.interval)) continue
    const when = localParts(e.interval.startTime, e.interval.startUtcOffset)
    if (!when) continue
    const m = isObj(e.metricsSummary) ? e.metricsSummary : {}
    const id = typeof (p as Json).name === 'string' ? ((p as Json).name as string).split('/').pop()! : `${when.date}T${when.hm}`
    if (seen.has(id)) continue
    seen.add(id)
    const seconds = typeof e.activeDuration === 'string' ? toNum(e.activeDuration.replace(/s$/, '')) : null
    walks.push({
      id,
      name: typeof e.displayName === 'string' && e.displayName ? e.displayName : 'Walk',
      date: when.date,
      steps: toNum(m.steps) ?? 0,
      distanceM: Math.round((toNum(m.distanceMillimeters) ?? 0) / 1000),
      durationMin: Math.round((seconds ?? 0) / 60),
      kcal: Math.round(toNum(m.caloriesKcal) ?? 0),
    })
  }
  return walks.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * Put Fitbit nights into the saved Vitals data. Fitbit owns what it measures
 * (sleepHours, bed, wake, rhr) and overwrites those; everything the owner typed
 * (feel, note, hrv, whoopRecovery, anything else) and every other night is kept.
 * Returns a NEW object. `existing` may be [] or null (an empty tile): treated as {}.
 */
export function mergeVitals(
  existing: unknown,
  nights: Record<string, Night>,
  restingHr: Record<string, number>,
): Record<string, unknown> {
  const base: Record<string, unknown> = isObj(existing) ? { ...existing } : {}
  for (const [date, night] of Object.entries(nights)) {
    const prev = isObj(base[date]) ? (base[date] as Json) : {}
    const next: Json = { ...prev, sleepHours: night.sleepHours, bed: night.bed, wake: night.wake }
    if (restingHr[date] != null) next.rhr = restingHr[date]
    base[date] = next
  }
  return base
}
