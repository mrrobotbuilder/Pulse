'use client'

/**
 * Onboarding — the first-visit interview that personalizes the whole dashboard.
 *
 * The whole board is already override-driven: goals, weights, mentor notices,
 * tile ideas, the greeting, and the wallpaper all read localStorage overrides
 * that win over the template author's seeded defaults. This module turns a set
 * of interview answers into those overrides and writes them, so every trace of
 * the author's life ("famous YouTuber", "185 lb lean") is replaced by the
 * visitor's own goals — for them now, and for any public user later.
 *
 * Two ways to map answers → personalization:
 *   · mapAnswersDeterministic() — rule-based, free, instant, always available.
 *   · POST /api/personalize    — Claude-crafted, used only when the owner has
 *     set ANTHROPIC_API_KEY on the server. Falls back to the deterministic
 *     mapper on any error, so the site works fully with no key.
 */

import type { Goal, Notice, TileIdea } from '@/lib/tiles/weights'
import { goals, overallGoal, saveGoals, saveOverallGoal, setActiveGoalId } from '@/lib/tiles/weights'
import { saveProfile, type Profile } from '@/lib/tiles/profile'
import { dashboardChrome, WALLPAPER_ACCENTS } from '@/lib/tiles/dashboardChrome'
import { syncEnabled, syncSave, syncLoad } from '@/lib/sync'
import { writeScoped, readScoped, removeScoped } from '@/lib/localScope'
import { isThemeId, saveTheme, type ThemeId } from '@/lib/theme'

/** Scoped-key name, not a full key: reads/writes go through lib/localScope. */
export const ONBOARDED_NAME = 'onboarded'
const CONFIG_TILE_ID = '_config' // cloud mirror slot (RLS-scoped like any tile)

/** The six input tiles a goal can lean on. */
export type TileSlot = 'train' | 'fuel' | 'vitals' | 'peak' | 'brand' | 'finance'

/** One focus area the user picks, with the concrete target they wrote for it. */
export interface FocusArea {
  domain: string // one of DOMAINS[].id
  target: string // free-text 6–12-month target
}

export interface InterviewAnswers {
  name: string
  age?: number
  heightCm?: number
  weightKg?: number
  sex?: 'male' | 'female'
  units?: 'metric' | 'imperial'
  dream: string // the big-picture 1–2 sentence dream
  areas: FocusArea[] // 2–4 chosen areas + targets
  priorityDomain: string // which area matters most right now
  accent: string // hex from WALLPAPER_ACCENTS
  greeting?: string // optional custom greeting line
  theme?: ThemeId // a preset from lib/theme.ts
}

/** The life areas a person switches on in the "rest of life" step. */
export type LifeArea = 'money' | 'content' | 'learning' | 'mind'

/**
 * The deep interview (Stage 4). Free text is capped per box and in total
 * (MAX_FIELD / MAX_TOTAL) so a single answer can never blow an AI budget later.
 * Unanswered choices are '' (or 0 for the 1–5 scales).
 */
export interface InterviewAnswersV2 {
  version: 2
  name: string
  age?: number
  heightCm?: number
  weightKg?: number
  sex?: 'male' | 'female'
  units?: 'metric' | 'imperial'
  goal: string // the big "write everything" box
  otherGoals: string
  wake: string // 'HH:MM' or ''
  sleep: string
  work: '' | 'desk' | 'feet' | 'shifts' | 'student' | 'other'
  day: string
  trainFreq: '' | 'never' | '1-2' | '3-4' | '5+'
  trainKinds: string[]
  trainNotes: string
  injuries: string
  eating: string
  sleepQuality: number // 0 = not answered, else 1–5
  energy: number
  devices: string[]
  life: Partial<Record<LifeArea, string>> // a key present = that area is switched on
  logMinutes: 0 | 1 | 5 | 15
  hateTracking: string
  boardSize: 'focused' | 'everything'
  vibes: string[]
  theme: ThemeId | 'auto'
  greeting: string
}

// The caps live with the plan validator, so the server route checks the same numbers.
export { MAX_FIELD, MAX_TOTAL, answerText } from './boardPlan'

export interface PersonalizationResult {
  goals: Goal[]
  overall: Goal
  activeId: string
  profile: Profile
  chromeAccent: string
  greeting?: string
  theme?: ThemeId
  notices: Notice[]
  ideas: Record<string, TileIdea[]>
  /** Tile order for `eq:order` (V2 only; V1 results leave the layout alone). */
  order?: string[]
  /** Hidden tiles for `eq:removed` (V2 only). */
  removed?: string[]
}

