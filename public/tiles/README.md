# Tile slots — the connector

Your dashboard has fixed tile **slots**. A slot is empty until a file exists at:

```
public/tiles/<slot>.html
```

When that file exists, its tile on the dashboard becomes "filled" — clicking the
tile opens the file live in a sandboxed frame. When it's missing, clicking the tile
shows the "how to build this" panel instead.

## The slots

| Slot id  | Tile     | File                       |
|----------|----------|----------------------------|
| `train`  | Train    | `public/tiles/train.html`  |
| `fuel`   | Fuel     | `public/tiles/fuel.html`   |
| `vitals` | Vitals   | `public/tiles/vitals.html` |
| `vee`    | Vee      | `public/tiles/vee.html`    |
| `brand`  | Brand    | `public/tiles/brand.html`  |
| `peak`   | Peak     | `public/tiles/peak.html`   |
| `finance`| Finance  | `public/tiles/finance.html`|

## The tile format

Each slot file is **one self-contained HTML file**: all CSS and JS inline, no
external requests. It runs in a sandboxed frame with `allow-scripts` and no
same-origin access, so it has no network and cannot use localStorage. To match the
look, colour it with the board's theme variables, always with a fallback, so the tile follows the board's theme preset: `var(--pulse-bg, #EEF1F4)` page, `var(--pulse-surface, #FFFFFF)` panels, `var(--pulse-text, #16233B)` text, `var(--pulse-muted, #4F5B6D)` secondary text, `var(--pulse-line, #C3CCD8)` lines, `var(--pulse-accent, #C2271D)` accent with `var(--pulse-accent-ink, #FFFFFF)` on it, `var(--pulse-gold, #855600)` for the main goal, `var(--pulse-signal, #08734A)` for live details. Never hardcode a colour (the board injects these at mount; see `lib/tiles/tileBridge.ts`).

### Saving data

A tile persists its data through the host bridge, which the dashboard provides. Do
not use localStorage (it is blocked in the sealed frame). Just call:

```js
// inside your tile
await window.Vitality.save(myData)         // persist
const data = await window.Vitality.load()  // read it back, returns [] when empty
```

By default this saves in the browser. If the dashboard owner has added a Supabase
project (see the main README), the same calls sync across devices with no change to
your tile.

## Two ways to fill a slot

1. **A Patreon episode.** Drop the episode's command into `.claude/commands/` and run
   it in Claude Code (e.g. `/logger`). It writes the exact slot file for you.
2. **Build your own.** Run `/tile <slot>` (see `.claude/commands/tile.md`), or ask
   Claude Code to "build a `<slot>` tile and save it to `public/tiles/<slot>.html`".

Then commit + redeploy (or reload locally) and the tile appears on your dashboard.
