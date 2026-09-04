'use client'

import { useMemo, useState } from 'react'
import {
  DOMAINS,
  domainLabel,
  mapAnswersDeterministic,
  applyPersonalization,
  mirrorPersonalization,
  skipOnboarding,
  type InterviewAnswers,
  type FocusArea,
  type PersonalizationResult,
} from '@/lib/onboarding'
import { WALLPAPER_ACCENTS } from '@/lib/tiles/dashboardChrome'

const MIN_AREAS = 2
const MAX_AREAS = 4

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  letterSpacing: '.1em',
}
const serif: React.CSSProperties = {
  fontFamily: 'var(--font-serif), Georgia, serif',
  fontStyle: 'italic',
}
const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(255,255,255,.14)',
  color: 'var(--fg)',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
const label: React.CSSProperties = {
  ...mono,
  fontSize: 10,
  textTransform: 'uppercase',
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 6,
}

type Step = 'basics' | 'dream' | 'areas' | 'priority' | 'look' | 'review'
const STEPS: Step[] = ['basics', 'dream', 'areas', 'priority', 'look', 'review']

interface OnboardingProps {
  /** Whose board this personalizes — see lib/localScope.ts */
  userId: string
  /** Called once personalization is applied and the page is about to reload. */
  onComplete: () => void
  /** Called when the visitor skips — no data changes, just hide the overlay. */
  onSkip: () => void
}

/**
 * The first-visit interview. Replaces the template author's seeded goals
 * ("Become a famous YouTuber", "Be 185 lb lean") with the visitor's own —
 * every existing feature (Train logger, kg/PR tracking, the mentor) stays
 * exactly as it is; only the identity behind it changes.
 *
 * Submitting tries the optional AI polish route first (POST
 * /api/personalize), then always has the deterministic mapper as a
 * guaranteed-available fallback — the interview never blocks on a network
 * call or a missing API key.
 */
