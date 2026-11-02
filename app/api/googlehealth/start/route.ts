import { NextRequest, NextResponse } from 'next/server'
import { signState, userFromBearer } from '@/lib/whoop'
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_HEALTH_SCOPE_STRING,
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
  url.searchParams.set('state', signState(userId, cfg.config.stateSecret))

  return NextResponse.json({ url: url.toString() })
}