/** The pickable focus areas. Each maps to how much the six tiles move it. */
export const DOMAINS: { id: string; label: string; hint: string }[] = [
  { id: 'strength', label: 'Strength & fitness', hint: 'lifting, training, body composition' },
  { id: 'health', label: 'Health & energy', hint: 'sleep, nutrition, recovery' },
  { id: 'content', label: 'Content & audience', hint: 'building a brand, followers, reach' },
  { id: 'money', label: 'Money & career', hint: 'income, saving, work goals' },
  { id: 'learning', label: 'Learning a skill', hint: 'studying, practice, mastery' },
  { id: 'mind', label: 'Mind & focus', hint: 'discipline, deep work, calm' },
]

export function domainLabel(id: string): string {
  return DOMAINS.find((d) => d.id === id)?.label ?? id
}

/** How much each input tile moves a goal in each domain (sums to 100 per domain). */
const DOMAIN_AFFINITY: Record<string, Partial<Record<TileSlot, number>>> = {
  strength: { train: 45, fuel: 25, vitals: 20, peak: 10 },
  health: { vitals: 40, fuel: 30, train: 20, peak: 10 },
  content: { brand: 55, peak: 25, vitals: 20 },
  money: { finance: 60, brand: 25, peak: 15 },
  learning: { peak: 50, brand: 25, vitals: 25 },
  mind: { peak: 45, vitals: 35, train: 20 },
}

/** Generic per-domain "tiles you're missing" blueprints (no author references). */
const DOMAIN_IDEAS: Record<string, TileIdea[]> = {
  strength: [
    { word: 'Water', title: 'Water', tracks: 'daily intake vs target', why: 'the cheapest recovery input most people skip', estWeight: 8 },
    { word: 'Steps', title: 'Steps / NEAT', tracks: 'daily movement outside training', why: 'the deficit is won between sessions', estWeight: 7 },
  ],
  health: [
    { word: 'Sleep', title: 'Sleep consistency', tracks: 'bedtime variance night to night', why: 'the habit behind every recovery score', estWeight: 8 },
    { word: 'Water', title: 'Water', tracks: 'daily intake vs target', why: 'energy and focus track hydration', estWeight: 6 },
  ],
  content: [
    { word: 'Pipeline', title: 'Content pipeline', tracks: 'ideas → filmed → published per week', why: 'publishing cadence is the biggest lever', estWeight: 10 },
    { word: 'Reach', title: 'Reach', tracks: 'views or impressions per post', why: 'output only matters if it lands', estWeight: 6 },
  ],
  money: [
    { word: 'Spend', title: 'Daily spend', tracks: 'what leaves your account each day', why: 'awareness is the first lever on savings', estWeight: 8 },
    { word: 'Income', title: 'Income streams', tracks: 'money in, by source, per week', why: 'growth comes from what you can repeat', estWeight: 7 },
  ],
  learning: [
    { word: 'Reps', title: 'Practice reps', tracks: 'focused minutes per day', why: 'mastery is time-on-task, tracked honestly', estWeight: 9 },
    { word: 'Streak', title: 'Study streak', tracks: 'days in a row you showed up', why: 'consistency compounds skill', estWeight: 6 },
  ],
  mind: [
    { word: 'Focus', title: 'Deep work', tracks: 'distraction-free blocks per day', why: 'depth is the input to everything hard', estWeight: 9 },
    { word: 'Sleep', title: 'Sleep consistency', tracks: 'bedtime variance night to night', why: 'focus collapses without it', estWeight: 6 },
  ],
}

const GOLD = '#E8C878' // the template's overall-goal accent; kept for the gold goal

function slugify(s: string, fallback: string): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28)
  return base || fallback
}

function titleCase(s: string): string {
  const clean = s.trim().replace(/\s+/g, ' ')
  if (!clean) return ''
  // Trim to a headline-ish length and title-case the first letters.
  const short = clean.length > 60 ? clean.slice(0, 57).replace(/\s\S*$/, '') + '…' : clean
  return short.charAt(0).toUpperCase() + short.slice(1)
}

