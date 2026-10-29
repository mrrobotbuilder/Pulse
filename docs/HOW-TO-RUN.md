# How to run the Pulse v2 plan

The plan is `docs/PLAN.md`. This file is how to run it: one fresh Claude Code
session per stage, a prompt you paste as-is, and the line that tells you the
stage is done.

## One-time setup

1. Run: `cd C:\Users\User\Projects\pulse`
2. Run: `npm install`
3. Run: `git pull` (another session may have shipped something)

Nothing else is needed until Stage 5.

## Before Stage 5 — the Anthropic key (your hands, about 3 minutes)

1. Open https://console.anthropic.com → **API Keys** → **Create Key**. Name it `pulse`. Copy it.
2. In the same console, open **Limits** and set a **monthly spend limit** (10 dollars is plenty to start). This is the real backstop if anything goes wrong.
3. Run: `pwsh -File scripts/set-anthropic-key.ps1` and press Enter.
4. Wait until you see `Paste your Anthropic key (nothing shows while you paste)`.
5. Then paste and press Enter. Nothing appears while you paste; that is normal.
6. You should see `Saved to .env.local (length …)` and `Added to Vercel production`.

The key never shows on screen and is never committed (`.env*` is gitignored).

## Rules for every session

- One stage per session. When a stage ends, start a fresh session for the next.
- Every session starts by reading `docs/PLAN.md` and `docs/HOW-TO-RUN.md`.
- Before committing or pushing, run `orca terminal list --json` and check no other
  agent terminal is working in this folder. If one is, tell it what you're doing.
- Pushing to `main` deploys to production. Verify on the live site after each push.
- Dev server port: 3005. Check it is free first; never kill a server you didn't start.

---

## Session 1 — Strip the product

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 1 (Strip the product) exactly as written. Remove pricing, Stripe hooks, trial and billing copy, the SaaS docs and the Patreon / Design Lab promos; keep the Rowan & Luke credit lines, accounts, sync, the connector and the parked WHOOP code. Run the stage's verify steps, commit, push, and check the live landing page. End with a one-line summary and "start a fresh session for Stage 2".
```

Done when: the live `/` has no pricing section, and the grep in the verify step comes back clean.

## Session 2 — Pick a design direction (you choose)

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 2 (Pick a design direction). Make three distinct directions for the board, the intro and the landing page as static mockups in docs/design/, each with its own theme tokens and 4 to 6 readable theme presets. Show me screenshots at 375px and 1440px, write docs/DESIGN.md, then STOP and ask me to pick.
```

Done when: you have picked a direction and `docs/DESIGN.md` names your choice.

## Session 3 — Apply the redesign

Paste:

```
Read docs/PLAN.md, docs/HOW-TO-RUN.md and docs/DESIGN.md, then run Stage 3 (Apply the redesign) using the direction I picked. Tokens in globals.css, theme presets, tiles inherit the theme through withBridge, a theme picker in the gear. Run every verify step, commit, push, and show me screenshots of the live board.
```

Done when: you have seen the live board's screenshots and said it is right.

## Session 3b — Live numbers on the tiles

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 3b (Live numbers on the tiles). First read each tile's own save format and show me the headline number you plan for each tile, and wait for my OK. Then build the summarizers, put the live numbers on the tile faces, run every verify step, commit, push, and show me screenshots of the live board.
```

Done when: you have seen the live board showing real numbers on the tiles.

## Session 4 — The deep intro

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 4 (The deep intro, no AI yet). First show me the final question list and wait for my OK, then build it. The rule-based board must still work for every answer. Run every verify step, commit, push, and check it on the live site.
```

Done when: you have approved the questions, and three made-up people each got a sensible board on the live site.

## Session 5 — The AI builds the board

Before this session: do "Before Stage 5 — the Anthropic key" above.

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 5 (The AI builds the board). Load the claude-api skill before writing any code and take the Sonnet 5.5 model id, structured-output syntax and price from it. Build the caps table and every server-side guard, then run every verify step including each fault injection, commit, push, and run one build on the live site.
```

Done when: three personas get three different boards live, and every fault injection still produced a valid board.

## Session 6 — "Why your board looks like this"

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 6 (Why your board looks like this): the reveal screen after an AI build, the reasoning room in the gear with restore and remove on every tile, and undo the whole AI board. Run every verify step, commit, push, and check it live.
```

Done when: restore, remove and undo all survive a reload on the live site.

