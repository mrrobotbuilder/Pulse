import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { verifyState } from '@/lib/whoop'
import {
  NONCE_COOKIE,
  exchangeCode,
  googleHealthConfig,
  storeTokens,
  unbindNonce,
} from '@/lib/googlehealth'

/**
 * Step two: Google sends the person back here with ?code= and our signed ?state=.
 * This URL is registered on the Google OAuth client and must match it byte for
 * byte. Failures answer with a plain error, never a silent bounce to /app.
 */
export async function GET(req: NextRequest) {
  const cfg = googleHealthConfig()
  if ('missing' in cfg) {
    return NextResponse.json(
      { error: 'Google Health is not configured on this deployment.', missing: cfg.missing },
      { status: 503 },
    )
  }

  const params = req.nextUrl.searchParams
  const board = new URL('/app', req.nextUrl.origin)

  if (params.get('error')) {
    board.searchParams.set('googlehealth', 'denied')
    return NextResponse.redirect(board)
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) {
    return NextResponse.json({ error: 'Google did not send back a code and state.' }, { status: 400 })
  }

  const signed = verifyState(state, cfg.config.stateSecret)
  const bound = signed ? unbindNonce(signed) : null
  if (!bound) {
    return NextResponse.json(
      { error: 'That connection link is no longer valid. Start the connection again.' },
      { status: 400 },
    )
  }

  // The nonce in the signed state must equal the cookie this browser got at
  // /start. A leaked link finished from another browser has no such cookie.
  const cookie = Buffer.from(req.cookies.get(NONCE_COOKIE)?.value ?? '')
  const wanted = Buffer.from(bound.nonce)
  if (cookie.length !== wanted.length || !timingSafeEqual(cookie, wanted)) {
    return NextResponse.json(
      { error: 'This connection was not started in this browser. Start it again from your board.' },
      { status: 400 },
    )
  }

  // One use only: clear the cookie whatever happens next.
  const finish = (res: NextResponse) => {
    res.cookies.delete({ name: NONCE_COOKIE, path: '/api/googlehealth/callback' })
    return res
  }

  try {
    const tokens = await exchangeCode(code, cfg.config)
    if (!tokens.refresh_token) {
      throw new Error('Google returned no refresh token. Remove Pulse at myaccount.google.com/permissions and connect again.')
    }
    await storeTokens(bound.userId, tokens, cfg.config)
    // A number here means Google gave the grant a lifetime (Testing mode: 604799 = 7 days);
    // "none" after publishing the app means the weekly reconnect is gone. Read it in the runtime logs.
    console.info(`googlehealth connected: refresh_token_expires_in=${tokens.refresh_token_expires_in ?? 'none'}`)
  } catch (err) {
    return finish(NextResponse.json({ error: (err as Error).message }, { status: 502 }))
  }

  board.searchParams.set('googlehealth', 'connected')
  return finish(NextResponse.redirect(board))
}
