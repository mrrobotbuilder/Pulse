'use client'

import { useEffect, useRef, useState } from 'react'
import DashboardHeaderGem from '@/app/app/DashboardHeaderGem'
import WeightStrip from '@/app/app/WeightStrip'
import styles from '@/app/app/dashboard.module.css'
import { CORE_TILES } from '@/lib/tiles/coreTiles'
import { tileInfo } from '@/lib/tiles/tileInfo'
import { prepareLocalNamespace } from '@/lib/migrateLocal'
import {
  allGoals,
  activeGoalId,
  setActiveGoalId,
  goals,
  saveGoals,
  noticedFeed,
  tileIdeas,
  type Goal,
} from '@/lib/tiles/weights'

/**
 * The Mentor — the equation, written out. When the mentor is opened the board
 * steps back and this remains:
 *
 *        the gem · "The math"
 *        [ pick your goal ]
 *        w + w + w + w   (each tile's weight, with its hatch)   [+ ideas]
 *        = y             (the goal, how far you've come, what the mentor saw)
 *
 * Every number is DATA, pre-written by the mentor (Claude Code) from data
 * sweeps — analytics, manual logs, wearables. The app never guesses.
 */

const label = (tile: string) => CORE_TILES[tile as keyof typeof CORE_TILES]?.label ?? tile