function normalizeWeights(raw: Partial<Record<TileSlot, number>>): Record<string, number> {
  const entries = Object.entries(raw).filter(([, v]) => (v ?? 0) > 0) as [string, number][]
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total <= 0) return {}
  const out: Record<string, number> = {}
  let running = 0
  entries.forEach(([k, v], i) => {
    if (i === entries.length - 1) out[k] = 100 - running // last one absorbs rounding
    else {
      const w = Math.round((v / total) * 100)
      out[k] = w
      running += w
    }
  })
  return out
}

/** Rule-based personalization — the always-available path. */
export function mapAnswersDeterministic(a: InterviewAnswers): PersonalizationResult {
  const accents = WALLPAPER_ACCENTS.map((w) => w.hex)
  const startIdx = Math.max(0, accents.indexOf(a.accent))
  const usedIds = new Set<string>()

  const goals: Goal[] = a.areas.map((area, i) => {
    let id = slugify(area.target || area.domain, 'goal-' + (i + 1))
    while (usedIds.has(id)) id = id + '-' + (i + 1)
    usedIds.add(id)
    const title = titleCase(area.target) || domainLabel(area.domain)
    const weights = normalizeWeights(DOMAIN_AFFINITY[area.domain] ?? {})
    const accent = accents[(startIdx + i) % accents.length]
    return { id, title, weights, accent, progress: 0 }
  })

  // Overall = priority-weighted blend of the goals' weights (priority goal 2×).
  const blend: Record<string, number> = {}
  a.areas.forEach((area, i) => {
    const g = goals[i]
    const factor = area.domain === a.priorityDomain ? 2 : 1
    Object.entries(g.weights).forEach(([slot, w]) => {
      blend[slot] = (blend[slot] ?? 0) + w * factor
    })
  })
  const overall: Goal = {
    id: 'overall',
    title: titleCase(a.dream) || 'Your best year',
    accent: GOLD,
    weights: normalizeWeights(blend as Partial<Record<TileSlot, number>>),
    progress: 0,
  }

  const profile: Profile = {}
  if (a.name.trim()) profile.name = a.name.trim()
  if (a.age) profile.age = a.age
  if (a.heightCm) profile.heightCm = a.heightCm
  if (a.weightKg) profile.weightKg = a.weightKg
  if (a.sex) profile.sex = a.sex
  if (a.units) profile.units = a.units

  const dreamShort = a.dream.trim().replace(/\s+/g, ' ')
  const notices: Notice[] = [
    {
      id: 'welcome-' + Date.now(),
      when: 'just now',
      text: dreamShort
        ? `Your board is built around one thing: ${dreamShort} Every tile below is an input toward it — log honestly and the mentor tunes the weights as your real data comes in.`
        : 'Your board is built around your goals. Every tile below is an input — log honestly and the mentor tunes the weights as your real data comes in.',
      points: [
        dreamShort ? `Your north star: **${dreamShort.replace(/\.$/, '')}**` : 'Your goals now drive the board',
        `Top focus right now: **${domainLabel(a.priorityDomain)}**`,
        'The weights are a starting guess — **they retune from your real data**',
      ],
    },
  ]

  const ideas: Record<string, TileIdea[]> = {}
  goals.forEach((g, i) => {
    ideas[g.id] = DOMAIN_IDEAS[a.areas[i].domain] ?? []
  })
  ideas.overall = DOMAIN_IDEAS[a.priorityDomain] ?? []

  return { goals, overall, activeId: 'overall', profile, chromeAccent: a.accent, greeting: a.greeting, theme: a.theme, notices, ideas }
}

// ── V2: the deep interview, mapped by rules ──

// Words that point the main goal at an area. Each match scores 1; the area with
// the most matches wins, ties go to the earlier row.
// ponytail: keyword scoring, English only; the Stage 5 AI reads the text properly.
const GOAL_KEYWORDS: [string, RegExp][] = [
  ['content', /\b(subscri\w*|followers?|audience|youtube|tiktok|instagram|channel|creator|views|content|podcast|newsletter|videos?)\b/gi],
  ['money', /\b(money|income|salary|sav(e|ing|ings)|debt|invest\w*|business|revenue|earn\w*|financ\w*|career|promotion|rent)\b/gi],
  ['strength', /\b(lift\w*|strong\w*|strength|muscle\w*|bench|squat|deadlift|gym|lean|bulk|marathon|running|5k|10k|fit|fitness|abs|kg|lbs?)\b/gi],
  ['health', /\b(sleep\w*|energy|tired|health\w*|diet|nutrition|recover\w*|weight)\b/gi],
  ['learning', /\b(learn\w*|study\w*|language|guitar|piano|coding|code|exam|degree|skill|practi[cs]e)\b/gi],
  ['mind', /\b(focus\w*|calm\w*|discipline|meditat\w*|anxi\w*|stress\w*|mind\w*|habits?|procrastinat\w*|doomscroll\w*)\b/gi],
]

