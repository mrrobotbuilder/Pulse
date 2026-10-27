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
