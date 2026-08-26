# My road to done

_Living checklist. A box gets ticked the moment the step is finished — nothing
is ticked on prediction. Last updated: 2026-08-26._

## Part 1 — the board (the original road)

```
- [x] 1. The board, locally — npm install + npm run dev            REQUIRED
       → your dashboard, running on this computer
- [x] 2. GitHub — gh auth login (one browser sign-in; I do the git) RECOMMENDED
       → github.com/mrrobotbuilder/Pulse — your code is saved and safe
- [x] 3. Vercel — import the repo, click Deploy                    RECOMMENDED
       → LIVE at pulse-ochre-zeta-49.vercel.app; every push auto-updates it
- [ ] 4. Supabase — new project, run supabase/sync.sql +
       tiles.sql, add the two NEXT_PUBLIC keys                     OPTIONAL
       → memory: data follows you across devices instead of one browser;
         unlocks the connector + sweeps.  ← BLOCKS EVERYTHING IN PART 2
- [ ] 5. Phone — open your live URL, Share → Add to Home Screen    OPTIONAL
       → the dashboard as an app in your pocket
- [ ] 6. The connector — set MCP_TOKEN, `claude mcp add …`         OPTIONAL
       → I can file data and build tiles from anywhere; /sweep runs nightly
- [ ] 7. Live-data keys — your OWN free YouTube / Finnhub keys     OPTIONAL
       → YouTube subs + live stock prices pull automatically (TikTok needs none)
```

**Where we actually are:** boxes 1–3 done. **Box 4 (Supabase) is the gate** —
until it is ticked, data lives in one browser, and none of Part 2 can be built.

## Part 2 — the road to a paid product

Turning the board from a personal dashboard into a hosted service: anyone signs
up, gets a free trial, then subscribes. Full plan and rationale in the approved
plan document; this is the checklist.

### Stage 0 — foundations
```
- [x] 0a. Self-host the four fonts (no more Google Fonts build failures)
- [x] 0b. Document WALKS_TOKEN + BLOB_READ_WRITE_TOKEN in .env.example
- [x] 0c. This file
- [ ] 0d. Supabase project created + sync.sql/tiles.sql run + keys set   ← box 4
- [x] 0e. WALKS_TOKEN confirmed set on Vercel (probed: POST returns 401, not 503;
       GET /api/walks returns the live STEGA log)
```

### Stage A — WHOOP
```
- [ ] A0. Register the app at developer.whoop.com (client id + secret,
       redirect URIs for production and localhost)                 YOUR HANDS
- [ ] A1. OAuth connect + callback; tokens in a service-role-only table
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
- [ ] B3. Per-user tiles table + close the open anon policy          SECURITY
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
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | not set | Cloud memory (box 4) |
| `MCP_TOKEN` | not set | The Claude connector |
| `ANTHROPIC_API_KEY` | not set | AI-polished onboarding wording |
| `YOUTUBE_API_KEY` / `FINNHUB_API_KEY` | not set | Live subs / stock prices |
| `WHOOP_CLIENT_ID` / `_SECRET` | not yet | Stage A |
| `STRIPE_SECRET_KEY` / `_WEBHOOK_SECRET` | not yet | Stage B4 |

## Known issues

1. **Local `npm run build` fails on `/icon` and `/apple-icon`** (`next/og`,
   "Invalid URL"). Windows-only, pre-existing, does **not** block Vercel.
   Verify builds on Vercel, not locally.
2. The **peak** and **fuel** tiles still render template demo contents. The
   onboarding interview personalizes the board *around* them.
