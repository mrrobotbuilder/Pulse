'use client'

/**
 * The custom tile lane (docs/PLAN.md, Stage 7): tiles that are not one of the
 * fixed slots, ids `custom-<slug>`. The HTML lives in this browser's tile index
 * (tileStore, scoped per user) and, for a signed-in user, in their own row of the
 * Supabase `tiles` table, keyed (user_id, slot) like every other tile. Its data
 * rides the normal lane: tileStore.saveData locally, tile_data in the cloud.
 */
import { tileStore } from './tileStore'
import { isCustomTileId } from './tileCheck'
import { syncEnabled, syncSaveTile, type RemoteTile } from '@/lib/sync'
import type { Tile } from './types'
import { READY_TILES, readyTileHtml } from './readyTiles'

/** This browser's custom tiles. */
export function listCustomTiles(userId: string): Tile[] {
  return tileStore.listTiles(userId).filter((t) => isCustomTileId(t.id))
}

/**
 * Keep a new custom tile here, and in the cloud when signed in. Resolves false
 * when the cloud copy failed: the tile still works in this browser, and the
 * caller says it did not reach the user's other devices.
 */
export async function saveCustomTile(userId: string, tile: { id: string; name: string; html: string; tracks?: string }): Promise<boolean> {
  if (!isCustomTileId(tile.id)) throw new Error('not a custom tile id: ' + tile.id)
  const now = Date.now()
  tileStore.adoptTile(userId, { ...tile, createdAt: now, updatedAt: now })
  if (!syncEnabled()) return true
  return syncSaveTile(tile.id, tile.html, tile.name)
}

/** Fold custom tiles from the cloud (accepted on another device) into this browser's index. */
export function foldRemoteCustomTiles(userId: string, remote: Record<string, RemoteTile>): void {
  for (const [slot, row] of Object.entries(remote)) {
    if (!isCustomTileId(slot)) continue
    tileStore.syncServerTile(userId, { id: slot, name: row.name || 'Your tile', html: row.html, createdAt: row.updatedAt, updatedAt: row.updatedAt })
  }
}

/**
 * Ready-made tiles keep the HTML they were added with, so a redesign of the
 * template would never reach them. Swap in the current template for every
 * ready tile in this browser that still runs an older one. Only the tile's
 * code changes; its saved data is a separate lane and stays as it is. A tile is
 * recognised as ours by the template's own signature, so an AI-written tile
 * that happens to share an id (custom-protein) is never touched.
 */
export function upgradeReadyTiles(userId: string): string[] {
  const upgraded: string[] = []
  for (const t of listCustomTiles(userId)) {
    const ready = READY_TILES.find((r) => r.id === t.id)
    if (!ready || !READY_SIGNATURE.test(t.html)) continue
    const html = readyTileHtml(ready)
    if (html === t.html) continue
    tileStore.syncServerTile(userId, { ...t, html, updatedAt: Math.max(Date.now(), t.updatedAt + 1) })
    upgraded.push(t.id)
    if (syncEnabled()) void syncSaveTile(t.id, html, t.name).then((ok) => ok || console.error(`could not send the new ${t.id} tile to the cloud`))
  }
  return upgraded
}
// The old template opened its script with `const C={"unit":`, the current one with `var K=window.PulseKit,C=`.
const READY_SIGNATURE = /const C=\{"unit":"|var K=window\.PulseKit,C=\{"name":/

/** A ready-made tile still running one of our templates (so not AI-written). */
export function isReadyTile(id: string, html: string): boolean {
  return READY_TILES.some((r) => r.id === id) && READY_SIGNATURE.test(html)
}

/**
 * Replace a custom tile's HTML (a redesign or its undo), here and in the cloud.
 * Its saved data is a separate lane and is not touched. Resolves false when
 * the cloud copy failed: the new design still works in this browser.
 */
export async function replaceCustomTileHtml(userId: string, id: string, html: string): Promise<boolean> {
  const t = listCustomTiles(userId).find((x) => x.id === id)
  if (!t) throw new Error('no such tile: ' + id)
  tileStore.syncServerTile(userId, { ...t, html, updatedAt: Math.max(Date.now(), t.updatedAt + 1) })
  if (!syncEnabled()) return true
  return syncSaveTile(id, html, t.name)
}
