/**
 * Goals + tile weights — the math of the equation, with NO AI key at runtime.
 *
 *   y = the Mentor (the overseer, where the math lives)
 *   x = each input tile · w = that tile's share of the ACTIVE goal
 *
 * Each goal carries its own weights (sum ≈ 100): "famous YouTuber" leans on
 * Brand; "185 lb lean" leans on Train/Fuel. The row badges show the active
 * goal's weights; the Mentor lists every goal with its full breakdown.
 *
 * WHO DOES THE MATH: Claude Code, at build time — not an Anthropic key, not
 * you by hand. In VS Code, say:
 *
 *   "My goals are X and Y. Open lib/tiles/weights.ts and re-run the math:
 *    for each goal, weigh how much each tile's input actually moves it
 *    (ask me questions if you need to). Each goal's weights sum to 100."
 *
 * Claude reasons, edits DEFAULT_GOALS, you reload. Later it can also
 * cross-reference your real tile data (video published vs workouts, water,
 * caffeine) and retune from evidence. A localStorage override
 * ('vitality:<userId>:goals') wins over these defaults, so the connector or a
 * goals UI can retune without a code change.
 *
 * Every reader here takes a userId: on a shared browser two accounts must not
 * see each other's goals. See lib/localScope.ts.
 */

import { readScoped, writeScoped } from '../localScope'

export interface Goal {
  id: string
  title: string
  /** tile slot -> % of this goal (sums to ~100) */
  weights: Record<string, number>
  /** true while the mentor (Claude Code) hasn't shaped + weighed it yet */
  pending?: boolean
  /** each goal tints the board a little; the overall goal goes gold */
  accent?: string
  /** how far you've come, 0–100 — computed by the mentor from data sweeps
   *  (analytics, manual logs, wearables), never guessed by the app */
  progress?: number
}

/** One observation the mentor pushed after scanning your data, with any
 *  weight changes it made because of what it found. */
export interface Notice {
  id: string
  when: string
  text: string
  /** bullet points; **bold** marks the highlighted words */
  points?: string[]
  deltas?: { tile: string; from: number; to: number }[]
}

export const DEFAULT_GOALS: Goal[] = [
  {
    id: 'youtube',
    title: 'Become a famous YouTuber',
    accent: '#6EE7B7',
    // Train entered this goal when the mentor noticed workouts drive output —
    // see DEFAULT_NOTICED. Before: brand 70 / vitals 20 / finance 10.
    weights: { brand: 62, train: 8, vitals: 20, finance: 10 },
    progress: 28,
  },
  {
    id: 'lean185',
    title: 'Be 185 lb lean',
    accent: '#8AB4FF',
    weights: { train: 40, fuel: 30, vitals: 20, peak: 10 },
    progress: 61,
  },
]

/** The overseer's synthesis of EVERY goal, polished into one sentence by the
 *  mentor (Claude Code). Switching it on = top priority — the board goes gold. */
export const OVERALL_GOAL: Goal = {
  id: 'overall',
  title: 'A jacked, famous YouTuber',
  accent: '#E8C878',
  weights: { brand: 30, train: 25, vitals: 20, fuel: 13, finance: 7, peak: 5 },
  progress: 34,
}

/** The gold overall goal: localStorage override ('vitality:goal:overall') if
 *  valid, else the seeded example. The onboarding interview writes this so
 *  the gold goal reflects the visitor's own dream instead of the template. */
export function overallGoal(userId: string): Goal {
  const raw = readScoped(userId, 'goal:overall')
  if (raw) {
    try {
      const o = JSON.parse(raw)
      if (o && typeof o.id === 'string' && o.weights) return o as Goal
    } catch {
      /* fall through */
    }
  }
  return OVERALL_GOAL
}

export function saveOverallGoal(userId: string, goal: Goal): void {
  writeScoped(userId, 'goal:overall', JSON.stringify(goal))
}

/** Overall first, then the individual goals. */
export function allGoals(userId: string): Goal[] {
  return [overallGoal(userId), ...goals(userId)]
}

/** The full active Goal (incl. overall), for accent + title. */
export function activeGoal(userId: string): Goal | undefined {
  const id = activeGoalId(userId)
  return allGoals(userId).find((g) => g.id === id) ?? goals(userId)[0]
}

