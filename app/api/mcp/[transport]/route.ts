import { createMcpHandler } from 'mcp-handler'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { constantTimeEquals, looksLikeJwt, verifyAccessToken } from '../oauth/crypto'
import { MCP_SCOPE, mcpResourceUrl, oauthSecret, originOf, resourceMetadataUrl } from '../oauth/shared'

/**
 * The Vitality Base connector — a personal, single-user MCP server.
 *
 * It lets Claude build and edit your dashboard tiles by talking, with no
 * copy-paste and no redeploy: a tile written here lands in your Supabase `tiles`
 * table, and the dashboard reads it on load (see lib/sync.ts + DashboardGrid).
 *
 * Setup (all one-time):
 *   1. Add your own free Supabase (NEXT_PUBLIC_SUPABASE_URL) and run
 *      supabase/sync.sql + supabase/tiles.sql — the stores the tiles live in.
 *   2. Set SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID. Both tables are scoped
 *      per account with RLS and `anon` revoked, and this connector has no signed-in
 *      browser session to borrow an identity from — so it authenticates as the
 *      service role and states which account it is acting for. OWNER_USER_ID is
 *      your own uuid: Supabase dashboard → Authentication → Users → your row.
 *   3. Set MCP_TOKEN to any long secret string. It's the password for this
 *      connector; without it the endpoint is disabled (503).
 *   4. Connect from Claude Code (bearer token, no OAuth):
 *        claude mcp add --transport http vitality \
 *          https://YOUR-SITE.vercel.app/api/mcp/mcp \
 *          --header "Authorization: Bearer YOUR_MCP_TOKEN"
 *
 * Auth is DUAL:
 *   • Claude Code presents the raw MCP_TOKEN bearer (constant-time compared).
 *   • claude.ai / Claude Desktop / cloud tasks can't send a static bearer, so
 *     they connect via the OAuth 2.1 flow under app/api/mcp/oauth/* and present
 *     a signed access-token JWT here instead. See CONNECTOR.md.
 * A request with no/invalid auth gets a 401 carrying `WWW-Authenticate` with the
 * protected-resource-metadata URL, which is how claude.ai discovers the OAuth AS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE IN THIS FILE — the service role bypasses RLS.
 *
 * `tile_data` and `tiles` are scoped per account: keyed by (user_id, tile_id) /
 * (user_id, slot), row-level security on, `anon` revoked. Every other client in
 * this codebase talks to them through a signed-in browser session, so RLS scopes
 * its queries to the right account automatically and un-scoped code is merely
 * useless. Not here. The service-role key bypasses RLS entirely, so this file
 * gets NO such safety net: an `.eq('user_id', ownerId)` that is missing does not
 * fail — it silently widens to every account on the deployment.
 *
 * So: every read and every write below filters on user_id explicitly, and every
 * insert states it. That filter is the ONLY thing scoping this connector. If you
 * add a tool here, it filters too.
 *
 * This is stage B3 of docs/PLAN.md. The connector stays owner-only for now (one
 * OWNER_USER_ID, not per-user tokens) — see SETUP.md box 6.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLOTS = ['train', 'fuel', 'vitals', 'vee', 'brand', 'peak', 'finance', 'walks'] as const

const MAX_TILE_HTML = 1024 * 1024 // 1MB — one tile can never be pathological
const MAX_TILE_DATA = 512 * 1024 // 512KB — mirrors tileStore's cap so a tile can always load what we save

/* The `me:<slot>` dual-write that used to live here is gone (stage B3).
 *
 * It existed on the belief that "tileStore.saveData writes `me:<slot>`" to
 * tile_data. That was never true. tileStore is localStorage ONLY — it never
 * touches Supabase — and it keys its own storage `vitality:<userId>:tile:<id>:data`,
 * a different scheme entirely. The only writer of tile_data is lib/sync.ts, and
 * it writes the BARE tile_id. So the second row this route wrote, `me:<slot>`,
 * was an orphan: nothing in the app has ever read it.
 *
 * One row per (user_id, tile_id), bare id, matching lib/sync.ts exactly. */

