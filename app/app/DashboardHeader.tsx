'use client'

import { useState, useEffect, useRef } from 'react'
import styles from './dashboard.module.css'
import { DEFAULT_CHROME, type Greeting, type DateConfig } from '@/lib/tiles/dashboardChrome'

interface DashboardHeaderProps {
  firstName?: string | null
  greeting?: Greeting
  date?: DateConfig
  /** Save the line the owner typed over the greeting; '' goes back to the auto line. */
  onGreeting?: (text: string) => void
}

/**
 * The editorial greeting + date. Prop-driven so a user can personalise it
 * (lib/tiles/dashboardChrome): keep the auto time-of-day line or write their own,
 * show / accent their name, scale it, and pick the date format (or hide it). The
 * font is the theme's display face; only wording, name, accent and scale are
 * exposed.
 */
export default function DashboardHeader({ firstName, greeting, date, onGreeting }: DashboardHeaderProps) {
  const [draft, setDraft] = useState<string | null>(null) // non-null while editing
  const cancelled = useRef(false) // Escape: leave without saving
  const g = greeting ?? DEFAULT_CHROME.greeting
  const d = date ?? DEFAULT_CHROME.date
  const [autoWord, setAutoWord] = useState('')
  const [fullDate, setFullDate] = useState('')
  const [todayDate, setTodayDate] = useState('')

  useEffect(() => {
    const now = new Date()
    const hour = now.getHours()
    setAutoWord(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
    setFullDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    setTodayDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
  }, [])

  // Custom wording falls back to the auto line if blank (never render empty).
  const word = g.mode === 'custom' && g.text.trim() ? g.text.trim() : autoWord
  const includesName = !!(firstName && word.toLowerCase().includes(firstName.toLowerCase()))
  const renderName = g.showName && firstName && !includesName
  const dateText = d.format === 'today' ? todayDate : fullDate
  // A full stop closes the line, unless the custom wording brought its own.
  const stop = /[.!?…]$/.test((renderName ? firstName : word) ?? '') || !word ? '' : '.'

  return (
    <div className={styles.header} style={{ ['--greet-scale' as string]: g.scale }}>
      {d.show && <p className="ann">{dateText}</p>}
      <h1 className={styles.greeting}>
        {draft !== null ? (
          <input
            className={styles.greetInput}
            aria-label="Greeting (leave empty for the automatic one)"
            value={draft}
            autoFocus
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                cancelled.current = true
                e.currentTarget.blur()
              }
            }}
            onBlur={() => {
              if (!cancelled.current) onGreeting?.(draft.trim())
              cancelled.current = false
              setDraft(null)
            }}
          />
        ) : (
          <button
            type="button"
            className={styles.greetBtn}
            title="Click to edit your greeting"
            disabled={!onGreeting}
            // Edit the whole line as shown, name included.
            onClick={() => setDraft(`${word}${renderName ? `, ${firstName}` : ''}${stop}`)}
          >
            {word}
            {renderName ? (
              <>
                , <span className={g.accentName ? styles.greetingName : undefined}>{firstName}</span>
              </>
            ) : null}
            {stop}
          </button>
        )}
      </h1>
    </div>
  )
}
