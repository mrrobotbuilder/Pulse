'use client'

import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabaseClient'

/**
 * Minimal email/password auth on top of the shared Supabase client.
 *
 * Password (not magic-link / OAuth) on purpose: no redirect URL to configure,
 * no email deliverability to worry about, identical behavior on localhost and
 * on Vercel. supabase-js persists the session in the browser, so it's sign in
 * once per device.
 *
 * `isSignedIn()` is synchronous and backed by a module-level cache so it can
 * drop into the existing synchronous `syncEnabled()` call sites (useTileHost,
 * DashboardGrid) without making them async. The cache is seeded from
 * `getSession()` on load and kept current by `onAuthStateChange`.
 */

let cachedUser: User | null = null
const listeners = new Set<(user: User | null) => void>()

function setUser(user: User | null) {
  cachedUser = user
  listeners.forEach((fn) => fn(user))
}

const client = supabase()
if (client) {
  client.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
  client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
}

/** Is a user currently signed in? Synchronous, reads the cache. */
export const isSignedIn = (): boolean => !!cachedUser

/** The signed-in user, or null. Synchronous, reads the cache. */
export const currentUser = (): User | null => cachedUser

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(fn: (user: User | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function signUp(email: string, password: string): Promise<{ error: string | null }> {
  const c = supabase()
  if (!c) return { error: 'Cloud backup is not configured yet.' }
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) return { error: error.message }
  setUser(data.user ?? null)
  return { error: null }
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const c = supabase()
  if (!c) return { error: 'Cloud backup is not configured yet.' }
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  setUser(data.user ?? null)
  return { error: null }
}

export async function signOut(): Promise<void> {
  const c = supabase()
  if (!c) return
  await c.auth.signOut()
  setUser(null)
}

export { supabaseConfigured }
