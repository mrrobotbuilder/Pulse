import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { signState, userFromBearer } from '@/lib/whoop'
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_HEALTH_SCOPE_STRING,
  NONCE_COOKIE,
  NONCE_MAX_AGE_SECONDS,
  bindNonce,
  googleHealthConfig,
} from '@/lib/googlehealth'

/**
 * Step one of connecting a Fitbit: hand the browser Google's consent URL.
 * A POST with the Supabase bearer token, like /api/whoop/start, so the account
 * id never travels in a URL. It rides in a signed `state` and returns at the callback.
 */
export async function POST(req: NextRequest) {
  const cfg = googleHealthConfig()
  if ('missing' in cfg) {
    return NextResponse.json(
      { error: 'Google Health is not configured on this deployment.', missing: cfg.missing },
      { status: 503 },
    )
  }

  const userId = await userFromBearer(req, cfg.config)
  if (!userId) {
    return NextResponse.json(
      { error: 'Sign in to Pulse first — a Fitbit connection is stored against an account.' },
      { status: 401 },
    )
  }

  const url = new URL(GOOGLE_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.config.clientId)
  url.searchParams.set('redirect_uri', cfg.config.redirectUri)
  url.searchParams.set('scope', GOOGLE_HEALTH_SCOPE_STRING)
  // offline = a refresh token; consent = Google issues one every time, not only the first.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  const nonce = randomBytes(24).toString('base64url')
  url.searchParams.set('state', signState(bindNonce(userId, nonce), cfg.config.stateSecret))

  const res = NextResponse.json({ url: url.toString() })
  // Lax: the callback is a top-level GET from Google, which Lax cookies ride along on.
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/googlehealth/callback',
    maxAge: NONCE_MAX_AGE_SECONDS,
  })
  return res
}
