/**
 * The AI board plan (docs/PLAN.md, Stage 5): its schema, and the validator that
 * is the real protection for the board.
 *
 * The model is asked for a plan in a fixed JSON shape, but nothing it returns is
 * trusted: `sanitizePlan` reads the raw object field by field, drops anything it
 * does not know, caps every text, keeps weights to tiles that are shown and
 * renormalizes them to 100, refuses unknown tiles and themes, and drops an accent
 * that fails the contrast check. Whatever a stranger writes in the interview, the
 * worst it can do is pick among the board's own options.
 *
 * Pure on purpose (relative imports, no browser APIs), so the server route, the
 * client and `node --test lib/boardPlan.test.mjs` all run the same code.
 */
import { z } from 'zod/v4'
import type { Goal, TileIdea } from './tiles/weights'
import type { InterviewAnswersV2, PersonalizationResult } from './onboarding'
import type { ThemeId } from './theme'

/** Interview text caps: per box, and for every box together (so one answer can't blow the AI budget). */
export const MAX_FIELD = 2000
export const MAX_TOTAL = 8000

/** Every free-text answer, for the total cap. */
export function answerText(a: Pick<InterviewAnswersV2, 'goal' | 'otherGoals' | 'day' | 'trainNotes' | 'injuries' | 'eating' | 'hateTracking' | 'life'>): string[] {
  return [a.goal, a.otherGoals, a.day, a.trainNotes, a.injuries, a.eating, a.hateTracking, ...Object.values(a.life)].map((s) => s ?? '')
}

/** The input tiles a plan may arrange. Mentor (vee) is fixed and never in a plan. */
export const PLAN_TILES = ['train', 'fuel', 'walks', 'vitals', 'peak', 'brand', 'finance'] as const
export type PlanTile = (typeof PLAN_TILES)[number]
const isPlanTile = (v: unknown): v is PlanTile => (PLAN_TILES as readonly unknown[]).includes(v)

/**
 * The colours an AI accent is checked against, per preset. A copy of
 * app/globals.css; scripts/check-contrast.mjs fails if the two drift apart.
 */
export const THEME_COLORS: Record<ThemeId, { bg: string; surface: string; accent: string; accentInk: string }> = {
  vellum: { bg: '#EEF1F4', surface: '#FFFFFF', accent: '#C2271D', accentInk: '#FFFFFF' },
  blueprint: { bg: '#123A66', surface: '#0E3058', accent: '#FFD34D', accentInk: '#10223A' },
  pencil: { bg: '#F1F1EF', surface: '#FFFFFF', accent: '#1C1C1C', accentInk: '#FFFFFF' },
  sage: { bg: '#E6EEE8', surface: '#FAFCFA', accent: '#A3361F', accentInk: '#FFFFFF' },
  night: { bg: '#101318', surface: '#171B22', accent: '#FF7A6B', accentInk: '#1A0C0A' },
}
const THEME_IDS = Object.keys(THEME_COLORS) as [ThemeId, ...ThemeId[]]
const isTheme = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as string[]).includes(v)

// ── what the model is asked for ──────────────────────────────────────────────
// Kept free of length/range constraints: structured outputs enforce the shape,
// and sanitizePlan enforces every limit, so the two never disagree.

const weightList = z.array(z.object({ tile: z.enum(PLAN_TILES), weight: z.number() }))

export const boardSchema = z.object({
  overallTitle: z.string().describe('The person\'s main goal as one sharp headline, under 60 characters.'),
  overallWeights: weightList.describe('How much each SHOWN tile moves the main goal. Only shown tiles. Should sum to 100.'),
  goals: z
    .array(z.object({ title: z.string(), weights: weightList }))
    .describe('1 to 3 sub-goals the person named, each weighted over shown tiles only.'),
  tiles: z
    .array(z.object({ id: z.enum(PLAN_TILES), show: z.boolean(), why: z.string().describe('One line, to the person, under 140 characters.') }))
    .describe('Every tile exactly once. Shown tiles first, most important first.'),
  theme: z.enum(THEME_IDS),
  themeWhy: z.string(),
  accent: z.string().describe('A #rrggbb accent that suits the person and reads on the theme, or "" to keep the theme\'s own.'),
  greeting: z.string().describe('A short greeting line under 50 characters, or "".'),
  welcome: z.object({ text: z.string(), points: z.array(z.string()) }),
  ideas: z
    .array(z.object({ word: z.string(), title: z.string(), tracks: z.string(), why: z.string(), estWeight: z.number() }))
    .describe('Up to 3 tiles worth adding later, each tied to what the person wrote.'),
  newTiles: z
    .array(z.object({ name: z.string(), tracks: z.string(), why: z.string(), weight: z.number() }))
    .describe('Up to 2 specs for tiles that do not exist yet but would clearly help. Empty when none.'),
})

