'use client'

import { useEffect, useState } from 'react'
import styles from './dashboard.module.css'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { isSignedIn, currentUser, onAuthChange, signIn, signUp, signOut } from '@/lib/auth'

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  letterSpacing: '.08em',
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
      {/* Reuses .settingsBtn's positioning (the reserved, otherwise-empty slot
          next to the gear) and its responsive/mobile behavior — only the
          visual look (width, color, border) is overridden inline, since that
          class defaults to a fixed 40x40 circular icon button. */}
      <button
        type="button"
        className={styles.settingsBtn}
        onClick={() => setOpen(true)}
        title={signedIn ? `Synced as ${email}` : 'Cloud backup'}
        style={{
          ...mono,
          fontSize: 10,
          textTransform: 'uppercase',
          width: 'auto',
          minWidth: 40,
          padding: '0 14px',
          color: signedIn ? 'var(--mint)' : 'var(--muted)',
          background: signedIn ? 'rgba(110,231,183,.10)' : 'rgba(255,255,255,.04)',
          borderColor: signedIn ? 'rgba(110,231,183,.4)' : 'rgba(255,255,255,.14)',
          maxWidth: 160,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {signedIn ? email : 'sync'}
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cloud backup"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          width: 'min(360px, 100%)',
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 20px 60px -20px rgba(0,0,0,.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Cloud backup</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid rgba(255,255,255,.14)',
              borderRadius: '50%',
              background: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {signedIn ? (
          <>
            <p style={{ color: 'var(--muted-strong, var(--muted))', fontSize: 13, lineHeight: 1.6, margin: '0 0 18px' }}>
              Signed in as <strong style={{ color: 'var(--fg)' }}>{email}</strong>. Every save on this device also
              mirrors to your account, so it&apos;s there when you open the dashboard elsewhere.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={doSignOut}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,.14)',
                background: 'none',
                color: 'var(--fg)',
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--muted-strong, var(--muted))', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>
              Sign in and every save on this device also backs up to your account — open the dashboard on another
              device and it&apos;s already there. Your data stays private to you.
            </p>
            {justSignedUp ? (
              <p style={{ ...mono, fontSize: 11, color: 'var(--mint)' }}>account created — signing you in…</p>
            ) : (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={emailField}
                  onChange={(e) => setEmailField(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
                {error && (
                  <p style={{ ...mono, fontSize: 11, color: '#ff6b6b', margin: 0 }}>{error}</p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    padding: '11px 0',
                    borderRadius: 999,
                    border: 'none',
                    background: 'var(--mint)',
                    color: 'var(--mint-ink, #042a1c)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                    marginTop: 4,
                  }}
                >
                  {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'up' ? 'in' : 'up')
                    setError(null)
                  }}
                  style={{
                    ...mono,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 0 0',
                  }}
                >
                  {mode === 'up' ? 'have an account? sign in' : 'new here? create an account'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(255,255,255,.12)',
  color: 'var(--fg)',
  fontSize: 14,
  outline: 'none',
}
