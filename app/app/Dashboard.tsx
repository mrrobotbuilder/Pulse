'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './dashboard.module.css'
import DashboardHeader from './DashboardHeader'
import DashboardHeaderGem from './DashboardHeaderGem'
import DashboardGrid from './DashboardGrid'
import AuthPanel from './AuthPanel'
import { dashboardChrome, DEFAULT_CHROME, type DashboardChrome } from '@/lib/tiles/dashboardChrome'
import { profile } from '@/lib/tiles/profile'
import { DEMO_USER_ID, readScoped } from '@/lib/localScope'
import { prepareLocalNamespace } from '@/lib/migrateLocal'
import { tileStore } from '@/lib/tiles/tileStore'
import { syncBackfill, syncClearTile, syncWipe } from '@/lib/sync'
import { site } from '@/content/site'
import { THEMES, readTheme, applyTheme, saveTheme, type ThemeId } from '@/lib/theme'
import Onboarding from './Onboarding'
import { BoardReasoning, RevealSheet } from './BoardReasoning'
import { readAiBoard, undoAiBoard, type AiBoard } from '@/lib/aiBoard'
import { onboardingState, hydratePersonalizationFromCloud, resetOnboarding } from '@/lib/onboarding'

interface DashboardProps {
  firstName: string | null
  userId: string
}

/* ── The gear panel ──
 * The app can't destroy anything by itself; everything sharp is a PROMPT you
 * copy into Claude Code (deterministic — /detonate is code, not improvisation).
 * Rooms:
 *   theme    — pick a theme preset; the board and every tile recolour
 *   why      — what the AI decided and why; restore, remove, undo the AI board
 *   how      — the loop: dashboard ⇄ Claude Code, the 4 data-in lanes
 *   yours    — redo the interview, or a talk-first restyle prompt
 *   data     — wipe what's INSIDE tiles (all, or one) — cards stay, contents go
 *   scratch  — the detonation prompt (black screen, context survives)
 */
const MAKE_IT_YOURS_PROMPT =
  "Make this dashboard MINE. Before you touch anything, talk it through with me — one question at a time: do I keep the gem? The hatch patterns on the tiles? The mentor tile? The graph-paper theme? Then ask how I want it to FEEL — mood, colors, energy. Only after my answers: strip every piece of the current style I let go of, restyle the board to me, and keep every tile and all my data working."

type Room = 'theme' | 'why' | 'how' | 'yours' | 'data' | 'scratch'
const ROOMS: [Room, string][] = [
  ['theme', 'Theme'],
  ['why', 'Your board’s reasoning'],
  ['how', 'How it works'],
  ['yours', 'Make it yours'],
  ['data', 'Tile data'],
  ['scratch', 'Detonate'],
]

function ScratchPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Room>('theme')
  const [theme, setTheme] = useState<ThemeId>(() => readTheme(userId))
  const [keepBg, setKeepBg] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [dataIds, setDataIds] = useState<string[]>([])
  const [armed, setArmed] = useState(false) // two-step "wipe all" and "undo the AI board"
  const [ai, setAi] = useState<AiBoard | null>(() => readAiBoard(userId))
  const [undoing, setUndoing] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)

  useEffect(() => {
    setDataIds(tileStore.listDataIds(userId))
  }, [userId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const prompt = keepBg
    ? 'Detonate my dashboard, but keep the paper. Remove every tile from my board (clear public/tiles of tiles) and strip the middle of the page — no tiles, no onboarding text. KEEP the graph-paper background and theme, the greeting and the date, and the settings gear. Do not touch git history, docs, or your memory of this project — remember everything we built so you can help me rebuild from this clean slate.'
    : 'Detonate my dashboard. Remove every tile from my board (clear public/tiles of tiles) and make it render a pure black screen — no tiles, no greeting, no gem, no background. Keep only the settings gear as the way back. Do not touch git history, docs, or your memory of this project — remember everything we built so you can help me rebuild from this clean slate.'

  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(tag)
      window.setTimeout(() => setCopied(null), 1600)
    })
  }

  const wipeOne = async (id: string) => {
    await Promise.all([tileStore.clearData(userId, id), syncClearTile(id)])
    window.location.reload() // tiles load their data on mount — a clean reload shows the empty card
  }
  const undoAi = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    if (!ai) return
    setUndoing(true)
    try {
      await undoAiBoard(userId, ai)
      window.location.reload()
    } catch (e) {
      setUndoing(false)
      setUndoError(e instanceof Error ? e.message : String(e))
    }
  }
  const wipeAll = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    await Promise.all([...dataIds.map((id) => tileStore.clearData(userId, id)), syncWipe()])
    window.location.reload()
  }

  const strong = (t: string) => <strong style={{ color: 'var(--text)' }}>{t}</strong>

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-head">
          <div className="tabs" role="tablist" aria-label="Settings rooms">
            {ROOMS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className="tab"
                onClick={() => {
                  setTab(id)
                  setArmed(false)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {tab === 'theme' && (
          <div className="sheet-body">
            <p className="muted">Same drawing, five papers. The board and every tile follow the one you pick.</p>
            {/* Each option carries its own data-theme, so it is painted in the
                preset it stands for. */}
            <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.id}
                  data-theme={t.id}
                  onClick={() => {
                    setTheme(t.id)
                    saveTheme(userId, t.id)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 56,
                    padding: '8px 14px',
                    textAlign: 'left',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    border: `1.5px solid ${theme === t.id ? 'var(--text)' : 'var(--line)'}`,
                    boxShadow: theme === t.id ? 'inset 0 -4px 0 var(--accent)' : 'none',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <span aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
                    <i style={{ width: 18, height: 18, background: 'var(--surface)', border: '1.5px solid var(--text)' }} />
                    <i style={{ width: 18, height: 18, background: 'var(--accent)', border: '1.5px solid var(--text)' }} />
                    <i style={{ width: 18, height: 18, background: 'var(--gold)', border: '1.5px solid var(--text)' }} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{t.name}</b>
                    <span style={{ display: 'block', fontSize: 14, color: 'var(--muted)' }}>{t.note}</span>
                  </span>
                  {theme === t.id && <span className="ann" style={{ color: 'var(--text)' }}>In use</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'why' && (
          <div className="sheet-body">
            {ai ? (
              <>
                <p className="muted">
                  What the AI decided when it built this board, and why. {strong('You have the last word')}: restore a tile it hid, remove one it showed, keep or drop its ideas.
                </p>
                <BoardReasoning userId={userId} rec={ai} onChange={setAi} />
                <p className="ann" style={{ marginTop: 24 }}>Undo</p>
                {ai.answers ? (
                  <>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Nothing the AI did is permanent. Undo it and the rules rebuild your board from the same answers.
                    </p>
                    <button type="button" className={armed ? 'btn' : 'btn ghost'} style={{ width: '100%', marginTop: 12 }} onClick={undoAi} disabled={undoing}>
                      {undoing ? 'Rebuilding…' : armed ? 'Sure? The rules rebuild your board' : 'Undo the AI board'}
                    </button>
                    {undoError && (
                      <p role="alert" style={{ marginTop: 8, color: 'var(--signal)' }}>
                        Could not undo: {undoError}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted" style={{ marginTop: 6 }}>
                    This board was built before undo existed. Redo the interview (Make it yours) to rebuild it.
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                The rules built this board, not the AI, so there is no reasoning to show. {strong('Redo the interview')} under Make it yours for an AI build.
              </p>
            )}
          </div>
        )}

        {tab === 'how' && (
          <div className="sheet-body">
            <h2>Your board renders. Claude Code thinks.</h2>
            <p className="muted">
              The AI Mentor works as a loop: data runs {strong('back and forth')} between your board and Claude Code. The mentor reads what your tiles saved, retunes your weights, goals and notices, and writes them back — the board only renders. The longer the loop runs, the more it adjusts to <em>you</em>.
            </p>
            <p className="ann" style={{ margin: '18px 0 6px' }}>How data gets in</p>
            <ul className="muted" style={{ listStyle: 'none', lineHeight: 1.9 }}>
              <li>{strong('Manual')} — type it straight into a tile</li>
              <li>{strong('API keys')} — Claude fetches (stocks, YouTube) and files it in</li>
              <li>{strong('MCP connector')} — your own token; Claude writes in from anywhere</li>
              <li>{strong('Scheduled sweeps')} — Claude runs on a schedule, noticing while you sleep</li>
            </ul>
          </div>
        )}

        {tab === 'yours' && (
          <div className="sheet-body">
            <p className="muted">
              Goals, dream, and priorities changed? {strong('Redo the interview')} — the same questions that built this board the first time.
            </p>
            <button
              type="button"
              className="btn ghost"
              style={{ width: '100%', margin: '14px 0 20px' }}
              onClick={() => {
                resetOnboarding(userId)
                window.location.reload()
              }}
            >
              Redo the interview
            </button>
            <p className="muted">
              Want your own visual design too? This is a {strong('conversation, not a switch')}. Paste this into Claude Code and the mentor talks it through with you first, before it changes a single pixel.
            </p>
            <pre className="prompt-box">{MAKE_IT_YOURS_PROMPT}</pre>
            <button type="button" className="btn" style={{ width: '100%', marginTop: 16 }} onClick={() => copy(MAKE_IT_YOURS_PROMPT, 'yours')}>
              {copied === 'yours' ? 'Copied ✓' : 'Copy the make-it-yours prompt'}
            </button>
          </div>
        )}

        {tab === 'data' && (
          <div className="sheet-body">
            <p className="muted">
              Don&apos;t like the demo numbers? {strong('Every card stays')} — only what&apos;s inside goes. Wipe one tile to keep it as a clean shell to build off, or wipe all the data at once.
            </p>
            {dataIds.length === 0 ? (
              <p className="ann" style={{ marginTop: 18 }}>No saved tile data on this device. The cards are already clean.</p>
            ) : (
              <>
                <div style={{ marginTop: 16 }}>
                  {dataIds.map((id) => (
                    <div
                      key={id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}
                    >
                      <span style={{ textTransform: 'capitalize' }}>{id}</span>
                      <button type="button" className="tab" onClick={() => wipeOne(id)}>
                        Wipe
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className={armed ? 'btn' : 'btn ghost'} style={{ width: '100%', marginTop: 18 }} onClick={wipeAll}>
                  {armed ? 'Sure? Everything inside every tile goes' : 'Wipe all tile data'}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'scratch' && (
          <div className="sheet-body">
            <p className="muted">
              Nothing gets destroyed from here. Paste the {strong('detonation prompt')} into Claude Code: it wipes the board to a black screen — but Claude {strong('keeps the context')} of everything you built, so when you start building again it already knows your world.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={keepBg} onChange={(e) => setKeepBg(e.target.checked)} style={{ width: 18, height: 18 }} />
              Keep the paper, the greeting and the date
            </label>
            <pre className="prompt-box">{prompt}</pre>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn" style={{ flex: 1.4 }} onClick={() => copy(prompt, 'detonate')}>
                {copied === 'detonate' ? 'Copied ✓' : 'Copy the prompt'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GearButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="icon-btn" onClick={onOpen} title="Settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
      </svg>
    </button>
  )
}

/**
 * The whole base app: one board. The gem sits beside the greeting; below it,
 * the equation (DashboardGrid). Every tile is an inert "slot" you fill with
 * your own sealed HTML (see public/tiles/README.md).
 */
export default function Dashboard({ firstName, userId }: DashboardProps) {
  // Pre-accounts boards stored goals/profile/layout under bare keys. Copy them
  // into this user's namespace before anything reads.
  //
  // This sits in the render body ON PURPOSE, not in an effect: React runs a
  // CHILD's effects before its parent's, so a migration in Dashboard's effect
  // would land after DashboardGrid had already read (and shown) the defaults.
  // A parent's render always precedes its children's, so here it is in time.
  // prepareLocalNamespace is idempotent and no-ops on the server.
  const migrated = useRef(false)
  if (!migrated.current) {
    migrated.current = true
    prepareLocalNamespace(userId)
  }

  const [chrome, setChrome] = useState<DashboardChrome | undefined>(undefined)
  const [scratchOpen, setScratchOpen] = useState(false)
  const [scratched, setScratched] = useState(false)
  const [resolvedFirstName, setResolvedFirstName] = useState<string | null>(firstName)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [reveal, setReveal] = useState<AiBoard | null>(null) // the AI build's reveal, once

  useEffect(() => {
    // Signed in: send this device's earlier logs to the cloud for any tile the
    // cloud has nothing for yet, so the connector sees the whole board. Retries
    // on the next load if it fails; the error goes to the console, not a toast.
    if (userId !== DEMO_USER_ID) {
      syncBackfill(userId).then(
        (ids) => ids.length && console.info('[sync] uploaded earlier data for', ids.join(', ')),
        (e) => console.error('[sync]', e),
      )
    }
  }, [userId])

  useEffect(() => {
    // The pre-paint script painted this browser's last theme; correct it to
    // this user's own choice (they differ only on a shared browser).
    applyTheme(readTheme(userId))
    setChrome(dashboardChrome.get(userId))
    try {
      setScratched(readScoped(userId, 'scratched') === '1')
      const p = profile(userId)
      if (p.name) setResolvedFirstName(p.name)
      // Straight after an AI build: walk through what it decided.
      const ai = readAiBoard(userId)
      if (ai && !ai.revealed && !site.detonated && onboardingState(userId) === 'done') setReveal(ai)
    } catch {
      /* ignore */
    }
  }, [userId])

  // Walks are logged from STEGA into a server-side blob, not the browser. The
  // sealed tile has no network, so the board fetches the log and hands it over
  // through the normal tile-data lane for the tile to read with Pulse.load().
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/walks')
        if (!res.ok) return
        const { walks } = await res.json()
        if (cancelled || !Array.isArray(walks)) return
        await tileStore.saveData(userId, 'walks', { walks, syncedAt: new Date().toISOString() })
        // the board re-reads the Walks number on the tile face
        window.dispatchEvent(new CustomEvent('pulse:tiledata', { detail: 'walks' }))
      } catch {
        // Offline or blob unconfigured — the tile keeps its last synced copy.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // First visit (and not the detonated/black scratch mode): personalize before
  // showing the demo board. If signed in with cloud data already saved from
  // another device, hydrate silently instead of asking again.
  useEffect(() => {
    if (site.detonated) return
    if (onboardingState(userId) !== 'none') return
    let cancelled = false
    ;(async () => {
      const hydrated = await hydratePersonalizationFromCloud(userId)
      if (cancelled) return
      if (hydrated) {
        window.location.reload()
      } else {
        setShowOnboarding(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // In scratch mode there's no gem. The greeting stays only when the background
  // was kept (world); a pure-black scratch drops it too. The gear is always
  // there — the way into scratch and back.
  const detonated = site.detonated // set IN CODE by /detonate — deterministic, same every time
  const showGem = (chrome?.gem.show ?? true) && !scratched && !detonated
  const showGreeting = (!scratched || chrome?.background.mode === 'world') && detonated !== 'black'

  // /detonate black: pure black, only the gear and the way back.
  if (detonated === 'black') {
    return (
      <main style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
        <div style={{ position: 'fixed', top: 24, right: 24 }}>
          <GearButton onOpen={() => setScratchOpen(true)} />
        </div>
        <p className="ann" style={{ position: 'fixed', bottom: 22, left: 0, right: 0, textAlign: 'center', color: '#8a8a8a' }}>
          run /detonate undo in claude code to come back
        </p>
        {scratchOpen && <ScratchPanel userId={userId} onClose={() => setScratchOpen(false)} />}
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.bhead}>
          {showGem && <DashboardHeaderGem className={styles.headerGem} />}
          {showGreeting ? (
            <DashboardHeader firstName={resolvedFirstName} greeting={chrome?.greeting} date={chrome?.date} />
          ) : (
            <div className={styles.header} />
          )}
          <div className={styles.actions}>
            <AuthPanel />
            <GearButton onOpen={() => setScratchOpen(true)} />
          </div>
        </header>

        <DashboardGrid userId={userId} chrome={chrome ?? DEFAULT_CHROME} />
      </div>

      {scratchOpen && <ScratchPanel userId={userId} onClose={() => setScratchOpen(false)} />}
      {reveal && <RevealSheet userId={userId} rec={reveal} onDone={() => setReveal(null)} />}
      {showOnboarding && (
        <Onboarding userId={userId} onComplete={() => setShowOnboarding(false)} onSkip={() => setShowOnboarding(false)} />
      )}
    </main>
  )
}
