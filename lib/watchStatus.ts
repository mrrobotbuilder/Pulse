/**
 * What the Sync panel says about the Fitbit sync, and when the board may sync
 * again on its own. Pure (no browser, no network) so it can be tested with
 * `node --test lib/watchStatus.test.mjs`. The browser side is lib/watchSync.ts.
 */

export type WatchStatus = {
  /** When this browser last saw a sync succeed (ISO). */
  okAt: string | null
  /** When the last attempt finished, successful or not (ISO). */
  triedAt: string | null
  /** Why the last attempt failed, or null if it worked. */
  error: string | null
}

export const EMPTY_WATCH_STATUS: WatchStatus = { okAt: null, triedAt: null, error: null }

/** Switching back to the tab syncs again only if the last try is at least this old. */
export const RESYNC_AFTER_MS = 2 * 60 * 1000

/** A sync that takes longer than this is stopped and reported, so one hung request cannot block every later one. */
export const SYNC_TIMEOUT_MS = 60 * 1000

export function resyncDue(lastTryMs: number | null, nowMs: number, running: boolean): boolean {
  if (running) return false
  if (lastTryMs === null) return true
  return nowMs - lastTryMs >= RESYNC_AFTER_MS
}

const iso = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)

/** Read the saved note back. Anything unreadable means "no history", which is only a display loss. */
export function parseWatchStatus(raw: string | null): WatchStatus {
  if (!raw) return EMPTY_WATCH_STATUS
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    return { okAt: iso(j.okAt), triedAt: iso(j.triedAt), error: typeof j.error === 'string' && j.error ? j.error : null }
  } catch {
    return EMPTY_WATCH_STATUS
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

/** "15:12" for today, "2 Nov 15:12" for any other day. Local time, 24 hour. */
export function formatWhen(isoTime: string, now: Date): string {
  const d = new Date(isoTime)
  const clock = `${two(d.getHours())}:${two(d.getMinutes())}`
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? clock : `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock}`
}

const MAX_REASON = 200

/** The text for the panel: one line of times, and the failure reason if the last try failed. */
export function describeWatchStatus(s: WatchStatus, now: Date): { times: string; failure: string | null } {
  const ok = s.okAt ? `Last successful sync ${formatWhen(s.okAt, now)}` : 'No successful sync seen by this browser yet'
  const times = s.triedAt ? `${ok} · last try ${formatWhen(s.triedAt, now)}` : `${ok} · no try yet`
  const failure = s.error ? `Last try failed: ${s.error.length > MAX_REASON ? s.error.slice(0, MAX_REASON) + '…' : s.error}` : null
  return { times, failure }
}

/** A readable reason for something thrown during a sync. */
export function describeSyncFailure(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return `The sync took longer than ${SYNC_TIMEOUT_MS / 1000} seconds and was stopped.`
    return e.message || e.name
  }
  return String(e)
}
