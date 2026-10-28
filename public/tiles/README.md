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

### The design kit

Every open tile also gets the board's design kit (`lib/tiles/tileKit.ts`), so all
tiles look like one app (Apple Fitness-style cards, rings and charts in the
board's colours and fonts). Use it instead of writing your own design:

- `<body class="k-hue-blue">` picks the tile's colour (`red`, `blue`, `indigo`,
  `teal`, `magenta`, `orange`, `green`, `gold`); put the content in
  `<main class="k-page">`.
- Classes: `k-card` (`k-hero`, `k-plain`), `k-head` with `k-cat` and `k-time`,
  `k-big`, `k-mid`, `k-sub`, `k-label`, `k-title`, `k-btn` (`k-soft`, `k-ghost`,
  `k-wide`, `k-sm`, `k-danger`), `k-row-btns`, `k-round` in `k-stepper`,
  `k-list` with `k-row` (`k-ico`, `k-main`, `k-end`, `k-x`), `k-grid` (`k-2`,
  `k-3`) of `k-stat`, `k-chips`/`k-chip`, `k-seg`, `k-field`/`k-input`,
  `k-empty`, `k-note`, `k-tag`.
- `window.PulseKit` (alias `Kit`): `ring(fraction, opts)`, `rings(list, opts)`,
  `bars(values, opts)`, `line(values, opts)`, `icon(name)`, `sheet(title, html,
  mount)` (use it instead of `prompt`/`alert`/`confirm`, which the sandbox
  blocks), `toast(text)`, `esc`, `dayKey`, `fmt`.

The built-in tiles (`train`, `fuel`, `vitals`, `peak`, `brand`, `finance`,
`walks`) and the ready-made tiles (`lib/tiles/readyTiles.ts`) are worked examples.

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
