import Dashboard from './Dashboard'
import { site } from '@/content/site'
import { DEMO_USER_ID } from '@/lib/localScope'
import { getServerUserId } from '@/lib/server/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard · Pulse',
}

// The board itself. It used to live at "/" — "/" is now the landing page, so
// the dashboard moved here and the PWA start_url follows it (app/manifest.ts).
// localStorage is keyed by ORIGIN, not path, so every existing board survived
// the move untouched.
//
// The board is now rendered AS somebody. The uid comes from the cookie
// session on the server (B1), so it is settled before the first byte of HTML
// rather than after React mounts — which is what stops the board flashing one
// account's data before switching to another's.
//
// Signed out is not an error: `me` is the anonymous/demo namespace and the
// board is meant to work without an account at all. Signing in later hands
// that anonymous board to the account (see claimDemoBoard).
//
// Reading cookies makes this route dynamic, which is required and not an
// oversight: a cached copy of this page would serve one person's board to
// everyone.
export default async function Page() {
  const userId = await getServerUserId()
  return <Dashboard firstName={site.name || null} userId={userId ?? DEMO_USER_ID} />
}
