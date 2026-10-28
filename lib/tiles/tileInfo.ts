/**
 * How each tile is drawn and described in direction A (docs/DESIGN.md): its
 * hatch pattern (the .h1–.h7 classes in globals.css), what it measures and
 * what feeds it. The board and the landing page's parts list both read this.
 * `live` marks tiles that fill themselves (a phone, an API) and get a live dot.
 */
export interface TileInfo {
  hatch: string
  measures: string
  fedBy: string
  live?: boolean
}

export const TILE_INFO: Record<string, TileInfo> = {
  train: { hatch: 'h1', measures: 'Every session, every best, every kilo.', fedBy: 'You, after the set' },
  fuel: { hatch: 'h2', measures: 'Glasses of water a day, against a goal of 8.', fedBy: 'You' },
  walks: { hatch: 'h7', measures: 'Distance, steps and where you went.', fedBy: 'Your phone, on the move', live: true },
  vitals: { hatch: 'h4', measures: 'Sleep and recovery.', fedBy: 'You, by hand' },
  peak: { hatch: 'h6', measures: 'The curve you are on: compounding, or stalled.', fedBy: 'Your Train log' },
  brand: { hatch: 'h3', measures: 'Your audience: views, subscribers, followers.', fedBy: 'TikTok, no key · YouTube, your key', live: true },
  finance: { hatch: 'h5', measures: 'What comes in, what leaves.', fedBy: 'You · live prices with your key' },
  vee: { hatch: 'h0', measures: 'Reads every tile, notices patterns, retunes the weights.', fedBy: 'Claude, on your computer' },
}

export const tileInfo = (id: string): TileInfo => TILE_INFO[id] ?? { hatch: 'h0', measures: '', fedBy: '' }