/** Slots whose tiles actually persist data. `vee` is the Mentor — it opens the
 *  mentor page, hosts no sealed tile, and reads no tile_data row; writing there
 *  would land nowhere, so the data tools refuse it up front. */
const DATA_SLOTS = ['train', 'fuel', 'vitals', 'brand', 'peak', 'finance', 'walks'] as const

/** Read exactly what the board reads: the owner's row for this slot. */
async function loadTileData(
  { client, ownerId }: Conn,
  slot: string,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const { data, error } = await client
    .from('tile_data')
    .select('data')
    .eq('user_id', ownerId)
    .eq('tile_id', slot)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, value: data ? (data.data ?? null) : undefined }
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] })
const fail = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }], isError: true })

/** A configured connection: the service-role client, and the account it acts for.
 *  Never one without the other — the id is what scopes every query. */
interface Conn {
  client: SupabaseClient
  ownerId: string
}

/** Read the environment. Returns the connection, or the names of what is missing
 *  — never a half-built object and never a silent default, matching whoopConfig()
 *  in lib/whoop.ts. A tool that gets `missing` back says which variables to set,
 *  because the alternative is a failure whose real cause is invisible. */
function conn(): Conn | { missing: string[] } {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OWNER_USER_ID: process.env.OWNER_USER_ID,
  }
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) return { missing }
  return {
    client: createClient(
      env.NEXT_PUBLIC_SUPABASE_URL as string,
      env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
    ownerId: env.OWNER_USER_ID as string,
  }
}

