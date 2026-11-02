import { NextRequest, NextResponse } from 'next/server'
import { verifyState } from '@/lib/whoop'
import { exchangeCode, googleHealthConfig, storeTokens } from '@/lib/googlehealth'

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

  const userId = verifyState(state, cfg.config.stateSecret)
  if (!userId) {
    return NextResponse.json(
      { error: 'That connection link is no longer valid. Start the connection again.' },
      { status: 400 },
    )
  }

  try {
    const tokens = await exchangeCode(code, cfg.config)
    if (!tokens.refresh_token) {
      throw new Error('Google returned no refresh token. Remove Pulse at myaccount.google.com/permissions and connect again.')
    }
    await storeTokens(userId, tokens, cfg.config)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  board.searchParams.set('googlehealth', 'connected')
  return NextResponse.redirect(board)
}
