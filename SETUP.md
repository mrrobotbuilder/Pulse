# My road to done

_Living checklist. A box gets ticked the moment the step is finished — nothing
is ticked on prediction. `[x]` means proven; `[~]` means written and building
but not yet provable, with the reason next to it; `[⏸]` means deliberately
parked, with the reason and the condition to resume; `[?]` means the item
itself turned out to be wrong or undecided, with the finding written next to it. Last updated: 2026-09-04._

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
- [x] 6. The connector — set MCP_TOKEN, `claude mcp add …`         OPTIONAL
       → I can file data and build tiles from anywhere; /sweep runs nightly
       PROVEN AGAINST PRODUCTION 2026-09-04, not just against a dev server.
       Registered at USER scope as `pulse` → /api/mcp/mcp, so it is reachable
       from any folder; `claude mcp list` reports ✔ Connected. Through the
       deployed route: tools/list returns all 7, and list_slots + read_data ran
       against the live database (8 slots, all empty — clean). See B3 for the
       write side, and known issue 4 for what nearly went wrong here.
- [ ] 7. Live-data keys — your OWN free YouTube / Finnhub keys     OPTIONAL
       → YouTube subs + live stock prices pull automatically (TikTok needs none)
```

**Where we actually are:** boxes 1–4 done — that is "EVERYTHING completed" on
the original road — plus box 6. 5 and 7 are the remaining bonuses.
Part 2 is the road to a paid product.

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
       makes signup instant while testing; turn back ON before launch - B6a)
- [x] 0e. WALKS_TOKEN confirmed set on Vercel (probed: POST returns 401, not 503;
       GET /api/walks returns the live STEGA log)
```

### Stage A — WHOOP — ⏸ PARKED 2026-09-04 (a decision, not a failure)
```
- [⏸] A0. Register the app at developer.whoop.com                    PARKED
       Blocked on a **WHOOP membership**: developer.whoop.com states "You must
       have a WHOOP membership to develop an app on the Developer Platform.
       Your WHOOP account is also your WHOOP developer login." The credentials
       are behind a purchase, not a form — which is not what this checklist
       said before. With the 10-member cap on unapproved apps (known issue 5),
       WHOOP cannot pay for itself before launch. RESUME WHEN: Pulse is
       launched and taking money from paying members.
- [x] A1a. `whoop_tokens` table live. RLS on with ZERO policies, and anon +
       authenticated revoked — so no browser can read it, only the server's
       service-role key. Probed against the live database: the anon key gets
       401 permission denied on BOTH read and write; service role gets 200.
- [~] A1b. `/api/whoop/start` + `/api/whoop/callback` written; typecheck and
       build clean. Both correctly answer 503 naming the missing variables,
       and the signed `state` round trip passes 9 checks including rejecting a
       validly-signed-but-expired state. The actual OAuth handshake CANNOT be
       tested until A0 supplies a client id and secret.
- [⏸] A2. Scheduled sync pulling recovery / sleep / strain into the vitals tile
- [⏸] A3. The "Connect WHOOP" button wired up, status + disconnect
```
**Nothing is deleted.** The table, both routes and the state signing stay in the
repo and stay green: with no `WHOOP_CLIENT_ID` the routes answer 503 and touch
nothing, so parked code cannot break a deploy or a user's board. Resuming means
buying a membership, doing A0, then finishing A2/A3 — A1 is already paid for.

