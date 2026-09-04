import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Who is asking, resolved on the server.
 *
 * Until B1 the app had no idea who you were until React had mounted in your
 * browser: the session lived in localStorage. Everything server-side —
 * middleware, route handlers, anything rendered before hydration — was
 * anonymous by construction. The board could get away with that; a paywall
 * cannot, because a gate that only exists in the browser is a gate anyone can
 * walk around by disabling JavaScript.
 *
 * The session now lives in cookies (see lib/supabaseClient.ts), so it arrives
 * with the request and this module can read it.
 *
 * THE ONE RULE IN THIS FILE — always `getUser()`, never `getSession()`.
 * getSession() returns whatever the cookie claims, unverified; a cookie is
 * client-controlled, so trusting it server-side means trusting the caller's
 * word about who they are. getUser() sends the token to Supabase and gets a
 * verified answer. Anything gating access must use this, and it is the reason
 * the extra round trip is worth paying for.
 *
 * This module is server-only by construction: importing next/headers from a
 * Client Component is a build error, so no 'server-only' package is needed to
 * enforce it.
 */

/** A request-scoped server client, or null when Supabase is unconfigured. */
export function serverSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  // Never cache or share this across requests — it carries one caller's cookies.
  const store = cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options)
          }
        } catch {
          // Server Components are not allowed to set cookies. That is fine and
          // expected here: the middleware refreshes the session on every
          // matched request, so the refreshed cookie is already on its way to
          // the browser. Swallowing it anywhere else would hide a real bug,
          // which is why this catch is narrow and explained rather than global.
        }
      },
    },
  })
}

/**
 * The verified signed-in user, or null.
 *
 * Returns null — rather than throwing — when Supabase is unconfigured or the
 * caller is signed out, because "no user" is the normal state for this app:
 * the board is meant to work signed out.
 */
export async function getServerUser(): Promise<User | null> {
  const client = serverSupabase()
  if (!client) return null
  try {
    const { data, error } = await client.auth.getUser()
    if (error) return null
    return data.user ?? null
  } catch {
    return null
  }
}

/** The signed-in user's id, or null. The shape B2 threads into the board. */
export async function getServerUserId(): Promise<string | null> {
  return (await getServerUser())?.id ?? null
}