export default function Onboarding({ userId, onComplete, onSkip }: OnboardingProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm')
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [weightKg, setWeightKg] = useState('')
  const [weightLb, setWeightLb] = useState('')
  const [sex, setSex] = useState<'' | 'male' | 'female'>('')

  const [dream, setDream] = useState('')

  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [targets, setTargets] = useState<Record<string, string>>({})

  const [priorityDomain, setPriorityDomain] = useState('')

  const [accent, setAccent] = useState(WALLPAPER_ACCENTS[0].hex)
  const [greeting, setGreeting] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const toggleDomain = (id: string) => {
    setSelectedDomains((prev) => {
      if (prev.includes(id)) return prev.filter((d) => d !== id)
      if (prev.length >= MAX_AREAS) return prev
      return [...prev, id]
    })
    if (priorityDomain && !selectedDomains.includes(priorityDomain)) setPriorityDomain('')
  }

  const canAdvance = useMemo(() => {
    switch (step) {
      case 'basics':
        return name.trim().length > 0
      case 'dream':
        return dream.trim().length > 4
      case 'areas':
        return (
          selectedDomains.length >= MIN_AREAS &&
          selectedDomains.every((d) => (targets[d] ?? '').trim().length > 0)
        )
      case 'priority':
        return !!priorityDomain
      case 'look':
        return true
      case 'review':
        return true
      default:
        return false
    }
  }, [step, name, dream, selectedDomains, targets, priorityDomain])

  const next = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  const back = () => setStepIdx((i) => Math.max(i - 1, 0))

  const buildAnswers = (): InterviewAnswers => {
    const cmFromFt = (ft: string, inch: string) => {
      const f = Number(ft) || 0
      const i = Number(inch) || 0
      return Math.round((f * 12 + i) * 2.54)
    }
    const resolvedHeightCm =
      heightUnit === 'cm' ? (heightCm ? Number(heightCm) : undefined) : heightFt || heightIn ? cmFromFt(heightFt, heightIn) : undefined
    const resolvedWeightKg =
      weightUnit === 'kg' ? (weightKg ? Number(weightKg) : undefined) : weightLb ? Math.round(Number(weightLb) * 0.4536) : undefined

    const areas: FocusArea[] = selectedDomains.map((domain) => ({ domain, target: (targets[domain] ?? '').trim() }))

    return {
      name: name.trim(),
      age: age ? Number(age) : undefined,
      heightCm: resolvedHeightCm,
      weightKg: resolvedWeightKg,
      sex: sex || undefined,
      units: heightUnit === 'cm' && weightUnit === 'kg' ? 'metric' : 'imperial',
      dream: dream.trim(),
      areas,
      priorityDomain,
      accent,
      greeting: greeting.trim() || undefined,
    }
  }

  const submit = async () => {
    setSubmitting(true)
    const answers = buildAnswers()
    const draft = mapAnswersDeterministic(answers)
    let result: PersonalizationResult = draft

    try {
      const res = await fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, draft }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
      })
      if (res.ok) {
        const json = await res.json()
        if (json?.result) result = json.result as PersonalizationResult
      }
    } catch {
      /* offline / timeout — deterministic draft already stands in */
    }

    applyPersonalization(userId, result)
    mirrorPersonalization(answers, result)
    onComplete()
    window.location.reload()
  }

  const skip = () => {
    skipOnboarding(userId)
    onSkip()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Personalize your dashboard"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--bg-elevated, #0a0a0a)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 20,
          padding: '26px 26px 22px',
          boxShadow: '0 24px 80px -20px rgba(0,0,0,.85)',
        }}
      >
        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                height: 3,
                flex: 1,
                borderRadius: 3,
                background: i <= stepIdx ? 'var(--mint)' : 'rgba(255,255,255,.12)',
                transition: 'background .3s ease',
              }}
            />
          ))}
        </div>

        {step === 'basics' && (
          <div>
            <p style={label}>step 1 of 6</p>
            <h2 style={{ ...serif, fontSize: 28, color: 'var(--fg)', margin: '0 0 6px' }}>Who&apos;s this for?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 20px' }}>
              This board is going to be built entirely around you — not a template. Body basics are optional; skip
              anything you don&apos;t want to share.
            </p>
            <label style={label}>Your name</label>
            <input style={{ ...inputStyle, marginBottom: 14 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" autoFocus />

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Age (optional)</label>
                <input style={inputStyle} type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} placeholder="—" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Sex (optional)</label>
                <select style={{ ...inputStyle, appearance: 'auto' }} value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>
                  Height{' '}
                  <button type="button" onClick={() => setHeightUnit(heightUnit === 'cm' ? 'ftin' : 'cm')} style={unitToggleStyle}>
                    {heightUnit === 'cm' ? 'cm' : 'ft/in'}
                  </button>
                </label>
                {heightUnit === 'cm' ? (
                  <input style={inputStyle} type="number" min={0} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="—" />
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={inputStyle} type="number" min={0} value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" />
                    <input style={inputStyle} type="number" min={0} value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" />
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>
                  Weight{' '}
                  <button type="button" onClick={() => setWeightUnit(weightUnit === 'kg' ? 'lb' : 'kg')} style={unitToggleStyle}>
                    {weightUnit}
                  </button>
                </label>
                {weightUnit === 'kg' ? (
                  <input style={inputStyle} type="number" min={0} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="—" />
                ) : (
                  <input style={inputStyle} type="number" min={0} value={weightLb} onChange={(e) => setWeightLb(e.target.value)} placeholder="—" />
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'dream' && (
          <div>
            <p style={label}>step 2 of 6</p>
            <h2 style={{ ...serif, fontSize: 28, color: 'var(--fg)', margin: '0 0 6px' }}>What&apos;s the dream?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              Zoom all the way out. In a sentence or two — what are you actually chasing? This becomes the gold goal
              at the top of your board.
            </p>
            <textarea
              style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }}
              value={dream}
              onChange={(e) => setDream(e.target.value)}
              placeholder="e.g. Open my own bakery within two years, while staying strong and healthy along the way."
              autoFocus
            />
          </div>
        )}

        {step === 'areas' && (
          <div>
            <p style={label}>step 3 of 6</p>
            <h2 style={{ ...serif, fontSize: 28, color: 'var(--fg)', margin: '0 0 6px' }}>Pick your focus areas</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              Choose {MIN_AREAS}–{MAX_AREAS} areas this dashboard should track toward. For each, write a concrete
              target for the next 6–12 months.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {DOMAINS.map((d) => {
                const selected = selectedDomains.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDomain(d.id)}
                    title={d.hint}
                    style={{
                      ...mono,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      padding: '9px 14px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      border: selected ? '1px solid var(--mint)' : '1px solid rgba(255,255,255,.14)',
                      background: selected ? 'rgba(110,231,183,.12)' : 'rgba(255,255,255,.03)',
                      color: selected ? 'var(--mint)' : 'var(--muted)',
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
            {selectedDomains.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedDomains.map((d) => (
                  <div key={d}>
                    <label style={label}>Your target for {domainLabel(d).toLowerCase()}</label>
                    <input
                      style={inputStyle}
                      value={targets[d] ?? ''}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [d]: e.target.value }))}
                      placeholder="e.g. Bench 225 lb for reps"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'priority' && (
          <div>
            <p style={label}>step 4 of 6</p>
            <h2 style={{ ...serif, fontSize: 28, color: 'var(--fg)', margin: '0 0 6px' }}>What matters most right now?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              Pick the one area to lean on hardest today. It gets double weight in your overall goal.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedDomains.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPriorityDomain(d)}
                  style={{
                    textAlign: 'left',
                    padding: '13px 16px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: priorityDomain === d ? '1px solid var(--mint)' : '1px solid rgba(255,255,255,.12)',
                    background: priorityDomain === d ? 'rgba(110,231,183,.1)' : 'rgba(255,255,255,.03)',
                    color: priorityDomain === d ? 'var(--fg)' : 'var(--muted)',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{domainLabel(d)}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>{targets[d]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'look' && (
          <div>
            <p style={label}>step 5 of 6</p>
            <h2 style={{ ...serif, fontSize: 28, color: 'var(--fg)', margin: '0 0 6px' }}>Make it look like yours</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              Pick an accent color for the world behind your board, and optionally write your own greeting.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {WALLPAPER_ACCENTS.map((w) => (
                <button
                  key={w.hex}
                  type="button"
                  title={w.name}
                  onClick={() => setAccent(w.hex)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: w.hex,
                    cursor: 'pointer',
                    border: accent === w.hex ? '3px solid #fff' : '3px solid transparent',
                    boxShadow: accent === w.hex ? `0 0 0 2px ${w.hex}` : 'none',
                  }}
                />
              ))}
            </div>
            <label style={label}>Custom greeting (optional — leave blank for "Good morning, {name || 'you'}")</label>
            <input style={inputStyle} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="e.g. Let's build the bakery, Alex" />
          </div>
        )}

        {step === 'review' && (
          <div>
            <p style={label}>step 6 of 6</p>
            <h2 style={{ ...serif, fontSize: 28, color: 'var(--fg)', margin: '0 0 6px' }}>Build your Pulse</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
              Here&apos;s what your dashboard is about to become. Everything else — the mentor, the workout logger,
              kilograms, personal records — stays exactly as it is.
            </p>
            <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '16px 18px', marginBottom: 8 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--fg)' }}>{name || 'You'}</strong> · {dream || '(no dream set)'}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--muted)', lineHeight: 1.9 }}>
                {selectedDomains.map((d) => (
                  <li key={d}>
                    <span style={{ color: d === priorityDomain ? 'var(--mint)' : 'var(--fg)' }}>{domainLabel(d)}</span>
                    {' — '}
                    {targets[d]}
                    {d === priorityDomain ? ' (top priority)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* nav */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {stepIdx > 0 ? (
            <button type="button" onClick={back} disabled={submitting} style={navBtnStyle(false, submitting)}>
              Back
            </button>
          ) : (
            <button type="button" onClick={skip} disabled={submitting} style={navBtnStyle(false, submitting)}>
              Skip — explore the demo
            </button>
          )}
          {step === 'review' ? (
            <button type="button" onClick={submit} disabled={submitting} style={navBtnStyle(true, submitting)}>
              {submitting ? 'Building your Pulse…' : 'Build my Pulse'}
            </button>
          ) : (
            <button type="button" onClick={next} disabled={!canAdvance} style={navBtnStyle(true, !canAdvance)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const unitToggleStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  textTransform: 'uppercase',
  color: 'var(--mint)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  marginLeft: 4,
}

function navBtnStyle(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: primary ? 1.3 : 1,
    padding: '12px 0',
    borderRadius: 999,
    border: primary ? 'none' : '1px solid rgba(255,255,255,.14)',
    background: disabled ? (primary ? 'rgba(110,231,183,.35)' : 'transparent') : primary ? 'var(--mint)' : 'transparent',
    color: primary ? 'var(--mint-ink, #042a1c)' : 'var(--fg)',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled && !primary ? 0.6 : 1,
  }
}
