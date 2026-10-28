/**
 * One glanceable number per tile, read from the tile's OWN saved data (the same
 * JSON the tile gets from Pulse.load()). Each reader follows that tile's save
 * format in public/tiles/<id>.html; change a tile's format, change it here.
 *
 *   null              nothing saved yet → the face says "No data yet"
 *   throws (caught)   a shape we do not know → logged, shown as "No data yet"
 *
 * Pure and dependency-free so `node --test lib/tiles/tileStats.test.mjs` can run it.
 */

export interface TileStat {
  value: string
  unit: string
  sub: string
}

type Obj = Record<string, unknown>

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Nothing saved: what tileStore.loadData returns for an empty slot ([]), plus null and {}. */
const isEmpty = (d: unknown) => d == null || (Array.isArray(d) && d.length === 0) || (isObj(d) && Object.keys(d).length === 0)

function shape(id: string): never {
  throw new Error(`tileStats: unknown ${id} data shape`)
}

/** Local calendar date, YYYY-MM-DD (the tiles key their days this way). */
export function dayKey(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** "today", a weekday inside the last week, else "Oct 12". */
function dayLabel(key: string, now: Date): string {
  const [y, m, d] = key.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ago = Math.round((today.getTime() - day.getTime()) / 864e5)
  if (ago === 0) return 'today'
  if (ago === 1) return 'yesterday'
  if (ago > 1 && ago < 7) return DAYS[day.getDay()]
  return MONTHS[day.getMonth()] + ' ' + day.getDate()
}

/** Same compact count as the Brand tile: 12K, 1.2M. */
function compact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e4) return Math.round(n / 1e3) + 'K'
  return n.toLocaleString('en-US')
}

/** Same money format as the Finance tile. */
function moneyIn(n: number, cur = '$'): string {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  const v = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : Math.round(a).toLocaleString('en-US')
  return cur === 'kr' ? sign + v + ' kr' : sign + cur + v
}

/* Train: { log: { exercise: [{ w, r, at, t? }] } }. Best lift set of the most recent day. */
function train(d: unknown, now: Date): TileStat | null {
  const log = isObj(d) ? d.log : shape('train')
  if (log == null) return null
  if (!isObj(log)) shape('train')
  let lastDay = ''
  let best: { name: string; w: number; r: number } | null = null
  for (const [name, sets] of Object.entries(log)) {
    if (!Array.isArray(sets)) shape('train')
    for (const s of sets) {
      // cardio sets (t: 'c') are km × minutes, not a lift
      if (!isObj(s) || !num(s.w) || !num(s.r) || !num(s.at) || s.t === 'c') continue
      const day = dayKey(new Date(s.at))
      // the tile's own ordering: heavier wins, then more reps
      if (day > lastDay || (day === lastDay && best && (s.w > best.w || (s.w === best.w && s.r > best.r)))) {
        if (day > lastDay) lastDay = day
        best = { name, w: s.w, r: s.r }
      }
    }
  }
  if (!best) return null
  return { value: `${best.w}×${best.r}`, unit: 'best set', sub: `${best.name} · ${dayLabel(lastDay, now)}` }
}

/* Fuel: { water: { 'YYYY-MM-DD': glasses }, goal? }, goal 8 unless set in fuel.html. */
function fuel(d: unknown, now: Date): TileStat | null {
  const water = isObj(d) ? d.water : shape('fuel')
  if (water == null) return null
  if (!isObj(water)) shape('fuel')
  const n = water[dayKey(now)]
  const today = num(n) ? n : 0
  const goal = num((d as Obj).goal) && ((d as Obj).goal as number) > 0 ? ((d as Obj).goal as number) : 8
  return { value: String(today), unit: today === 1 ? 'glass' : 'glasses', sub: `of ${goal} today` }
}

/* Vitals: { 'YYYY-MM-DD': { sleepHours, feel, whoopRecovery? } }. Same recovery
   formula as vitals.html estRecovery and peak.html recoveryFromVitals. */
function recovery(h: Obj): number | null {
  if (num(h.whoopRecovery)) return Math.max(1, Math.min(99, Math.round(h.whoopRecovery)))
  const parts: number[] = []
  const w: number[] = []
  if (num(h.feel)) {
    parts.push(Math.max(0, Math.min(100, h.feel)))
    w.push(0.6)
  }
  if (num(h.sleepHours)) {
    parts.push(Math.max(0, Math.min(1, h.sleepHours / 8)) * 100)
    w.push(0.4)
  }
  if (!parts.length) return null
  const sw = w.reduce((a, b) => a + b, 0)
  let s = 0
  for (let i = 0; i < parts.length; i++) s += parts[i] * w[i]
  return Math.max(1, Math.min(99, Math.round(s / sw)))
}

