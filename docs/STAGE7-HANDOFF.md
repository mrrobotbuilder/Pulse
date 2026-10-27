# Stage 7 handoff (2026-10-27, session cut off by usage limit)

## Done
- **7a, committed (096cdb7, not pushed):** CSP meta in `withBridge` (`TILE_CSP`, placed right after the doctype, before any tile markup) + `frame-src 'none'` header on `/app` (`next.config.mjs`) to stop self-navigation exfil. `node --no-warnings scripts/check-tiles.mjs http://localhost:3005` passes: 8 existing tiles work, planted tile sends 0 requests (unlocked copy: 9, page control: 1), 3 navigation tricks blocked.
- **7b, committed as WIP (not pushed, tsc not run yet):**
  - `lib/tiles/tileCheck.ts` + test: `isCustomTileId`, `customTileId`, `checkTileHtml` (60 KB, doctype, no external script/resource, blocked tags, network/navigation/storage/eval, must call Pulse.save + Pulse.load, inline scripts must parse; linear patterns). `node --test lib/tiles/tileCheck.test.mjs` 11/11; timing test proven to fail on a quadratic pattern.
  - `lib/tiles/tileStats.ts`: `custom-*` summarizer for `{ unit, entries: [{ at, value }] }` (+ test).
  - `lib/boardPlan.ts` `setTileShown`: accepts custom ids and keeps their weight through later restores/removes (+ test, 13/13).
  - `useTileHost` READABLE allows custom ids; `Tile.tracks`; `lib/tiles/customTiles.ts` (list/save/fold remote); `lib/sync.ts`: `RemoteTile.updatedAt`, and `syncWipe` no longer deletes `tiles` rows ("every card stays").

## Left
1. `app/app/DashboardGrid.tsx`: merge custom tiles into `filled` (local index + `foldRemoteCustomTiles`), name/tracks map, `label()`/`info()` inside the component, row order includes custom ids, stats refresh, re-read on `pulse:layout`. Then run `CUSTOM=1 node scripts/check-tiles.mjs`.
2. MCP route: slot schema accepts `CUSTOM_TILE_RE`; list_slots shows custom rows.
3. `app/api/tiles/generate/route.ts`: spec `{name, tracks, why}` (LIMITS caps), same caps (`takeBuild`, owner uncapped), Sonnet 5.5 via the personalize route's call pattern, structured `{ html }`, max_tokens ~8000, ~90 s timeout, `checkTileHtml` before returning; failure = `{ fallback, reason }` and the spec stays an idea. Save contract in the prompt: `Pulse.save({ unit, entries: [{ at, value }] })`.
4. `lib/aiBoard.ts`: `built` per idea title (ready/failed/added/declined), `autoBuild` true only on new records (max 2 from `plan.newTiles`), `buildTile`, `acceptTile` (customTileId, saveCustomTile, setTileShown with the plan weight, append to `eq:order`, dispatch `pulse:layout`), `declineTile`, event `pulse:aiboard`.
5. `BoardReasoning.tsx`: per idea "Build me one for this", status line, preview card (sandboxed iframe, `withBridge`, labelled "not kept"), "Add to my board" / "Not for me".
6. Verify: check-ai `tiles` mode with mock model (ok, external script rejected, fetch rejected, caps), 3 real-model tiles used in the browser (save, reload, data there), tsc, push, live check (watch the 3/IP/day cap).
