'use client'

/**
 * "Why your board looks like this" (docs/PLAN.md, Stage 6): the AI's plan for
 * this board plus what the person decided about it, under the scoped key
 * `ai:board`, mirrored to the cloud `_config` slot.
 *
 * The board itself still reads only its own keys (`eq:removed`, the goals, the
 * idea lists); the actions here write those keys and record the decision, so
 * nothing the AI did is permanent: a tile it hid can be restored, one it showed
 * removed, and the whole AI board undone back to the rule-based one.
 */
import { planIdeas, setTileShown, type BoardPlan, type PlanTile } from './boardPlan'
import { applyPersonalization, mapAnswersV2, mirrorBoardChange, mirrorPersonalization, type InterviewAnswersV2 } from './onboarding'
import { readScoped, writeScoped, removeScoped } from './localScope'
import { goals, overallGoal, saveGoals, saveOverallGoal, type TileIdea } from './tiles/weights'
import { customTileId } from './tiles/tileCheck'
import { saveCustomTile } from './tiles/customTiles'
import { tileStore } from './tiles/tileStore'

const KEY = 'ai:board'

export interface AiBoard {
  plan: BoardPlan
  /** The answers the plan was built from; undo rebuilds the rule board from them. null on a Stage 5 record. */
  answers: InterviewAnswersV2 | null
  /** Tiles the person changed: 'restored' = the AI hid it, 'removed' = the AI showed it. */
  tiles: Partial<Record<PlanTile, 'restored' | 'removed'>>
  /** The person's answer to each idea, by title. */
  ideas: Record<string, 'add' | 'no'>
  /** The reveal screen has been seen. */
  revealed: boolean
  /** Tiles the AI wrote for an idea (Stage 7), by idea title. A build in flight is not stored (see building()). */
  built: Record<string, BuiltTile>
  /** The reveal still has to start the automatic builds (true only on a fresh AI board). */
  autoBuild: boolean
}

/**
 * One AI-written tile, by where it stands: `ready` waits in a preview card
 * (its HTML kept here until the person decides), `failed` stayed an idea,
 * `added` is on the board as `id`, `declined` was dropped from the preview.
 */
export type BuiltTile =
  | { status: 'ready'; html: string }
  | { status: 'failed'; reason: string }
  | { status: 'added'; id: string; cloud: boolean }
  | { status: 'declined' }

export function newAiBoard(plan: BoardPlan, answers: InterviewAnswersV2): AiBoard {
  return { plan, answers, tiles: {}, ideas: {}, revealed: false, built: {}, autoBuild: true }
}

/** At most this many tiles are written without being asked, per AI board. */
export const AUTO_BUILDS = 2

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** The record, or null when the rules built this board. */
export function readAiBoard(userId: string): AiBoard | null {
  let o: Record<string, unknown>
  try {
    o = obj(JSON.parse(readScoped(userId, KEY) || 'null'))
  } catch {
    return null
  }
  // Stage 5 stored the bare plan, with no answers to undo from.
  if (!o.plan && Array.isArray(o.tiles)) return { plan: o as unknown as BoardPlan, answers: null, tiles: {}, ideas: {}, revealed: true, built: {}, autoBuild: false }
  if (!Array.isArray(obj(o.plan).tiles)) return null
  const answers = obj(o.answers).version === 2 ? (o.answers as InterviewAnswersV2) : null
  // autoBuild only when the record says so: a Stage 5/6 record never builds by itself.
  return { plan: o.plan as BoardPlan, answers, tiles: obj(o.tiles) as AiBoard['tiles'], ideas: obj(o.ideas) as AiBoard['ideas'], revealed: o.revealed === true, built: obj(o.built) as AiBoard['built'], autoBuild: o.autoBuild === true }
}

/** Save the record locally and in the cloud. */
export function saveAiBoard(userId: string, rec: AiBoard): Promise<void> {
  writeScoped(userId, KEY, JSON.stringify(rec))
  return mirrorBoardChange(userId)
}

