'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './dashboard.module.css'
import { CORE_TILES, VEE_TILE, DEFAULT_HOME_ORDER } from '@/lib/tiles/coreTiles'
import { tileInfo, setCustomTileIds } from '@/lib/tiles/tileInfo'
import WeightStrip from './WeightStrip'
import GoalsEditor from './GoalsEditor'
import { activeGoal as readActiveGoal, allGoals, setActiveGoalId, tileWeights, noticedFeed, type Goal, type Notice } from '@/lib/tiles/weights'
import { readScoped, writeScoped, removeScoped } from '@/lib/localScope'
import { useTileHost, loadTileData } from '@/lib/tiles/useTileHost'
import { summarize, type TileStat } from '@/lib/tiles/tileStats'
import { withBridge } from '@/lib/tiles/tileBridge'
import { kitHead } from '@/lib/tiles/tileKit'
import { loadTileFonts, tileFontCss } from '@/lib/tiles/tileFonts'
import { themeTokens } from '@/lib/theme'
import { syncEnabled, syncLoadTiles } from '@/lib/sync'
import { foldRemoteCustomTiles, listCustomTiles, saveCustomTile, upgradeReadyTiles, isReadyTile, replaceCustomTileHtml } from '@/lib/tiles/customTiles'
import { READY_TILES, readyTileHtml, type ReadyTile } from '@/lib/tiles/readyTiles'
import { showOnBoard } from '@/lib/aiBoard'
import { mirrorBoardChange } from '@/lib/onboarding'
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
type CustomMeta = Record<string, { name: string; tracks: string }> // custom-* -> its name and what it tracks

const coreLabel = (id: string) => (id === 'vee' ? VEE_TILE.label : CORE_TILES[id as keyof typeof CORE_TILES]?.label ?? id)

/** The AI-written tiles in this browser's index: their HTML for `filled`, and their names. */
function readCustom(userId: string): { html: FilledMap; meta: CustomMeta } {
  const html: FilledMap = {}
  const meta: CustomMeta = {}
  for (const t of listCustomTiles(userId).reverse()) {
    html[t.id] = t.html
    meta[t.id] = { name: t.name, tracks: t.tracks ?? '' }
  }
  return { html, meta }
}

/** A notice's **bold** words, rendered. */
function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
    </>
  )
}

/**
 * A copy of a tile's saved data small enough to send with a redesign: long
 * arrays keep only their newest items, so the model still sees the shape.
 */
function dataSample(data: unknown, max = 3000): string | undefined {
  if (data == null || (Array.isArray(data) && !data.length)) return undefined
  for (const keep of [Infinity, 40, 15, 5, 1]) {
    const cut = (v: unknown): unknown =>
      Array.isArray(v) ? v.slice(-Math.min(v.length, keep)).map(cut) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cut(x)])) : v
    const json = JSON.stringify(cut(data))
    if (json.length <= max) return json
  }
  return undefined
}

