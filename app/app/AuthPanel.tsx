'use client'

import { useEffect, useState } from 'react'
import styles from './dashboard.module.css'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { isSignedIn, currentUser, onAuthChange, signIn, signUp, signOut } from '@/lib/auth'
import { currentWatchState, onWatchState, type WatchState } from '@/lib/watchSync'

/** What the last Fitbit sync learned, kept live so the pill and the panel agree. */
function useWatchState(): WatchState {
  const [s, setS] = useState<WatchState>(currentWatchState())
  useEffect(() => {
    setS(currentWatchState()) // the sync may have finished before this mounted
    return onWatchState(setS)
  }, [])
  return s
}

/**
 * The cloud-backup control: a small pill next to the settings gear.
 *
 * Renders nothing when Supabase isn't configured (today's zero-config look is
 * unchanged for anyone who hasn't set the two env keys). Signed out, it reads
 * "sync"; signed in, it shows the account email. Either way, clicking opens a
 * small email/password panel — sign up, sign in, or sign out. After a
 * successful sign-in a reload lets every open tile re-run its bridge `load`
 * against the cloud copy.
 */
export default function AuthPanel() {
  const configured = supabaseConfigured()
  const [open, setOpen] = useState(false)
  // Start signed out, like the server render. The saved session is only known
  // in the browser (and may already be loaded before React hydrates), so reading
  // it here would make the first client paint differ from the server HTML.
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const watch = useWatchState()

  useEffect(() => {
    if (!configured) return
    setSignedIn(isSignedIn()) // the session may have loaded before this mounted
    setEmail(currentUser()?.email ?? null)
    return onAuthChange((user) => {
      setSignedIn(!!user)
      setEmail(user?.email ?? null)
    })
  }, [configured])

  if (!configured) return null

  return (
    <>
      <button
        type="button"
        className={styles.syncBtn}
        data-on={signedIn}
        onClick={() => setOpen(true)}
        title={watch === 'expired' ? 'Your Fitbit connection expired. Open this to reconnect.' : signedIn ? `Synced as ${email}` : 'Cloud backup'}
        aria-label={watch === 'expired' ? `${signedIn ? email : 'Sync'}. Fitbit connection expired` : undefined}
      >
        {/* first, because the pill cuts long emails off with "…" from the right */}
        {watch === 'expired' && (
          <span
            aria-hidden="true"
            style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }}
          />
        )}
        {signedIn ? email : 'Sync'}
      </button>
      {open && <AuthOverlay signedIn={signedIn} email={email} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * "Connect watch" — starts the Google Health (Fitbit) sign-in. The server needs
 * to know WHICH Pulse account is connecting, so both calls carry the Supabase
 * access token as a Bearer header (never in a URL). More brands go here later.
 */
function WatchConnect() {
  const expired = useWatchState() === 'expired'
  const [status, setStatus] = useState<'loading' | 'off' | 'on' | 'unavailable'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const authHeader = async (): Promise<Record<string, string>> => {
    const { data } = (await supabase()?.auth.getSession()) ?? { data: { session: null } }
    if (!data.session) throw new Error('Sign in again, then retry.')
    return { authorization: `Bearer ${data.session.access_token}` }
  }

  useEffect(() => {
    let alive = true
    authHeader()
      .then((h) => fetch('/api/googlehealth/status', { headers: h, cache: 'no-store' }))
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) return setStatus('unavailable')
        const json = await res.json()
        setStatus(json.connected ? 'on' : 'off')
      })
      .catch(() => alive && setStatus('unavailable'))
    return () => {
      alive = false
    }
  }, [])

  const connect = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/googlehealth/start', { method: 'POST', headers: await authHeader() })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) {
        const why = json.missing ? ` Missing: ${json.missing.join(', ')}.` : ''
        throw new Error((json.error ?? `Could not start (HTTP ${res.status}).`) + why)
      }
      window.location.href = json.url
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line, rgba(255,255,255,0.12))' }}>
      <span className="ann">Watch</span>
      {expired ? (
        <p role="alert" style={{ color: 'var(--accent)', fontWeight: 700, margin: '8px 0 12px' }}>
          Your Fitbit connection expired, so new sleep and steps are not coming in. Google only keeps a connection for 7
          days while this app is in test mode. Press Reconnect Fitbit (about 20 seconds). Your saved data is untouched.
        </p>
      ) : (
        <p className="muted" style={{ margin: '8px 0 12px' }}>
          {status === 'on'
            ? 'Fitbit is connected. Sleep, steps and heart rate come in by themselves each time you open the board.'
            : 'Connect your Fitbit (through Google) so sleep, steps and heart rate fill in without logging.'}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--accent)', fontWeight: 700, margin: '0 0 10px' }}>{error}</p>
      )}
      <button type="button" className="btn" disabled={busy || status === 'loading'} onClick={connect} style={{ width: '100%' }}>
        {busy ? 'Opening Google…' : status === 'on' || expired ? 'Reconnect Fitbit' : 'Connect watch (Fitbit)'}
      </button>
    </div>
  )
}

function AuthOverlay({
  signedIn,
  email,
  onClose,
}: {
  signedIn: boolean
  email: string | null
  onClose: () => void
}) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [emailField, setEmailField] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justSignedUp, setJustSignedUp] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fn = mode === 'up' ? signUp : signIn
    const { error: err } = await fn(emailField.trim(), password)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    if (mode === 'up') {
      // With "confirm email" off (per setup), signUp already signs the user in.
      setJustSignedUp(true)
      window.setTimeout(() => window.location.reload(), 700)
    } else {
      window.location.reload()
    }
  }

  const doSignOut = async () => {
    setBusy(true)
    await signOut()
    window.location.reload()
  }

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="Cloud backup" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ width: 'min(400px, 100%)' }}>
        <div className="sheet-head">
          <span className="ann">Cloud backup</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="sheet-body">
        {signedIn ? (
          <>
            <p className="muted">
              Signed in as <strong style={{ color: 'var(--text)' }}>{email}</strong>. Every save on this device also
              mirrors to your account, so it&apos;s there when you open the dashboard elsewhere.
            </p>
            <WatchConnect />
            <button type="button" className="btn ghost" disabled={busy} onClick={doSignOut} style={{ width: '100%', marginTop: 18 }}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 16 }}>
              Sign in and every save on this device also backs up to your account — open the dashboard on another
              device and it&apos;s already there. Your data stays private to you.
            </p>
            {justSignedUp ? (
              <p className="ann" style={{ color: 'var(--text)' }}>Account created. Signing you in…</p>
            ) : (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={emailField}
                  onChange={(e) => setEmailField(e.target.value)}
                  className="input"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                />
                {error && (
                  <p role="alert" style={{ color: 'var(--accent)', fontWeight: 700, margin: 0 }}>{error}</p>
                )}
                <button type="submit" className="btn" disabled={busy} style={{ marginTop: 4 }}>
                  {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'up' ? 'in' : 'up')
                    setError(null)
                  }}
                  className="ann"
                  style={{ minHeight: 44 }}
                >
                  {mode === 'up' ? 'have an account? sign in' : 'new here? create an account'}
                </button>
              </form>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