The vitals tile still prefers a real WHOOP recovery score over its manual
estimate, and still works fine without one. But it renders a **"Connect WHOOP"
button with no handler** (`public/tiles/vitals.html:138`) — acceptable on a
personal board, not on a board people pay for. Tracked as C5.
### Stage B — the service
```
- [x] B0. Namespace all local data per user
       Half the board was already keyed per user (tileStore, tileSkin,
       dashboardChrome); goals, weights, overall/active goal, ideas, the
       noticed feed, the profile, the onboarding flag, scratched and the
       equation layout were bare, so a second account on one browser read
       the first account's board. All of it now goes through the new
       `lib/localScope.ts`, whose one rule is that the bare-key fallback
       read belongs to the `me` namespace ALONE — a bare key predates
       accounts, so it is the owner's own board, and serving it to any other
       userId would be the bleed this exists to stop.
       `lib/migrateLocal.ts` copies the bare keys into `me` once per
       browser: non-destructive (copies, never deletes), never overwrites an
       existing scoped value, refuses to run for a non-`me` namespace.
       PROVEN 2026-09-04 three ways. (1) tsc clean — every one of the 21 call
       sites was found as a type error, not by eye. (2) A harness ran the
       PRE-B0 modules from git HEAD and the POST-B0 modules against
       identically seeded storage: 12 board reads byte-identical on a
       populated legacy board and on an empty one, bare keys intact, a
       different userId gets defaults instead of the owner's board, no
       overwrite, idempotent, survives a throwing localStorage — 16/16.
       (3) A real browser on a dev server: 9 legacy keys planted, reloaded,
       all 9 copied with identical values, all 9 originals still present, and
       the board and /mentor rendered the seeded goal titles and name.
       Vercel build green; / /app /mentor all 200 in production.
- [x] B1. Server-side auth (@supabase/ssr + middleware)
       The session moved from localStorage to COOKIES, so the server can
       finally tell who is asking. Before this, nothing server-side knew you
       at all — fine for a board, fatal for a paywall, since a gate that only
       exists in the browser is one anybody can walk around with JavaScript
       off. `lib/supabaseClient.ts` now uses `createBrowserClient` (same
       exported API, so no call site changed), `middleware.ts` refreshes the
       session on every matched request, and `lib/server/auth.ts` adds
       `getServerUser()` — whose one rule is always `getUser()`, never
       `getSession()`: getSession trusts the cookie, and a cookie is
       client-controlled. `/api/auth/whoami` reports your own id back.
       The matcher skips static files and the token-authed routes (/api/mcp,
       /api/walks, /api/whoop/sync, /api/stripe — the Stripe webhook verifies
       a signature over the RAW body, so session middleware there is a hazard,
       not just waste).
       ONE-TIME COST, expected: a session saved before this was localStorage,
       not a cookie, so IT DOES NOT CARRY OVER. Sign in once more on each
       device. Board data is untouched — only the session moved.
       PROVEN 2026-09-04 against the live Supabase with a throwaway account
       created and then deleted: signed out -> whoami false, no session
       cookie; signed in through the real form -> session cookie set, ZERO
       sb-* keys left in localStorage, and the SERVER independently resolved
       that account's exact uid and email; /app -> /mentor kept the session
       server-side; sign out -> cookie gone, whoami false, board still fine
       signed out. Excluded routes unaffected (/api/mcp 401, /api/walks 200,
       /api/whoop/start 503). Vercel green; same seven checks pass in
       production. The test account was deleted — one user in the project,
       the owner.
- [x] B2. Real user ids replace the hardcoded "me"
       /app and /mentor now resolve the uid from the cookie session on the
       SERVER, so who you are is settled before the first byte of HTML — no
       flash of one account's board before another's. Signed out still gets
       `me`, the anonymous/demo namespace, because the board is meant to work
       with no account at all. Both routes are dynamic now, necessarily: a
       cached copy of either would serve one person's board to everyone.
       The part worth knowing: `claimDemoBoard()` hands this browser's `me`
       board to the account that signs in, so nobody watches their goals,
       tiles, skins and layout vanish the moment they make an account. Done
       naively that REOPENS the B0 leak — `me` is copied, not deleted, so A
       claims it, signs out, and B signs in on the same browser and inherits
       A's board. A claim marker (`vitality:me:claimed-by`) stops that: the
       first account to sign in owns it, and the copy is refused for anyone
       else. B gets a clean account, which is correct — the anonymous board
       was A's work, not a shared asset.
       PROVEN 2026-09-04 two ways. (1) A 22-check harness: A inherits goals,
       profile, tiles, skins and chrome; `me` survives; B is REFUSED and sees
       defaults (75kg, not A's 91kg); repeat claims no-op; nothing is
       overwritten; markers are never copied as board data; a pre-accounts
       board still reaches a signed-in account in one call. (2) A real browser
       with TWO throwaway accounts against the live Supabase: anonymous board
       seeded → signed in as A, six keys copied under A's real uid, `me`
       intact, board unchanged → signed out, signed in as B, and B saw NEITHER
       A's goal NOR A's name → signed out, anonymous board back. Both
       throwaway accounts deleted; one user in the project, the owner.
       Vercel green; production smoke test unchanged.
- [x] B3. Per-user tiles table + close the open anon policy          SECURITY
       Database half done 2026-08-26 (both tables keyed per account, RLS on,
       anon revoked). Connector half done 2026-09-03: the MCP route now uses
       the SERVICE ROLE key, scopes every read and write to OWNER_USER_ID, and
       the phantom `me:<slot>` dual-write is gone.
       PROVEN 2026-09-04 against the live Supabase, driven through the real
       route in a running dev server. All seven tools exercised end to end:
       list_slots, read_tile, create_tile, delete_tile, read_data, save_data,
       delete_data. The writes that used to be dead now land and read back.
       A filtered read finding the row it had just written is also proof the
       row carries the right user_id — the scoping works, not just the write.
       save_data's merge was checked too: a second save under a different date
       kept the first, rather than replacing the store.
       Every test was reversible and reversed. Both tables were verified empty
       before and after — 8 slots empty / 0 filled in `tiles`, all 7 data slots
       clear. Nothing of the owner's was touched.
- [ ] B4. Stripe: checkout, customer portal, webhook → subscriptions table
- [ ] B5. 14-day trial, then the paywall; upgrade screen
- [ ] B6a. Launch hardening — **NOT parked, required before charging.** Rate-
       limit the auth routes, turn Supabase email confirmation ON for real
       signups, auth-or-scope `GET /api/walks`, and drop the `OWNER_USER_ID`
       fallback from request paths (the MCP connector keeps it by design).
- [⏸] B6b. Multi-user WHOOP sync — parked with Stage A.
```