function vitals(d: unknown, now: Date): TileStat | null {
  if (!isObj(d)) shape('vitals')
  const days = Object.keys(d).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(d[k]) && num((d[k] as Obj).sleepHours)).sort()
  if (!days.length) {
    if (Object.keys(d).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))) return null
    shape('vitals')
  }
  const key = days[days.length - 1]
  const h = d[key] as Obj
  const hrs = h.sleepHours as number
  const hh = Math.floor(hrs)
  const mm = Math.round((hrs - hh) * 60)
  const rec = recovery(h)
  const when = dayLabel(key, now)
  const sub = [rec != null ? `recovery ${rec}%` : null, when === 'today' ? null : when].filter(Boolean).join(' · ')
  return { value: `${hh}h${mm ? ` ${mm}m` : ''}`, unit: 'sleep', sub: sub || 'last night' }
}

/* Walks: { walks: [{ date: 'YYYY-MM-DD', steps, distanceM }], syncedAt }. Monday-based week. */
function walks(d: unknown, now: Date): TileStat | null {
  const list = isObj(d) ? d.walks : undefined
  if (!Array.isArray(list)) shape('walks')
  if (!list.length) return null
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const from = dayKey(start)
  const to = dayKey(now)
  let steps = 0
  let count = 0
  let dist = 0
  for (const w of list) {
    if (!isObj(w) || typeof w.date !== 'string' || w.date < from || w.date > to) continue
    if (num(w.steps)) steps += w.steps
    if (num(w.distanceM)) dist += w.distanceM
    count++
  }
  return {
    value: steps.toLocaleString('en-US'),
    unit: 'steps',
    sub: `${count} walk${count === 1 ? '' : 's'} · ${(dist / 1000).toFixed(1)} km this week`,
  }
}

/* Brand: { accounts: [{ platform, handle, history: [{ t, count }] }] }. */
function brand(d: unknown, now: Date): TileStat | null {
  const accounts = isObj(d) ? d.accounts : shape('brand')
  if (accounts == null) return null
  if (!Array.isArray(accounts)) shape('brand')
  const weekAgo = now.getTime() - 7 * 864e5
  let total = 0
  let counted = 0
  let delta = 0
  let hasDelta = false
  let allYoutube = true
  for (const a of accounts) {
    if (!isObj(a)) continue
    const h = (Array.isArray(a.history) ? a.history : []).filter((p: unknown): p is Obj => isObj(p) && num(p.count) && num(p.t))
    if (!h.length) continue
    const last = h[h.length - 1].count as number
    total += last
    counted++
    if (a.platform !== 'youtube') allYoutube = false
    const before = h.filter((p) => (p.t as number) <= weekAgo)
    if (before.length) {
      delta += last - (before[before.length - 1].count as number)
      hasDelta = true
    }
  }
  if (!counted) return null
  const sub = hasDelta
    ? `${delta >= 0 ? '+' : '−'}${compact(Math.abs(delta))} this week`
    : `${counted} account${counted === 1 ? '' : 's'}`
  return { value: compact(total), unit: allYoutube ? 'subs' : 'followers', sub }
}

/* Finance: { accounts: [{ balance }], holdings: [{ shares, price }], subs: [{ amount }], history: [{ t, value }], currency? }.
   Net worth exactly as finance.html netWorth(). */
function finance(d: unknown): TileStat | null {
  const store = isObj(d) ? d : shape('finance')
  const cur = ['$', '€', '£', 'kr'].includes(store.currency as string) ? (store.currency as string) : '$'
  const money = (n: number) => moneyIn(n, cur)
  const list = (k: string): Obj[] => {
    const v = store[k]
    if (v == null) return []
    if (!Array.isArray(v)) shape('finance')
    return v.filter(isObj)
  }
  const accounts = list('accounts')
  const holdings = list('holdings')
  const subs = list('subs')
  const history = list('history').filter((p) => num(p.value))
  const burn = subs.reduce((s, x) => s + (num(x.amount) ? x.amount : 0), 0)
  const burnLine = `${money(burn)}/mo subs`
  if (!accounts.length && !holdings.length) {
    return subs.length ? { value: money(burn), unit: 'a month', sub: `${subs.length} subscription${subs.length === 1 ? '' : 's'}` } : null
  }
  let worth = 0
  for (const a of accounts) worth += num(a.balance) ? a.balance : 0
  for (const h of holdings) worth += (num(h.shares) ? h.shares : 0) * (num(h.price) ? h.price : 0)
  let sub = subs.length ? burnLine : 'net worth'
  if (!subs.length && history.length >= 2) {
    const ch = (history[history.length - 1].value as number) - (history[0].value as number)
    sub = `${ch >= 0 ? '▲' : '▼'} ${money(Math.abs(ch))} since day one`
  }
  return { value: money(worth), unit: 'net worth', sub }
}

