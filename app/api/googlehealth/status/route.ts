import { NextRequest, NextResponse } from 'next/server'
import { adminClient, userFromBearer } from '@/lib/whoop'
import { googleHealthConfig } from '@/lib/googlehealth'

/** Is this account connected? Returns a boolean and a date, never a token. */
export async function GET(req: NextRequest) {
  const cfg = googleHealthConfig()
  if ('missing' in cfg) {
    return NextResponse.json(
      { error: 'Google Health is not configured on this deployment.', missing: cfg.missing },
      { status: 503 },
    )
  }
  const userId = await userFromBearer(req, cfg.config)
  if (!userId) return NextResponse.json({ error: 'Sign in to Pulse first.' }, { status: 401 })

  const { data, error } = await adminClient(cfg.config)
    .from('googlehealth_tokens')
    .select('connected_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 502 })
  return NextResponse.json({ connected: !!data, connectedAt: data?.connected_at ?? null })
}
