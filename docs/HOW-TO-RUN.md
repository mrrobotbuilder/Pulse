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

## Session 8 — Plan the phone coach

Paste:

```
Read docs/PLAN.md, Stage 8. Help me plan the phone health coach: compare a Telegram bot, Grok through an MCP connector, and the Claude mobile app using the connector I already have. Ask me the questions that change the build, then write the plan as a new stage in docs/PLAN.md with its own session in docs/HOW-TO-RUN.md.
```

Done when: Stage 8 has a written plan and its own session here.
