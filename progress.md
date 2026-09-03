# Pulse — progress

_Last updated: 2026-09-03 · commit `ca42145`_

> **[`SETUP.md`](SETUP.md) is the source of truth for where the project stands.**
> This file is the narrative of what was built and why. It fell a week out of
> date once (it still claimed box 4 was pending after Supabase had gone live) —
> if the two ever disagree again, believe SETUP.md.
> The approved plan behind it all is [`docs/PLAN.md`](docs/PLAN.md).

---

## Where the board lives

| | |
|---|---|
| **Live (public)** | https://pulse-ochre-zeta-49.vercel.app |
| **Live (team-scoped)** | `pulse-oriad.vercel.app` — sits behind Vercel SSO, bounces you to a login |
| **Repo** | https://github.com/mrrobotbuilder/Pulse |
| **Vercel project** | `pulse` (team `oriad`) — auto-deploys on every push to `main` |
| **Local dev** | `npm run dev` (used port 3005 last session; 3000 is another project) |

---

## What's built

### The host app
Next.js 14 App Router dashboard, rebranded from the `vitality-base` template to
Pulse. Tile bridge aliased so `window.Pulse` and `window.Vitality` both work —
tiles written against either name run unchanged.

### The tiles (8 installed)
`train` · `fuel` · `vitals` · `peak` · `brand` · `finance` · `vee` · `walks`

- **Train** — the self-contained workout logger (sessions, PRs, kg, exercise
  library, scrubbable chart). Built first, before the host app existed.
- **Walks** — fed from STEGA (separate app), not logged on this board.

### Cloud backup (commit `fd941e7`)
Email + password auth via Supabase, with Row Level Security locking every row to
`auth.uid()`. localStorage stays the always-on device fallback — signed-out and
unconfigured behavior is identical to having no cloud at all. SQL lives in
`supabase/sync.sql` (tile data) and `supabase/tiles.sql` (connector-built tiles).

### The Walks / STEGA integration (commits `ac00090`, `87e57f6`, `4727000`)
Sealed tiles can't fetch, so the split is: `app/api/walks/route.ts` holds the log
in a Vercel Blob, `Dashboard.tsx` fetches it on mount and writes it into the
tile-data lane, and `walks.html` reads it back through the normal bridge.
Guarded by a `WALKS_TOKEN` bearer compared in constant time.

### The onboarding interview (commit `e267052`) — newest
The board no longer opens on the template author's life. First visit runs a
6-step interview — name and body basics, the big dream, 2–4 focus areas each with
a real target, a priority, and a look — then rebuilds the whole board around
those answers: goals, the gold overall goal, tile weights, the mentor's welcome
notice, and suggested tiles.

- **Nothing was deleted.** Train, kg, PRs, and the mentor all work exactly as
  before — only the identity behind them changes.
- **Works with zero setup.** `lib/onboarding.ts` maps answers to a full
  personalization deterministically, for free, instantly.
- **Optional AI polish.** `app/api/personalize/route.ts` asks Claude to rewrite
  the *wording* when `ANTHROPIC_API_KEY` is set; returns 503 and falls back
  silently otherwise. Onboarding never blocks on a network call.
- Visitors can skip to the demo board, or redo the interview later from the gear
  → **Make it yours** → **Redo the interview**.

Verified live in a browser: interview renders in production, personalization
applies end-to-end, skip path leaves the demo untouched, redo resets cleanly,
Train bridge still fires, no console errors, no horizontal overflow at 375px.

---

## The road — where we actually are

```
- [x] 1. The board, locally — npm install + npm run dev            REQUIRED
- [x] 2. GitHub — repo live at mrrobotbuilder/Pulse                RECOMMENDED
- [x] 3. Vercel — deployed, auto-deploys on push                   RECOMMENDED
- [x] 4. Supabase — sync.sql + tiles.sql + the two NEXT_PUBLIC keys OPTIONAL
- [ ] 5. Phone — open the live URL, Share → Add to Home Screen      OPTIONAL
- [ ] 6. The connector — set MCP_TOKEN, `claude mcp add …`          OPTIONAL
- [ ] 7. Live-data keys — your own free YouTube / Finnhub keys      OPTIONAL
```

