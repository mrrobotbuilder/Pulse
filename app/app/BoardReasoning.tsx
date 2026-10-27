'use client'

import { useEffect, useRef, useState } from 'react'
import { CORE_TILES } from '@/lib/tiles/coreTiles'
import { tileInfo } from '@/lib/tiles/tileInfo'
import { withBridge } from '@/lib/tiles/tileBridge'
import { THEMES, themeTokens } from '@/lib/theme'
import { planIdeas, type PlanTile } from '@/lib/boardPlan'
import { acceptTile, building, buildTile, chooseIdea, chooseTile, declineTile, hiddenTiles, readAiBoard, saveAiBoard, startAutoBuilds, type AiBoard } from '@/lib/aiBoard'
import type { TileIdea } from '@/lib/tiles/weights'

const label = (id: string) => CORE_TILES[id as keyof typeof CORE_TILES]?.label ?? id

/** Why a tile the AI was asked to write did not come, in one plain line. */
function failLine(reason: string): string {
  if (reason === 'cap_ip') return "You have used today's AI builds. Try again tomorrow."
  if (reason === 'cap_day') return 'The AI has done all its building for today. Try again tomorrow.'
  if (reason === 'no_key' || reason === 'caps_unavailable') return 'The AI is switched off on this board right now.'
  if (reason.startsWith('refused_')) return 'The tile it wrote reached outside its box, so it was thrown away.'
  if (reason === 'offline') return 'Could not reach the AI. Check your connection.'
  return 'The AI could not write it this time.'
}

/**
 * A generated tile running in the same sandbox as the board's tiles, before it
 * lands. Its Pulse.save/load answer from memory only: nothing typed here is kept.
 */
function TilePreview({ title, html }: { title: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    let mem: unknown = null
    const on = (e: MessageEvent) => {
      const win = frame.current?.contentWindow
      const m = e.data
      if (!win || e.source !== win || m?.source !== 'vitality-tile' || !m.id) return
      if (m.type === 'load') win.postMessage({ source: 'vitality-host', type: 'load:result', id: m.id, data: mem }, '*')
      else if (m.type === 'save') {
        mem = m.data
        win.postMessage({ source: 'vitality-host', type: 'save:ok', id: m.id }, '*')
      }
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])
  return (
    <figure style={{ marginTop: 10, border: '1px solid var(--line)' }}>
      <figcaption className="ann" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
        Preview · try it, nothing here is kept
      </figcaption>
      <iframe ref={frame} srcDoc={withBridge(html, themeTokens())} sandbox="allow-scripts" title={`Preview: ${title}`} style={{ display: 'block', width: '100%', height: 420, border: 0 }} />
    </figure>
  )
}

/** One idea's AI-written tile: build it, preview it, add it or drop it. */
function IdeaBuild({ userId, rec, idea, onChange }: { userId: string; rec: AiBoard; idea: TileIdea; onChange: (r: AiBoard) => void }) {
  const built = rec.built[idea.title]
  const [adding, setAdding] = useState(false)
  if (building(userId, idea.title)) {
    return (
      <p className="ann" role="status" style={{ marginTop: 8 }}>
        Writing your tile… this takes up to a minute.
      </p>
    )
  }
  if (built?.status === 'added') {
    return (
      <p className="ann" role="status" style={{ marginTop: 8 }}>
        On your board.{built.cloud ? '' : ' Saved on this device only: it did not reach your other devices.'}
      </p>
    )
  }
  if (built?.status === 'ready') {
    const add = async () => {
      setAdding(true)
      try {
        const out = await acceptTile(userId, idea)
        if (out) onChange(out)
      } finally {
        setAdding(false)
      }
    }
    return (
      <>
        <TilePreview title={idea.title} html={built.html} />
        <div className="chips" role="group" aria-label={`${idea.title}: keep the tile?`} style={{ marginTop: 8 }}>
          <button type="button" className="btn" disabled={adding} onClick={add}>
            {adding ? 'Adding…' : 'Add to my board'}
          </button>
          <button type="button" className="btn ghost" disabled={adding} onClick={() => { const out = declineTile(userId, idea); if (out) onChange(out) }}>
            Not for me
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      {built?.status === 'failed' && (
        <p className="ann" role="status" style={{ marginTop: 8 }}>
          {failLine(built.reason)} It stays an idea.
        </p>
      )}
      {built?.status === 'declined' && (
        <p className="ann" role="status" style={{ marginTop: 8 }}>
          Dropped that tile. Ask for another any time.
        </p>
      )}
      <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={() => void buildTile(userId, idea)}>
        {built?.status === 'failed' ? 'Try again' : 'Build me one for this'}
      </button>
    </>
  )
}

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

  // A tile build started, finished or was answered (here or in another view): re-read the record.
  useEffect(() => {
    const on = () => {
      const r = readAiBoard(userId)
      if (r) onChange(r)
    }
    window.addEventListener('pulse:aiboard', on)
    return () => window.removeEventListener('pulse:aiboard', on)
  }, [userId, onChange])

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
              // While its tile is being written, previewed or on the board, the
              // question is about the tile, so the idea's own buttons step aside.
              const tileStatus = rec.built[idea.title]?.status
              const tileInPlay = building(userId, idea.title) || tileStatus === 'ready' || tileStatus === 'added'
              return (
                <li key={idea.title} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <b>{idea.title}</b>
                  {idea.tracks && <span className="muted"> · {idea.tracks}</span>}
                  {idea.why && <p className="muted" style={{ fontSize: 15 }}>{idea.why}</p>}
                  {!tileInPlay && (
                    <div className="chips" role="group" aria-label={`${idea.title}: your call`} style={{ marginTop: 8 }}>
                      <button type="button" className="chip" aria-pressed={choice === 'add'} onClick={() => onChange(chooseIdea(userId, rec, idea, 'add'))}>
                        Add it
                      </button>
                      <button type="button" className="chip" aria-pressed={choice === 'no'} onClick={() => onChange(chooseIdea(userId, rec, idea, 'no'))}>
                        Not for me
                      </button>
                    </div>
                  )}
                  {choice && !tileInPlay && (
                    <p className="ann" role="status" style={{ marginTop: 6 }}>
                      {choice === 'add' ? 'Kept on your list of tiles to build.' : 'Dropped. The mentor will not suggest it again.'}
                    </p>
                  )}
                  <IdeaBuild userId={userId} rec={rec} idea={idea} onChange={onChange} />
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
    void saveAiBoard(userId, { ...(readAiBoard(userId) ?? rec), revealed: true })
    onDone()
  }
  // A fresh AI board: write the first tiles it planned while the person reads (once).
  useEffect(() => startAutoBuilds(userId), [userId])
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
