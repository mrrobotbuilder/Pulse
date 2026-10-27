'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './dashboard.module.css'
import { CORE_TILES, VEE_TILE, DEFAULT_HOME_ORDER } from '@/lib/tiles/coreTiles'
import { tileInfo } from '@/lib/tiles/tileInfo'
import WeightStrip from './WeightStrip'
import { activeGoal as readActiveGoal, allGoals, setActiveGoalId, tileWeights, noticedFeed, type Goal, type Notice } from '@/lib/tiles/weights'
import { readScoped, writeScoped } from '@/lib/localScope'
import { useTileHost } from '@/lib/tiles/useTileHost'
import { withBridge } from '@/lib/tiles/tileBridge'
import { themeTokens } from '@/lib/theme'
import { syncEnabled, syncLoadTiles } from '@/lib/sync'
import type { DashboardChrome } from '@/lib/tiles/dashboardChrome'

// Lazy: the board never pays for the mentor (Three.js gem included) until it
// comes alive. Keeps first load fast.
const MentorPage = dynamic(() => import('@/app/mentor/MentorPage'), { ssr: false })

/**
 * The board: the equation drawn as a technical drawing (docs/DESIGN.md, A).
 *
 *   goals (tabs)        the active goal decides every weight below
 *   y  |  weight strip  y = the goal's progress; the strip = each tile's w
 *   tiles               every filled slot with w > 0, plus the Mentor
 *   tray                filled slots that weigh nothing in this goal
 *
 * Every tile is an inert SLOT: clicking opens the sealed HTML dropped into
 * public/tiles/<slot>.html (or a live one from Supabase), or, if the slot is
 * empty, the "how to build this" dialog. Order and hidden tiles persist in
 * `eq:order` / `eq:removed`.
 */

// The fixed slot roster (the seeded order), minus the Library tile.
const SLOT_ORDER = DEFAULT_HOME_ORDER.filter((id) => id !== 'library') as string[]

type FilledMap = Record<string, string> // slotId -> sealed HTML

const labelFor = (id: string) => (id === 'vee' ? VEE_TILE.label : CORE_TILES[id as keyof typeof CORE_TILES]?.label ?? id)

/** A notice's **bold** words, rendered. */
function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
    </>
  )
}

/* ── open a filled slot's sealed HTML in a sandboxed iframe ── */
function OpenTileOverlay({
  slot,
  register,
  unregister,
  onClose,
}: {
  slot: { id: string; name: string; html: string }
  register: (w: Window | null, id: string) => void
  unregister: (w: Window | null) => void
  onClose: () => void
}) {
  const winRef = useRef<Window | null>(null)
  // The tile gets the board's theme as CSS variables; a theme switch while it
  // is open re-renders it in the new colours.
  const [tokens, setTokens] = useState<Record<string, string>>(() => themeTokens())
  useEffect(() => {
    const on = () => setTokens(themeTokens())
    window.addEventListener('pulse:theme', on)
    return () => window.removeEventListener('pulse:theme', on)
  }, [])
  return (
    <div className={styles.openFull} role="dialog" aria-modal="true" aria-label={slot.name}>
      <div className={styles.openTop}>
        <button type="button" className="btn ghost" onClick={onClose}>
          <span aria-hidden="true">←</span> Board
        </button>
        <span className="ann">{slot.name}</span>
      </div>
      <div className={styles.openStage}>
        <iframe
          ref={(el) => {
            if (el) {
              winRef.current = el.contentWindow
              register(el.contentWindow, slot.id)
            } else if (winRef.current) {
              unregister(winRef.current)
              winRef.current = null
            }
          }}
          onLoad={(e) => {
            winRef.current = e.currentTarget.contentWindow
            register(e.currentTarget.contentWindow, slot.id)
          }}
          className={styles.openFrame}
          srcDoc={withBridge(slot.html, tokens)}
          sandbox="allow-scripts"
          title={slot.name}
        />
      </div>
    </div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    </button>
  )
}

