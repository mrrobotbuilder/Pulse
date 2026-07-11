'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The ONE Supabase browser client, shared by auth (lib/auth.ts) and sync
 * (lib/sync.ts). It must be a single instance: the signed-in session lives on
 * this client, and a sync call made through a second, separate client would
 * carry no session — Row Level Security would then reject it as anonymous.
 *
 * Created lazily and only when both public env vars are present; otherwise the
 * app stays purely local (see lib/auth.ts / lib/sync.ts no-ops).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

/** Whether the two public Supabase keys are configured. */
export const supabaseConfigured = (): boolean => !!(url && anonKey)

/** The shared client, or null if unconfigured. */
export function supabase(): SupabaseClient | null {
  if (!url || !anonKey) return null
  if (!client) client = createClient(url, anonKey)
  return client
}
