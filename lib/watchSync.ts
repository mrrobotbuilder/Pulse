'use client'

import { supabase } from './supabaseClient'
import { tileStore } from './tiles/tileStore'
import { syncEnabled, syncSave } from './sync'
import { loadTileData } from './tiles/useTileHost'
import { mergeVitals, type Night, type Walk } from './googlehealthMap'

/**
 * Pull the owner's Fitbit data (through /api/googlehealth/sync) into the Vitals
 * and Walks tiles. Sealed tiles have no network, so the board does the fetch and
 * hands the result over through the tile-data lane, like every other tile.
 *
 *  - Vitals: merged onto the saved nights. Fitbit owns sleepHours, bed, wake and
 *    rhr; feel, note and everything else the owner typed is kept (mergeVitals).
 *    The merge base is the cloud copy when sync is on (loadTileData), so an empty
 *    local copy can never replace a real history.
 *  - Walks: replaced whole with Fitbit walks and all-day steps per day.
 *
 * Returns what happened. "not-connected" and "not-configured" are expected states,
 * not errors. Anything else throws with the real reason.
 */
export type WatchSyncResult = 'synced' | 'signed-out' | 'not-connected' | 'not-configured' | 'expired'

/**
 * What the last sync learned about the connection, for the Sync pill and panel:
 * 'ok' (data arrived), 'expired' (Google refused the saved grant: reconnect),
 * 'unknown' (not run yet, signed out, not connected, or failed for another reason).
 */
export type WatchState = 'unknown' | 'ok' | 'expired'
let watchState: WatchState = 'unknown'
const watchListeners = new Set<(s: WatchState) => void>()
function setWatchState(s: WatchState) {
  watchState = s
  watchListeners.forEach((fn) => fn(s))
}
export const currentWatchState = (): WatchState => watchState
export function onWatchState(fn: (s: WatchState) => void): () => void {
  watchListeners.add(fn)
  return () => watchListeners.delete(fn)
}

export async function syncWatch(userId: string): Promise<WatchSyncResult> {
  const client = supabase()
  const { data: s } = (await client?.auth.getSession()) ?? { data: { session: null } }
  if (!s.session) return 'signed-out'

  const res = await fetch('/api/googlehealth/sync', {
    headers: { authorization: `Bearer ${s.session.access_token}` },
    cache: 'no-store',
  })
  if (res.status === 409) return 'not-connected'
  if (res.status === 503) return 'not-configured'
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (json.expired === true) {
      setWatchState('expired')
      return 'expired'
    }
    throw new Error(json.error ?? `Fitbit sync failed (HTTP ${res.status}).`)
  }

  const nights = json.nights as Record<string, Night>
  const restingHr = json.restingHr as Record<string, number>
  const walks = json.walks as Walk[]
  const dailySteps = json.dailySteps as Record<string, number>
  if (!nights || !restingHr || !Array.isArray(walks) || !dailySteps) throw new Error('Fitbit sync answered with an unexpected shape.')

  const now = new Date().toISOString()
  const vitals = mergeVitals(await loadTileData(userId, 'vitals'), nights, restingHr)
  const walksData = { walks, dailySteps, syncedAt: json.syncedAt ?? now }

  for (const [id, data] of [['vitals', vitals], ['walks', walksData]] as const) {
    if (!(await tileStore.saveData(userId, id, data))) throw new Error(`Could not save the ${id} data on this device.`)
    // Mirror to the account: the tiles read the cloud copy first, so an older cloud copy would win.
    if (syncEnabled() && !(await syncSave(id, data, now))) throw new Error(`Saved ${id} on this device but could not back it up to your account.`)
    window.dispatchEvent(new CustomEvent('pulse:tiledata', { detail: id }))
  }
  setWatchState('ok')
  return 'synced'
}