Boxes 1–4 are done — "EVERYTHING completed" on the original road. 5–7 are
bonuses. Box 6 (the connector) additionally needs the stage B3 rework before it
can work: the MCP route still writes with the anon key, which `tiles` no longer
accepts. See SETUP.md → "The `tiles` table".

The live road now continues in [`SETUP.md`](SETUP.md) Part 2 — the staged plan
to a paid product.

---

## Environment keys

**The key table lives in [`SETUP.md`](SETUP.md) → "The keys, and where they go".**

It used to be duplicated here, and the copy went stale — this file spent a week
claiming the Supabase keys were unset after they had been live in production.
One table, one place. Short version: everything the board needs today is set,
and `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` are the only things missing.

---

## Known issues

**1. ~~`next/font/google` is a build-time single point of failure.~~ FIXED
(commit `a356d76`)** — all four faces are now self-hosted from `app/fonts/*.woff2`
via `next/font/local`; the live CSS contains zero references to Google. The
original problem, for the record:
`app/layout.tsx` fetches four Google fonts at build time (Inter, Instrument
Serif, Hanken Grotesk, JetBrains Mono). If any one fetch fails, the whole
Vercel build dies:

```
An error occurred in `next/font`.
TypeError: Cannot read properties of null (reading '1')
```

This already happened once — the deploy at `4727000` failed on it. A retry with
**zero source changes** went green (`e672a06`), confirming it was a transient
`fonts.googleapis.com` failure, not a code defect. It can recur.
**Durable fix if it does:** self-host the four faces via `next/font/local`
(`app/fonts/` already holds local woff files) and drop the network dependency.

**2. Local `npm run build` fails on `/icon` and `/apple-icon`** with
`next/og` "Invalid URL". Windows-only, pre-existing, does **not** block Vercel
deploys. Ignore it locally.

**3. ~~`SETUP.md` doesn't exist~~ FIXED (commit `09d9b9e`)** — `SETUP.md` is now
the living road checklist, and carries the staged plan to a paid service.

**4. One empty commit in history** (`e672a06`) — the deploy retry. Harmless.

---

## Next steps

**Do next (unblocks the most):**
1. **Register the WHOOP app — stage A0.** `developer.whoop.com`, client id +
   secret, redirect URIs for production and localhost. This is the single thing
   blocking Stage A: the routes, the token table and the signed `state` round
   trip are all written and tested, and cannot be proven end to end without it.
   Production also still needs `WHOOP_REDIRECT_URI` and `WHOOP_STATE_SECRET`
   pushed to Vercel — both exist locally, neither is set on production.
2. ~~**Supabase — box 4**~~ **DONE** — project live, both tables scoped per
   account with RLS, anon revoked, keys set locally and on Vercel.
3. ~~Confirm `WALKS_TOKEN` on Vercel~~ **DONE** — probed in production: POST with
   a bad bearer returns 401 (not the 503 the route emits when the env is
   missing), and GET returns the real STEGA log.

**Worth doing soon:**
3. ~~Self-host the fonts~~ **DONE** — verified on the live site.
4. ~~Create `SETUP.md`~~ **DONE** — see `SETUP.md` for the current road.

**Optional / later:**
5. Add `ANTHROPIC_API_KEY` on Vercel to upgrade onboarding wording.
6. Add the board to a phone home screen (box 5).
7. The connector — `MCP_TOKEN` + `claude mcp add` (box 6). Supabase is no longer
   the blocker; the **stage B3 rework is**. Setting `MCP_TOKEN` today would take
   the route from "inert 503" to "authenticates, then fails every write on RLS".
   Do B3 first.
8. Live-data keys — YouTube and Finnhub (box 7). TikTok already needs none.

**Known scope not yet touched:** the peak and fuel tiles still render their
template demo contents. The interview personalizes the board *around* them;
rebuilding each tile's interior per user is separate per-tile work.