export function hiddenTiles(userId: string): string[] {
  try {
    const v = JSON.parse(readScoped(userId, 'eq:removed') || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Restore (show) or remove (hide) one tile, keep the weights at 100, and redraw the board. */
export function chooseTile(userId: string, rec: AiBoard, id: PlanTile, show: boolean): AiBoard {
  showOnBoard(userId, id, show, rec.plan.overallWeights[id])

  const tiles = { ...rec.tiles }
  if (rec.plan.tiles.find((t) => t.id === id)?.show === show) delete tiles[id]
  else tiles[id] = show ? 'restored' : 'removed'
  const out = { ...rec, tiles }
  void saveAiBoard(userId, out)
  window.dispatchEvent(new CustomEvent('pulse:layout'))
  return out
}

/** Show or hide tile `id` (a fixed one or custom-*) with the weights kept at 100. */
function showOnBoard(userId: string, id: string, show: boolean, share?: number): void {
  const ov = overallGoal(userId)
  const gs = goals(userId)
  const next = setTileShown({ removed: hiddenTiles(userId), overall: ov.weights, goals: gs.map((g) => g.weights) }, id, show, share)
  writeScoped(userId, 'eq:removed', JSON.stringify(next.removed))
  saveOverallGoal(userId, { ...ov, weights: next.overall })
  saveGoals(userId, gs.map((g, i) => ({ ...g, weights: next.goals[i] })))
}

/**
 * Answer one idea. "Not for me" takes it out of every idea list the mentor
 * shows; "Add it" keeps it on the main goal's list (building it is Stage 7).
 */
export function chooseIdea(userId: string, rec: AiBoard, idea: TileIdea, choice: 'add' | 'no'): AiBoard {
  const lists = obj((() => {
    try {
      return JSON.parse(readScoped(userId, 'ideas') || 'null')
    } catch {
      return null
    }
  })()) as Record<string, TileIdea[]>
  for (const k of Object.keys(lists)) lists[k] = Array.isArray(lists[k]) ? lists[k].filter((i) => i?.title !== idea.title) : []
  if (choice === 'add') lists.overall = [idea, ...(lists.overall ?? [])]
  writeScoped(userId, 'ideas', JSON.stringify(lists))
  const out = { ...rec, ideas: { ...rec.ideas, [idea.title]: choice } }
  void saveAiBoard(userId, out)
  return out
}

/**
 * Undo the whole AI board: the rule-based board from the same answers, with one
 * line saying so. Awaits the cloud write, since the caller reloads next.
 */
export async function undoAiBoard(userId: string, rec: AiBoard): Promise<void> {
  if (!rec.answers) throw new Error('no answers to rebuild from')
  const draft = mapAnswersV2(rec.answers)
  const [first, ...rest] = draft.notices
  const result = { ...draft, notices: [{ ...first, text: `You undid the AI board, so the rules built this one from the same answers. ${first.text}` }, ...rest] }
  applyPersonalization(userId, result)
  removeScoped(userId, KEY)
  await mirrorPersonalization(rec.answers, result, null)
}

/* ── Stage 7: the AI writes the tile for an idea ── */

// Builds in flight, by user and idea title. Memory only: a reload mid-build
// leaves no stuck "writing…" behind, and the idea can simply be built again.
const inFlight = new Set<string>()
const flightKey = (userId: string, title: string) => `${userId}|${title}`
export const building = (userId: string, title: string) => inFlight.has(flightKey(userId, title))

/** Tell every view of the record (reveal, gear) to re-read it. */
const announce = () => window.dispatchEvent(new CustomEvent('pulse:aiboard'))

/** Change one idea's built tile on the LATEST stored record (builds finish in any order). */
function setBuilt(userId: string, title: string, next: BuiltTile | null): AiBoard | null {
  const rec = readAiBoard(userId)
  if (!rec) return null
  const built = { ...rec.built }
  if (next) built[title] = next
  else delete built[title]
  const out = { ...rec, built }
  void saveAiBoard(userId, out)
  return out
}

/** The spec the tile writer gets for an idea (app/api/tiles/generate). */
const specFor = (idea: TileIdea) => ({ name: idea.title, tracks: idea.tracks ?? '', why: idea.why ?? '' })

/**
 * Ask the AI to write the tile for one idea. Resolves once it waits in a
 * preview card, or failed (the idea stays an idea; `reason` says why).
 */
export async function buildTile(userId: string, idea: TileIdea): Promise<void> {
  const key = flightKey(userId, idea.title)
  if (inFlight.has(key)) return
  inFlight.add(key)
  let result: BuiltTile
  try {
    setBuilt(userId, idea.title, null)
    announce()
    const res = await fetch('/api/tiles/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: specFor(idea) }),
      signal: AbortSignal.timeout(150_000),
    })
    const json = await res.json().catch(() => null)
    result =
      res.ok && typeof json?.html === 'string'
        ? { status: 'ready', html: json.html }
        : { status: 'failed', reason: typeof json?.reason === 'string' ? json.reason : 'ai_error' }
  } catch (e) {
    result = { status: 'failed', reason: e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'offline' }
  } finally {
    inFlight.delete(key)
  }
  setBuilt(userId, idea.title, result)
  announce()
}

/** The automatic builds after a fresh AI board: its first AUTO_BUILDS new-tile specs, once. */
export function startAutoBuilds(userId: string): void {
  const rec = readAiBoard(userId)
  if (!rec?.autoBuild) return
  void saveAiBoard(userId, { ...rec, autoBuild: false })
  const ideas = planIdeas(rec.plan)
  for (const t of rec.plan.newTiles.slice(0, AUTO_BUILDS)) {
    const idea = ideas.find((i) => i.title === t.name)
    if (idea) void buildTile(userId, idea)
  }
}

/**
 * "Add to my board": the previewed tile becomes a custom tile, shown with the
 * weight the plan gave the idea (the goals renormalize), placed last in the
 * row, and taken off the idea lists. `cloud` on its built entry is false when
 * the tile could not reach the person's other devices.
 */
export async function acceptTile(userId: string, idea: TileIdea): Promise<AiBoard | null> {
  const rec = readAiBoard(userId)
  const built = rec?.built[idea.title]
  if (!rec || built?.status !== 'ready') return rec
  const id = customTileId(idea.title, tileStore.listTiles(userId).map((t) => t.id))
  const cloud = await saveCustomTile(userId, { id, name: idea.title, html: built.html, tracks: idea.tracks })
  showOnBoard(userId, id, true, idea.estWeight)
  try {
    const order = JSON.parse(readScoped(userId, 'eq:order') || 'null')
    if (Array.isArray(order) && order.length) writeScoped(userId, 'eq:order', JSON.stringify([...order.filter((x) => x !== id), id]))
  } catch {
    /* no saved order: new tiles append anyway */
  }
  // Built now, so it is no longer an idea the mentor offers. Re-read: another
  // build may have finished while the cloud save was in flight.
  const after = chooseIdea(userId, readAiBoard(userId) ?? rec, idea, 'no')
  const out: AiBoard = { ...after, ideas: { ...after.ideas, [idea.title]: 'add' }, built: { ...after.built, [idea.title]: { status: 'added', id, cloud } } }
  // Not awaited: the tile is on the board now, and a failed cloud mirror of the
  // record must not make the caller offer "Add" again.
  void saveAiBoard(userId, out)
  window.dispatchEvent(new CustomEvent('pulse:layout'))
  announce()
  return out
}

/** "Not for me": drop the previewed tile. The idea stays, and can be built again. */
export function declineTile(userId: string, idea: TileIdea): AiBoard | null {
  const out = setBuilt(userId, idea.title, { status: 'declined' })
  announce()
  return out
}