export const firstCallSchema = z.object({
  followUps: z.array(z.string()).describe('0 to 2 questions, ONLY if an answer is too vague to build from. Otherwise empty.'),
  board: boardSchema.nullable().describe('The board, when no follow-up is needed; null when asking.'),
})

// ── the validated plan ───────────────────────────────────────────────────────

export interface BoardPlan {
  overallTitle: string
  overallWeights: Record<string, number>
  goals: { title: string; weights: Record<string, number> }[]
  /** Every plan tile exactly once: shown ones first, in board order. */
  tiles: { id: PlanTile; show: boolean; why: string }[]
  theme: ThemeId
  themeWhy: string
  /** null = keep the preset's own accent. */
  accent: string | null
  greeting: string
  welcome: { text: string; points: string[] }
  ideas: TileIdea[]
  newTiles: { name: string; tracks: string; why: string; weight: number }[]
}

/** What the person said that the plan must obey, whatever the model returned. */
export interface PlanConstraints {
  /** The theme they picked by hand; 'auto' lets the AI choose. */
  theme: ThemeId | 'auto'
  /** Their own greeting line wins over the AI's. */
  greeting: string
  fallbackTheme: ThemeId
}

export const LIMITS = { title: 60, why: 140, text: 500, point: 140, greeting: 50, word: 20, tracks: 120, goals: 3, ideas: 3, newTiles: 2, points: 4 }

/** A string, trimmed, control characters removed, cut at a word near `max`. */
export function clip(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  return (cut.replace(/\s+\S*$/, '') || cut) + '…'
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/**
 * Integer weights that sum to exactly 100 over `tiles`, from raw model weights.
 * Unknown or hidden tiles, negatives and non-numbers are dropped; a shown tile
 * with no usable weight gets `missing`. All zero → an even split.
 */
export function normalizeTo100(raw: unknown, tiles: readonly string[], missing = 0): Record<string, number> {
  const sum: Record<string, number> = {}
  for (const e of list(raw)) {
    const { tile, weight } = rec(e)
    if (typeof tile !== 'string' || !tiles.includes(tile)) continue
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue
    sum[tile] = (sum[tile] ?? 0) + weight
  }
  for (const t of tiles) if (!(sum[t] > 0) && missing > 0) sum[t] = missing
  let entries = Object.entries(sum)
  if (!entries.length) entries = tiles.map((t) => [t, 1])
  const total = entries.reduce((s, [, v]) => s + v, 0)
  // Largest remainder: floors first, then the biggest fractions get the spare points.
  const exact = entries.map(([k, v]) => [k, (v / total) * 100] as const)
  const out: Record<string, number> = Object.fromEntries(exact.map(([k, v]) => [k, Math.floor(v)]))
  let spare = 100 - Object.values(out).reduce((s, v) => s + v, 0)
  for (const [k] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (spare-- <= 0) break
    out[k] += 1
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k]
  return out
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** The accent if it reads on this preset (4.5:1 on bg and surface, ink 4.5:1 on it), else null. */
export function checkAccent(v: unknown, theme: ThemeId): string | null {
  if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.trim())) return null
  const hex = v.trim().toUpperCase()
  const t = THEME_COLORS[theme]
  return contrast(hex, t.bg) >= 4.5 && contrast(hex, t.surface) >= 4.5 && contrast(t.accentInk, hex) >= 4.5 ? hex : null
}

const clampWeight = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(30, Math.round(v))) : 0)

/**
 * The raw model output → a plan that can only set what the board allows.
 * Throws only when nothing usable is left (not an object, or no tile shown);
 * the route turns that into the rule-based fallback.
 */
