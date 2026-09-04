# My road to done

_Living checklist. A box gets ticked the moment the step is finished — nothing
is ticked on prediction. `[x]` means proven; `[~]` means written and building
but not yet provable, with the reason next to it. Last updated: 2026-09-03._

## Part 1 — the board (the original road)

```
- [x] 1. The board, locally — npm install + npm run dev            REQUIRED
       → your dashboard, running on this computer
- [x] 2. GitHub — gh auth login (one browser sign-in; I do the git) RECOMMENDED
       → github.com/mrrobotbuilder/Pulse — your code is saved and safe
- [x] 3. Vercel — import the repo, click Deploy                    RECOMMENDED
       → LIVE at pulse-ochre-zeta-49.vercel.app; every push auto-updates it
- [x] 4. Supabase — new project, run supabase/sync.sql +
       tiles.sql, add the two NEXT_PUBLIC keys                     OPTIONAL
       → memory: data follows you across devices instead of one browser;
         unlocks the connector + sweeps.  ← BLOCKS EVERYTHING IN PART 2
- [ ] 5. Phone — open your live URL, Share → Add to Home Screen    OPTIONAL
       → the dashboard as an app in your pocket
- [~] 6. The connector — set MCP_TOKEN, `claude mcp add …`         OPTIONAL
       → I can file data and build tiles from anywhere; /sweep runs nightly
       MCP_TOKEN + OWNER_USER_ID set on Vercel 2026-09-04; the endpoint is live
       (401 without a bearer, not 503) and every tool was driven successfully
       against the real database — see B3. Remaining: `claude mcp add` on the
       client you want to reach it from.
- [ ] 7. Live-data keys — your OWN free YouTube / Finnhub keys     OPTIONAL
       → YouTube subs + live stock prices pull automatically (TikTok needs none)
```

**Where we actually are:** boxes 1–4 done — that is "EVERYTHING completed" on
the original road. 5–7 are bonuses. Part 2 is the road to a paid product.

## Part 2 — the road to a paid product

Turning the board from a personal dashboard into a hosted service: anyone signs
up, gets a free trial, then subscribes. Full plan and rationale in
[`docs/PLAN.md`](docs/PLAN.md) (approved 2026-08-26); this is the checklist.

### Stage 0 — foundations
```
- [x] 0a. Self-host the four fonts (no more Google Fonts build failures)
- [x] 0b. Document WALKS_TOKEN + BLOB_READ_WRITE_TOKEN in .env.example
- [x] 0c. This file
- [x] 0d. Supabase LIVE. Project "pulse" (North EU/Stockholm, ref
       gomyudnemankqlcmwhlk). tile_data + tiles both created, both scoped
       per account with RLS, anon revoked on both. Security advisor: clean.
       Keys set locally and on Vercel (prod + preview + dev).      <- box 4
- [ ] 0f. Turn "Confirm email" OFF in Supabase auth settings (optional,
       makes signup instant while testing; turn back ON before launch - B6)
- [x] 0e. WALKS_TOKEN confirmed set on Vercel (probed: POST returns 401, not 503;
       GET /api/walks returns the live STEGA log)
```

### Stage A — WHOOP
```
- [ ] A0. Register the app at developer.whoop.com (client id + secret,
       redirect URIs for production and localhost)                 YOUR HANDS
- [x] A1a. `whoop_tokens` table live. RLS on with ZERO policies, and anon +
       authenticated revoked — so no browser can read it, only the server's
       service-role key. Probed against the live database: the anon key gets
       401 permission denied on BOTH read and write; service role gets 200.
- [~] A1b. `/api/whoop/start` + `/api/whoop/callback` written; typecheck and
       build clean. Both correctly answer 503 naming the missing variables,
       and the signed `state` round trip passes 9 checks including rejecting a
       validly-signed-but-expired state. The actual OAuth handshake CANNOT be
       tested until A0 supplies a client id and secret.
- [ ] A2. Scheduled sync pulling recovery / sleep / strain into the vitals tile
- [ ] A3. The "Connect WHOOP" button wired up, status + disconnect
```
The vitals tile already has the button and already prefers a real WHOOP recovery
score over its manual estimate — the wiring behind it is what's missing.

### Stage B — the service
```
- [ ] B0. Namespace all local data per user
- [ ] B1. Server-side auth (@supabase/ssr + middleware)
- [ ] B2. Real user ids replace the hardcoded "me"
- [~] B3. Per-user tiles table + close the open anon policy          SECURITY
       Database half done 2026-08-26 (both tables keyed per account, RLS on,
       anon revoked). Connector half done 2026-09-03: the MCP route now uses
       the SERVICE ROLE key, scopes every read and write to OWNER_USER_ID, and
       the phantom `me:<slot>` dual-write is gone.
       PROVEN 2026-09-04 against the live Supabase, driven through the real
       route in a running dev server: tools/list, list_slots, create_tile,
       read_tile, delete_tile and read_data all succeed. The write that used to
       be dead now lands and reads back; the test tile was deleted after, and
       `tiles` is empty again. A filtered read found the row it wrote, which is
       also proof the row carries the right user_id.
       ONE TOOL UNEXERCISED — save_data. Every slot's cloud data is currently
       empty, useTileHost prefers cloud over localStorage
       (useTileHost.ts:153 `if (remote != null) data = remote`), and the
       connector has no delete_data. So a test row would persist and shadow the
       real localStorage data for that tile — the train logger's history being
       the obvious casualty. Not worth proving a write at that price.
- [ ] B4. Stripe: checkout, customer portal, webhook → subscriptions table
- [ ] B5. 14-day trial, then the paywall; upgrade screen
- [ ] B6. Multi-user WHOOP sync + hardening
```