/* ── open a filled slot's sealed HTML in a sandboxed iframe ── */
function OpenTileOverlay({
  slot,
  userId,
  canRedesign,
  onRedesigned,
  register,
  unregister,
  onClose,
}: {
  slot: { id: string; name: string; html: string; measures: string; hatch: string; weight: number; goal?: string }
  userId: string
  /** AI-written tiles can be rebuilt in the current look; their data stays. */
  canRedesign: boolean
  onRedesigned: (html: string) => void
  register: (w: Window | null, id: string) => void
  unregister: (w: Window | null) => void
  onClose: () => void
}) {
  const backupKey = `tile-backup:${slot.id}`
  const [redesign, setRedesign] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [redesignNote, setRedesignNote] = useState<string | null>(null)
  const [hasBackup, setHasBackup] = useState(() => !!readScoped(userId, backupKey))
  const runRedesign = async () => {
    setRedesign('busy')
    setRedesignNote(null)
    try {
      const data = dataSample(await loadTileData(userId, slot.id))
      const res = await fetch('/api/tiles/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec: { name: slot.name.slice(0, 60), tracks: slot.measures.slice(0, 120), why: 'A redesign of a tile the person already uses, in the new Pulse look.', ...(data ? { data } : {}) } }),
        signal: AbortSignal.timeout(150_000),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || typeof json?.html !== 'string') throw new Error(typeof json?.reason === 'string' ? json.reason : `the tile writer answered ${res.status}`)
      writeScoped(userId, backupKey, slot.html)
      const cloud = await replaceCustomTileHtml(userId, slot.id, json.html)
      setHasBackup(true)
      onRedesigned(json.html)
      setRedesignNote(cloud ? 'Redesigned. Your data is untouched.' : 'Redesigned on this device, but it did not reach your other devices yet.')
    } catch (e) {
      setRedesignNote(`Could not redesign it: ${e instanceof Error ? e.message : String(e)}. The old design is still here.`)
    } finally {
      setRedesign('idle')
    }
  }
  const undoRedesign = async () => {
    const old = readScoped(userId, backupKey)
    if (!old) return
    try {
      const cloud = await replaceCustomTileHtml(userId, slot.id, old)
      removeScoped(userId, backupKey)
      setHasBackup(false)
      onRedesigned(old)
      setRedesignNote(cloud ? 'The old design is back.' : 'The old design is back on this device; other devices still show the new one.')
    } catch (e) {
      setRedesignNote(`Could not undo: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const winRef = useRef<Window | null>(null)
  // The tile gets the board's theme as CSS variables; a theme switch while it
  // is open re-renders it in the new colours.
  const [tokens, setTokens] = useState<Record<string, string>>(() => themeTokens())
  useEffect(() => {
    const on = () => setTokens(themeTokens())
    window.addEventListener('pulse:theme', on)
    return () => window.removeEventListener('pulse:theme', on)
  }, [])
  // Esc pressed inside the tile (the kit passes it up) closes it like Esc on the board.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source && e.source === winRef.current && e.data?.source === 'vitality-tile' && e.data.type === 'escape') onClose()
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [onClose])
  // The board's fonts, as data: URLs. The board starts loading them on mount, so
  // they are almost always ready; if not, wait a moment rather than render the
  // tile twice (a second srcDoc would reload it and lose what was typed).
  const [fonts, setFonts] = useState<string | null>(() => tileFontCss() || null)
  useEffect(() => {
    if (fonts !== null) return
    let alive = true
    const done = (css: string) => alive && setFonts((f) => f ?? css)
    void loadTileFonts().then(done)
    const t = window.setTimeout(() => done(''), 1500)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [fonts])
  return (
    <div className={styles.openFull} role="dialog" aria-modal="true" aria-label={slot.name}>
      <div className={styles.openTop}>
        <div className={styles.openBar}>
          <button type="button" className={styles.openBack} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Board
          </button>
          <div className={styles.openTools}>
            {slot.weight > 0 && (
              <span className={styles.openWeight}>
                w {slot.weight}
                {slot.goal ? <small> in {slot.goal}</small> : null}
              </span>
            )}
            {canRedesign && hasBackup && redesign === 'idle' && (
              <button type="button" className={styles.openBack} onClick={undoRedesign}>
                Undo redesign
              </button>
            )}
            {canRedesign && (
              <button type="button" className={styles.openBack} disabled={redesign === 'busy'} onClick={() => setRedesign('confirm')}>
                {redesign === 'busy' ? 'Redesigning… (about a minute)' : '✦ Redesign'}
              </button>
            )}
          </div>
        </div>
        {redesignNote && (
          <p className={styles.openNote} role="status">
            {redesignNote}
          </p>
        )}
        <div className={styles.openHead}>
          <i className={`sw ${slot.hatch} ${styles.openSw}`} aria-hidden="true" />
          <div className={styles.openTitle}>
            <h2>{slot.name}</h2>
            <p>{slot.measures}</p>
          </div>
        </div>
      </div>
      {redesign === 'confirm' && (
        <div className="veil" role="dialog" aria-modal="true" aria-label="Redesign this tile" onMouseDown={(e) => e.target === e.currentTarget && setRedesign('idle')}>
          <div className="sheet">
            <div className="sheet-head">
              <span className="ann">Redesign {slot.name}</span>
              <CloseButton onClose={() => setRedesign('idle')} />
            </div>
            <div className="sheet-body">
              <p>The AI rebuilds this tile in the new look, with rings, charts and a history list. Everything you logged stays: only the design changes, and you can undo it.</p>
              <p className="muted">It takes about a minute and uses one AI build.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn ghost" onClick={() => setRedesign('idle')}>
                  Keep this design
                </button>
                <button type="button" className="btn" onClick={runRedesign}>
                  Redesign it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={styles.openStage}>
        <div className={styles.openCard}>
          {fonts !== null && (
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
              srcDoc={withBridge(slot.html, tokens, kitHead(fonts))}
              sandbox="allow-scripts"
              title={slot.name}
            />
          )}
        </div>
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

/* ── the "+ New tile" picker: put a hidden tile back, or add a ready-made one ── */
function NewTileOverlay({
  userId,
  hidden,
  onBoard,
  labelFor,
  onClose,
}: {
  userId: string
  /** Tiles that exist but are hidden from the board (the interview or Edit removed them). */
  hidden: string[]
  /** Every tile id currently on the board. */
  onBoard: Set<string>
  labelFor: (id: string) => string
  onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Show (or create, then show) a tile, keep the weights at 100, redraw, and
  // mirror the layout so the owner's other devices get it too.
  const add = async (id: string, ready?: ReadyTile) => {
    setBusy(id)
    setError(null)
    try {
      let synced = true
      if (ready && !hidden.includes(id)) synced = await saveCustomTile(userId, { id, name: ready.name, html: readyTileHtml(ready), tracks: ready.tracks })
      showOnBoard(userId, id, true)
      window.dispatchEvent(new CustomEvent('pulse:layout'))
      // The tile is on this board now; a failed mirror only means other devices lag.
      synced = (await mirrorBoardChange(userId).then(() => true, () => false)) && synced
      if (!synced) setError(`${ready?.name ?? labelFor(id)} is on this board, but it did not reach your other devices. Try again later.`)
    } catch (e) {
      setError(`Could not add ${ready?.name ?? labelFor(id)}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const groups = [...new Set(READY_TILES.map((t) => t.group))]
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="New tile" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ width: 'min(720px, 100%)' }}>
        <div className="sheet-head">
          <span className="ann">New tile</span>
          <CloseButton onClose={onClose} />
        </div>
        <div className="sheet-body">
          {error && (
            <p className={styles.pickError} role="alert">
              {error}
            </p>
          )}
          {hidden.length > 0 && (
            <section className={styles.pickGroup}>
              <h3>Put back on your board</h3>
              <ul className={styles.pickList}>
                {hidden.map((id) => (
                  <li key={id}>
                    <i className={`sw ${tileInfo(id).hatch}`} aria-hidden="true" />
                    <div>
                      <b>{labelFor(id)}</b>
                      <span>{tileInfo(id).measures}</span>
                    </div>
                    <button type="button" className="btn" disabled={busy !== null} onClick={() => add(id)}>
                      {busy === id ? 'Adding…' : 'Add back'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.map((g) => (
            <section key={g} className={styles.pickGroup}>
              <h3>{g}</h3>
              <ul className={styles.pickList}>
                {READY_TILES.filter((t) => t.group === g).map((t) => {
                  const there = onBoard.has(t.id)
                  return (
                    <li key={t.id}>
                      <i className={`sw ${tileInfo(t.id).hatch}`} aria-hidden="true" />
                      <div>
                        <b>{t.name}</b>
                        <span>{t.tracks}</span>
                      </div>
                      <button type="button" className="btn ghost" disabled={there || busy !== null} onClick={() => add(t.id, t)}>
                        {there ? 'On your board' : busy === t.id ? 'Adding…' : 'Add'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
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
  const [goalsOpen, setGoalsOpen] = useState(false) // the goals sheet
  const [goalNote, setGoalNote] = useState<string | null>(null) // goals saved here but not mirrored
  const [showWelcome, setShowWelcome] = useState(false) // transient "see the vision" home (non-destructive)
  const [loaded, setLoaded] = useState(false) // tile discovery finished — gates the blank "see the vision" state
  const [scratched, setScratched] = useState(false) // deliberate "start from scratch" → clean canvas, no onboarding text
  const [editing, setEditing] = useState(false) // edit mode: drag to reorder, ✕ to remove
  const [order, setOrder] = useState<string[]>([]) // persisted tile order
  const [removed, setRemoved] = useState<string[]>([]) // slots removed in edit mode
  const [goal, setGoal] = useState<Goal | undefined>(undefined) // active goal: drives the weights
  const [mentorAlive, setMentorAlive] = useState(false) // the mentor comes to life OVER the board — no page load
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [custom, setCustom] = useState<CustomMeta>({}) // AI-written tiles (custom-*): name and what each tracks
  const dragId = useRef<string | null>(null)

  // Hand the AI-written tiles their own hatches before anything draws one.
  setCustomTileIds(Object.keys(custom))
  const labelFor = (id: string) => custom[id]?.name ?? coreLabel(id)
  const info = (id: string) => (custom[id] ? { ...tileInfo(id), measures: custom[id].tracks || 'Built by the AI for you.' } : tileInfo(id))

  // Every save re-reads that tile's face number, including a save that lands
  // just after its overlay closed.
  const { register, unregister } = useTileHost(
    userId,
    (info) => {
      if (info.type === 'save') void refreshStat(info.tileId)
    },
    () => {},
  )

  useEffect(() => {
    setMounted(true)
    void loadTileFonts() // ready before the first tile opens
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

  // The reasoning room restored, removed or added a tile: re-read what it wrote.
  useEffect(() => {
    const on = () => {
      try {
        const r = JSON.parse(readScoped(userId, 'eq:removed') || '[]')
        if (Array.isArray(r)) setRemoved(r.filter((x) => typeof x === 'string'))
        const o = JSON.parse(readScoped(userId, 'eq:order') || 'null')
        if (Array.isArray(o)) setOrder(o.filter((x) => typeof x === 'string'))
      } catch {
        /* ignore */
      }
      setGoal(readActiveGoal(userId))
      // An accepted AI tile lands in the tile index: fold it in without a reload.
      const c = readCustom(userId)
      setCustom(c.meta)
      setFilled((prev) => ({ ...Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith('custom-'))), ...c.html }))
      for (const id of Object.keys(c.html)) void refreshStat(id)
    }
    window.addEventListener('pulse:layout', on)
    return () => window.removeEventListener('pulse:layout', on)
    // refreshStat is stable per userId
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
        // AI-written tiles accepted on another device
        foldRemoteCustomTiles(userId, remote)
      }
      upgradeReadyTiles(userId) // ready-made tiles get the current design
      const c = readCustom(userId)

      if (alive) {
        setFilled({ ...map, ...c.html })
        setCustom(c.meta)
        setLoaded(true)
        for (const id of Object.keys(c.html)) void refreshStat(id)
      }
    })()
    return () => {
      alive = false
    }
    // refreshStat is stable per userId
  }, [userId])

  // Every slot that holds a tile: the fixed roster first, then the AI-written ones.
  const slotIds = useMemo(() => [...SLOT_ORDER, ...Object.keys(custom)], [custom])
  const filledOrder = useMemo(() => slotIds.filter((id) => filled[id]), [slotIds, filled])

  // Each input's share of the active goal (plain numbers — Claude retunes them;
  // the localStorage override wins. See lib/tiles/weights).
  const weights = useMemo(() => (mounted ? tileWeights(userId) : {}), [mounted, goal, userId])

  // The live number on each tile's face, read from the tile's own saved data.
  // undefined = still reading, null = nothing to show ("No data yet").
  const [stats, setStats] = useState<Record<string, TileStat | null>>({})
  const refreshStat = useCallback(
    async (id: string) => {
      let stat: TileStat | null = null
      try {
        stat = summarize(id, await loadTileData(userId, id))
      } catch (e) {
        console.error(`could not read the ${id} tile's data`, e)
      }
      setStats((prev) => ({ ...prev, [id]: stat }))
    },
    [userId],
  )
  useEffect(() => {
    for (const id of SLOT_ORDER) if (id !== 'vee') void refreshStat(id)
    // a tile's data changed outside its overlay (the Walks sync from STEGA)
    const onData = (e: Event) => {
      const id = (e as CustomEvent).detail
      if (typeof id === 'string') void refreshStat(id)
    }
    window.addEventListener('pulse:tiledata', onData)
    return () => window.removeEventListener('pulse:tiledata', onData)
  }, [refreshStat])

  // Every filled slot except the mentor, in the saved order, minus anything
  // removed in edit mode. New tiles append.
  const rowIds = useMemo(() => {
    const base = order.length ? order : SLOT_ORDER
    const seen = new Set(base)
    const all = [...base, ...slotIds.filter((id) => !seen.has(id))]
    return all.filter((id) => id !== 'vee' && filled[id] && !removed.includes(id))
  }, [order, slotIds, filled, removed])

  const onIds = rowIds.filter((id) => (weights[id] ?? 0) > 0)
  const offIds = rowIds.filter((id) => !((weights[id] ?? 0) > 0))

  // Esc closes any overlay.
  useEffect(() => {
    if (!openId && !connectId && !newOpen && !goalsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenId(null)
        setConnectId(null)
        setNewOpen(false)
        setGoalsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, connectId, newOpen, goalsOpen])

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
            <button type="button" className={`${styles.goal} ${styles.goalEdit}`} onClick={() => setGoalsOpen(true)}>
              ✎ Edit goals
            </button>
          </div>
          {goalNote && (
            <p className={styles.pickError} role="status" style={{ marginTop: 10 }}>
              {goalNote}
            </p>
          )}

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
            <WeightStrip ids={rowIds} weights={weights} label="w" names={labelFor} />
          </div>

          <div className={styles.bar}>
            <p className="ann">Inputs · x</p>
            <button type="button" className={editing ? 'btn' : 'btn ghost'} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>

          <div className={styles.tiles}>
            {onIds.map((id) => {
              const ti = info(id)
              const st = stats[id]
              return (
                <div key={id} data-slot={id} className={styles.tile} {...dragProps(id)}>
                  <div className={styles.tileTop}>
                    <i className={`sw ${ti.hatch}`} />
                    <span className={`ann ${ti.live ? styles.live : ''}`}>w {weights[id]}</span>
                  </div>
                  <h3>{labelFor(id)}</h3>
                  <p className={styles.stat}>
                    {st ? (
                      <>
                        {st.value}
                        <small>{st.unit}</small>
                      </>
                    ) : st === null ? (
                      <small className={styles.statEmpty}>No data yet{' '}· open to log</small>
                    ) : (
                      ' '
                    )}
                  </p>
                  <p className={styles.sub}>{st ? st.sub : ti.measures}</p>
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
                <div key={id} data-slot={id} className={styles.off} {...dragProps(id)}>
                  <i className={`sw ${info(id).hatch}`} />
                  <b>{labelFor(id)}</b>
                  <span>{stats[id] ? `${stats[id]!.value} ${stats[id]!.unit}` : info(id).measures}</span>
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
          slot={{ id: openId, name: labelFor(openId), html: filled[openId], measures: info(openId).measures, hatch: info(openId).hatch, weight: weights[openId] ?? 0, goal: goal?.title }}
          userId={userId}
          canRedesign={!!custom[openId] && !isReadyTile(openId, filled[openId])}
          onRedesigned={(html) => setFilled((prev) => ({ ...prev, [openId]: html }))}
          register={register}
          unregister={unregister}
          onClose={() => setOpenId(null)}
        />
      )}

      {connectId && <ConnectorOverlay id={connectId} label={labelFor(connectId)} onClose={() => setConnectId(null)} />}

      {newOpen && (
        <NewTileOverlay
          userId={userId}
          hidden={removed.filter((id) => id !== 'vee' && filled[id])}
          onBoard={new Set(rowIds)}
          labelFor={labelFor}
          onClose={() => setNewOpen(false)}
        />
      )}

      {goalsOpen && (
        <GoalsEditor
          userId={userId}
          tileIds={rowIds}
          labelFor={labelFor}
          onClose={() => setGoalsOpen(false)}
          onSaved={(_active, mirrorFailed) => {
            setGoalsOpen(false)
            setGoal(readActiveGoal(userId))
            setGoalNote(mirrorFailed ? 'Your goals are saved on this device, but they did not reach your other devices. Save them again later.' : null)
          }}
        />
      )}

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
