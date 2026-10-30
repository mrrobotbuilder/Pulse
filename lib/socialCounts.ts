/**
 * Public numbers for one social account, one lookup per platform. Plain fetches
 * with the key passed in, so the browser bridge (TikTok) and the server (the
 * hourly collector, /api/youtube/subs) share them and nothing here reads env.
 *
 * Every lookup throws on failure, with a short reason the Brand tile can show.
 * It never returns a 0 it did not read: a zero would draw as a crash on the
 * growth line.
 */

export interface Counts {
  followers: number
  /** YouTube: total channel views. X: views across the last 10 original posts. */
  views?: number
  /** Total posts or videos on the account. */
  posts?: number
}

const TIMEOUT_MS = 10_000
/** X bills each post read, so this is the number that sets the monthly cost. */
export const X_RECENT_POSTS = 10

async function getJson(url: string, headers?: Record<string, string>) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) }
}

const count = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : undefined)

/** Keyless, through tikwm. */
export async function tiktokCounts(handle: string): Promise<Counts> {
  const { json } = await getJson('https://www.tikwm.com/api/user/info?unique_id=' + encodeURIComponent(handle))
  const followers = count(json?.data?.stats?.followerCount)
  if (followers == null) throw new Error(String(json?.msg || 'no_data'))
  return { followers, posts: count(json?.data?.stats?.videoCount) }
}

/** YouTube rounds the public subscriber count to 3 significant figures. Views and video count are exact. */
export async function youtubeCounts(handle: string, key: string): Promise<Counts> {
  const { ok, status, json } = await getJson(
    'https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=' +
      encodeURIComponent(handle) +
      '&key=' +
      encodeURIComponent(key),
  )
  if (!ok) throw new Error(`youtube_${status}`)
  const stats = json?.items?.[0]?.statistics
  if (stats?.hiddenSubscriberCount) throw new Error('hidden')
  const followers = stats?.subscriberCount != null ? Number(stats.subscriberCount) : NaN
  if (!Number.isFinite(followers)) throw new Error('not_found')
  const exact = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : undefined)
  return { followers, views: exact(stats.viewCount), posts: exact(stats.videoCount) }
}

/**
 * Pay-per-use: a user read is 1 cent and a post read half a cent, and X charges
 * each resource once per UTC day, so looking hourly costs the same as daily.
 * The views call is separate so that losing it never costs the follower count.
 */
export async function xCounts(handle: string, token: string): Promise<Counts> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('bad_handle')
  const auth = { Authorization: `Bearer ${token}` }
  const { ok, status, json } = await getJson(
    `https://api.x.com/2/users/by/username/${handle}?user.fields=public_metrics`,
    auth,
  )
  if (!ok) throw new Error(`x_${status}`)
  const followers = count(json?.data?.public_metrics?.followers_count)
  if (followers == null) throw new Error('not_found')
  const out: Counts = { followers, posts: count(json.data.public_metrics.post_count) }
  try {
    const recent = await getJson(
      `https://api.x.com/2/users/${json.data.id}/tweets?max_results=${X_RECENT_POSTS}&exclude=retweets,replies&tweet.fields=public_metrics`,
      auth,
    )
    if (!recent.ok) throw new Error(`x_${recent.status}`)
    const seen = (recent.json?.data ?? []).map((p: { public_metrics?: { impression_count?: unknown } }) => count(p.public_metrics?.impression_count))
    if (seen.length && seen.every((v: number | undefined) => v != null)) {
      out.views = seen.reduce((s: number, v: number) => s + v, 0)
    }
  } catch (e) {
    console.error('brand: X views lookup failed, keeping the follower count', e)
  }
  return out
}
