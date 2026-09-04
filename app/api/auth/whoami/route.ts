import { getServerUser } from '@/lib/server/auth'

/**
 * "Who does the SERVER think I am?"
 *
 * The proof that B1 works, and later the quickest way to tell a session bug
 * from a rendering bug: if the board thinks you are signed in and this says
 * null, the cookie is the problem, not React.
 *
 * Returns only the caller's own id and email, read from their own verified
 * session — never another user's, and nothing that isn't already theirs.
 * Signed out is a 200 with `signedIn: false`, because being signed out is a
 * normal state for this app and not an error.
 */

// The answer depends on the caller's cookies, so it must never be cached or
// prerendered — a cached copy would hand one person another person's identity.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const user = await getServerUser()
  return Response.json(
    {
      signedIn: !!user,
      userId: user?.id ?? null,
      email: user?.email ?? null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
