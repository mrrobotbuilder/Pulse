import type { SupabaseClient } from '@supabase/supabase-js'

/** The part of Google's token answer that gets stored. */
export interface TokenWrite {
  access_token: string
  /** Absent on a refresh: Google keeps the old one valid, it does not rotate. */
  refresh_token?: string
  expires_in: number
  scope?: string
}

/**
 * Save a token answer under a Pulse account. SERVER ONLY. Throws on failure.
 *
 * - With a refresh token (the first sign-in): insert the row, or replace it.
 * - Without one (every later refresh, about each hour): update the stored row and
 *   leave its refresh token alone. This must NOT be an upsert: Postgres checks
 *   `refresh_token not null` on the proposed row before it looks for the existing
 *   one, so an upsert without a refresh token is refused even when the row exists.
 *   That is what stopped the owner's sync an hour after each sign-in (2026-11-02).
 */
export async function writeTokenRow(db: SupabaseClient, userId: string, tokens: TokenWrite): Promise<void> {
  const fields = {
    access_token: tokens.access_token,
    scope: tokens.scope ?? null,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (tokens.refresh_token) {
    const { error } = await db
      .from('googlehealth_tokens')
      .upsert({ user_id: userId, ...fields, refresh_token: tokens.refresh_token }, { onConflict: 'user_id' })
    if (error) throw new Error(`Could not store the Google Health tokens: ${error.message}`)
    return
  }
  const { data, error } = await db.from('googlehealth_tokens').update(fields).eq('user_id', userId).select('user_id')
  if (error) throw new Error(`Could not store the Google Health tokens: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Could not store the Google Health tokens: there is no saved connection to refresh.')
}
