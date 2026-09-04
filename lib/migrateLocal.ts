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
/**
 * Hand this device's anonymous board to the account that just signed in.
 *
 * Someone builds a board signed out — it lives under `me`. They sign in. If
 * nothing moved it, they would watch their own goals, tiles and layout vanish
 * and be replaced by an empty account. So `me` is copied to their namespace.
 *
 * THE BLEED THIS GUARDS AGAINST. `me` is not deleted by the copy, so on a
 * shared browser the naive version is: A signs in and claims the demo board;
 * A signs out; B signs in on the same browser and inherits A's goals, tiles
 * and body profile. That is exactly the leak B0 existed to close, reopened one
 * stage later.
 *
 * The guard is a claim marker. The first account to sign in on this browser
 * stamps `vitality:me:claimed-by` with its own id, and from then on this
 * function refuses to copy for anyone else. B gets a clean account, which is
 * the correct answer: the anonymous board was A's work, not a shared asset.
 *
 * Three further properties, same discipline as the legacy migration:
 *  - never overwrites — a key is copied only when the target does not exist;
 *  - once per account per browser, tracked by its own marker, so deleting a
 *    goal after claiming does not resurrect it on the next load;
 *  - copies, never deletes, so `me` still works signed out afterwards.
 */
export const CLAIM_OWNER_KEY = 'claimed-by'
export const CLAIM_DONE_MARKER = 'claimed-demo:v1'

/** Markers are bookkeeping, not board data — they must never be copied. */
const NEVER_COPY = new Set([MIGRATION_MARKER, CLAIM_OWNER_KEY, CLAIM_DONE_MARKER])

export interface ClaimResult {
  ran: boolean
  copied: string[]
  /** Set when another account already claimed this browser's demo board. */
  refusedOwner: string | null
}

const NO_CLAIM: ClaimResult = { ran: false, copied: [], refusedOwner: null }

export function claimDemoBoard(userId: string): ClaimResult {
  if (typeof window === 'undefined') return NO_CLAIM
  if (!userId || userId === DEMO_USER_ID) return NO_CLAIM

  let store: Storage
  try {
    store = window.localStorage
    if (store.getItem(scopedKey(userId, CLAIM_DONE_MARKER)) !== null) return NO_CLAIM
  } catch {
    return NO_CLAIM
  }

  try {
    const owner = store.getItem(scopedKey(DEMO_USER_ID, CLAIM_OWNER_KEY))
    if (owner !== null && owner !== userId) {
      // Someone else's anonymous work. Leave it alone and give this account a
      // clean board — see THE BLEED THIS GUARDS AGAINST above.
      return { ran: false, copied: [], refusedOwner: owner }
    }
  } catch {
    return NO_CLAIM
  }

  const prefix = scopedKey(DEMO_USER_ID, '')
  const copied: string[] = []
  try {
    // Snapshot the key list first: writing into localStorage while iterating
    // its live indices is how you skip entries.
    const sourceKeys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k && k.startsWith(prefix)) sourceKeys.push(k)
    }

    for (const key of sourceKeys) {
      const name = key.slice(prefix.length)
      if (NEVER_COPY.has(name)) continue
      const target = scopedKey(userId, name)
      if (store.getItem(target) !== null) continue // never overwrite
      const value = store.getItem(key)
      if (value === null) continue
      store.setItem(target, value)
      copied.push(name)
    }
  } catch {
    /* partial copy is fine — the never-overwrite rule makes a retry safe */
  }

  try {
    store.setItem(scopedKey(DEMO_USER_ID, CLAIM_OWNER_KEY), userId)
    store.setItem(scopedKey(userId, CLAIM_DONE_MARKER), new Date().toISOString())
  } catch {
    /* without the markers it retries next load, which is harmless */
  }

  return { ran: true, copied, refusedOwner: null }
}

/**
 * Everything the local store needs doing before anything reads it, in order.
 *
 * Called from the render body of each page that reads scoped storage, so it
 * lands before any child effect. Both steps are idempotent and cost a couple
 * of getItem calls once they have run.
 */
export function prepareLocalNamespace(userId: string): void {
  // 1. Pre-accounts bare keys -> `me`, ALWAYS, whoever is signed in. If this
  //    only ran while signed out, a visitor whose very first action is to sign
  //    in would strand their old board under keys nothing reads any more.
  migrateLocalData(DEMO_USER_ID)
  // 2. `me` -> the signed-in account, if this browser's demo board is theirs
  //    to take. No-op when signed out or when another account claimed it.
  claimDemoBoard(userId)
}
