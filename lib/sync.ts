'use client'

import { supabase } from './supabaseClient'
import { isSignedIn, supabaseConfigured } from './auth'
import { tileStore } from './tiles/tileStore'

/**
 * Optional cross-device cloud backup for tile data.
 *
 * The base is local-first: a tile's `Vitality.save()` data always lands in
 * this device's localStorage first (see tileStore.ts) — that never depends on
 * the network or on being signed in. When the owner has ALSO configured a
 * Supabase project and signed in, every save is additionally mirrored to a
 * `tile_data` table scoped to their account by Row Level Security (see
 * supabase/sync.sql) — so opening the same site on another device loads the
 * same data.
 *
 * If the two public env keys are absent, or the visitor isn't signed in,
 * every function here no-ops and the app stays purely local — offline and
 * signed-out behavior are identical to a deployment with no cloud at all.
 */

/** Whether cross-device sync is both configured AND the visitor is signed in. */
export const syncEnabled = (): boolean => supabaseConfigured() && isSignedIn()

/** Push a tile's data to the owner's Supabase. Best-effort; returns false on any failure. */
export async function syncSave(tileId: string, data: unknown, isoNow: string): Promise<boolean> {
  const c = supabase()
  if (!c || !isSignedIn()) return false
  try {
    const { error } = await c
      .from('tile_data')
      .upsert({ tile_id: tileId, data, updated_at: isoNow }, { onConflict: 'user_id,tile_id' })
    return !error
  } catch {
    return false
  }
}

/**
 * Upload this device's tile data for every tile the cloud has no row for yet.
 *
 * Why: a tile only mirrors on its next save, so data logged before signing in
 * (or before sync existed) never reached the cloud, and the connector and any
 * coach reading it saw an empty board. Insert-only (`ignoreDuplicates` is ON
 * CONFLICT DO NOTHING), so an existing cloud row, written by another device,
 * always wins and is never overwritten. Empty stores are skipped: an empty
 * cloud row would hide another device's real local data.
 *
 * Waits for the session itself instead of the isSignedIn() cache, which is
 * still empty during the board's first effects. Returns the ids it uploaded.
 */
export async function syncBackfill(userId: string): Promise<string[]> {
  const c = supabase()
  if (!c) return []
  const { data: s } = await c.auth.getSession()
  if (!s.session || s.session.user.id !== userId) return []
  const { data: rows, error } = await c.from('tile_data').select('tile_id')
  if (error) throw new Error(`backfill: could not list cloud rows (${error.message})`)
  const inCloud = new Set((rows ?? []).map((r: { tile_id: string }) => r.tile_id))
  const now = new Date().toISOString()
  const missing: { tile_id: string; data: unknown; updated_at: string }[] = []
  for (const id of tileStore.listDataIds(userId)) {
    if (inCloud.has(id)) continue
    const data = await tileStore.loadData(userId, id)
    const empty = Array.isArray(data) ? data.length === 0 : !data || (typeof data === 'object' && !Object.keys(data).length)
    if (!empty) missing.push({ tile_id: id, data, updated_at: now })
  }
  if (!missing.length) return []
  const { error: upErr } = await c
    .from('tile_data')
    .upsert(missing, { onConflict: 'user_id,tile_id', ignoreDuplicates: true })
  if (upErr) throw new Error(`backfill: upload failed (${upErr.message})`)
  return missing.map((m) => m.tile_id)
}

/** Read a tile's data from Supabase, or null if unconfigured / signed out / missing / offline. */
export async function syncLoad(tileId: string): Promise<unknown | null> {
  const c = supabase()
  if (!c || !isSignedIn()) return null
  try {
    const { data, error } = await c.from('tile_data').select('data').eq('tile_id', tileId).maybeSingle()
    if (error) return null
    return data?.data ?? null
  } catch {
    return null
  }
}

/** Delete one tile's cloud row (mirrors tileStore.clearData's local wipe). No-op if unconfigured / signed out. */
export async function syncClearTile(tileId: string): Promise<void> {
  const c = supabase()
  if (!c || !isSignedIn()) return
  try {
    await c.from('tile_data').delete().eq('tile_id', tileId)
  } catch {
    /* best-effort */
  }
}

/** A tile document stored in the owner's Supabase (built from Claude via the MCP connector). */
export interface RemoteTile {
  html: string
  name: string | null
  /** ms since epoch, from updated_at (0 when unreadable) */
  updatedAt: number
}

/**
 * Read every MCP-built tile from the owner's Supabase, keyed by slot. Returns an
 * empty object if sync is unconfigured / signed out / offline. The dashboard prefers
 * these over the static public/tiles files, so a tile made from Claude — on the
 * laptop or the phone — appears without a redeploy. Requires the `tiles` table
 * (supabase/tiles.sql) — a separate, not-yet-built capstone piece.
 */
export async function syncLoadTiles(): Promise<Record<string, RemoteTile>> {
  const c = supabase()
  if (!c || !isSignedIn()) return {}
  try {
    const { data, error } = await c.from('tiles').select('slot, html, name, updated_at')
    if (error || !data) return {}
    const map: Record<string, RemoteTile> = {}
    for (const row of data as Array<{ slot: string; html: string; name: string | null; updated_at: string | null }>) {
      if (row.slot && typeof row.html === 'string' && row.html.trim()) {
        map[row.slot] = { html: row.html, name: row.name ?? null, updatedAt: Date.parse(row.updated_at ?? '') || 0 }
      }
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Write a tile into the owner's Supabase `tiles` table (the "+ New tile" button /
 * paste box). Same store the MCP connector writes to, so a tile made in the browser
 * and one made from Claude land in the same place. Returns false if unconfigured,
 * signed out, or the write fails (e.g. tiles.sql not run yet).
 */
export async function syncSaveTile(slot: string, html: string, name?: string): Promise<boolean> {
  const c = supabase()
  if (!c || !isSignedIn()) return false
  try {
    const { error } = await c
      .from('tiles')
      // The `tiles` primary key is (user_id, slot) — the table is scoped per
      // account, like tile_data. user_id fills itself from auth.uid(), so it is
      // never sent from the browser, but the conflict target must name both
      // columns or the upsert has no matching unique index to resolve against.
      .upsert({ slot, html, name: name ?? null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,slot' })
    return !error
  } catch {
    return false
  }
}

/**
 * Wipe the owner's cloud tile data — what is INSIDE every tile. The tiles
 * themselves stay (the gear's "Wipe all tile data" promises every card stays):
 * deleting the `tiles` rows here used to remove connector-built and AI-written
 * tiles from every other device. No-op if unconfigured / signed out.
 * Best-effort; never throws. Row Level Security scopes this to the signed-in
 * account automatically — there is no unfiltered delete here.
 */
export async function syncWipe(): Promise<void> {
  const c = supabase()
  if (!c || !isSignedIn()) return
  try {
    await c.from('tile_data').delete().neq('tile_id', '')
  } catch {
    /* best-effort */
  }
}
