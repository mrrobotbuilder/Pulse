'use client'

import { useState } from 'react'
import styles from './dashboard.module.css'
import { tileInfo } from '@/lib/tiles/tileInfo'
import { allGoals, saveGoals, saveOverallGoal, activeGoalId, setActiveGoalId, type Goal } from '@/lib/tiles/weights'
import { normalizeWeights, evenWeights, goalId } from '@/lib/tiles/goalMath'
import { mirrorBoardChange } from '@/lib/onboarding'

/**
 * The goals sheet: rename, re-weigh, add and delete goals yourself.
 *
 * The gold overall goal can be renamed and re-weighed but not deleted (the
 * board always has one). Every goal's weights are saved as whole numbers that
 * sum to 100 (goalMath.normalizeWeights); the sliders can say anything, the
 * save scales them. A new goal starts split evenly across the board's tiles.
 */

type Draft = Goal & { open?: boolean }

const sum = (w: Record<string, number>) => Object.values(w).reduce((s, v) => s + (v > 0 ? v : 0), 0)

export default function GoalsEditor({
  userId,
  tileIds,
  labelFor,
  onClose,
  onSaved,
}: {
  userId: string
  /** The tiles on the board, in board order: the rows each goal can weigh. */
  tileIds: string[]
  labelFor: (id: string) => string
  onClose: () => void
  onSaved: (activeId: string, mirrorFailed: boolean) => void
}) {
  const [list, setList] = useState<Draft[]>(() => allGoals(userId).map((g) => ({ ...g, weights: { ...g.weights } })))
  const [newTitle, setNewTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const patch = (id: string, change: Partial<Draft>) => setList((l) => l.map((g) => (g.id === id ? { ...g, ...change } : g)))
  const setWeight = (g: Draft, tile: string, v: number) => patch(g.id, { weights: { ...g.weights, [tile]: v } })

  const addGoal = () => {
    const title = newTitle.trim()
    if (!title) return
    const id = goalId(title, list.map((g) => g.id))
    setList((l) => [...l.map((g) => ({ ...g, open: false })), { id, title, weights: evenWeights(tileIds), open: true }])
    setNewTitle('')
  }

  const save = async () => {
    setError(null)
    const clean: Goal[] = []
    for (const g of list) {
      const title = g.title.trim()
      if (!title) return setError('Every goal needs a name.')
      const weights = normalizeWeights(g.weights)
      if (!Object.keys(weights).length) return setError(`Give "${title}" at least one tile, so it has something to add up.`)
      const { open: _open, pending: _pending, ...rest } = g
      clean.push({ ...rest, title, weights })
    }
    setSaving(true)
    const [overall, ...rest] = clean
    saveOverallGoal(userId, overall)
    saveGoals(userId, rest)
    // A deleted active goal hands the board to the gold goal.
    let active = activeGoalId(userId)
    if (!clean.some((g) => g.id === active)) {
      active = overall.id
      setActiveGoalId(userId, active)
    }
    window.dispatchEvent(new CustomEvent('vitality:goal'))
    // The goals are saved on this device now; a failed mirror only means other devices lag.
    const mirrorFailed = await mirrorBoardChange(userId).then(() => false, () => true)
    setSaving(false)
    onSaved(active, mirrorFailed)
  }

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="Your goals" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ width: 'min(760px, 100%)' }}>
        <div className="sheet-head">
          <span className="ann">Your goals</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="sheet-body">
          <p className="muted">
            Rename a goal, say how much each tile moves it, add a new one or delete one you are done with. Each goal adds up to 100; we scale the sliders for you when you save.
          </p>

          <ol className={styles.geList}>
            {list.map((g, i) => {
              const total = sum(g.weights)
              const isOverall = i === 0
              // The board's tiles, plus any tile this goal still weighs that is not on the board.
              const rows = [...tileIds, ...Object.keys(g.weights).filter((id) => !tileIds.includes(id) && g.weights[id] > 0)]
              const weighed = rows.filter((id) => (g.weights[id] ?? 0) > 0)
              return (
                <li key={g.id} className={`${styles.geGoal} ${isOverall ? styles.geOverall : ''}`}>
                  <div className={styles.geHead}>
                    <label className="ann" htmlFor={`ge-${g.id}`}>
                      {isOverall ? 'Overall goal · gold' : 'Goal'}
                    </label>
                    <input id={`ge-${g.id}`} className={`input ${styles.geTitle}`} value={g.title} maxLength={80} onChange={(e) => patch(g.id, { title: e.target.value })} />
                  </div>

                  <div className={styles.geMini} aria-hidden="true">
                    {weighed.map((id) => (
                      <i key={id} className={tileInfo(id).hatch} style={{ flexGrow: g.weights[id] }} title={labelFor(id)} />
                    ))}
                    {!weighed.length && <span>No tiles weighed yet</span>}
                  </div>

                  <div className={styles.geActions}>
                    <button type="button" className="btn ghost" aria-expanded={!!g.open} onClick={() => patch(g.id, { open: !g.open })}>
                      {g.open ? 'Hide weights' : 'Weights'}
                    </button>
                    {!isOverall &&
                      (confirmId === g.id ? (
                        <span className={styles.geConfirm} role="group" aria-label={`Delete ${g.title}?`}>
                          <span>Delete this goal?</span>
                          <button type="button" className="btn ghost" onClick={() => setConfirmId(null)}>
                            Keep it
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setList((l) => l.filter((x) => x.id !== g.id))
                              setConfirmId(null)
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      ) : (
                        <button type="button" className={`btn ghost ${styles.geDelete}`} onClick={() => setConfirmId(g.id)}>
                          Delete
                        </button>
                      ))}
                  </div>

                  {g.open && (
                    <div className={styles.geWeights}>
                      {rows.map((id) => {
                        const v = g.weights[id] ?? 0
                        const share = total ? Math.round((v / total) * 100) : 0
                        return (
                          <div key={id} className={styles.geRow}>
                            <i className={`sw ${tileInfo(id).hatch}`} aria-hidden="true" />
                            <label htmlFor={`gw-${g.id}-${id}`}>{labelFor(id)}</label>
                            <input
                              id={`gw-${g.id}-${id}`}
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={v}
                              aria-valuetext={`${share} percent of this goal`}
                              onChange={(e) => setWeight(g, id, Number(e.target.value))}
                            />
                            <output htmlFor={`gw-${g.id}-${id}`}>{share}%</output>
                          </div>
                        )
                      })}
                      <div className={styles.geTotal}>
                        <span className="ann">{total === 100 ? 'Adds up to 100' : total ? `Sliders add up to ${total}, saved as 100` : 'Nothing weighed yet'}</span>
                        <button type="button" className="btn ghost" onClick={() => patch(g.id, { weights: evenWeights(tileIds) })}>
                          Split evenly
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          <form
            className={styles.geAdd}
            onSubmit={(e) => {
              e.preventDefault()
              addGoal()
            }}
          >
            <label htmlFor="ge-new" className="field-label" style={{ margin: 0 }}>
              Add a goal
            </label>
            <div>
              <input id="ge-new" className="input" value={newTitle} maxLength={80} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Run a half marathon in May" />
              <button type="submit" className="btn ghost" disabled={!newTitle.trim()}>
                + Add
              </button>
            </div>
          </form>

          {error && (
            <p className={styles.pickError} role="alert" style={{ marginTop: 16 }}>
              {error}
            </p>
          )}

          <div className={styles.geFoot}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save goals'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
