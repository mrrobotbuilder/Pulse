---
name: "source-command-sweep"
description: "Migrated source command `sweep`"
---

# source-command-sweep

Use this skill when the user asks to run the migrated source command `sweep`.

## Command Template

# /sweep — file the inbox into the dashboard

You are the mentor doing your rounds. Sweep `~/vitality-inbox/` and file
everything into the dashboard's data stores. Works manually or from a
scheduled (cron) session — same prompt either way.

## Socials first — the auto-updates (best-effort, skip quietly on failure)

1. `read_data` on `brand`. For each account in `accounts`:
   - **tiktok** — fetch the public endpoint (no key):
     `curl -s "https://www.tikwm.com/api/user/info?unique_id=<handle-without-@>" -H "User-Agent: Mozilla/5.0"`
     → `data.stats.followerCount`. It's unofficial: any error, missing field,
     or nonsense number (0 when they had thousands) → skip it, say so, move on.
   - **youtube** — only if they've given you a YouTube Data API key (it may be
     in `.env.local` as `YOUTUBE_API_KEY`): channels endpoint →
     `statistics.subscriberCount`.
   - other platforms: no auto lane — screenshots in the inbox cover them.
2. Append a snapshot to that account's `history`: `{t:<now ms>,count:<n>}`.
   NEVER rewrite or trim history — append only. Skip the append if the last
   snapshot is under 12h old (one point a day is the rhythm).
3. `save_data` the updated `{accounts:[...]}` back to `brand` (default merge).
4. **Mirror vitals → peak:** if today's `vitals` entry has data, compute
   recovery with the EXACT shared formula — identical to the vitals tile AND to
   Peak's own client-side read, so all three agree (see docs/THE-MATH.md §5):
     whoopRecovery present → round(whoopRecovery)   (a device wins outright)
     else: feel  → clamp(0..100, feel)        · weight 0.6
           sleep → clamp01(sleepHours/8)·100   · weight 0.4
     recovery = round( Σ(partᵢ·wᵢ) / Σwᵢ ), clamped 1..99
   then `save_data` `{whoop:{recovery:<n>}}` into `peak`. Peak already
   re-derives this live on load — your write just keeps it fresh while they're
   away. Never round differently or add a term: matching the tile is the point.

## The routine

1. List `~/vitality-inbox/`. If it doesn't exist or is empty, say so and stop —
   never create it yourself.
2. For each file (screenshot, CSV, text note, export):
   - Read it and extract what it actually contains. Typical lands:
     - sleep / HRV / recovery numbers → `vitals`
     - caffeine, water, meals → `fuel`
     - workouts, sets, sessions → `train`
     - subscriber / revenue / analytics numbers → `brand`
     - spending, balances → `finance`
   - **Read before you write:** call `read_data` for the slot, look at the
     shape the tile actually stores, and match it. Date keys are local time
     `YYYY-MM-DD`.
   - File it with `save_data` (default merge — never replace unless the user
     explicitly asked). One save per slot per sweep is plenty; batch a file's
     numbers into one payload.
3. Move each processed file to `~/vitality-inbox/done/` (create `done/` if
   needed). Leave anything you couldn't confidently parse in place and say why.
4. Close with a two-line report: what you filed where, what you skipped.

## Hard rules

- Data only. NEVER call `create_tile`/`delete_tile` from a sweep.
- Never invent numbers. If a screenshot is ambiguous, skip it and say so.
- If the connector isn't configured (no MCP tools available), stop and tell
  them what's missing (MCP_TOKEN / Supabase / supabase/sync.sql) — don't
  improvise another write path.
- If they mention weights/goals changed by the new data, that's a separate
  conversation — surface it, don't silently retune during a sweep.
- Saves are last-writer-wins: don't sweep while they're actively logging in
  the dashboard (schedule sweeps for night).