/** Resolve the connection or hand back the error a tool should return. */
function open(): { conn: Conn } | { err: ToolResult } {
  const c = conn()
  if ('missing' in c) {
    return {
      err: fail(
        `The connector is not fully configured — missing ${c.missing.join(', ')}. ` +
          'Set them in .env.local and on Vercel, then redeploy. See the setup notes at the top of app/api/mcp.',
      ),
    }
  }
  return { conn: c }
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_slots',
      {
        title: 'List dashboard slots',
        description:
          'READ. List the seven dashboard tile slots (train, fuel, vitals, vee, brand, peak, finance) and whether each currently holds a tile.',
        inputSchema: {},
      },
      async (): Promise<ToolResult> => {
        const o = open()
        if ('err' in o) return o.err
        const { data, error } = await o.conn.client
          .from('tiles')
          .select('slot')
          .eq('user_id', o.conn.ownerId)
        if (error) return fail('Could not read the tiles table. Did you run supabase/tiles.sql?')
        const filled = new Set((data ?? []).map((r: { slot: string }) => r.slot))
        return text(SLOTS.map((s) => `- ${s}${filled.has(s) ? ' — filled' : ' — empty'}`).join('\n'))
      },
    )

    server.registerTool(
      'read_tile',
      {
        title: 'Read a tile',
        description:
          'READ. Return the current sealed HTML of a slot so you can edit it. Empty slots return a note.',
        inputSchema: { slot: z.enum(SLOTS) },
      },
      async ({ slot }): Promise<ToolResult> => {
        const o = open()
        if ('err' in o) return o.err
        const { data, error } = await o.conn.client
          .from('tiles')
          .select('html')
          .eq('user_id', o.conn.ownerId)
          .eq('slot', slot)
          .maybeSingle()
        if (error) return fail('Could not read that slot.')
        if (!data) return text(`Slot "${slot}" is empty. Use create_tile to fill it.`)
        return text(data.html as string)
      },
    )

    server.registerTool(
      'create_tile',
      {
        title: 'Create or replace a tile',
        description:
          'WRITE. Put a sealed, self-contained HTML tile into a dashboard slot, replacing any existing tile there (use this to edit too). The HTML MUST be one complete standalone document — all CSS and JS inline, no external requests, no network calls (it runs sandboxed with allow-scripts only). Match the look: near-black background, mint accent #6EE7B7, clean sans headings. To persist data it may call window.Vitality.save(data) / window.Vitality.load(). The tile appears on the dashboard on next reload.',
        inputSchema: {
          slot: z.enum(SLOTS),
          html: z.string().min(1).max(MAX_TILE_HTML).describe('The complete sealed tile HTML document'),
          name: z.string().min(1).max(60).optional().describe('Optional display name'),
        },
      },
      async ({ slot, html, name }): Promise<ToolResult> => {
        const o = open()
        if ('err' in o) return o.err
        // user_id is stated, not defaulted: the table's `default auth.uid()` is
        // null for a service-role request, which has no auth.uid(). The conflict
        // target must name both key columns to match the (user_id, slot) index.
        const { error } = await o.conn.client
          .from('tiles')
          .upsert(
            {
              user_id: o.conn.ownerId,
              slot,
              html,
              name: name ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,slot' },
          )
        if (error) return fail('Could not save the tile.')
        return text(`Saved the "${slot}" tile. Reload your dashboard to see it.`)
      },
    )

    server.registerTool(
      'delete_tile',
      {
        title: 'Clear a tile',
        description:
          'WRITE. Remove the live tile from a slot. The slot reverts to any committed static file, or to empty.',
        inputSchema: { slot: z.enum(SLOTS) },
      },
      async ({ slot }): Promise<ToolResult> => {
        const o = open()
        if ('err' in o) return o.err
        // Both filters are load-bearing. Without the user_id one this deletes
        // that slot for EVERY account on the deployment — the service role has
        // no RLS to stop it.
        const { error } = await o.conn.client
          .from('tiles')
          .delete()
          .eq('user_id', o.conn.ownerId)
          .eq('slot', slot)
        if (error) return fail('Could not clear that slot.')
        return text(`Cleared the "${slot}" slot.`)
      },
    )

    // ── The data lane (BUILD: the sweep pipe). These two tools touch ONLY the
    //    tile_data table — never a tile's HTML — so nothing here can break a
    //    tile. save_data merges by default so an automated sweep can never
    //    clobber history it didn't read first.

    server.registerTool(
      'read_data',
      {
        title: "Read a tile's saved data",
        description:
          "READ. Return the JSON a slot's tile has saved — resolved with the board's own precedence, so this is exactly what the tile renders. Use this BEFORE save_data when you need to append to history. Empty slots return a note.",
        inputSchema: { slot: z.enum(DATA_SLOTS) },
      },
      async ({ slot }): Promise<ToolResult> => {
        const o = open()
        if ('err' in o) return o.err
        const res = await loadTileData(o.conn, slot)
        if (!res.ok) return fail('Could not read tile_data. Did you run supabase/sync.sql?')
        if (res.value === undefined) return text(`No saved data for "${slot}" yet.`)
        return text(JSON.stringify(res.value, null, 2))
      },
    )

    server.registerTool(
      'save_data',
      {
        title: "Write data into a tile's store",
        description:
          'WRITE (data only — never touches tile HTML). File JSON into a slot\'s saved store: the exact data window.Vitality.load() hands the tile, so it renders on next reload. `data` is a JSON string. By default it SHALLOW-MERGES into what\'s already saved (existing keys you don\'t send survive — safe for sweeps that add a day to a date-keyed store). Pass merge:false only when you intend to replace the whole store. Payload capped at 512KB, matching what a tile is allowed to load.',
        inputSchema: {
          slot: z.enum(DATA_SLOTS),
          data: z
            .string()
            .min(1)
            .max(MAX_TILE_DATA)
            .describe('The JSON to save, as a string — e.g. {"2026-07-11":{"hrv":110}}'),
          merge: z
            .boolean()
            .optional()
            .describe(
              'Default true: shallow-merge into the existing object; refuses shape mismatches (e.g. the tile stores an array) instead of clobbering. false = replace the whole store deliberately.',
            ),
        },
      },
      async ({ slot, data, merge }): Promise<ToolResult> => {
        const o = open()
        if ('err' in o) return o.err

        let incoming: unknown
        try {
          incoming = JSON.parse(data)
        } catch {
          return fail('`data` is not valid JSON. Send a JSON string, e.g. {"2026-07-11":{"hrv":110}}.')
        }

        const doMerge = merge !== false
        let next: unknown = incoming
        if (doMerge) {
          const res = await loadTileData(o.conn, slot)
          if (!res.ok) return fail('Could not read tile_data before merging. Did you run supabase/sync.sql?')
          const existing = res.value
          const isObj = (v: unknown): v is Record<string, unknown> =>
            !!v && typeof v === 'object' && !Array.isArray(v)
          if (existing === undefined || existing === null) {
            next = incoming // nothing saved yet — nothing to protect
          } else if (isObj(existing) && isObj(incoming)) {
            next = { ...existing, ...incoming }
          } else {
            // ANY shape mismatch over existing data (array store + object payload,
            // object store + array payload, scalars…) would mean losing history on
            // a default save. Refuse; replacing must be said out loud.
            return fail(
              `"${slot}" already holds ${Array.isArray(existing) ? 'an array' : typeof existing} data and the payload doesn't shallow-merge into it. read_data first, send the full updated value, and pass merge:false to replace deliberately.`,
            )
          }
        }

        const json = JSON.stringify(next)
        if (json.length > MAX_TILE_DATA) {
          return fail('Merged payload exceeds the 512KB tile-data cap; trim old entries before saving.')
        }

        // One row, bare tile_id, exactly what lib/sync.ts writes and syncLoad reads.
        const { error } = await o.conn.client
          .from('tile_data')
          .upsert(
            {
              user_id: o.conn.ownerId,
              tile_id: slot,
              data: next,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,tile_id' },
          )
        if (error) return fail('Could not save tile data. Did you run supabase/sync.sql?')
        return text(
          `Filed into "${slot}" (${doMerge ? 'merged' : 'replaced'}). The tile renders it on next dashboard load.`,
        )
      },
    )
  },
  { serverInfo: { name: 'vitality-base', version: '0.2.0' } },
  { basePath: '/api/mcp', sessionIdGenerator: undefined, disableSse: true },
)