/* ── the connector: how to build (and hook up) an empty slot ── */
function ConnectorOverlay({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  const path = `public/tiles/${id}.html`
  const prompt = `Build a "${label}" tile for my Pulse dashboard as ONE self-contained HTML file (all CSS and JS inline, no external requests). Colour it with the board's theme variables so it follows the board: background var(--pulse-surface, #FFFFFF), text var(--pulse-text, #16233B), muted text var(--pulse-muted, #4F5B6D), lines var(--pulse-line, #C3CCD8), accent var(--pulse-accent, #C2271D). Save and load with await window.Pulse.save(data) and await window.Pulse.load() (the dashboard provides window.Pulse, do not use localStorage). Write it to ${path}.`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={`Build the ${label} tile`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ width: 'min(620px, 100%)' }}>
        <div className="sheet-head">
          <span className="ann">Build the {label} tile</span>
          <CloseButton onClose={onClose} />
        </div>
        <div className="sheet-body">
          <p className="muted">
            This tile is a <strong style={{ color: 'var(--text)' }}>slot</strong>. It fills when a file exists at <code>{path}</code>. Two ways to fill it:
          </p>
          <ol className="muted" style={{ paddingLeft: 18, marginTop: 10, lineHeight: 1.7 }}>
            <li>
              <strong style={{ color: 'var(--text)' }}>From an episode:</strong> drop the episode&apos;s command into <code>.claude/commands/</code> and run it in Claude Code (e.g. <code>/logger</code>). It writes this exact file.
            </li>
            <li style={{ marginTop: 8 }}>
              <strong style={{ color: 'var(--text)' }}>Build your own:</strong> run <code>/tile {id}</code>, or paste this into Claude Code:
            </li>
          </ol>
          <pre className="prompt-box">{prompt}</pre>
          <p className="muted" style={{ fontSize: 14 }}>Then commit and redeploy (or reload locally) and the tile appears right here.</p>
          <button type="button" className="btn" style={{ marginTop: 14 }} onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy build prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── the "+ New tile" panel: dead simple — start with /tile ── */
function NewTileOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="New tile" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-head">
          <span className="ann">New tile</span>
          <CloseButton onClose={onClose} />
        </div>
        <div className="sheet-body">
          <h2>
            Start with <code>/tile</code>
          </h2>
          <p className="muted">
            In Claude Code, run <code>/tile train</code> (or any slot: fuel, vitals, brand, peak, finance). It builds the tile and drops it straight onto your board.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── the welcome-home "see the vision" screen: one line, one way back ── */
function EmptyCanvas({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.openFull} style={{ alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', zIndex: 100 }}>
      <div className={styles.empty}>
        <h2>See the vision.</h2>
        <p>You can create anything.</p>
        <button type="button" className="btn" style={{ marginTop: 32 }} onClick={onBack}>
          ← Back to the board
        </button>
      </div>
    </div>
  )
}

/* ── the blank board's default face: shown when no tiles exist yet ── */
function VisionEmptyState({ onNewTile }: { onNewTile: () => void }) {
  return (
    <div className={styles.empty}>
      <h2>See the vision.</h2>
      <p>
        This board is yours, and empty. Build your own tile with <strong style={{ color: 'var(--text)' }}>+ New tile</strong>, or run <code>/vitality</code> in Claude Code to load the full dashboard.
      </p>
      <button type="button" className="btn" style={{ marginTop: 28 }} onClick={onNewTile}>
        + New tile
      </button>
    </div>
  )
}

interface DashboardGridProps {
  userId: string
  chrome?: DashboardChrome
}

export default function DashboardGrid({ userId }: DashboardGridProps) {
  const [mounted, setMounted] = useState(false)
  const [filled, setFilled] = useState<FilledMap>({})
  const [openId, setOpenId] = useState<string | null>(null) // filled slot opened live
  const [connectId, setConnectId] = useState<string | null>(null) // empty slot connector
  const [newOpen, setNewOpen] = useState(false) // "+ New tile" creator
  const [showWelcome, setShowWelcome] = useState(false) // transient "see the vision" home (non-destructive)
  const [loaded, setLoaded] = useState(false) // tile discovery finished — gates the blank "see the vision" state
  const [scratched, setScratched] = useState(false) // deliberate "start from scratch" → clean canvas, no onboarding text
  const [editing, setEditing] = useState(false) // edit mode: drag to reorder, ✕ to remove
  const [order, setOrder] = useState<string[]>([]) // persisted tile order
  const [removed, setRemoved] = useState<string[]>([]) // slots removed in edit mode
  const [goal, setGoal] = useState<Goal | undefined>(undefined) // active goal: drives the weights
  const [mentorAlive, setMentorAlive] = useState(false) // the mentor comes to life OVER the board — no page load
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const dragId = useRef<string | null>(null)

  const { register, unregister } = useTileHost(userId, undefined, () => {})

  useEffect(() => {
    setMounted(true)
    try {
      setScratched(readScoped(userId, 'scratched') === '1')
      const o = JSON.parse(readScoped(userId, 'eq:order') || 'null')
      if (Array.isArray(o)) setOrder(o.filter((x) => typeof x === 'string'))
      const r = JSON.parse(readScoped(userId, 'eq:removed') || 'null')
      if (Array.isArray(r)) setRemoved(r.filter((x) => typeof x === 'string'))
      setGoal(readActiveGoal(userId))
      setNotice(noticedFeed(userId)[0])
    } catch {
      /* ignore */
    }
  }, [userId])

  // While the mentor is alive over the board, the board must not scroll —
  // only the overlay does (it has its own overflowY).
  useEffect(() => {
    if (!mentorAlive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mentorAlive])

  // Discover which slots are filled, from two sources (live wins over static):
  //   1. static files committed to public/tiles/<id>.html (the /tile + episode-command path)
  //   2. live tiles in Supabase, built from Claude via the MCP connector — these
  //      override a static file for the same slot and appear without a redeploy.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const pairs = await Promise.all(
        SLOT_ORDER.map(async (id) => {
          try {
            const res = await fetch(`/tiles/${id}.html`, { cache: 'no-store' })
            if (!res.ok) return null // 404 → slot is empty
            const html = await res.text()
            if (!html.trim()) return null
            return [id, html] as const
          } catch {
            return null
          }
        }),
      )
      const map: FilledMap = {}
      for (const p of pairs) if (p) map[p[0]] = p[1]

      if (syncEnabled()) {
        const remote = await syncLoadTiles()
        for (const id of SLOT_ORDER) if (remote[id]) map[id] = remote[id].html
      }

      if (alive) {
        setFilled(map)
        setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const filledOrder = useMemo(() => SLOT_ORDER.filter((id) => filled[id]), [filled])

  // Each input's share of the active goal (plain numbers — Claude retunes them;
  // the localStorage override wins. See lib/tiles/weights).
  const weights = useMemo(() => (mounted ? tileWeights(userId) : {}), [mounted, goal, userId])

  // Every filled slot except the mentor, in the saved order, minus anything
  // removed in edit mode. New tiles append.
  const rowIds = useMemo(() => {
    const base = order.length ? order : SLOT_ORDER
    const seen = new Set(base)
    const all = [...base, ...SLOT_ORDER.filter((id) => !seen.has(id))]
    return all.filter((id) => id !== 'vee' && filled[id] && !removed.includes(id))
  }, [order, filled, removed])

  const onIds = rowIds.filter((id) => (weights[id] ?? 0) > 0)
  const offIds = rowIds.filter((id) => !((weights[id] ?? 0) > 0))

  // Esc closes any overlay.
  useEffect(() => {
    if (!openId && !connectId && !newOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenId(null)
        setConnectId(null)
        setNewOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, connectId, newOpen])

  if (!mounted) return null

  const saveOrder = (next: string[]) => {
    setOrder(next)
    writeScoped(userId, 'eq:order', JSON.stringify(next))
  }

  const saveRemoved = (next: string[]) => {
    setRemoved(next)
    writeScoped(userId, 'eq:removed', JSON.stringify(next))
  }

  // Drag-reorder: while dragging over a sibling, move the dragged tile there live.
  const moveTo = (src: string, dst: string) => {
    if (src === dst) return
    const cur = rowIds.slice()
    const from = cur.indexOf(src)
    const to = cur.indexOf(dst)
    if (from < 0 || to < 0) return
    cur.splice(from, 1)
    cur.splice(to, 0, src)
    saveOrder(cur)
  }

  const openSlot = (id: string) => {
    if (editing) return // while editing, taps rearrange — they don't open
    if (filled[id]) setOpenId(id)
    else setConnectId(id)
  }

  const pickGoal = (g: Goal) => {
    setActiveGoalId(userId, g.id)
    setGoal(g)
    try {
      window.dispatchEvent(new CustomEvent('vitality:goal'))
    } catch {
      /* ignore */
    }
  }

  const dragProps = (id: string) => ({
    draggable: editing,
    onDragStart: () => {
      dragId.current = id
    },
    onDragOver: (e: React.DragEvent) => {
      if (editing && dragId.current && dragId.current !== id) {
        e.preventDefault()
        moveTo(dragId.current, id)
      }
    },
    onDragEnd: () => {
      dragId.current = null
    },
  })

  const removeBadge = (id: string) =>
    editing ? (
      <button type="button" className={styles.remove} aria-label={`Remove ${labelFor(id)}`} onClick={() => saveRemoved([...removed, id])}>
        ✕
      </button>
    ) : null

  const gs = allGoals(userId)
  const isEmpty = filledOrder.length === 0
  const progress = goal?.progress

  return (
    <div className={editing ? styles.editing : undefined}>
      {!loaded ? null : isEmpty ? (
        // A fresh board shows the onboarding vision; a deliberately-scratched board
        // stays clean — just the header, nothing in the middle.
        scratched ? null : <VisionEmptyState onNewTile={() => setNewOpen(true)} />
      ) : (
        <>
          <div className={styles.goals} role="tablist" aria-label="Goals">
            {gs.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={g.id === goal?.id}
                className={`${styles.goal} ${g.id === 'overall' ? styles.overall : ''}`}
                onClick={() => pickGoal(g)}
              >
                {g.title}
                {g.id !== 'overall' && g.progress != null && <span>{g.progress}%</span>}
              </button>
            ))}
          </div>

          <div className={styles.yrow}>
            <div>
              <p className={styles.ybig}>
                <small>y =</small>
                {progress ?? '—'}
              </p>
              <p className={styles.ynote}>
                {progress != null ? (
                  <>
                    How far toward <b>{goal?.title}</b>, from your data.
                  </>
                ) : (
                  <>The mentor fills this in after its first look at your data.</>
                )}
              </p>
            </div>
            <WeightStrip ids={rowIds} weights={weights} label="w" />
          </div>

          <div className={styles.bar}>
            <p className="ann">Inputs · x</p>
            <button type="button" className={editing ? 'btn' : 'btn ghost'} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>

          <div className={styles.tiles}>
            {onIds.map((id) => {
              const info = tileInfo(id)
              return (
                <div key={id} className={styles.tile} {...dragProps(id)}>
                  <div className={styles.tileTop}>
                    <i className={`sw ${info.hatch}`} />
                    <span className={`ann ${info.live ? styles.live : ''}`}>w {weights[id]}</span>
                  </div>
                  <h3>{labelFor(id)}</h3>
                  <p className={styles.stat}>
                    {weights[id]}%<small>of y</small>
                  </p>
                  <p className={styles.sub}>{info.measures}</p>
                  <button type="button" className={styles.hit} aria-label={`Open ${labelFor(id)}`} onClick={() => openSlot(id)} />
                  {removeBadge(id)}
                </div>
              )
            })}

            <div className={`${styles.tile} ${styles.mentor}`}>
              <div className={styles.tileTop}>
                <span className="ann">Mentor · {notice ? `noticed ${notice.when}` : VEE_TILE.kicker}</span>
              </div>
              {notice ? (
                <>
                  <p className={styles.note}>
                    <Bold text={notice.points?.[0] ?? notice.text} />
                  </p>
                  {notice.deltas?.length ? (
                    <ul>
                      {notice.deltas.map((d) => (
                        <li key={d.tile}>
                          {labelFor(d.tile)} · {d.from} → {d.to}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className={styles.note}>Reads every tile, notices patterns, retunes the weights.</p>
              )}
              <button type="button" className={styles.hit} aria-label="Open the mentor" onClick={() => !editing && setMentorAlive(true)} />
            </div>

            <button type="button" className={styles.newTile} onClick={() => setNewOpen(true)}>
              <span>
                <b aria-hidden="true">+</b>New tile
              </span>
            </button>
          </div>

          {offIds.length > 0 && (
            <div className={styles.tray}>
              <p className="ann">Not in this goal · w 0</p>
              {offIds.map((id) => (
                <div key={id} className={styles.off} {...dragProps(id)}>
                  <i className={`sw ${tileInfo(id).hatch}`} />
                  <b>{labelFor(id)}</b>
                  <span>{tileInfo(id).measures}</span>
                  <button type="button" className={styles.hit} aria-label={`Open ${labelFor(id)}`} onClick={() => openSlot(id)} />
                  {removeBadge(id)}
                </div>
              ))}
            </div>
          )}

          <div className={styles.foot}>
            <a href="/mentor" className="btn ghost">
              The math
            </a>
            <button type="button" className="btn ghost" onClick={() => setShowWelcome(true)}>
              See the vision
            </button>
          </div>
        </>
      )}

      {openId && filled[openId] && (
        <OpenTileOverlay
          key={openId}
          slot={{ id: openId, name: labelFor(openId), html: filled[openId] }}
          register={register}
          unregister={unregister}
          onClose={() => setOpenId(null)}
        />
      )}

      {connectId && <ConnectorOverlay id={connectId} label={labelFor(connectId)} onClose={() => setConnectId(null)} />}

      {newOpen && <NewTileOverlay onClose={() => setNewOpen(false)} />}

      {showWelcome && <EmptyCanvas onBack={() => setShowWelcome(false)} />}

      {/* the mentor, alive over the board — everything fades behind it */}
      {mentorAlive && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 95,
            overflowY: 'auto',
            overscrollBehavior: 'contain', // reaching the ends must not scroll the board behind
            backgroundColor: 'var(--bg)',
          }}
        >
          <MentorPage
            userId={userId}
            overlay
            onClose={() => {
              setMentorAlive(false)
              // whatever goal they picked in there, the board follows it
              setGoal(readActiveGoal(userId))
              try {
                window.dispatchEvent(new CustomEvent('vitality:goal'))
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
