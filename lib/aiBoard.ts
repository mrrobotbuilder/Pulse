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
import { setTileShown, type BoardPlan, type PlanTile } from './boardPlan'
import { applyPersonalization, mapAnswersV2, mirrorBoardChange, mirrorPersonalization, type InterviewAnswersV2 } from './onboarding'
import { readScoped, writeScoped, removeScoped } from './localScope'
import { goals, overallGoal, saveGoals, saveOverallGoal, type TileIdea } from './tiles/weights'

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
}

export function newAiBoard(plan: BoardPlan, answers: InterviewAnswersV2): AiBoard {
  return { plan, answers, tiles: {}, ideas: {}, revealed: false }
}

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
  if (!o.plan && Array.isArray(o.tiles)) return { plan: o as unknown as BoardPlan, answers: null, tiles: {}, ideas: {}, revealed: true }
  if (!Array.isArray(obj(o.plan).tiles)) return null
  const answers = obj(o.answers).version === 2 ? (o.answers as InterviewAnswersV2) : null
  return { plan: o.plan as BoardPlan, answers, tiles: obj(o.tiles) as AiBoard['tiles'], ideas: obj(o.ideas) as AiBoard['ideas'], revealed: o.revealed === true }
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
  const ov = overallGoal(userId)
  const gs = goals(userId)
  const next = setTileShown({ removed: hiddenTiles(userId), overall: ov.weights, goals: gs.map((g) => g.weights) }, id, show, rec.plan.overallWeights[id])
  writeScoped(userId, 'eq:removed', JSON.stringify(next.removed))
  saveOverallGoal(userId, { ...ov, weights: next.overall })
  saveGoals(userId, gs.map((g, i) => ({ ...g, weights: next.goals[i] })))

  const tiles = { ...rec.tiles }
  if (rec.plan.tiles.find((t) => t.id === id)?.show === show) delete tiles[id]
  else tiles[id] = show ? 'restored' : 'removed'
  const out = { ...rec, tiles }
  void saveAiBoard(userId, out)
  window.dispatchEvent(new CustomEvent('pulse:layout'))
  return out
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