function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/** 401 that tells an OAuth client where to discover the authorization server
 *  (RFC 9728). claude.ai reads `resource_metadata` here, fetches it, then runs
 *  the OAuth flow — that is how it bootstraps a connection with no static token. */
function unauthorized(req: Request): Response {
  const metadata = resourceMetadataUrl(originOf(req))
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${metadata}"`,
    },
  })
}

/** True if the bearer authorizes this request via EITHER path:
 *  the raw MCP_TOKEN (Claude Code) or a valid OAuth access-token JWT (claude.ai). */
function isAuthorized(req: Request, expected: string): boolean {
  const provided = bearerToken(req)
  if (!provided) return false

  // Path 1 — Claude Code: raw shared secret, constant-time.
  if (constantTimeEquals(provided, expected)) return true

  // Path 2 — OAuth: a signed access token bound (aud) to this resource.
  if (looksLikeJwt(provided)) {
    const secret = oauthSecret()
    if (!secret) return false
    const verified = verifyAccessToken(provided, {
      secret,
      expectedAud: mcpResourceUrl(originOf(req)),
    })
    if (verified && verified.scope.split(/\s+/).includes(MCP_SCOPE)) return true
  }

  return false
}

async function handler(req: Request): Promise<Response> {
  const expected = process.env.MCP_TOKEN
  if (!expected) {
    return Response.json(
      { error: 'connector_not_configured', hint: 'Set MCP_TOKEN in your environment to enable the connector.' },
      { status: 503 },
    )
  }
  if (!isAuthorized(req, expected)) return unauthorized(req)
  return mcpHandler(req)
}

export { handler as GET, handler as POST }
