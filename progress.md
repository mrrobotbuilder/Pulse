# Pulse — progress

_Last updated: 2026-08-26 · commit `e672a06` · `main` in sync with `origin/main`_

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
- [ ] 4. Supabase — sync.sql + tiles.sql + the two NEXT_PUBLIC keys OPTIONAL
- [ ] 5. Phone — open the live URL, Share → Add to Home Screen      OPTIONAL
- [ ] 6. The connector — set MCP_TOKEN, `claude mcp add …`          OPTIONAL
- [ ] 7. Live-data keys — your own free YouTube / Finnhub keys      OPTIONAL
```

Boxes 1–3 are done. **Box 4 (Supabase) is the one that matters next** — until
it's ticked, data lives in one browser and the connector and sweeps stay locked.

---

## Environment keys

Checked in local `.env.local` only — I have **not** verified what's set on
Vercel, so production may differ.

| Key | Local | What it unlocks |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | ✅ set | Walks blob storage |
| `VERCEL_OIDC_TOKEN` | ✅ set | Vercel-managed |
| `WALKS_TOKEN` | ❌ not local | STEGA → Pulse walk ingest (must be on Vercel) |
| `NEXT_PUBLIC_SUPABASE_URL` | ❌ | Cloud backup |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ❌ | Cloud backup |
| `ANTHROPIC_API_KEY` | ❌ | AI-polished onboarding wording (optional) |
| `MCP_TOKEN` | ❌ | The Claude connector |
| `YOUTUBE_API_KEY` / `FINNHUB_API_KEY` | ❌ | Live subs / stock prices |

---

## Known issues

**1. `next/font/google` is a build-time single point of failure.**
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

**3. `SETUP.md` doesn't exist** even though CLAUDE.md calls for it as the
running road checklist. This file covers the same ground for now.

**4. One empty commit in history** (`e672a06`) — the deploy retry. Harmless.

---

## Next steps

**Do next (unblocks the most):**
1. **Supabase — box 4.** Create the free project, run `supabase/sync.sql` and
   `supabase/tiles.sql`, turn Email auth on with "Confirm email" OFF, add the two
   `NEXT_PUBLIC_` keys to Vercel and `.env.local`. This gives data that follows
   you across devices and unlocks the connector and sweeps.
2. **Confirm `WALKS_TOKEN` is set on Vercel** — Walks silently shows nothing in
   production without it, and I only checked local env.

**Worth doing soon:**
3. **Self-host the fonts** if the build fails on Google Fonts again — it's a
   known, recurring risk with a clean fix.
4. **Create `SETUP.md`** as the living checklist CLAUDE.md expects.

**Optional / later:**
5. Add `ANTHROPIC_API_KEY` on Vercel to upgrade onboarding wording.
6. Add the board to a phone home screen (box 5).
7. The connector — `MCP_TOKEN` + `claude mcp add` (box 6); needs Supabase first.
8. Live-data keys — YouTube and Finnhub (box 7). TikTok already needs none.

**Known scope not yet touched:** the peak and fuel tiles still render their
template demo contents. The interview personalizes the board *around* them;
rebuilding each tile's interior per user is separate per-tile work.
