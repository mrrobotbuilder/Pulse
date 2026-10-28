/**
 * How each tile is drawn and described in direction A (docs/DESIGN.md): its
 * hatch pattern (the .h1–.h43 classes in globals.css), what it measures and
 * what feeds it. The board and the landing page's parts list both read this.
 * `live` marks tiles that fill themselves (a phone, an API) and get a live dot.
 *
 * Every tile owns a different hatch: the core tiles and the ready-made tiles
 * have fixed ones, and an AI-written tile gets one of the spares (h20–h39),
 * handed out so no two tiles in this browser share one (see hatchForCustom).
 */
export interface TileInfo {
  hatch: string
  measures: string
  fedBy: string
  live?: boolean
}

export const TILE_INFO: Record<string, TileInfo> = {
  train: { hatch: 'h1', measures: 'Every session, every best, every kilo.', fedBy: 'You, after the set' },
  fuel: { hatch: 'h2', measures: 'Water, glass by glass, against your daily goal.', fedBy: 'You' },
  walks: { hatch: 'h7', measures: 'Distance, steps and where you went.', fedBy: 'Your phone, on the move', live: true },
  vitals: { hatch: 'h4', measures: 'Sleep and recovery.', fedBy: 'You, by hand' },
  peak: { hatch: 'h6', measures: 'Your energy hour by hour, and when you peak.', fedBy: 'Your Vitals, caffeine and how you feel' },
  brand: { hatch: 'h3', measures: 'Your audience: views, subscribers, followers.', fedBy: 'TikTok, no key · YouTube, your key', live: true },
  finance: { hatch: 'h5', measures: 'What comes in, what leaves.', fedBy: 'You · live prices with your key' },
  vee: { hatch: 'h0', measures: 'Reads every tile, notices patterns, retunes the weights.', fedBy: 'Claude, on your computer' },
}

/** The ready-made tiles' hatches (ids from lib/tiles/readyTiles.ts). */
export const READY_HATCH: Record<string, string> = {
  'custom-weight': 'h8',
  'custom-calories': 'h9',
  'custom-protein': 'h10',
  'custom-pushups': 'h11',
  'custom-caffeine': 'h12',
  'custom-mood': 'h13',
  'custom-meditation': 'h14',
  'custom-reading': 'h15',
  'custom-screen-time': 'h16',
  'custom-deep-work': 'h17',
  'custom-posts': 'h18',
  'custom-savings': 'h19',
  'custom-no-sugar': 'h40',
  'custom-no-alcohol': 'h41',
  'custom-cold-shower': 'h42',
  'custom-journal': 'h43',
}

const SPARES = Array.from({ length: 20 }, (_, i) => `h${20 + i}`)

// Every AI-written tile id this browser knows (the board registers them), so
// the spares can be handed out without two tiles landing on the same one.
let knownCustom: string[] = []
let assigned: Record<string, string> = {}

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** The board tells us which custom tiles exist; assignments follow from the sorted list. */
export function setCustomTileIds(ids: string[]): void {
  const next = [...new Set(ids.filter((id) => !READY_HATCH[id]))].sort()
  if (next.join('|') === knownCustom.join('|')) return
  knownCustom = next
  assigned = {}
  const taken = new Set<string>()
  for (const id of knownCustom) {
    // Start where the id hashes to and walk to the first free spare: an id
    // keeps its hatch unless a new tile happens to claim that slot first.
    // ponytail: past 20 AI tiles the spares wrap and repeat; add classes then.
    let i = hash(id) % SPARES.length
    for (let n = 0; n < SPARES.length && taken.has(SPARES[i]); n++) i = (i + 1) % SPARES.length
    taken.add(SPARES[i])
    assigned[id] = SPARES[i]
  }
}

function hatchForCustom(id: string): string {
  return READY_HATCH[id] ?? assigned[id] ?? SPARES[hash(id) % SPARES.length]
}

export const tileInfo = (id: string): TileInfo =>
  TILE_INFO[id] ?? { hatch: id.startsWith('custom-') ? hatchForCustom(id) : 'h0', measures: '', fedBy: '' }
