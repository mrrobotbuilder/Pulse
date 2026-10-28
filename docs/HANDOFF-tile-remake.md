# Handoff: remake the owner's five AI-built tiles (2026-10-28)

## Where things stand

The redesign is live (commits 7882724 → e5b20da on `main`): goal editor on the
board and the Mentor page, a different hatch for every tile, every built-in tile
and the ready-made template rebuilt on the tile kit (`lib/tiles/tileKit.ts`,
documented in `public/tiles/README.md`), real exercise photos in Train.

The owner checked it on their phone: "Everything looks great", except five
tiles that are still the old design. They are the owner's own AI-written tiles
(the `custom-*` lane: stored in their browser's tile index and in their
Supabase `tiles` table), so the redesign of the built-in files never reached
them:

1. Sugar-free streak
2. Caffeine
3. X followers
4. Deep work
5. Morning routine

(Caveat: Caffeine and Deep work share names with ready-made tiles. Their ids
may be `custom-caffeine` / `custom-deep-work`; `upgradeReadyTiles` only swaps
HTML that carries the ready template's signature, so these AI-written ones were
left alone on purpose.)

## The job

Rebuild each of the five so it matches the other tiles, and keep every byte of
their saved data readable.

For each tile:
1. Read its current HTML and its saved data through the Pulse connector
   (`mcp__pulse__read_tile`, `mcp__pulse__read_data`; `list_slots` lists only
   the fixed slots, so use the custom ids). If the connector cannot reach a
   tile, ask the owner for its id from the board (open the tile: the URL does
   not show it, so read `vitality:<user>:tiles` in DevTools, or use the board's
   ✦ Redesign button as the fallback, see below).
2. Write the new tile by hand on the tile kit, copying the structure of the
   closest ready-made kind in `lib/tiles/readyTiles.ts`:
   - Sugar-free streak and Morning routine: the `check` kind (streak ring,
     28-day dots, "I did it today" / "Not today"). If Morning routine is a
     checklist of several steps, keep its steps as chips that each tick, with
     the ring counting full days.
   - Caffeine and Deep work: the `count` kind (ring against a limit or goal,
     quick-add buttons, 7/30-day bars, stats, log with delete).
   - X followers: like Brand's account card (big count, weekly change, growth
     line, "Log count" sheet), as a single-account tile.
   It must read the EXACT shape the old tile saved (shown by `read_data`) and,
   when saving, keep every key it does not change. Never re-shape the data.
3. Save it with `mcp__pulse__create_tile` on the same id (it replaces the HTML;
   the data lane is separate and untouched). Keep a copy of the old HTML in
   `docs/tile-backups/<id>.html` first, uncommitted if it holds personal text.
4. Check it: the HTML must pass `checkTileHtml` (lib/tiles/tileCheck.ts), then
   open it on the board in a browser and confirm the old entries still show.

Fallback without the connector: the board shows **✦ Redesign** on every
AI-written tile. One tap rebuilds it with the AI (about 7 cents each), keeps the
data, and **Undo redesign** restores the old one.

## Done when

All five open on the board in the kit look (same family as Fuel, Protein, No
sugar), their old entries are visible, logging a new entry saves (close and
reopen to prove it), and the owner says they match.
