import type { WhoopConfig } from '@/lib/whoop'
import { adminClient } from '@/lib/whoop'
import { writeTokenRow } from '@/lib/googlehealthStore'
import { mapDailySteps, mapRestingHr, mapSleep, mapWalks, type Night, type Walk } from '@/lib/googlehealthMap'

/**
 * Google Health (Fitbit) — the server side of the watch connection. SERVER ONLY.
 *
 * The legacy Fitbit Web API was switched off on 2026-11-02; this talks to the
 * Google Health API instead (developers.google.com/health). Sign-in is plain
 * Google OAuth, so the state signing, Supabase client and bearer check are the
 * generic ones from lib/whoop.ts; the config shape is the same on purpose.
 *
 * Endpoints and scope names are copied from Google's codelab and migration
 * pages (read 2026-11-02). Do not guess new ones: check the docs.
 */

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_HEALTH_API = 'https://health.googleapis.com/v4'

const SCOPE_BASE = 'https://www.googleapis.com/auth/googlehealth.'
export const GOOGLE_HEALTH_SCOPES = [
  'activity_and_fitness.readonly',
  'sleep.readonly',
  'health_metrics_and_measurements.readonly',
].map((s) => SCOPE_BASE + s)
export const GOOGLE_HEALTH_SCOPE_STRING = GOOGLE_HEALTH_SCOPES.join(' ')

/** Same shape as WHOOP's config; only the variable names differ. */
export type GoogleHealthConfig = WhoopConfig

export function googleHealthConfig(): { config: GoogleHealthConfig } | { missing: string[] } {
  const env = {
    GOOGLEHEALTH_CLIENT_ID: process.env.GOOGLEHEALTH_CLIENT_ID,
    GOOGLEHEALTH_CLIENT_SECRET: process.env.GOOGLEHEALTH_CLIENT_SECRET,
    GOOGLEHEALTH_REDIRECT_URI: process.env.GOOGLEHEALTH_REDIRECT_URI,
    GOOGLEHEALTH_STATE_SECRET: process.env.GOOGLEHEALTH_STATE_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) return { missing }
  return {
    config: {
      clientId: env.GOOGLEHEALTH_CLIENT_ID as string,
      clientSecret: env.GOOGLEHEALTH_CLIENT_SECRET as string,
      redirectUri: env.GOOGLEHEALTH_REDIRECT_URI as string,
      stateSecret: env.GOOGLEHEALTH_STATE_SECRET as string,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL as string,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    },
  }
}

// ── browser-bound state ──────────────────────────────────────────────────────
//
// The signed `state` proves the link came from us, but not that the browser
// finishing the flow is the one that started it: a leaked callback URL could be
// completed by someone else, attaching THEIR Google data to this account. So
// start also sets a one-time HttpOnly cookie, its nonce rides inside the signed
// state, and the callback requires both to match. (userId is a UUID: no colon.)

export const NONCE_COOKIE = 'gh_oauth_nonce'
export const NONCE_MAX_AGE_SECONDS = 15 * 60

export function bindNonce(userId: string, nonce: string): string {
  return `${userId}:${nonce}`
}

export function unbindNonce(bound: string): { userId: string; nonce: string } | null {
  const i = bound.indexOf(':')
  if (i < 1 || i === bound.length - 1) return null
  return { userId: bound.slice(0, i), nonce: bound.slice(i + 1) }
}

// ── tokens ───────────────────────────────────────────────────────────────────

export interface GoogleTokens {
  access_token: string
  /** Absent on a refresh: Google keeps the old one valid, it does not rotate. */
  refresh_token?: string
  expires_in: number
  scope?: string
  /** Present in Google's codelab response (604799 = 7 days) while the app is in Testing mode. */
  refresh_token_expires_in?: number
}