## Session 7 — The AI writes new tiles

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 7 (The AI writes new tiles). Harden the sandbox with the CSP first and prove the 8 existing tiles still work, then the custom slots, the generation route with its validator, and the preview step. Run every verify step, including the planted fetch tile and the external-script spec, commit, push, and check it live.
```

Done when: three generated tiles work on the live site, and the planted tile's network calls are blocked.

## Session 8 — Plan the phone coach (done 2026-10-28)

Planned: Stage 8 in `docs/PLAN.md` (Grok first behind a probe, Telegram only if
it fails). Run Session 8a next.

## Before Session 8a (your hands, about 2 minutes)

1. On your phone: the Grok app installed and signed in to the account with SuperGrok.
2. On your phone and on the PC: be able to sign in to the live board
   (https://pulse-ochre-zeta-49.vercel.app/app) with your own account.
3. Keep the phone next to you for the whole session: steps happen on it.

## Session 8a — Real data, the `today` tool, the Grok probe

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 8a (Real data in the cloud, a today tool, the Grok probe) step by step. Step 1 first: find out why the connector reads no data and fix the root cause, guiding me through any sign-in on the phone. Then build the today tool, write docs/coach-prompt.md and wait for my OK on it, then walk me through the Grok probe one click at a time, waiting for me after each. Copy MCP_TOKEN to my clipboard without printing it. Record which probe steps passed and the decision in docs/PLAN.md, commit, push, and check the today tool on the live site.
```

Done when: the result line is written under Stage 8a in `docs/PLAN.md`. If Grok
passed, the real proof comes the next morning: a 07:30 push from Grok with a
real board number, and you skip Session 8b. If Grok failed, run Session 8b.
Start a fresh session either way.

## Before Session 8b (only if Grok failed; your hands, about 3 minutes)

1. In Telegram, open a chat with **@BotFather** and send `/newbot`.
2. Give it a name (for example `Pulse Coach`) and a username ending in `bot`.
3. BotFather replies with a token. Leave that chat open; the session will ask
   for the token through a hidden prompt, never in the chat.

## Session 8b — Telegram coach (only if 8a's probe failed)

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 8b (Telegram coach). The Grok probe in Stage 8a failed; read its result line first. Load the claude-api skill before writing code and check Vercel's cron limits for this project at the source. Write scripts/set-telegram.ps1 and walk me through running it for the BotFather token, then find my chat id after I send /start. Build the shared board helpers, the webhook with secret check, chat allow-list and update_id dedupe, the daily cron, and the message cap. Run every verify step including each fault injection, commit, push, and test it live from my phone.
```

Done when: the bot answered "what did I log today" with a real number on your
phone, a logged lunch showed on the board, and the next morning's message
arrived on its own.

## Before Session 9a (your hands, about 10 minutes)

1. YouTube key (skip if you already added one): console.cloud.google.com →
   create a project → APIs & Services → Library → enable **YouTube Data API v3**
   → Credentials → **Create credentials → API key**. Leave the page open; the
   session asks for the key through a hidden prompt.
2. X developer account: sign in at **console.x.com** with your X account →
   create an app → add a payment card and a small credit (5 dollars is plenty
   to start) → open the app's keys and generate a **Bearer token**. Leave it
   open; the session asks for it through a hidden prompt, never in the chat.
3. Be able to open your Supabase project's **SQL editor** (supabase.com →
   your project → SQL editor). If the project shows "paused", press Restore.

## Session 9a — Brand tracks YouTube, TikTok and X by itself

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 9a (Hourly counts for YouTube, TikTok and X, and the growth view) step by step. Check the X API price and endpoint at docs.x.com first and ask me before turning on hourly if a lookup costs well above 1 cent. Write scripts/set-x-token.ps1 and walk me through it, copy supabase/brand.sql to my clipboard for the SQL editor, build the collector, the hourly Supabase tick, the /api/brand merge and the new Brand tile, then ask me before deleting the old X followers tile. Run every verify step including each fault injection, commit, push, and check it live on my phone.
```

Done when: the Brand tile on your phone shows today's curve drawn by two hourly
checks you did not trigger, and the X followers tile is merged in.
Start a fresh session for 9b.

## Before Session 9b (your hands, about 10 minutes)

1. In the Instagram app: Settings → Account type and tools → switch to a
   **Creator** account (free, reversible).
2. Sign in at **developers.facebook.com** with the Facebook account linked to
   that Instagram, and accept the developer terms.

## Session 9b — Instagram on Brand

Paste:

```
Read docs/PLAN.md and docs/HOW-TO-RUN.md, then run Stage 9b (Instagram). Check every Meta name and permission in Meta's current docs before building. Walk me through creating the Meta app and adding me as a tester one click at a time, waiting after each. Build the Connect button and sign-in like the WHOOP flow, store the token server-only, refresh it before expiry, and add Instagram to the hourly collector. Run every verify step including the forced token expiry, commit, push, and check it live on my phone.
```

Done when: your Instagram count moved on the Brand tile across two hourly
checks on its own.
