/**
 * One-time copy of the pre-accounts localStorage keys into the `me` namespace.
 *
 * Runs once per browser, on the board's first client render. It exists so the
 * switch to per-user keys is invisible: a board that was built before accounts
 * existed keeps every goal, weight, tile order and profile field it had.
 *
 * Three deliberate properties, each of which is a decision and not an accident:
 *
 *  1. NON-DESTRUCTIVE. The bare `vitality:<name>` keys are copied, never
 *     deleted. If this migration is ever wrong, nothing is lost and the old
 *     board is one key rename away. Deleting them is a separate later change
 *     that should only happen once real accounts have been live for a while.
 *
 *  2. NEVER OVERWRITES. A bare key is copied only when the scoped key does not
 *     already exist. Re-running can therefore only ever add, never clobber
 *     something the user changed after the first run.
 *
 *  3. `me` ONLY. The bare keys are the owner's own pre-accounts board, so they
 *     belong to the anonymous/demo namespace. Copying them into a real account
 *     would be handing that account someone else's data. B2 introduces the
 *     separate `me:* -> <uid>:*` step for a signing-in owner; that is not this
 *     function and is not built yet.
 */

import { DEMO_USER_ID, LEGACY_NAMES, legacyKey, scopedKey } from './localScope'

/** Bumping the suffix re-runs the migration for everyone. */
export const MIGRATION_MARKER = 'migrated:legacy-v1'

export interface MigrationResult {
  /** False when it had already run, the namespace was not `me`, or no storage. */
  ran: boolean
  /** Names actually copied this time. */
  copied: string[]
  /** Names skipped because a scoped value already existed. */
  kept: string[]
}

const NOOP: MigrationResult = { ran: false, copied: [], kept: [] }

export function migrateLocalData(userId: string): MigrationResult {
  if (typeof window === 'undefined') return NOOP
  if (userId !== DEMO_USER_ID) return NOOP // see property 3 above

  let store: Storage
  try {
    store = window.localStorage
    if (store.getItem(scopedKey(userId, MIGRATION_MARKER)) !== null) return NOOP
  } catch {
    return NOOP // private mode / storage disabled — the board still works
  }

  const copied: string[] = []
  const kept: string[] = []
  for (const name of LEGACY_NAMES) {
    try {
      const legacy = store.getItem(legacyKey(name))
      if (legacy === null) continue
      if (store.getItem(scopedKey(userId, name)) !== null) {
        kept.push(name) // property 2 — never overwrite
        continue
      }
      store.setItem(scopedKey(userId, name), legacy)
      copied.push(name)
    } catch {
      /* one bad key must not abort the rest */
    }
  }

  try {
    store.setItem(scopedKey(userId, MIGRATION_MARKER), new Date().toISOString())
  } catch {
    /* if the marker can't be written it simply runs again next load */
  }

  return { ran: true, copied, kept }
}
