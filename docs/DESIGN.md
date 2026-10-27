# Pulse design directions (Stage 2)

_Written 2026-10-27. Stage 2 of `docs/PLAN.md`._

**Chosen direction: not picked yet.** The owner picks A, B or C (or a mix) and
this line gets updated.

## How to look at them

- **All screenshots side by side:** open `docs/design/index.html` in a browser.
- **The mockups themselves:** `docs/design/a-drafting.html`, `b-trackmeet.html`,
  `c-balance.html`. Each has the landing page, the intro (steps 2 and 3 of the
  new 9-step interview) and the board on one page, plus a black bar at the top
  to switch theme presets. `?view=board` shows one section, `?theme=night` one
  preset.
- **Re-take the screenshots:** `node docs/design/shoot.mjs` (writes
  `docs/design/shots/`, and flags fonts that failed to load or any sideways
  overflow).
- **Re-check contrast:** `node docs/design/check-contrast.mjs`. All 15 presets
  pass: every text pair at 4.5:1 or more, the focus ring at 3:1 or more. A preset
  with a missing or non-hex token is reported as "not measurable" and fails.

Every mockup uses the real tile names and the owner's real goals and weights
(`lib/tiles/weights.ts`: Brand 30, Train 25, Vitals 20, Fuel 13, Finance 7,
Peak 5 for "A jacked, famous YouTuber"). The tile numbers are made up but
plausible.

## Why the current look has to go

Today's board is near-black with one mint accent (`#6EE7B7`). That is the single
most common look AI-built dashboards land on, so it reads as "generated" rather
than "mine". All three directions leave it behind. Each one is built around one
idea that comes from the board's own subject, y = Σ w·x, so the weights are
visible instead of hidden in a gear panel.

## The three directions

| | A · Drafting Table | B · Track Meet | C · Balance |
|---|---|---|---|
| Feel | Calm, precise, a technical drawing | Loud, athletic, a stadium scoreboard | Soft, friendly, a hanging mobile |
| Default ground | Light graph paper | Deep navy | Pale lilac |
| The signature | The **weight strip**: one bar split by weight, each tile its own ink hatch pattern, with a dimension line reading 100 | **Lanes**: every tile is a lane ranked by weight; its bar is the points it adds to y, and the bars sum to the score | **The mobile**: y hangs at the top, each tile is a disc sized by its weight; tile cards are tinted to match and sized by weight |
| How the board is laid out | y and the strip on top, a 4-column grid of equal tiles, w 0 tiles in a "not in this goal" tray | A scoreboard (y huge, goals with progress bars), then a ranked list of lanes, then the Mentor's note | The mobile beside y, then a bento grid where big weight = big tile |
| Display type | Bricolage Grotesque (condensed widths) | Big Shoulders Display, uppercase | Unbounded |
| Body type | Atkinson Hyperlegible | Barlow | Figtree |
| Data/labels | IBM Plex Mono | Azeret Mono | DM Mono |
| Radius | 3px | 2px | 26px, pill buttons |
| Motion | Low: the strip draws in once | High: y counts up, lanes sprint in, once | Medium: the mobile swings and settles, once (3.2 s) |
| Best at | Showing the math honestly; reads like a tool you trust | Making the daily number feel like a result; strongest on a phone at a glance | Feeling personal and gentle; easiest for a stranger on day one |
| Risk | Can feel cold or "work-like" | Can feel aggressive on a bad day; less calm for a sleep-focused person | Pastel bento is close to many lifestyle apps; the mobile carries the identity |

All motion respects `prefers-reduced-motion` and stops by itself in under 5 s.
Every control is at least 44px tall and has a 2px focus ring.

## Tokens (the theme system)

Every direction uses the same token names, so the Stage 5 AI picks a preset id
and Stage 3's `withBridge` passes the same variables into every tile:

`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, `--accent-ink`
(text on an accent fill), `--gold` (the overall goal), `--focus`, `--radius`,
`--font-display`, `--font-body`, `--font-mono`, `--motion` (low / medium / high).
C adds one tint per tile (`--t-brand`, `--t-train`, …) and `--mentor-bg` /
`--mentor-text`; A adds `--grid` for the paper.

## Theme presets (5 per direction, all checked)

**A · Drafting Table**
| Preset | Ground | Accent | For |
|---|---|---|---|
| `vellum` (default) | `#EEF1F4` cool paper | `#C2271D` red pencil | anyone |
| `blueprint` | `#123A66` blue | `#FFD34D` yellow | dark, still technical |
| `pencil` | `#F1F1EF` grey | `#1C1C1C` graphite | minimal, no colour |
| `sage` | `#E6EEE8` green paper | `#A3361F` brick | calm |
| `night` | `#101318` | `#FF7A6B` coral | night use |

**B · Track Meet**
| Preset | Ground | Accent | For |
|---|---|---|---|
| `lane4` (default) | `#0B1E33` navy | `#FF5A36` tartan orange | intense |
| `night` | `#0A0B0E` | `#4DA3FF` blue | night use |
| `indoor` | `#F3F4F6` light | `#C2360F` | light, still loud |
| `tartan` | `#2A0E0B` oxblood | `#FFC845` gold | warm, dramatic |
| `finish` | `#FFFFFF` | `#000000` | stark, high contrast |

**C · Balance**
| Preset | Ground | Accent | For |
|---|---|---|---|
| `morning` (default) | `#EEEAF4` lilac | `#231A33` ink | friendly |
| `moss` | `#E6EEE3` green | `#1B2B1E` | calm, outdoors |
| `sea` | `#E3EDF2` blue | `#0F4C6B` | calm, cool |
| `dusk` | `#1B1726` | `#F3EEFA` | dark, soft |
| `ink` | `#FFFFFF` | `#000000` | high contrast, saturated tints |

## Screenshots

Board, desktop (1440px)

| A · Drafting Table | B · Track Meet | C · Balance |
|---|---|---|
| ![](design/shots/a-drafting-board-1440.png) | ![](design/shots/b-trackmeet-board-1440.png) | ![](design/shots/c-balance-board-1440.png) |

Board, phone (375px)

| A | B | C |
|---|---|---|
| ![](design/shots/a-drafting-board-375.png) | ![](design/shots/b-trackmeet-board-375.png) | ![](design/shots/c-balance-board-375.png) |

Intro, desktop and phone

| A | B | C |
|---|---|---|
| ![](design/shots/a-drafting-intro-1440.png) | ![](design/shots/b-trackmeet-intro-1440.png) | ![](design/shots/c-balance-intro-1440.png) |
| ![](design/shots/a-drafting-intro-375.png) | ![](design/shots/b-trackmeet-intro-375.png) | ![](design/shots/c-balance-intro-375.png) |

Landing page, desktop and phone

| A | B | C |
|---|---|---|
| ![](design/shots/a-drafting-landing-1440.png) | ![](design/shots/b-trackmeet-landing-1440.png) | ![](design/shots/c-balance-landing-1440.png) |
| ![](design/shots/a-drafting-landing-375.png) | ![](design/shots/b-trackmeet-landing-375.png) | ![](design/shots/c-balance-landing-375.png) |

Presets

| A | B | C |
|---|---|---|
| ![](design/shots/a-drafting-presets-1440.png) | ![](design/shots/b-trackmeet-presets-1440.png) | ![](design/shots/c-balance-presets-1440.png) |

## Mixing

The token names are shared, so mixes are cheap. Combinations that would hold
together: B's lanes as the board with A's calm paper presets; C's mobile as the
landing hero with A's board; A's weight strip on top of C's bento. Say which
parts you want from which.

## The choice

_To be filled in when the owner picks._
