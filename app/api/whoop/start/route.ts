import { NextRequest, NextResponse } from 'next/server'
import {
  WHOOP_AUTHORIZE_URL,
  WHOOP_SCOPE_STRING,
  signState,
  userFromBearer,
  whoopConfig,
} from '@/lib/whoop'

/**
 * Step one of connecting a WHOOP band: hand the browser the URL to send the
 * person to.
 *
 * It is a POST, not a link, on purpose. The route has to know WHICH Pulse
 * account is connecting, and the only proof of that is the Supabase access
 * token — which belongs in an Authorization header, never in a URL where it
 * would land in browser history, referrers and server logs. So the board POSTs
 * with the header, gets a URL back, and navigates to it itself.
 *
 * The returned URL is WHOOP's own consent screen. Nothing is stored here; the
 * account id rides along in a signed `state` and comes back at the callback.
 */
export async function POST(req: NextRequest) {
  const cfg = whoopConfig()
  if ('missing' in cfg) {
    return NextResponse.json(
      {
        error: 'WHOOP is not configured on this deployment.',
        missing: cfg.missing,
      },
      { status: 503 },
    )
  }

  const userId = await userFromBearer(req, cfg.config)
  if (!userId) {
    return NextResponse.json(
      { error: 'Sign in to Pulse first — a WHOOP connection is stored against an account.' },
      { status: 401 },
    )
  }

  const url = new URL(WHOOP_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.config.clientId)
  url.searchParams.set('redirect_uri', cfg.config.redirectUri)
  url.searchParams.set('scope', WHOOP_SCOPE_STRING)
  url.searchParams.set('state', signState(userId, cfg.config.stateSecret))

  return NextResponse.json({ url: url.toString() })
}