export function sanitizePlan(raw: unknown, c: PlanConstraints): BoardPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('plan_not_object')
  const r = raw as Record<string, unknown>

  const seen = new Set<PlanTile>()
  const picked: BoardPlan['tiles'] = []
  for (const e of list(r.tiles)) {
    const { id, show, why } = rec(e)
    if (!isPlanTile(id) || seen.has(id)) continue
    seen.add(id)
    picked.push({ id, show: show === true, why: clip(why, LIMITS.why) })
  }
  for (const id of PLAN_TILES) if (!seen.has(id)) picked.push({ id, show: false, why: '' })
  const tiles = [...picked.filter((t) => t.show), ...picked.filter((t) => !t.show)]
  const shown = tiles.filter((t) => t.show).map((t) => t.id)
  if (!shown.length) throw new Error('plan_no_tiles')

  // A shown tile the model forgot to weigh still earns a small share, so
  // "shown" always means "on the row" (a zero weight would park it in the tray).
  const overallWeights = normalizeTo100(r.overallWeights, shown, 5)

  const goals: BoardPlan['goals'] = []
  for (const e of list(r.goals)) {
    if (goals.length >= LIMITS.goals) break
    const g = rec(e)
    const title = clip(g.title, LIMITS.title)
    if (!title) continue
    const has = list(g.weights).some((w) => shown.includes(rec(w).tile as PlanTile) && (rec(w).weight as number) > 0)
    goals.push({ title, weights: has ? normalizeTo100(g.weights, shown) : { ...overallWeights } })
  }

  const theme: ThemeId = c.theme !== 'auto' ? c.theme : isTheme(r.theme) ? r.theme : c.fallbackTheme
  const welcome = rec(r.welcome)

  const ideas: TileIdea[] = []
  for (const e of list(r.ideas)) {
    if (ideas.length >= LIMITS.ideas) break
    const i = rec(e)
    const title = clip(i.title, LIMITS.title)
    if (!title) continue
    ideas.push({ word: clip(i.word, LIMITS.word).split(' ')[0] || title.split(' ')[0], title, tracks: clip(i.tracks, LIMITS.tracks), why: clip(i.why, LIMITS.why), estWeight: clampWeight(i.estWeight) })
  }

  const newTiles: BoardPlan['newTiles'] = []
  for (const e of list(r.newTiles)) {
    if (newTiles.length >= LIMITS.newTiles) break
    const t = rec(e)
    const name = clip(t.name, LIMITS.title)
    if (!name) continue
    newTiles.push({ name, tracks: clip(t.tracks, LIMITS.tracks), why: clip(t.why, LIMITS.why), weight: clampWeight(t.weight) })
  }

  return {
    overallTitle: clip(r.overallTitle, LIMITS.title) || 'Your best year',
    overallWeights,
    goals,
    tiles,
    theme,
    themeWhy: c.theme !== 'auto' ? 'You picked this paper yourself.' : clip(r.themeWhy, LIMITS.why),
    accent: checkAccent(r.accent, theme),
    greeting: clip(c.greeting, LIMITS.greeting) || clip(r.greeting, LIMITS.greeting),
    welcome: {
      text: clip(welcome.text, LIMITS.text) || 'Your board is built around your goal. Every tile below is an input toward it.',
      points: list(welcome.points).map((p) => clip(p, LIMITS.point)).filter(Boolean).slice(0, LIMITS.points),
    },
    ideas,
    newTiles,
  }
}

function slugify(s: string, fallback: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || fallback
}

/**
 * A validated plan → the PersonalizationResult the board already knows how to
 * write. The rule-based draft supplies what the AI never decides (the profile,
 * goal colours, the active goal).
 */
export function planToResult(plan: BoardPlan, draft: PersonalizationResult): PersonalizationResult {
  const used = new Set(['overall'])
  const goals: Goal[] = plan.goals.map((g, i) => {
    let id = slugify(g.title, 'goal-' + (i + 1))
    while (used.has(id)) id = id + '-' + (i + 1)
    used.add(id)
    return { id, title: g.title, weights: g.weights, accent: draft.goals[i % Math.max(1, draft.goals.length)]?.accent ?? draft.overall.accent, progress: 0 }
  })
  const ideas: TileIdea[] = [
    ...plan.ideas,
    ...plan.newTiles.map((t) => ({ word: t.name.split(' ')[0], title: t.name, tracks: t.tracks, why: t.why, estWeight: t.weight })),
  ]
  return {
    ...draft,
    goals,
    overall: { ...draft.overall, title: plan.overallTitle, weights: plan.overallWeights },
    activeId: 'overall',
    chromeAccent: plan.accent ?? draft.chromeAccent,
    greeting: plan.greeting || undefined,
    theme: plan.theme,
    notices: [{ id: 'welcome-' + Date.now(), when: 'just now', text: plan.welcome.text, points: plan.welcome.points }],
    ideas: Object.fromEntries([['overall', ideas], ...goals.map((g) => [g.id, ideas])]),
    order: plan.tiles.map((t) => t.id),
    removed: plan.tiles.filter((t) => !t.show).map((t) => t.id),
  }
}