export const DEFAULT_NOTICED: Notice[] = [
  {
    id: 'n-workouts-drive',
    when: 'this morning',
    text: 'When you skip the gym, you drink less water — and your analytics take a deep dive the same day. Workouts might be the key to your drive, not just your body. I moved Train into the YouTuber goal.',
    points: [
      'When you skip the gym, you drink **less water** the same day',
      'No-workout days: your **analytics take a deep dive**',
      '**Workouts might be the key to your drive** — not just your body',
      'So I moved **Train into the YouTuber goal**',
    ],
    deltas: [
      { tile: 'train', from: 0, to: 8 },
      { tile: 'brand', from: 70, to: 62 },
    ],
  },
]

/** A blueprint for a tile they SHOULD have — a gap the mentor found between
 *  their goal and what their tiles actually track. Pre-written by the mentor
 *  (Claude Code) from their data; localStorage 'vitality:ideas' overrides. */
export interface TileIdea {
  /** ONE word — how the idea shows up in the popup (the mentor picks it) */
  word?: string
  title: string
  /** what the tile tracks, in one line */
  tracks: string
  /** why it moves THIS goal — tied to their data when possible */
  why: string
  /** the weight it would likely earn (≈ %) */
  estWeight: number
}

export const DEFAULT_IDEAS: Record<string, TileIdea[]> = {
  overall: [
    {
      word: 'Pipeline',
      title: 'Content pipeline',
      tracks: 'videos in flight → published, per week',
      why: 'Your output IS the goal — but nothing tracks the machine that makes it. Brand tracks the channel; this tracks the work.',
      estWeight: 10,
    },
    {
      word: 'Sleep',
      title: 'Sleep consistency',
      tracks: 'bedtime variance, night by night',
      why: 'Your recovery swings track your analytics dips. Vitals sees the score — this would see the habit behind it.',
      estWeight: 6,
    },
  ],
  youtube: [
    {
      word: 'Pipeline',
      title: 'Content pipeline',
      tracks: 'ideas → filmed → edited → published',
      why: 'You track the channel (Brand) but not the machine that feeds it. Publishing cadence is the single biggest lever here.',
      estWeight: 12,
    },
    {
      word: 'Caffeine',
      title: 'Caffeine timing',
      tracks: 'when + how much, against publish days',
      why: 'The data hints more caffeine on publish days — fuel or crutch? One small tile answers it.',
      estWeight: 5,
    },
  ],
  lean185: [
    {
      word: 'Water',
      title: 'Water',
      tracks: 'daily intake vs target',
      why: 'The noticed pattern: skip the gym → drink less. No tile tracks water yet — it is the cheapest input you are missing.',
      estWeight: 8,
    },
    {
      word: 'Steps',
      title: 'Steps / NEAT',
      tracks: 'daily movement outside the gym',
      why: 'At 185-lean, the deficit is won between workouts. Train sees sessions; nothing sees the other 23 hours.',
      estWeight: 7,
    },
  ],
}

/** The mentor's tile recommendations for a goal (localStorage override wins). */
export function tileIdeas(userId: string, goalId: string): TileIdea[] {
  const raw = readScoped(userId, 'ideas')
  if (raw) {
    try {
      const o = JSON.parse(raw)
      if (o && typeof o === 'object' && Array.isArray(o[goalId])) return o[goalId] as TileIdea[]
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_IDEAS[goalId] ?? DEFAULT_IDEAS.overall ?? []
}

/** The mentor's noticed feed: localStorage override, else the seeded example.
 *  Claude Code (or the connector) writes 'vitality:noticed' after a scan. */
export function noticedFeed(userId: string): Notice[] {
  const raw = readScoped(userId, 'noticed')
  if (raw) {
    try {
      const o = JSON.parse(raw)
      if (Array.isArray(o)) return o as Notice[]
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_NOTICED
}

/** Save the goals list (used by the mentor page's goal input). */
export function saveGoals(userId: string, list: Goal[]): void {
  writeScoped(userId, 'goals', JSON.stringify(list))
}

/** All goals: localStorage override ('vitality:goals') if valid, else defaults. */
export function goals(userId: string): Goal[] {
  const raw = readScoped(userId, 'goals')
  if (raw) {
    try {
      const o = JSON.parse(raw)
      if (Array.isArray(o) && o.every((g) => g && typeof g.id === 'string' && g.weights)) return o as Goal[]
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_GOALS
}

/** The active goal id (persisted). Defaults to the first goal. */
export function activeGoalId(userId: string): string {
  const v = readScoped(userId, 'goal:active')
  if (v) return v
  return goals(userId)[0]?.id ?? ''
}

export function setActiveGoalId(userId: string, id: string): void {
  writeScoped(userId, 'goal:active', id)
}

/** The active goal's weights (the badges on the row read these). */
export function tileWeights(userId: string): Record<string, number> {
  return activeGoal(userId)?.weights ?? {}
}
