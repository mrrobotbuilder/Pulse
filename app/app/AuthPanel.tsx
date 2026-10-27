'use client'

import { useEffect, useState } from 'react'
import styles from './dashboard.module.css'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { isSignedIn, currentUser, onAuthChange, signIn, signUp, signOut } from '@/lib/auth'

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
  const [signedIn, setSignedIn] = useState(isSignedIn())
  const [email, setEmail] = useState(currentUser()?.email ?? null)

  useEffect(() => {
    if (!configured) return
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
        title={signedIn ? `Synced as ${email}` : 'Cloud backup'}
      >
        {signedIn ? email : 'Sync'}
      </button>
      {open && <AuthOverlay signedIn={signedIn} email={email} onClose={() => setOpen(false)} />}
    </>
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
