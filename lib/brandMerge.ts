/**
 * Folds the hourly snapshots into the Brand tile's saved data. Pure, so the rule
 * that matters is testable: a point the owner logged by hand is never dropped.
 *
 * brand_snapshots is the archive. The `brand` row in tile_data is the copy the
 * tile draws, thinned so it stays small: hourly for 14 days, then the last check
 * of each UTC day, up to a year. Only points the collector wrote are thinned;
 * they carry `auto: 1`, hand-logged points do not.
 */

const DAY_MS = 864e5
const HOURLY_DAYS = 14
const KEEP_DAYS = 365

export interface Snapshot {
  platform: string
  handle: string
  t: string
  followers: number
  views: number | null
  posts: number | null
}

export interface CheckResult {
  platform: string
  handle: string
  ok: boolean
  error?: string
}

interface Point {
  t: number
  count: number
  views?: number
  posts?: number
  auto?: 1
}

type Obj = Record<string, unknown>

/** How a handle is compared and stored: no @, lower case. */
export const normHandle = (h: string) => h.trim().replace(/^@+/, '').toLowerCase()

const sameAccount = (a: Obj, b: { platform: string; handle: string }) =>
  a.platform === b.platform && normHandle(String(a.handle)) === normHandle(b.handle)

function thin(points: Point[], now: number): Point[] {
  const lastOfDay = new Map<string, Point>()
  for (const p of points) {
    if (p.auto && p.t < now - HOURLY_DAYS * DAY_MS) lastOfDay.set(new Date(p.t).toISOString().slice(0, 10), p)
  }
  const kept = new Set(lastOfDay.values())
  return points.filter((p) => {
    if (!p.auto) return true
    if (p.t < now - KEEP_DAYS * DAY_MS) return false
    return p.t >= now - HOURLY_DAYS * DAY_MS || kept.has(p)
  })
}

/**
 * The brand data with `rows` merged into each connected account and the latest
 * check result recorded on it. Returns a new object. A snapshot for an account
 * that is no longer connected is left out, so disconnecting sticks.
 */
export function mergeBrand(data: Obj, rows: Snapshot[], checks: CheckResult[], now: number): Obj {
  const accounts = Array.isArray(data.accounts) ? (data.accounts as Obj[]) : []
  return {
    ...data,
    accounts: accounts.map((a) => {
      const byTime = new Map<number, Point>()
      for (const p of Array.isArray(a.history) ? (a.history as Point[]) : []) byTime.set(p.t, p)
      for (const r of rows) {
        if (!sameAccount(a, r)) continue
        const t = Date.parse(r.t)
        byTime.set(t, {
          t,
          count: r.followers,
          ...(r.views != null ? { views: r.views } : {}),
          ...(r.posts != null ? { posts: r.posts } : {}),
          auto: 1,
        })
      }
      const check = checks.find((c) => sameAccount(a, c))
      return {
        ...a,
        history: thin([...byTime.values()].sort((x, y) => x.t - y.t), now),
        ...(check ? { check: { t: now, ok: check.ok, ...(check.error ? { error: check.error } : {}) } } : {}),
      }
    }),
  }
}
