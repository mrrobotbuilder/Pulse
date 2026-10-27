'use client'

import { useEffect, useState } from 'react'
import { CORE_TILES } from '@/lib/tiles/coreTiles'
import { tileInfo } from '@/lib/tiles/tileInfo'
import { THEMES } from '@/lib/theme'
import { planIdeas, type PlanTile } from '@/lib/boardPlan'
import { chooseIdea, chooseTile, hiddenTiles, saveAiBoard, type AiBoard } from '@/lib/aiBoard'

const label = (id: string) => CORE_TILES[id as keyof typeof CORE_TILES]?.label ?? id

/**
 * What the AI decided about this board, and the person's say over each call
 * (docs/PLAN.md, Stage 6): remove on every shown tile, restore on every hidden
 * one, add it / not for me on every idea. The reveal screen and the gear's
 * "Your board's reasoning" room both draw this.
 */
export function BoardReasoning({ userId, rec, onChange }: { userId: string; rec: AiBoard; onChange: (r: AiBoard) => void }) {
  const hidden = hiddenTiles(userId)
  const rows = rec.plan.tiles.map((t) => ({ ...t, on: !hidden.includes(t.id) }))
  const shown = rows.filter((r) => r.on)
  const off = rows.filter((r) => !r.on)
  const theme = THEMES.find((t) => t.id === rec.plan.theme)
  const ideas = planIdeas(rec.plan)

  // A restored or removed tile moves to the other list; keep keyboard focus on its new button.
  const [moved, setMoved] = useState<string | null>(null)
  useEffect(() => {
    if (moved) document.querySelector<HTMLButtonElement>(`[data-reason-btn="${moved}"]`)?.focus()
  }, [moved, rec])
  const set = (id: PlanTile, show: boolean) => {
    onChange(chooseTile(userId, rec, id, show))
    setMoved(id)
  }

  const row = (r: (typeof rows)[number], action: React.ReactNode) => (
    <li key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <i className={`sw ${tileInfo(r.id).hatch}`} aria-hidden="true" style={{ flex: 'none', marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{label(r.id)}</b>
        <p className="muted" style={{ fontSize: 15 }}>{r.why || 'The AI did not say why.'}</p>
        {/* Read from the board itself, so a tile removed in Edit mode says so too. */}
        {r.show !== r.on && <p className="ann" style={{ marginTop: 4 }}>{r.on ? 'The AI hid this · you brought it back' : 'The AI showed this · you removed it'}</p>}
      </div>
      {action}
    </li>
  )

  return (
    <div>
      <p className="ann" style={{ marginTop: 18 }}>On your board · {shown.length}</p>
      <ul style={{ listStyle: 'none' }}>
        {shown.map((r) =>
          row(
            r,
            <button type="button" className="tab" data-reason-btn={r.id} aria-label={`Remove ${label(r.id)}`} disabled={shown.length === 1} title={shown.length === 1 ? 'Keep at least one tile' : undefined} onClick={() => set(r.id, false)}>
              Remove
            </button>,
          ),
        )}
      </ul>

      <p className="ann" style={{ marginTop: 18 }}>Hidden · {off.length}</p>
      {off.length ? (
        <ul style={{ listStyle: 'none' }}>
          {off.map((r) =>
            row(
              r,
              <button type="button" className="tab" data-reason-btn={r.id} aria-label={`Restore ${label(r.id)}`} onClick={() => set(r.id, true)}>
                Restore
              </button>,
            ),
          )}
        </ul>
      ) : (
        <p className="muted" style={{ marginTop: 6 }}>Nothing hidden: every tile is on your board.</p>
      )}

      <p className="ann" style={{ marginTop: 18 }}>The paper</p>
      <p style={{ marginTop: 6 }}>
        <b>{theme?.name ?? rec.plan.theme}</b> <span className="muted">· {rec.plan.themeWhy || 'The AI did not say why.'}</span>
      </p>

      {ideas.length > 0 && (
        <>
          <p className="ann" style={{ marginTop: 18 }}>Tiles it would add</p>
          <ul style={{ listStyle: 'none' }}>
            {ideas.map((idea) => {
              const choice = rec.ideas[idea.title]
              return (
                <li key={idea.title} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <b>{idea.title}</b>
                  {idea.tracks && <span className="muted"> · {idea.tracks}</span>}
                  {idea.why && <p className="muted" style={{ fontSize: 15 }}>{idea.why}</p>}
                  <div className="chips" role="group" aria-label={`${idea.title}: your call`} style={{ marginTop: 8 }}>
                    <button type="button" className="chip" aria-pressed={choice === 'add'} onClick={() => onChange(chooseIdea(userId, rec, idea, 'add'))}>
                      Add it
                    </button>
                    <button type="button" className="chip" aria-pressed={choice === 'no'} onClick={() => onChange(chooseIdea(userId, rec, idea, 'no'))}>
                      Not for me
                    </button>
                  </div>
                  {choice && (
                    <p className="ann" role="status" style={{ marginTop: 6 }}>
                      {choice === 'add' ? 'Kept on your list of tiles to build.' : 'Dropped. The mentor will not suggest it again.'}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

/** The reveal: shown once, right after an AI build. */
export function RevealSheet({ userId, rec: first, onDone }: { userId: string; rec: AiBoard; onDone: () => void }) {
  const [rec, setRec] = useState(first)
  const done = () => {
    void saveAiBoard(userId, { ...rec, revealed: true })
    onDone()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-labelledby="reveal-h" style={{ zIndex: 150 }}>
      <div className="sheet" style={{ width: 'min(620px, 100%)' }}>
        <div className="sheet-body">
          <p className="ann">Built by the AI from your answers</p>
          <h2 id="reveal-h" tabIndex={-1} autoFocus>
            Why your board looks like this
          </h2>
          <p className="muted">
            Every call below came from what you wrote. Disagree with one? Change it here, or any time in the gear under <b style={{ color: 'var(--text)' }}>Your board&apos;s reasoning</b>.
          </p>
          <BoardReasoning userId={userId} rec={rec} onChange={setRec} />
          <button type="button" className="btn" style={{ width: '100%', marginTop: 22 }} onClick={done}>
            Show me my board
          </button>
        </div>
      </div>
    </div>
  )
}
