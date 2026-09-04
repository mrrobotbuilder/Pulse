/**
 * Per-user localStorage keys — one place, one rule.
 *
 * Before this, half the board's local state was namespaced and half was not.
 * `tileStore`, `tileSkin` and `dashboardChrome` already keyed by user
 * (`vitality:<userId>:…`); goals, weights, the profile, the onboarding flag
 * and the equation layout were bare (`vitality:goals`, `vitality:profile`, …).
 * On a shared browser the bare half is shared: sign in as someone else and you
 * are looking at the first person's goals. This module closes that half.
 *
 * The shape matches what the already-scoped modules use, so there is exactly
 * one convention to remember:
 *
 *   vitality:<userId>:<name>
 *
 * THE ONE RULE IN THIS FILE — the legacy fallback belongs to `me` alone.
 * Every bare `vitality:<name>` key in the wild was written before accounts
 * existed, which means it is the owner's own board. Reading it for `me` (the
 * anonymous/demo namespace) restores their data. Reading it for ANY OTHER
 * userId would hand one account another account's goals — the precise bug this
 * module exists to prevent. `readScoped` therefore falls back only for `me`,
 * and that check is not an optimisation to be removed.
 */

/** The anonymous / demo namespace. Real account ids arrive in B2; `me` stays
 *  the namespace for signed-out visitors after that. */
export const DEMO_USER_ID = 'me'

/**
 * Every bare key that predates per-user scoping, listed by hand.
 *
 * Deliberately an allow-list rather than a `vitality:` prefix sweep, for two
 * reasons a sweep gets wrong: `vitality:goal` is a CustomEvent name and not a
 * storage key at all, and `vitality:me:tiles` is already scoped — a sweep
 * would re-copy scoped keys into themselves.
 */
export const LEGACY_NAMES = [
  'profile',
  'goals',
  'goal:overall',
  'goal:active',
  'ideas',
  'noticed',
  'onboarded',
  'scratched',
  'eq:order',
  'eq:removed',
] as const

export type LegacyName = (typeof LEGACY_NAMES)[number]

/** `vitality:<userId>:<name>` — the key this app writes from now on. */
export function scopedKey(userId: string, name: string): string {
  return `vitality:${userId}:${name}`
}

/** `vitality:<name>` — the pre-accounts key. Read, never written. */
export function legacyKey(name: string): string {
  return `vitality:${name}`
}

/**
 * Read a scoped value, falling back to the pre-accounts key for `me` only.
 *
 * Returns null both when nothing is stored and when localStorage is
 * unavailable (SSR, private mode, storage disabled) — callers already treat
 * null as "use the defaults", so those cases stay indistinguishable on purpose.
 */
export function readScoped(userId: string, name: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const own = window.localStorage.getItem(scopedKey(userId, name))
    if (own !== null) return own
    if (userId !== DEMO_USER_ID) return null // see THE ONE RULE above
    return window.localStorage.getItem(legacyKey(name))
  } catch {
    return null
  }
}

/** Write a scoped value. Never writes the legacy key. */
export function writeScoped(userId: string, name: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(scopedKey(userId, name), value)
  } catch {
    /* quota, private mode, storage disabled — the board works without it */
  }
}

/** Remove a scoped value. Leaves the legacy key alone. */
export function removeScoped(userId: string, name: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(scopedKey(userId, name))
  } catch {
    /* ignore */
  }
}
