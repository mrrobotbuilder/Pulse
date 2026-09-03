<!--
  Recovered 2026-09-03 from the Claude Code session transcript where it was
  approved. Until now this plan existed ONLY inside
  ~/.claude/projects/C--Users-User-Projects-pulse/*.jsonl — a local file that no
  backup covers and that closing a terminal was feared to have destroyed.
  SETUP.md referenced "the approved plan document" with nothing to point at.
  It is in git now so that never happens again.

  Approved: 2026-08-26 12:53. Body below is verbatim — not re-summarised.
  SETUP.md is the live checklist; this is the reasoning behind it.
-->

# Pulse → paid product: WHOOP sync + hosted SaaS

## Context

Pulse is a live single-user life dashboard (Next.js 14.2.35, 8 sealed tiles,
Vercel auto-deploy, localStorage-primary with an optional Supabase mirror that
is written but not yet connected). The goal of this plan:

1. Make the site more effective for users (UX + the known rough edges).
2. Integrate the **WHOOP band** ("WAP" was voice-dictation) so recovery/sleep
   data syncs into the board automatically.
3. Take it from personal project to a **hosted SaaS**: anyone signs up, gets a
   **free trial, then a hard paywall** via **Stripe subscriptions**, with
   Supabase as the multi-user backend.

User decisions already made: device = WHOOP · model = hosted SaaS (one site,
one codebase) · paywall = trial then hard paywall.

## Verified facts

**WHOOP API v2** (checked at developer.whoop.com, 2026-08-26): OAuth2
auth-code flow — auth `https://api.prod.whoop.com/oauth/oauth2/auth`, token
`https://api.prod.whoop.com/oauth/oauth2/token`; `offline` scope required for
refresh tokens, which **rotate** on every refresh (refreshes must be
serialized); v2 REST endpoints for recovery/sleep/cycles(strain)/workouts/
profile; webhooks exist; redirect URI registered in the WHOOP dev dashboard;
an app-approval process exists for production use.

**Codebase** (explored + independently re-verified by the design pass):
- Walks pattern = the template for any external data: server route holds the
  payload → `app/app/Dashboard.tsx` (~line 441) fetches on mount →
  `tileStore.saveData(userId, slot, …)` → sealed tile reads `window.Pulse.load()`.
- `public/tiles/vitals.html` already has a dead "Connect WHOOP" button
  (`data-whoop`, line 138, no handler) and the data contract is already coded:
  `{ 'YYYY-MM-DD': { sleepHours, feel, whoopRecovery? } }` with `whoopRecovery`
  winning over the manual `0.6·feel + 0.4·sleep` estimate (vitals.html:107,
  docs/THE-MATH.md §5). Tile-side work is mostly done.
- `supabase/sync.sql` (`tile_data`) is already multi-tenant-correct (own-rows
  RLS). `supabase/tiles.sql` (`tiles`, slot PK, open anon policy) is the
  biggest multi-user blocker.
- Single-user hardcodings: `app/page.tsx` passes `userId="me"`; MCP route uses
  one deployment-wide token + `OWNER_SUBJECT='owner'` and dual-writes
  `<slot>`/`me:<slot>` rows; profile/goals/weights localStorage un-namespaced.
- Auth is client-side only (`lib/auth.ts`, anon key); no `@supabase/ssr`, no
  `middleware.ts`. No Stripe code anywhere — greenfield.
- Adding a tile slot touches: `lib/tiles/coreTiles.tsx`, `READABLE` in
  `lib/tiles/useTileHost.ts`, `SLOTS`/`DATA_SLOTS` in the MCP route.

## Key architecture decisions

1. **WHOOP tokens in a service-role-only table** (`whoop_tokens`: RLS on, zero
   policies, zero grants) — refresh tokens are per-user secrets; anything the
   browser anon key can reach is off-limits for them.
2. **Refresh rotation serialized by compare-and-swap** — `UPDATE … WHERE
   refresh_token = $old RETURNING *`; 0 rows ⇒ someone else rotated, re-read.
   Write the new token *before* using it so a crash never orphans the grant.
3. **WHOOP data flows through the walks pattern** — Vercel cron pulls
   recovery/sleep/strain into a `whoop_data` table (service-role writes,
   own-rows select); Dashboard fetches `/api/whoop/data` on mount and merges
   `whoopRecovery` per date into the existing vitals lane. Manual entries are
   only filled, never overwritten.
4. **Connect button stays in the sealed tile** — new outbound bridge message
   (`pulse:action` → `whoop-connect`) routed by `useTileHost` to the OAuth URL.
5. **`OWNER_USER_ID` env is the migration keystone** — resolves "who am I"
   before SSR auth exists, backfills `tiles.user_id`, anchors MCP, and keeps
   the owner's live board working (and permanently entitled) at every stage.
6. **Plain Stripe account** (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`),
   Checkout + Customer Portal + webhook. Subscription truth lives in a
   `subscriptions` table written **only** by the webhook via service role;
   clients can only read their own row. Never trust client-asserted entitlement.
7. **Trial → hard paywall, no card up front**: at signup the server creates a
   `subscriptions` row with `status='trialing'`, `trial_ends_at = now()+14d`
   (length configurable). `isEntitled()` = owner OR unexpired trial OR
   Stripe-active. When not entitled, the dashboard is replaced by an upgrade
   screen (server-gated, not just hidden). Anonymous visitors get the landing
   page + the existing local `me` demo board as the marketing surface —
   explicitly labeled a demo, no cloud, no device sync, no AI.
8. **Local data migration is copy-on-first-sign-in** — `vitality:me:*` copied
   (never moved) to `vitality:<uid>:*` behind a one-time marker.

## Stages

### Stage 0 — Foundation hardening (do first, small, all independently shippable)
- **Connect Supabase (box 4)**: create the project, run `supabase/sync.sql` +
  `tiles.sql`, Email auth on ("Confirm email" OFF for now), add the two
  `NEXT_PUBLIC_` keys to Vercel + `.env.local`. Everything below needs this.
- **Verify `WALKS_TOKEN` on Vercel** (Walks silently empty in prod without it).
- **Self-host the four fonts** via `next/font/local` (`app/fonts/` already has
  woffs) — kills the known transient build-killer.
- **Create `SETUP.md`** (the living checklist CLAUDE.md expects) and document
  `WALKS_TOKEN`/`BLOB_READ_WRITE_TOKEN` in `.env.example`.
- Verify: deploy goes green with no Google Fonts fetch; Walks renders in prod.

### Stage A — WHOOP integration (independent of B; owner-only at first)
Prereq: register the app in the WHOOP Developer Dashboard (redirect URIs for
prod + localhost). Env: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`,
`WHOOP_STATE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `CRON_SECRET`.

- **A1 — OAuth connect + token store.** New: `supabase/whoop.sql`
  (`whoop_tokens`, service-role-only), `lib/server/supabaseAdmin.ts`,
  `lib/server/whoop.ts` (exchange/refresh with CAS, v2 fetchers),
  `app/api/whoop/connect/route.ts` (signed-state, uid from Supabase JWT else
  `OWNER_USER_ID`), `app/api/whoop/callback/route.ts`.
  Verify: complete OAuth in a browser; token row appears.
- **A2 — Cron sync + data lane.** New: `whoop_data` table (pk `(user_id,
  date)`, recovery/sleep_hours/strain/raw), `app/api/whoop/sync/route.ts`
  (`CRON_SECRET`-authed; refresh-if-expiring, pull trailing ~14 days),
  `vercel.json` cron (~30 min; confirm the plan on team `oriad` allows the
  cadence), `app/api/whoop/data/route.ts`, and a Dashboard mount effect beside
  the walks one that merges `whoopRecovery` (+ gap-fill `sleepHours`) into the
  vitals lane, loop-guarded by a synced-at marker.
  Verify: invoke sync manually → rows appear → reload board → the vitals
  recovery ring shows the device number via the existing precedence path.
- **A3 — Button + status + disconnect.** Wire `data-whoop` through a new
  `pulse:action` bridge message (`tileBridge.ts` + `useTileHost.ts`); tile
  shows "Connected · synced Xh ago" from a `whoopStatus` field the merge
  writes; `app/api/whoop/disconnect/route.ts` deletes the token row.
  Verify: full click-through on the deployed board; disconnect clears.

### Stage B — SaaS conversion (each sub-stage shippable; owner's board never breaks)
- **B0 — Namespace everything.** Add userId to the modules owning
  `vitality:profile`, goals/weights, `vitality:scratched` (with legacy-key
  fallback reads); new `lib/migrateLocal.ts` (copy `me:*` → `<uid>:*`, once).
  Verify: board byte-identical before/after.
- **B1 — Server-side auth layer.** Add `@supabase/ssr`; `lib/supabaseClient.ts`
  → `createBrowserClient` (cookie sessions — owner re-signs-in once);
  `middleware.ts` for session refresh (matcher excludes token-authed routes:
  `/api/mcp`, `/api/walks`, `/api/whoop/sync`, `/api/stripe/webhook`);
  `lib/server/auth.ts` → `getServerUser()`.
  Verify: a whoami check returns uid; signed-out board unchanged.
- **B2 — Thread real userId.** `app/page.tsx` resolves the session uid, runs
  the local migration, passes it to `<Dashboard>`; `"me"` remains the
  anonymous demo namespace. WHOOP routes prefer `getServerUser()`.
  Verify: owner signs in and sees their data; incognito gets a fresh demo.
- **B3 — `tiles` multi-tenant + MCP cleanup** (the security-urgent one; can be
  pulled forward right after B1). Migration: add `user_id` (backfill with
  `OWNER_USER_ID`), pk `(user_id, slot)`, drop the open policy, own-rows RLS,
  revoke anon. MCP route writes via `supabaseAdmin` as the owner; delete the
  `<slot>`/`me:<slot>` dual-write. `lib/sync.ts` upserts on `(user_id, slot)`.
  Verify: owner's connector tiles still render; a second account sees none;
  anon key can no longer read `tiles`.
- **B4 — Stripe plumbing** (not yet gating). `app/api/stripe/checkout/route.ts`
  (subscription-mode Checkout, customer keyed by uid), `…/portal/route.ts`,
  `…/webhook/route.ts` (raw-body signature verify; upserts `subscriptions` via
  service role on checkout/subscription events), `supabase/billing.sql`
  (`subscriptions`: status, price_id, current_period_end, `trial_ends_at`;
  own-row select only). Signup handler seeds the trial row.
  Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
  `NEXT_PUBLIC_SITE_URL`.
  Verify: full Stripe **test-mode** loop — test card → `active`; portal cancel
  → webhook flips the row; `stripe listen` locally.
- **B5 — Trial gate + upgrade UI.** `lib/entitlements.ts` (client + server
  `isEntitled()`: owner ∥ unexpired trial ∥ active); server-gated dashboard —
  signed-in-but-lapsed users land on an upgrade screen with Checkout + Portal
  links and days-remaining banner during trial; `syncEnabled()`, WHOOP
  connect/data, and AI routes all require entitlement.
  Verify: test account through the whole lifecycle — trial works → force
  `trial_ends_at` into the past → hard gate → pay (test mode) → unlocked.
  Owner unaffected throughout.
- **B6 — Multi-user WHOOP + hardening.** Cron iterates all `whoop_tokens`
  rows; drop `OWNER_USER_ID` fallbacks from request paths (keep for MCP);
  rate-limit auth routes; turn Supabase email confirmation ON for real
  signups; `/api/walks` GET gets auth or per-user scoping.
  Verify: two accounts, two WHOOP connections, zero data bleed.

### Stage C — Effectiveness / UX pass (parallel to B, prioritized after Stage 0)
- **Landing page**: the site currently boots straight into the board. A hosted
  SaaS needs a front door — what Pulse is, screenshots, pricing, "Try the
  demo" (the `me` board), "Start free trial" (signup). New `app/(marketing)`
  route group so the app itself moves cleanly behind auth in B5.
- **Finish the two template tiles**: peak and fuel still render the template
  author's demo content — rebuild their interiors to personalize from the
  interview answers like the rest of the board.
- **Phone/PWA (box 5)**: manifest + icons verified, Add-to-Home-Screen
  instructions surfaced in the UI; confirm 375px layout holds on real devices.
- **Empty states**: every tile should look intentional with zero data on a
  brand-new account (first thing every trial user sees).

## Ordering

Stage 0 → A1–A3 (WHOOP visible on your own board fast) → B0–B3 (multi-user
foundations; B3 early) → C landing page → B4–B5 (billing + gate) → B6 + rest
of C. Each stage deploys green on its own; the owner's live board keeps
working at every point.

## Risks / open items

- **WHOOP app approval**: until WHOOP approves the app for production, only
  registered test users can connect — fine for Stage A, must be resolved
  before public launch. Vercel preview URLs can't be registered redirect URIs;
  connect works on prod + localhost only.
- **Trial length & price**: defaulted to 14 days; price is set in the Stripe
  dashboard (`STRIPE_PRICE_ID`) — both changeable without code.
- **Business prerequisites** (user-side, before charging real money): Stripe
  account activation (identity/bank), Terms of Service + Privacy Policy pages
  (WHOOP approval and Stripe both expect them), and a support email.
- **Last-write-wins merge window**: the Dashboard's vitals merge writes the
  whole blob; a concurrent manual edit in the same seconds could lose a field
  (risk already exists in `syncSave`). Accepted for now.
- **B1 session move** (localStorage → cookies) requires one owner re-sign-in.
- **MCP stays owner-only** for now; per-user connector tokens are future work.
- Windows-local `npm run build` still fails on `/icon` (`next/og`) — known,
  pre-existing, does not block Vercel; verify deploys on Vercel, not locally.

## Verification (end-to-end definition of done)

1. Deploy green with self-hosted fonts; Walks live in prod.
2. Your own WHOOP connected: recovery ring in vitals shows the device number
   after a cron cycle, verified in the live browser.
3. Stripe test-mode lifecycle proven: signup → trial banner → expiry → hard
   gate → test payment → unlock → portal cancel → gate returns.
4. Two-account isolation test: second (non-owner) account sees no owner tiles,
   no owner data, no owner WHOOP; anon key denied on `tiles`.
5. Landing page live; demo board reachable; 375px clean.
