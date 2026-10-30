import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { constantTimeEquals } from '../../mcp/oauth/crypto'
import { mergeBrand, normHandle, type CheckResult, type Snapshot } from '@/lib/brandMerge'
import { tiktokCounts, xCounts, youtubeCounts, type Counts } from '@/lib/socialCounts'

/**
 * The hourly check behind the Brand tile. Supabase's pg_cron POSTs here with
 * BRAND_CRON_SECRET (supabase/brand.sql). It reads the accounts in the owner's
 * `brand` tile data, looks each one up, archives a row per account in
 * brand_snapshots and merges the result back into the tile data.
 *
 * The merge happens here rather than in the browser because the browser's cloud
 * read cannot tell a failed read from an empty one, and writing a stale local
 * copy over the cloud would lose hand-logged data. It also keeps the connector's
 * `today` current with no board open.
 *
 * A platform that fails records nothing and reports why, never a 0.
 */

type Lookup = (handle: string) => Promise<Counts>

function lookups(): Record<string, Lookup> {
  const yt = process.env.YOUTUBE_API_KEY
  const x = process.env.X_BEARER_TOKEN
  return {
    tiktok: tiktokCounts,
    youtube: (h) => (yt ? youtubeCounts(h, yt) : Promise.reject(new Error('no_key'))),
    x: (h) => (x ? xCounts(h, x) : Promise.reject(new Error('no_key'))),
  }
}

/** The newest rows are enough to repair the tile copy; older ones are already in it. */
const REPAIR_ROWS = 1000

async function mergeIntoTile(db: SupabaseClient, owner: string, checks: CheckResult[]) {
  const { data: rows, error } = await db
    .from('brand_snapshots')
    .select('platform, handle, t, followers, views, posts')
    .eq('user_id', owner)
    .order('t', { ascending: false })
    .limit(REPAIR_ROWS)
  if (error) throw new Error(`could not read snapshots: ${error.message}`)

  // A tile can save between the read and the write. The write only lands if the
  // row is still the one that was read; if not, read it again. The archive holds
  // every point, so losing both tries only delays them to the next hour.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slot = await readSlot(db, owner)
    if (!slot) return false
    const { data: written, error: writeError } = await db
      .from('tile_data')
      .update({ data: mergeBrand(slot.data, (rows ?? []) as Snapshot[], checks, Date.now()), updated_at: new Date().toISOString() })
      .eq('user_id', owner)
      .eq('tile_id', 'brand')
      .eq('updated_at', slot.updatedAt)
      .select('tile_id')
    if (writeError) throw new Error(`could not update the tile: ${writeError.message}`)
    if (written?.length) return true
  }
  console.error('brand: the tile kept changing during the merge; the next run repairs it')
  return false
}

async function readSlot(db: SupabaseClient, owner: string) {
  const { data, error } = await db
    .from('tile_data')
    .select('data, updated_at')
    .eq('user_id', owner)
    .eq('tile_id', 'brand')
    .maybeSingle()
  if (error) throw new Error(`could not read the tile: ${error.message}`)
  if (!data) return null
  return { data: (data.data ?? {}) as Record<string, unknown>, updatedAt: data.updated_at as string }
}

export async function POST(req: NextRequest) {
  const expected = process.env.BRAND_CRON_SECRET
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const owner = process.env.OWNER_USER_ID
  if (!expected || !url || !serviceKey || !owner) {
    return NextResponse.json({ error: 'The Brand collector is not configured.' }, { status: 503 })
  }
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!constantTimeEquals(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const slot = await readSlot(db, owner)
    const accounts = Array.isArray(slot?.data.accounts) ? (slot.data.accounts as Record<string, unknown>[]) : []
    const look = lookups()
    const tracked = accounts
      .map((a) => ({ platform: String(a.platform), handle: normHandle(String(a.handle ?? '')) }))
      .filter((a) => a.handle && look[a.platform])

    const t = new Date().toISOString()
    const results = await Promise.all(
      tracked.map(async (a) => {
        try {
          return { ...a, counts: await look[a.platform](a.handle) }
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          console.error(`brand: ${a.platform} @${a.handle} failed: ${error}`)
          return { ...a, error }
        }
      }),
    )

    const rows = results.flatMap((r) =>
      'counts' in r && r.counts
        ? [{ user_id: owner, platform: r.platform, handle: r.handle, t, followers: r.counts.followers, views: r.counts.views ?? null, posts: r.counts.posts ?? null }]
        : [],
    )
    if (rows.length) {
      const { error } = await db
        .from('brand_snapshots')
        .upsert(rows, { onConflict: 'user_id,platform,handle,hour', ignoreDuplicates: true })
      if (error) throw new Error(`could not save snapshots: ${error.message}`)
    }

    const checks: CheckResult[] = results.map((r) =>
      'error' in r ? { platform: r.platform, handle: r.handle, ok: false, error: r.error } : { platform: r.platform, handle: r.handle, ok: true },
    )
    const merged = tracked.length ? await mergeIntoTile(db, owner, checks) : false
    return NextResponse.json({
      saved: rows.map((r) => `${r.platform}:${r.handle}`),
      failed: checks.filter((c) => !c.ok).map((c) => ({ account: `${c.platform}:${c.handle}`, error: c.error })),
      merged,
    })
  } catch (err) {
    console.error('brand: collect failed', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
