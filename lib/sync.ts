'use client'

import { supabase } from './supabaseClient'
import { isSignedIn, supabaseConfigured } from './auth'

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
    const { data, error } = await c.from('tiles').select('slot, html, name')
    if (error || !data) return {}
    const map: Record<string, RemoteTile> = {}
    for (const row of data as Array<{ slot: string; html: string; name: string | null }>) {
      if (row.slot && typeof row.html === 'string' && row.html.trim()) {
        map[row.slot] = { html: row.html, name: row.name ?? null }
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
 * Wipe the owner's cloud data — every tile's saved data AND every tile they built
 * (the connector / "+ New tile" store). Used by the dashboard's Reset button. No-op
 * if unconfigured / signed out. Best-effort; never throws. Row Level Security scopes
 * this to the signed-in account automatically — there is no unfiltered delete here.
 */
export async function syncWipe(): Promise<void> {
  const c = supabase()
  if (!c || !isSignedIn()) return
  try {
    await c.from('tile_data').delete().neq('tile_id', '')
    await c.from('tiles').delete().neq('slot', '')
  } catch {
    /* best-effort */
  }
}