const READERS: Record<string, (d: unknown, now: Date) => TileStat | null> = {
  train,
  fuel,
  vitals,
  walks,
  brand,
  finance,
  // Peak saves no score of its own (its curve is computed on screen), and its
  // only number would repeat Vitals' recovery. Owner's call, 2026-10-27.
  peak: () => null,
}

/*
 * An AI-written tile (custom-*) is asked to save { unit, entries: [{ at, value }] }
 * (app/api/tiles/generate): the newest value and how many. A model may still
 * pick its own shape; then the face only says something was logged.
 */
function custom(d: unknown, now: Date): TileStat | null {
  if (!isObj(d) || !Array.isArray(d.entries)) return { value: 'Logged', unit: '', sub: 'open to see it' }
  const list = d.entries.filter((e): e is Obj => isObj(e) && num(e.value))
  const last = list[list.length - 1]
  if (!last) return null
  // A yes/no habit (ready tile kind 'check'): one entry per day, 1 kept, 0 missed. The face is the streak.
  if (d.kind === 'check') {
    const kept = new Set(list.filter((e) => (e.value as number) > 0 && typeof e.at === 'string').map((e) => dayKey(new Date(e.at as string))))
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (!kept.has(dayKey(day))) day.setDate(day.getDate() - 1)
    let streak = 0
    while (kept.has(dayKey(day)) && streak < 5000) {
      streak++
      day.setDate(day.getDate() - 1)
    }
    return { value: String(streak), unit: streak === 1 ? 'day' : 'days', sub: kept.has(dayKey(now)) ? 'in a row · kept today' : 'in a row · not marked today' }
  }
  const when = typeof last.at === 'string' && !Number.isNaN(Date.parse(last.at)) ? dayLabel(dayKey(new Date(last.at)), now) : ''
  const unit = typeof d.unit === 'string' ? d.unit.slice(0, 16) : ''
  return { value: compact(Math.round((last.value as number) * 10) / 10), unit, sub: `${list.length} logged${when ? ' · last ' + when : ''}` }
}

/**
 * The connector's `today` digest: the date, the gold goal if stored, then one
 * line per data slot and custom tile, each from summarize(). A slot with no
 * row, empty data or an unreadable shape says "no data yet", never an error.
 * `now` must carry the owner's wall clock in its local fields (the route
 * builds it from Europe/Stockholm), because the tiles key their days that way.
 */
export function todayDigest(
  slots: string[],
  custom: { id: string; name: string | null }[],
  data: Record<string, unknown>,
  goal: string | null,
  now: Date,
): string {
  const date = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
  const lines = [`Today: ${date} (Europe/Stockholm)`]
  if (goal) lines.push(`Overall goal: ${goal}`)
  const rows = [
    ...slots.map((id) => [id, id[0].toUpperCase() + id.slice(1)] as const),
    ...custom.map((c) => [c.id, c.name || c.id] as const),
  ]
  for (const [id, label] of rows) {
    const s = summarize(id, data[id], now)
    lines.push(s ? `${label}: ${s.value}${s.unit ? ' ' + s.unit : ''}${s.sub ? ` (${s.sub})` : ''}` : `${label}: no data yet`)
  }
  return lines.join('\n')
}

/** The face number for tile `id`, or null (nothing saved, an unknown tile, or a shape we cannot read). */
export function summarize(id: string, data: unknown, now: Date = new Date()): TileStat | null {
  const read = READERS[id] ?? (id.startsWith('custom-') ? custom : undefined)
  if (!read || isEmpty(data)) return null
  try {
    return read(data, now)
  } catch (e) {
    console.error(`tileStats: could not summarize "${id}"`, e)
    return null
  }
}
