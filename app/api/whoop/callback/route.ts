import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, storeTokens, verifyState, whoopConfig } from '@/lib/whoop'

/**
 * Step two: WHOOP sends the person back here with ?code= and the ?state= we
 * signed in /api/whoop/start.
 *
 * This URL is registered on the WHOOP app itself, so it has to match what was
 * entered there byte for byte — including http vs https and the port.
 *
 * On success the person lands back on their board. On failure they get a plain
 * error response rather than a redirect that pretends everything is fine: a
 * silent bounce back to /app with no connection is the single most confusing
 * way this can fail.
 */
export async function GET(req: NextRequest) {
  const cfg = whoopConfig()
  if ('missing' in cfg) {
    return NextResponse.json(
      { error: 'WHOOP is not configured on this deployment.', missing: cfg.missing },
      { status: 503 },
    )
  }

  const params = req.nextUrl.searchParams
  const board = new URL('/app', req.nextUrl.origin)

  // The person pressed "deny" on WHOOP's consent screen, or WHOOP refused the
  // request. Not an error on our side — send them back with a note.
  const denied = params.get('error')
  if (denied) {
    board.searchParams.set('whoop', 'denied')
    return NextResponse.redirect(board)
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) {
    return NextResponse.json(
      { error: 'WHOOP did not send back a code and state.' },
      { status: 400 },
    )
  }

  const userId = verifyState(state, cfg.config.stateSecret)
  if (!userId) {
    // Forged, tampered with, or simply left sitting on the consent screen for
    // more than fifteen minutes.
    return NextResponse.json(
      { error: 'That connection link is no longer valid. Start the connection again.' },
      { status: 400 },
    )
  }

  try {
    const tokens = await exchangeCode(code, cfg.config)
    await storeTokens(userId, tokens, cfg.config)
  } catch (err) {
    // Surface the real reason. exchangeCode and storeTokens both throw with
    // WHOOP's or Supabase's own wording, and neither ever includes our secret.
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  board.searchParams.set('whoop', 'connected')
  return NextResponse.redirect(board)
}
