import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * WHOOP — the server side of the band connection. SERVER ONLY.
 *
 * Never import this from a client component. It reads WHOOP_CLIENT_SECRET and
 * SUPABASE_SERVICE_ROLE_KEY, and the table it touches (whoop_tokens) is
 * invisible to the browser by design — see supabase/whoop.sql.
 *
 * The endpoints below are WHOOP's own, taken from their OAuth docs
 * (developer.whoop.com/docs/developing/oauth). Do not "tidy" them into the API
 * base URL: the OAuth endpoints sit at /oauth/oauth2/*, while the data API sits
 * under /developer/v2/*. Different paths on the same host.
 */

export const WHOOP_AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
export const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
export const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'

/**
 * What we ask the person to grant.
 *
 * `offline` is the one that is easy to miss: without it WHOOP returns an access
 * token and no refresh token, the connection dies within the hour, and the only
 * way to renew it is sending them through the consent screen again. It is
 * documented on the OAuth page but does NOT appear in the scope table in the API
 * reference, so it may also need adding by hand when registering the app if the
 * dashboard only lists the read: scopes.
 */
export const WHOOP_SCOPES = [
  'offline',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
] as const

export const WHOOP_SCOPE_STRING = WHOOP_SCOPES.join(' ')

// ── configuration ────────────────────────────────────────────────────────────

export interface WhoopConfig {
  clientId: string
  clientSecret: string
  /** Must match, byte for byte, a redirect URI registered on the WHOOP app. */
  redirectUri: string
  /** HMAC key for the `state` round trip. Any long random string. */
  stateSecret: string
  supabaseUrl: string
  serviceRoleKey: string
}

/**
 * Read the environment. Returns the config, or the names of what is missing —
 * never a half-built object and never a silent default. A route that gets
 * `missing` back answers 503 and says which variables to set, because the
 * alternative is a 500 whose real cause is invisible.
 */
export function whoopConfig(): { config: WhoopConfig } | { missing: string[] } {
  const env = {
    WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID,
    WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET,
    WHOOP_REDIRECT_URI: process.env.WHOOP_REDIRECT_URI,
    WHOOP_STATE_SECRET: process.env.WHOOP_STATE_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) return { missing }
  return {
    config: {
      clientId: env.WHOOP_CLIENT_ID as string,
      clientSecret: env.WHOOP_CLIENT_SECRET as string,
      redirectUri: env.WHOOP_REDIRECT_URI as string,
      stateSecret: env.WHOOP_STATE_SECRET as string,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL as string,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    },
  }
}

/** The service-role client — the ONLY thing that can read or write whoop_tokens. */
export function adminClient(config: WhoopConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ── the `state` round trip ───────────────────────────────────────────────────
//
// state has to survive a trip through WHOOP's servers and come back
// trustworthy, because the callback binds a WHOOP account to a Pulse account
// purely on what state says. If it were guessable, someone could aim a consent
// flow at another person's row. So it is signed here, verified on return, and
// expires in minutes.

const STATE_TTL_SECONDS = 15 * 60

/** Sign a user id into an opaque state token. */
export function signState(userId: string, secret: string): string {
  const payload = { u: userId, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** Verify a state token. Returns the user id, or null if forged or expired. */
export function verifyState(state: string, secret: string): string | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts

  const expected = createHmac('sha256', secret).update(body).digest()
  let provided: Buffer
  try {
    provided = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

  let payload: { u?: unknown; exp?: unknown }
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  return typeof payload.u === 'string' && payload.u ? payload.u : null
}

// ── the token exchange ───────────────────────────────────────────────────────

export interface WhoopTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  token_type?: string
}

/** Turn the ?code= from the callback into a token pair. Throws on any failure. */
export async function exchangeCode(code: string, config: WhoopConfig): Promise<WhoopTokens> {
  return postToken(
    {
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    },
  )
}

/**
 * Trade a refresh token for a fresh pair. Throws on any failure.
 *
 * WHOOP ROTATES refresh tokens: the response carries a NEW refresh_token and the
 * one just sent stops working. Always store what comes back — dropping it
 * strands the connection, and the only repair is another trip through consent.
 * WHOOP's docs also include `scope: offline` on the refresh request itself.
 */
export async function refreshTokens(
  refreshToken: string,
  config: WhoopConfig,
): Promise<WhoopTokens> {
  return postToken(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'offline',
    },
  )
}

async function postToken(body: Record<string, string>): Promise<WhoopTokens> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) {
    // Surface WHOOP's own words. The body is an OAuth error object
    // ({"error":"invalid_grant", …}) and never contains our secret.
    throw new Error(`WHOOP token endpoint returned ${res.status}: ${text.slice(0, 400)}`)
  }

  let json: WhoopTokens
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`WHOOP token endpoint returned unparseable JSON: ${text.slice(0, 200)}`)
  }
  if (!json.access_token || !json.refresh_token) {
    // Almost always the `offline` scope missing from the app registration.
    throw new Error(
      'WHOOP returned no refresh_token. The app registration is probably missing the `offline` scope.',
    )
  }
  return json
}

/** Write a token pair to whoop_tokens under a Pulse account. Throws on failure. */
export async function storeTokens(
  userId: string,
  tokens: WhoopTokens,
  config: WhoopConfig,
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const { error } = await adminClient(config)
    .from('whoop_tokens')
    .upsert(
      {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) throw new Error(`Could not store the WHOOP tokens: ${error.message}`)
}

/**
 * The Pulse account behind a request, taken from the Supabase access token the
 * browser sends as `Authorization: Bearer …`. Returns null if absent or invalid.
 */
export async function userFromBearer(req: Request, config: WhoopConfig): Promise<string | null> {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!bearer) return null
  const { data, error } = await adminClient(config).auth.getUser(bearer)
  if (error || !data?.user) return null
  return data.user.id
}