const WEARABLES = ['whoop', 'apple-watch', 'garmin', 'oura']
const ROW_SLOTS = ['train', 'fuel', 'vitals', 'peak', 'brand', 'finance', 'walks']
const VIBE_THEME: [string, ThemeId][] = [
  ['minimal', 'pencil'],
  ['calm', 'sage'],
  ['intense', 'blueprint'],
  ['data-heavy', 'blueprint'],
  ['playful', 'vellum'],
]

function firstSentence(s: string): string {
  return (s.trim().split(/(?<=[.!?])\s|\n/)[0] ?? '').trim()
}

/** The goal area the text talks about most, or null when nothing matches. */
export function goalDomain(text: string): string | null {
  let best: string | null = null
  let bestScore = 0
  for (const [domain, re] of GOAL_KEYWORDS) {
    const score = text.match(re)?.length ?? 0
    if (score > bestScore) {
      best = domain
      bestScore = score
    }
  }
  return best
}

/** V2 → the V1 shape the mapper (and today's /api/personalize) reads. */
export function answersV2ToV1(a: InterviewAnswersV2): InterviewAnswers {
  const on = new Set<string>()
  if (a.trainFreq && a.trainFreq !== 'never') on.add('strength')
  const low = (n: number) => n > 0 && n <= 3
  if (low(a.sleepQuality) || low(a.energy) || a.devices.some((d) => WEARABLES.includes(d))) on.add('health')
  for (const area of Object.keys(a.life)) on.add(area)
  const main = goalDomain(a.goal)
  if (main) on.add(main)
  if (on.size === 0) on.add('health') // nothing to go on: a health board is the safe default

  const ordered = DOMAINS.map((d) => d.id).filter((id) => on.has(id))
  const areas: FocusArea[] = ordered.map((domain) => ({
    domain,
    target: firstSentence(a.life[domain as LifeArea] ?? ''),
  }))

  return {
    name: a.name,
    age: a.age,
    heightCm: a.heightCm,
    weightKg: a.weightKg,
    sex: a.sex,
    units: a.units,
    dream: firstSentence(a.goal),
    areas,
    priorityDomain: main ?? ordered[0],
    accent: WALLPAPER_ACCENTS[0].hex,
    greeting: a.greeting.trim() || undefined,
    theme: a.theme === 'auto' ? VIBE_THEME.find(([v]) => a.vibes.includes(v))?.[1] : a.theme,
  }
}

/** Rule-based board from the deep interview: V1 mapping plus order and hidden tiles. */
export function mapAnswersV2(a: InterviewAnswersV2): PersonalizationResult {
  const result = mapAnswersDeterministic(answersV2ToV1(a))
  const w = result.overall.weights
  // Heaviest first; the sort is stable, so ties keep the seeded order.
  const order = [...ROW_SLOTS].sort((x, y) => (w[y] ?? 0) - (w[x] ?? 0))
  const removed = a.boardSize === 'focused' ? ROW_SLOTS.filter((id) => !((w[id] ?? 0) > 0)) : []
  return { ...result, order, removed }
}

/**
 * Write a personalization result into the localStorage overrides the board
 * reads. Does NOT reload — the caller decides (the interview reloads; the
 * cloud-hydrate path re-renders instead).
 */
export function applyPersonalization(userId: string, result: PersonalizationResult): void {
  try {
    saveGoals(userId, result.goals)
    saveOverallGoal(userId, result.overall)
    setActiveGoalId(userId, result.activeId)
    saveProfile(userId, result.profile)
    writeScoped(userId, 'noticed', JSON.stringify(result.notices))
    writeScoped(userId, 'ideas', JSON.stringify(result.ideas))

    dashboardChrome.update(userId, {
      background: { mode: 'world', accent: result.chromeAccent, particles: 24, mountains: true, speed: 1 },
      greeting: {
        mode: result.greeting && result.greeting.trim() ? 'custom' : 'auto',
        text: result.greeting?.trim() ?? '',
        showName: true,
        accentName: true,
        scale: 1,
      },
    })

    if (isThemeId(result.theme)) saveTheme(userId, result.theme)
    // A V2 build lays the row out too; a V1 result (old cloud copy) leaves it alone.
    if (Array.isArray(result.order)) writeScoped(userId, 'eq:order', JSON.stringify(result.order))
    if (Array.isArray(result.removed)) writeScoped(userId, 'eq:removed', JSON.stringify(result.removed))

    writeScoped(userId, ONBOARDED_NAME, '1')
    // re-tint the room live (Dashboard listens for this)
    window.dispatchEvent(new CustomEvent('vitality:goal'))
  } catch {
    /* localStorage blocked — the interview still closes, board falls back to defaults */
  }
}