### Stage C — make it good for users
```
- [x] C1. A landing page at / (the board moved to /app; PWA opens the board)
- [?] C2. "Finish the peak and fuel tiles (still template demo content)"
       THE PARENTHETICAL IS WRONG — checked 2026-09-04 by rendering both with
       an empty store. Neither shows template demo content:
       · `fuel` is deliberately minimal. Its own header says "almost nothing,
         on purpose… everything else this tile could become (macros, meals,
         caffeine) gets built WITH the mentor, on top of this." It saves real
         data through the bridge and draws its week from it. With no data it
         reads "0 of 8 today" with a "+ Log a glass" button — a working empty
         state, not a placeholder.
       · `peak` has an EMPTY demo object (weightKg 75, everything else blank)
         and real math. It was never showing fake numbers.
       So there is nothing to un-fake. What is left is a PRODUCT decision, not
       a bug, and it is yours: does `fuel` stay a one-number starter (macros
       and meals arrive per-episode, built with the mentor as designed), or
       does a paid product ship it fuller on day one? Left unticked and
       deliberately undecided rather than silently rewriting a tile whose
       comment says minimal is the point.
- [ ] C3. Phone / PWA polish (box 5)
- [x] C4. Empty states — what a brand-new account sees on day one
       Audited all 8 tiles with an empty store 2026-09-04. Seven already told
       you the one thing to do next — train "Today is unwritten — add an
       exercise to begin", vee "The void is empty. Drop your first thought",
       walks "No walks logged yet. Plan one in STEGA…", finance "add accounts
       or stocks and the net-worth line draws itself", fuel "+ Log a glass",
       brand a per-account message, vitals its input card.
       `peak` was the one dead end: "NOT ENOUGH DATA TO BUILD" at 55% opacity
       named the problem and hid the fix. Its refusal to draw is RIGHT — a
       curve with no personal data is a generic baseline dressed as insight —
       so the honesty stayed and the next step was added: "NOTHING TO PLOT YET
       / Log sleep and how you feel in Vitals — this curve builds itself from
       that. Caffeine logs and plans sharpen it." Vitals is named because it
       is the hardwired input: sleep + feel reshape the curve on the next
       refresh, with no sweep and no connector.
       Verified by rendering, not by reading the diff.
- [x] C5. Hide the dead "Connect WHOOP" button while Stage A is parked
       `public/tiles/vitals.html` gated it behind `const WHOOP_ENABLED=false`
       rather than deleting it: everything behind that button still exists and
       Stage A resumes by flipping one line. The tile still prefers a real
       `whoopRecovery` over its manual estimate — that path is untouched and
       works the moment data arrives. Verified in a browser: button gone, the
       sleep and feel inputs still work.
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
| `WHOOP_CLIENT_ID` / `_SECRET` | ⏸ parked — needs a membership | Stage A, after launch |
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
2. ~~The **peak** and **fuel** tiles still render template demo contents.~~
   **NOT TRUE — checked 2026-09-04 by rendering both with an empty store.**
   `fuel` is minimal by deliberate design (its own header: "almost nothing,
   on purpose") and saves real data; `peak`'s demo object is empty and its
   math is real. Neither ever showed fake numbers. This line had been repeated
   into C2 as if it were a defect — see C2 for the product decision that is
   actually left.
3. **`vercel env pull` prints `[SENSITIVE]` as the *value* of any variable
   marked Sensitive** — it is a redaction marker, not what is stored. This
   already cost one session: `SUPABASE_SERVICE_ROLE_KEY` was read back as the
   literal 11-character string `[SENSITIVE]` and written up as a broken
   placeholder key in production. It was never broken. To check a sensitive
   variable is really set, probe a route that reports its own missing env
   instead — e.g. `curl -X POST .../api/whoop/start` returns 503 listing
   exactly what is absent, and the service-role key is not in that list.
4. **A 401 from a protected route proves it is deployed — not that your token
   works.** Box 6 sat on that mistake: `/api/mcp/mcp` answered 401 without a
   bearer (rather than 503), which was read as "the connector is live and
   configured". It was live — but the `MCP_TOKEN` on Vercel and the one in
   `.env.local` were **different values**, so a correct-looking client would
   have been refused with exactly the same 401. Nobody had tested the passing
   case. Fixed 2026-09-04: both ends now hold the production token. Always
   probe with a *good* credential and require a 200, not merely a rejection of
   the empty case.
5. **WHOOP has two gates, and the plan only knew about one.** (a) Registering
   an app at all requires a WHOOP *membership* — your WHOOP account is the
   developer login, so there is no free developer tier to start from. (b) An
   unapproved app is capped at **10 WHOOP members**, not "registered test
   users" as `docs/PLAN.md:200` puts it — so subscriber #11 could not connect
   a band. Lifting the cap needs WHOOP approval: API Terms of Use compliance,
   a privacy-policy URL in their dashboard, Design/Brand guideline compliance,
   and proof of testing with at least one real member. No published timeline.
   Together these are why Stage A is parked until after launch.