async function postToken(body: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    // Google's own OAuth error object ({"error":"invalid_grant", ...}); it never holds our secret.
    throw new Error(`Google token endpoint returned ${res.status}: ${text.slice(0, 400)}`)
  }
  let json: GoogleTokens
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Google token endpoint returned unparseable JSON: ${text.slice(0, 200)}`)
  }
  if (!json.access_token) throw new Error('Google returned no access_token.')
  return json
}

export function exchangeCode(code: string, c: GoogleHealthConfig): Promise<GoogleTokens> {
  return postToken({
    grant_type: 'authorization_code',
    code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
  })
}

export function refreshTokens(refreshToken: string, c: GoogleHealthConfig): Promise<GoogleTokens> {
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
  })
}

/**
 * Write a token pair under a Pulse account. Throws on failure.
 * A first sign-in must bring a refresh token (the start route asks for
 * access_type=offline and prompt=consent); a refresh keeps the stored one.
 */
export async function storeTokens(
  userId: string,
  tokens: GoogleTokens,
  c: GoogleHealthConfig,
): Promise<void> {
  await writeTokenRow(adminClient(c), userId, tokens)
}

/**
 * A working access token for this account, refreshed if it is about to die.
 * Returns null when the account has not connected. Throws if the stored grant
 * is dead (revoked, or a Testing-mode refresh token past its 7 days); the
 * caller should tell the person to connect again.
 */
export async function accessTokenFor(userId: string, c: GoogleHealthConfig): Promise<string | null> {
  const db = adminClient(c)
  const { data, error } = await db
    .from('googlehealth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the Google Health tokens: ${error.message}`)
  if (!data) return null

  if (new Date(data.expires_at).getTime() - Date.now() > 60_000) return data.access_token as string

  const fresh = await refreshTokens(data.refresh_token as string, c)
  await storeTokens(userId, fresh, c)
  return fresh.access_token
}

// ── the watch feed ───────────────────────────────────────────────────────────

export interface WatchData {
  syncedAt: string
  nights: Record<string, Night>
  restingHr: Record<string, number>
  dailySteps: Record<string, number>
  walks: Walk[]
}

const isoDay = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)

async function google(token: string, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${GOOGLE_HEALTH_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 200).replace(/\s+/g, ' ')
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      /* keep the raw text */
    }
    throw new Error(`Google Health ${path.split('?')[0]} answered ${res.status}: ${msg}`)
  }
  return JSON.parse(text) as Record<string, unknown>
}

/** Every page of a list call, up to maxPages. Newest data points come first. */
async function listAll(token: string, type: string, filter: string, maxPages: number): Promise<unknown[]> {
  const points: unknown[] = []
  let pageToken = ''
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ filter })
    if (pageToken) q.set('pageToken', pageToken)
    const json = await google(token, `/users/me/dataTypes/${type}/dataPoints?${q}`)
    points.push(...((json.dataPoints as unknown[]) ?? []))
    pageToken = (json.nextPageToken as string) ?? ''
    if (!pageToken) break
  }
  return points
}

/**
 * Everything the Vitals and Walks tiles need, in four parallel Google calls.
 * Any failing call throws: a half-filled answer would look like "no data".
 * Filter spellings (snake_case type names) were tested against a real account.
 */
export async function fetchWatchData(token: string): Promise<WatchData> {
  const dayStart = (daysAgo: number) => {
    const [y, m, d] = isoDay(daysAgo).split('-').map(Number)
    return { date: { year: y, month: m, day: d }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } }
  }
  const [sleep, rhr, rollup, exercise] = await Promise.all([
    listAll(token, 'sleep', `sleep.interval.civil_end_time >= "${isoDay(14)}"`, 2),
    listAll(token, 'daily-resting-heart-rate', `daily_resting_heart_rate.date >= "${isoDay(14)}"`, 1),
    // 56 days back to two days ahead: the server runs in UTC and the account may be a day ahead.
    google(token, '/users/me/dataTypes/steps/dataPoints:dailyRollUp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ range: { start: dayStart(55), end: dayStart(-2) }, windowSizeDays: 1, pageSize: 90 }),
    }),
    listAll(token, 'exercise', `exercise.interval.civil_start_time >= "${isoDay(60)}"`, 4),
  ])
  return {
    syncedAt: new Date().toISOString(),
    nights: mapSleep(sleep),
    restingHr: mapRestingHr(rhr),
    dailySteps: mapDailySteps((rollup.rollupDataPoints as unknown[]) ?? []),
    walks: mapWalks(exercise),
  }
}