// Cloud writes of `_config` run one at a time, so a quick restore-then-remove
// cannot land in the wrong order and leave the older layout in the cloud.
let configQueue: Promise<void> = Promise.resolve()
function enqueueConfig(job: () => Promise<void>): Promise<void> {
  configQueue = configQueue.then(job).catch((e) => console.warn('could not save the board to the cloud', e))
  return configQueue
}

/**
 * Cloud mirror of the answers + result, so it follows the account. Callers that
 * reload right after must await it: a reload cancels a write still in flight.
 */
export function mirrorPersonalization(answers: InterviewAnswers | InterviewAnswersV2, result: PersonalizationResult, aiBoard: unknown = null): Promise<void> {
  if (!syncEnabled()) return Promise.resolve()
  return enqueueConfig(async () => {
    if (!(await syncSave(CONFIG_TILE_ID, { answers, result, aiBoard }, new Date().toISOString()))) throw new Error('syncSave failed')
  })
}

const readJson = (userId: string, name: string): unknown => {
  try {
    return JSON.parse(readScoped(userId, name) || 'null')
  } catch {
    return null
  }
}

/**
 * After a change to a built board on this device (the reasoning room): rewrite
 * the cloud copy's layout, weights, ideas and AI record from local state, so a
 * second device hydrates the board as it is now, not as it was built.
 */
export function mirrorBoardChange(userId: string): Promise<void> {
  if (!syncEnabled()) return Promise.resolve()
  return enqueueConfig(async () => {
    const blob = (await syncLoad(CONFIG_TILE_ID)) as { result?: PersonalizationResult } | null
    if (!blob?.result) return // nothing in the cloud to update (built while signed out)
    const list = (name: string) => {
      const v = readJson(userId, name)
      return Array.isArray(v) ? (v as string[]) : undefined
    }
    const ideas = readJson(userId, 'ideas') as PersonalizationResult['ideas'] | null
    const result: PersonalizationResult = {
      ...blob.result,
      overall: overallGoal(userId),
      goals: goals(userId),
      order: list('eq:order') ?? blob.result.order,
      removed: list('eq:removed') ?? blob.result.removed,
      ideas: ideas && typeof ideas === 'object' ? ideas : blob.result.ideas,
    }
    if (!(await syncSave(CONFIG_TILE_ID, { ...blob, result, aiBoard: readJson(userId, 'ai:board') }, new Date().toISOString()))) throw new Error('syncSave failed')
  })
}

/** Restore personalization from the cloud on a fresh device. Returns whether it applied. */
export async function hydratePersonalizationFromCloud(userId: string): Promise<boolean> {
  if (!syncEnabled()) return false
  try {
    const blob = (await syncLoad(CONFIG_TILE_ID)) as { result?: PersonalizationResult; aiBoard?: unknown } | null
    if (blob && blob.result && Array.isArray(blob.result.goals)) {
      applyPersonalization(userId, blob.result)
      // The AI record (lib/aiBoard.ts reads it); a rule-built board has none.
      if (blob.aiBoard) writeScoped(userId, 'ai:board', JSON.stringify(blob.aiBoard))
      else removeScoped(userId, 'ai:board')
      return true
    }
  } catch {
    /* offline / missing — fall through to the interview */
  }
  return false
}

/** Mark onboarding skipped (explore the demo board first). */
export function skipOnboarding(userId: string): void {
  writeScoped(userId, ONBOARDED_NAME, 'skip')
}

/** Clear onboarding state so the interview shows again ("Redo the interview"). */
export function resetOnboarding(userId: string): void {
  removeScoped(userId, ONBOARDED_NAME)
}

/** Current onboarding state, read synchronously. */
export function onboardingState(userId: string): 'done' | 'skip' | 'none' {
  const v = readScoped(userId, ONBOARDED_NAME)
  if (v === '1') return 'done'
  if (v === 'skip') return 'skip'
  return 'none'
}