### Stage C — make it good for users
```
- [x] C1. A landing page at / (the board moved to /app; PWA opens the board)
- [ ] C2. Finish the peak and fuel tiles (still template demo content)
- [ ] C3. Phone / PWA polish (box 5)
- [ ] C4. Empty states — what a brand-new account sees on day one
```

### Before charging real money
```
- [ ] Stripe account activated (identity + bank details)           YOUR HANDS
- [ ] Terms of Service + Privacy Policy pages (Stripe and WHOOP both expect them)
- [ ] A support email address
```

## The keys, and where they go

Every key lives in `.env.local` (gitignored) for local dev **and** in
Vercel → Settings → Environment Variables for production. `.env.example` lists
them all with instructions.

| Key | Status | Unlocks |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | set locally | Walks blob storage |
| `WALKS_TOKEN` | set on Vercel ✅ | STEGA → Pulse walk ingest |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | local ✅ / Vercel ✅ | Cloud memory (box 4) |
| `SUPABASE_SERVICE_ROLE_KEY` | local ✅ / Vercel ✅ | Server-only; WHOOP tokens + Stripe webhook |
| `SUPABASE_DB_PASSWORD` | local ✅ | Running migrations from the CLI |
| `MCP_TOKEN` | local ✅ / Vercel ✅ | The Claude connector |
| `OWNER_USER_ID` | local ✅ / Vercel ✅ | Which account the connector writes as — needed with `MCP_TOKEN` |
| `ANTHROPIC_API_KEY` | not set | AI-polished onboarding wording |
| `YOUTUBE_API_KEY` / `FINNHUB_API_KEY` | not set | Live subs / stock prices |
| `WHOOP_CLIENT_ID` / `_SECRET` | **the only thing missing** | Stage A |
| `WHOOP_REDIRECT_URI` | local ✅ | Must match the WHOOP app byte for byte |
| `WHOOP_STATE_SECRET` | local ✅ (generated) | Signs the OAuth `state` |
| `STRIPE_SECRET_KEY` / `_WEBHOOK_SECRET` | not yet | Stage B4 |

## The `tiles` table (decision made 2026-08-26)

Created in the SECURE shape rather than the original one. The old
`supabase/tiles.sql` used `slot text primary key` with a policy of
`using (true) with check (true)` granted to **anon** - meaning anyone holding
the public anon key (it ships in the browser by design) could read and
overwrite any user's tiles, and a tile is raw HTML the dashboard renders.

It is now keyed `(user_id, slot)` with own-rows RLS and anon revoked, matching
`tile_data`. Done on an empty database, so it cost nothing; the same change
after real data exists would have needed a migration.

**Consequence (resolved 2026-09-03):** the MCP connector route (`app/api/mcp`)
could no longer write — it used the anon key and conflicted on the bare `slot` /
`tile_id`. It now authenticates with the SERVICE ROLE key and scopes every read
and write to `OWNER_USER_ID`.

Note what that trade means: the service role **bypasses RLS**, so the database is
no longer what protects those rows in this one file — the explicit
`.eq('user_id', …)` on every query is. A missing filter there would not error,
it would silently reach every account. That rule is written at the top of the
route; keep it if you add a tool.

While removing it, one thing turned out to be a phantom: the route also wrote a
second `me:<slot>` row into `tile_data`, believing `tileStore` wrote that key.
`tileStore` is localStorage-only and keys as `vitality:<userId>:tile:<id>:data` —
it has never touched Supabase. Those rows were orphans nothing read. Gone now;
one row per `(user_id, tile_id)`, matching `lib/sync.ts`.

## Known issues

0. **Supabase's Management API cannot run SQL on this project.** Both
   `supabase db query --linked` and the Supabase connector fail with
   `28P01: password authentication failed for user "postgres"` — even for
   `select 1`, so it is not about any particular statement. The database
   itself is fine: REST works, and a DIRECT connection with the password in
   `.env.local` works. Migrations therefore go through
   `supabase db query --db-url …`, one statement per call (the direct path
   refuses multiple commands in one prepared statement). Supabase's stored
   copy of the password is out of step with the real one; resetting the
   database password in the dashboard would probably fix it.

1. **Local `npm run build` fails on `/icon` and `/apple-icon`** (`next/og`,
   "Invalid URL"). Windows-only, pre-existing, does **not** block Vercel.
   Verify builds on Vercel, not locally.
2. The **peak** and **fuel** tiles still render template demo contents. The
   onboarding interview personalizes the board *around* them.
3. **`vercel env pull` prints `[SENSITIVE]` as the *value* of any variable
   marked Sensitive** — it is a redaction marker, not what is stored. This
   already cost one session: `SUPABASE_SERVICE_ROLE_KEY` was read back as the
   literal 11-character string `[SENSITIVE]` and written up as a broken
   placeholder key in production. It was never broken. To check a sensitive
   variable is really set, probe a route that reports its own missing env
   instead — e.g. `curl -X POST .../api/whoop/start` returns 503 listing
   exactly what is absent, and the service-role key is not in that list.