export default function MentorPage({
  userId,
  overlay = false,
  onClose,
}: {
  /** whose goals to read — see lib/localScope.ts */
  userId: string
  /** true when the mentor "comes alive" over the board (no page load) */
  overlay?: boolean
  onClose?: () => void
}) {
  // /mentor is a second entry point that reads scoped storage, so it has to
  // prepare the namespace too — otherwise landing here first, before ever
  // opening /app, would show defaults instead of your goals. Render body, not
  // an effect, for the same ordering reason as Dashboard. Idempotent.
  const prepared = useRef(false)
  if (!prepared.current) {
    prepared.current = true
    prepareLocalNamespace(userId)
  }

  const [mounted, setMounted] = useState(false)
  const [list, setList] = useState<Goal[]>([])
  const [active, setActive] = useState('')
  const [draft, setDraft] = useState('')
  const [ideasOpen, setIdeasOpen] = useState(false) // the +: blueprints for tiles you're missing
  const gemRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
    setList(allGoals(userId))
    setActive(activeGoalId(userId))
  }, [])

  // Pulse the gem when the goal changes — WAAPI on the wrapper, NO remount.
  // (Remounting would re-init the WebGL gem: heavy, and it visibly glitches.)
  useEffect(() => {
    const el = gemRef.current
    if (!el || !active) return
    const s = active === 'overall' ? 1.16 : 1
    el.animate(
      [
        { transform: `scale(${s * 0.92})` },
        { transform: `scale(${s * 1.12}) rotate(-3deg)` },
        { transform: `scale(${s})` },
      ],
      { duration: 750, easing: 'cubic-bezier(.34,1.56,.64,1)' },
    )
  }, [active])

  if (!mounted) return null

  const act = list.find((g) => g.id === active) ?? list[0]
  const entries = Object.entries(act?.weights ?? {}).sort((a, b) => b[1] - a[1])
  const advice = noticedFeed(userId)[0]
  // The overall goal is drawn in gold, every other goal in ink.
  const goalInk = act?.id === 'overall' ? 'var(--gold)' : 'var(--text)'

  const switchGoal = (id: string) => {
    setActiveGoalId(userId, id)
    setActive(id)
  }

  const addGoal = () => {
    const raw = draft.trim()
    if (!raw) return
    const id = 'g-' + raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)
    saveGoals(userId, [...goals(userId), { id, title: raw, weights: {}, pending: true } as Goal])
    setList(allGoals(userId))
    setDraft('')
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className={styles.wrap} style={{ paddingBlock: '20px 90px' }}>
        {overlay ? (
          <button type="button" className="btn ghost" onClick={onClose}>
            ← Board
          </button>
        ) : (
          <a href="/app" className="btn ghost">
            ← Board
          </a>
        )}

        <header style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 24 }}>
          {/* One persistent WebGL gem (never remounted): it pulses on every
              goal switch through WAAPI on the wrapper. */}
          <div ref={gemRef} style={{ width: 112, height: 112, flex: 'none' }}>
            <DashboardHeaderGem size={112} />
          </div>
          <div>
            <p className="ann">AI mentor · notices everything, runs the math</p>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontVariationSettings: '"wdth" 85', marginTop: 6 }}>The math.</h1>
          </div>
        </header>

        <div className={styles.goals} role="tablist" aria-label="Goals" style={{ marginTop: 32 }}>
          {list.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === active}
              className={`${styles.goal} ${g.id === 'overall' ? styles.overall : ''}`}
              onClick={() => switchGoal(g.id)}
            >
              {g.title}
              {g.pending && <span>being weighed</span>}
            </button>
          ))}
        </div>

        {/* w + w + w — every input's weight in this goal */}
        <section aria-label="The weights" style={{ marginTop: 36 }}>
          <p className="ann">x · each input, weighted</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2vw, 20px)', flexWrap: 'wrap', marginTop: 12 }}>
            {entries.map(([tile, w], i) => (
              <div key={tile} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2vw, 20px)' }}>
                {i > 0 && (
                  <span aria-hidden="true" style={{ font: '400 28px var(--font-display)', color: 'var(--muted)' }}>
                    +
                  </span>
                )}
                <div className={styles.tile} style={{ minHeight: 0, padding: '12px 14px', gap: 4 }}>
                  <i className={`sw ${tileInfo(tile).hatch}`} />
                  <span style={{ font: '700 clamp(28px, 4vw, 40px)/1 var(--font-display)', fontVariationSettings: '"wdth" 80', color: goalInk }}>{w}</span>
                  <span className="ann">{label(tile)}</span>
                </div>
              </div>
            ))}
            {/* the +: what you are NOT tracking — the mentor's blueprints */}
            <button type="button" className={styles.newTile} style={{ minHeight: 96, width: 120 }} onClick={() => setIdeasOpen(true)}>
              <span>
                <b aria-hidden="true">+</b>Missing?
              </span>
            </button>
          </div>
          <div style={{ marginTop: 20 }}>
            <WeightStrip ids={entries.map(([t]) => t)} weights={act?.weights ?? {}} label="w" />
          </div>
        </section>

        {ideasOpen && (
          <div className="veil" role="dialog" aria-modal="true" aria-label="Tiles you are missing" onMouseDown={(e) => e.target === e.currentTarget && setIdeasOpen(false)}>
            <div className="sheet">
              <div className="sheet-head">
                <span className="ann">The mentor sees a gap</span>
                <button type="button" className="icon-btn" aria-label="Close" onClick={() => setIdeasOpen(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="sheet-body">
                <h2>You&apos;re not tracking everything.</h2>
                {tileIdeas(userId, act?.id ?? 'overall').map((idea) => (
                  <div key={idea.title} style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
                    <p style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <b style={{ font: '700 26px var(--font-display)' }}>{idea.word ?? idea.title.split(/[\s/]/)[0]}</b>
                      <span className="ann" style={{ color: 'var(--text)' }}>≈ w {idea.estWeight}</span>
                    </p>
                    <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                      {idea.title} · {idea.tracks}
                    </p>
                    <p style={{ fontSize: 15, marginTop: 6 }}>{idea.why}</p>
                  </div>
                ))}
                <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
                  Want one? Tell the mentor: <em>&ldquo;build me water&rdquo;</em>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* = y — the goal, how far you have come, what the mentor saw */}
        <section aria-label="The answer" style={{ marginTop: 48, paddingTop: 28, borderTop: '1.5px dashed var(--line)' }}>
          <p className="ann">= y</p>
          <h2 style={{ fontSize: 'clamp(30px, 4.4vw, 48px)', marginTop: 8, color: goalInk }}>{act?.title}</h2>

          <div style={{ maxWidth: 560, marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span className="ann">How far you&apos;ve come</span>
              <span style={{ font: '700 28px var(--font-display)' }}>{act?.progress ?? 0}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="How far you have come"
              aria-valuenow={act?.progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 18, border: '1.5px solid var(--text)', background: 'var(--surface)' }}
            >
              <div className="h1" style={{ width: `${act?.progress ?? 0}%`, height: '100%', borderRight: (act?.progress ?? 0) > 0 ? '1.5px solid var(--text)' : 'none' }} />
            </div>
          </div>

          {advice && (
            <div style={{ maxWidth: 620, marginTop: 30 }}>
              <p className="ann">Mentor notices · {advice.when}</p>
              <ul style={{ listStyle: 'none', marginTop: 10 }}>
                {(advice.points ?? [advice.text]).map((pt, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, margin: '6px 0', color: 'var(--muted)' }}>
                    <span aria-hidden="true" style={{ color: 'var(--text)' }}>—</span>
                    <span>
                      {pt.split(/\*\*(.+?)\*\*/g).map((part, j) =>
                        j % 2 ? (
                          <strong key={j} style={{ color: 'var(--text)' }}>
                            {part}
                          </strong>
                        ) : (
                          part
                        ),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="ann" style={{ marginTop: 18 }}>
            Results, progress and advice are worked out by the mentor from your data, never guessed by the app.
          </p>
        </section>

        {/* write a new goal — the mentor shapes it */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addGoal()
          }}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 620, marginTop: 48 }}
        >
          <label htmlFor="mentor-goal" className="field-label" style={{ width: '100%', margin: 0 }}>
            A new goal <small>(write it raw; the mentor shapes and weighs it)</small>
          </label>
          <input id="mentor-goal" className="input" style={{ flex: '1 1 260px' }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Run a half marathon in May" />
          <button type="submit" className="btn">
            Give it to the mentor
          </button>
        </form>
      </div>
    </main>
  )
}
