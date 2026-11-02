import { NextRequest, NextResponse } from 'next/server'
import { userFromBearer } from '@/lib/whoop'
import { accessTokenFor, fetchWatchData, googleHealthConfig } from '@/lib/googlehealth'

/**
 * The board calls this on load to pull the owner's Fitbit data. Sealed tiles
 * have no network, so the board fetches here and hands the result to the tiles
 * through the tile-data lane (see lib/watchSync.ts).
 *
 *   401  not signed in to Pulse
 *   409  signed in but no Fitbit connected (expected; the board stays quiet)
 *   503  Google Health is not configured on this deployment (also expected)
 *   502  Google refused; the message is shown. `expired: true` means the grant is dead
 *        and only a new sign-in fixes it (the board then shows "expired" in the Sync panel)
 */
export async function GET(req: NextRequest) {
  const cfg = googleHealthConfig()
  if ('missing' in cfg) {
    return NextResponse.json({ error: 'Google Health is not configured on this deployment.', missing: cfg.missing }, { status: 503 })
  }
  const userId = await userFromBearer(req, cfg.config)
  if (!userId) return NextResponse.json({ error: 'Sign in to Pulse first.' }, { status: 401 })

  try {
    const token = await accessTokenFor(userId, cfg.config)
    if (!token) return NextResponse.json({ connected: false }, { status: 409 })
    return NextResponse.json({ connected: true, ...(await fetchWatchData(token)) })
  } catch (err) {
    const msg = (err as Error).message
    // Google answers invalid_grant when the refresh token is dead: expired (7 days
    // in Testing mode), revoked, or unused for 6 months. Only a new sign-in fixes it.
    const expired = /invalid_grant/.test(msg)
    return NextResponse.json(
      { error: expired ? 'Your Fitbit connection expired. Open the Sync panel and press Reconnect Fitbit.' : msg, expired },
      { status: 502 },
    )
  }
}
