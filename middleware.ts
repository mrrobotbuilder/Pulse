import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Keeps the Supabase session alive across server requests.
 *
 * Access tokens are short-lived. In the old localStorage world the browser
 * refreshed them itself and the server never knew or cared. Now that the
 * session lives in cookies, something has to refresh those cookies on the way
 * through and write them back on the response — otherwise the session quietly
 * expires and the user is signed out mid-visit for no visible reason. That is
 * this file's whole job.
 *
 * Two things here are load-bearing and look like noise if you skim:
 *
 *  1. `response` is REASSIGNED inside setAll. The refreshed cookies have to end
 *     up on the response that is actually returned, so the response is rebuilt
 *     from the mutated request. Setting cookies on a stale response object is
 *     the classic way to get "random logouts" with this library.
 *
 *  2. Nothing is allowed between createServerClient and getUser(). getUser() is
 *     what triggers the refresh; code in between (especially anything that
 *     returns early) can leave a half-refreshed session in the cookies.
 */

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Supabase is optional — with no keys the app is purely local, and there is
  // no session to refresh. Pass the request straight through.
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        // The library hands us no-store headers alongside the cookies. Without
        // them a CDN could cache a response carrying one person's session
        // cookie and serve it to somebody else.
        for (const [key, val] of Object.entries(headers ?? {})) {
          response.headers.set(key, val)
        }
      },
    },
  })

  // Refreshes the token when it is near expiry and, via setAll above, writes
  // the new cookies onto the response. Do not add code above this line.
  await supabase.auth.getUser()

  return response
}

export const config = {
  /**
   * Everything except static assets and the routes that authenticate
   * themselves with a token rather than a session cookie:
   *
   *   /api/mcp        — bearer MCP_TOKEN or a signed OAuth JWT
   *   /api/walks      — bearer WALKS_TOKEN from STEGA
   *   /api/whoop/sync — the scheduled sync (parked with Stage A, excluded now
   *                     so it is not forgotten when Stage A resumes)
   *   /api/stripe     — the webhook, which verifies a Stripe signature over the
   *                     RAW body; running session middleware over it risks the
   *                     body being touched and the signature failing
   *
   * Those callers carry no cookies, so refreshing a session for them is pure
   * overhead — and for the Stripe webhook it is an actual hazard.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|api/mcp|api/walks|api/whoop/sync|api/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
}
