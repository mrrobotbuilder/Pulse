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
import { THEMES, applyTheme, readTheme, type ThemeId } from '@/lib/theme'

const MIN_AREAS = 2
const MAX_AREAS = 4

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

  const accent = WALLPAPER_ACCENTS[0].hex
  const [theme, setTheme] = useState<ThemeId>(() => readTheme(userId))
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
      theme,
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
        if (json?.result) result = { ...(json.result as PersonalizationResult), theme }
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

  const stepHead = (n: number, title: string, help: React.ReactNode) => (
    <>
      <p className="ann">Step {n} of {STEPS.length}</p>
      <h2>{title}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{help}</p>
    </>
  )

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="Personalize your dashboard" style={{ zIndex: 200 }}>
      <div className="sheet" style={{ width: 'min(580px, 100%)' }}>
        <div className="sheet-body">
          {/* the ruler: one mark per step, done steps inked, the current one in accent */}
          <ol aria-label="Interview progress" style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, listStyle: 'none', borderTop: '1.5px solid var(--text)', marginBottom: 22 }}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === stepIdx ? 'step' : undefined}
                style={{ height: 10, borderLeft: '1.5px solid var(--text)', borderTop: i <= stepIdx ? `4px solid ${i === stepIdx ? 'var(--accent)' : 'var(--text)'}` : 'none', marginTop: -1.5 }}
              >
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  {s}
                  {i < stepIdx ? ' (done)' : ''}
                </span>
              </li>
            ))}
          </ol>

          {step === 'basics' && (
            <div>
              {stepHead(1, "Who's this for?", <>This board is going to be built entirely around you, not a template. Body basics are optional; skip anything you don&apos;t want to share.</>)}
              <label className="field-label" htmlFor="ob-name">Your name</label>
              <input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" autoFocus />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor="ob-age">Age <small>(optional)</small></label>
                  <input id="ob-age" className="input" type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} placeholder="—" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor="ob-sex">Sex <small>(optional)</small></label>
                  <select id="ob-sex" className="input" value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}>
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span className="field-label">
                    Height{' '}
                    <button type="button" className="ann" onClick={() => setHeightUnit(heightUnit === 'cm' ? 'ftin' : 'cm')} style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                      {heightUnit === 'cm' ? 'cm' : 'ft/in'}
                    </button>
                  </span>
                  {heightUnit === 'cm' ? (
                    <input className="input" aria-label="Height in centimetres" type="number" min={0} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="—" />
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="input" aria-label="Height, feet" type="number" min={0} value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" />
                      <input className="input" aria-label="Height, inches" type="number" min={0} value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <span className="field-label">
                    Weight{' '}
                    <button type="button" className="ann" onClick={() => setWeightUnit(weightUnit === 'kg' ? 'lb' : 'kg')} style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                      {weightUnit}
                    </button>
                  </span>
                  {weightUnit === 'kg' ? (
                    <input className="input" aria-label="Weight in kilograms" type="number" min={0} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="—" />
                  ) : (
                    <input className="input" aria-label="Weight in pounds" type="number" min={0} value={weightLb} onChange={(e) => setWeightLb(e.target.value)} placeholder="—" />
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'dream' && (
            <div>
              {stepHead(2, "What's the dream?", <>Zoom all the way out. In a sentence or two: what are you actually chasing? This becomes the gold goal at the top of your board.</>)}
              <label className="field-label" htmlFor="ob-dream">Your dream</label>
              <textarea
                id="ob-dream"
                className="input"
                style={{ minHeight: 120 }}
                value={dream}
                onChange={(e) => setDream(e.target.value)}
                placeholder="e.g. Open my own bakery within two years, while staying strong and healthy along the way."
                autoFocus
              />
            </div>
          )}

          {step === 'areas' && (
            <div>
              {stepHead(3, 'Pick your focus areas', <>Choose {MIN_AREAS}–{MAX_AREAS} areas this board should track toward. For each, write a concrete target for the next 6–12 months.</>)}
              <div className="chips" role="group" aria-label="Focus areas">
                {DOMAINS.map((d) => (
                  <button key={d.id} type="button" className="chip" aria-pressed={selectedDomains.includes(d.id)} onClick={() => toggleDomain(d.id)} title={d.hint}>
                    {d.label}
                  </button>
                ))}
              </div>
              {selectedDomains.map((d) => (
                <div key={d}>
                  <label className="field-label" htmlFor={`ob-t-${d}`}>Your target for {domainLabel(d).toLowerCase()}</label>
                  <input
                    id={`ob-t-${d}`}
                    className="input"
                    value={targets[d] ?? ''}
                    onChange={(e) => setTargets((prev) => ({ ...prev, [d]: e.target.value }))}
                    placeholder="e.g. Bench 225 lb for reps"
                  />
                </div>
              ))}
            </div>
          )}

          {step === 'priority' && (
            <div>
              {stepHead(4, 'What matters most right now?', <>Pick the one area to lean on hardest today. It gets double weight in your overall goal.</>)}
              <div role="radiogroup" aria-label="Top priority" style={{ display: 'grid', gap: 8 }}>
                {selectedDomains.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={priorityDomain === d} className="chip" aria-pressed={priorityDomain === d} onClick={() => setPriorityDomain(d)} style={{ minHeight: 56 }}>
                    <span>
                      <span style={{ display: 'block' }}>{domainLabel(d)}</span>
                      <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{targets[d]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'look' && (
            <div>
              {stepHead(5, 'Make it look like yours', <>Pick a paper for your board (you can change it later in the gear), and write your own greeting if you like.</>)}
              <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === t.id}
                    data-theme={t.id}
                    onClick={() => {
                      setTheme(t.id)
                      applyTheme(t.id) // preview it live behind the dialog
                    }}
                    style={{
                      minHeight: 56,
                      padding: '8px 12px',
                      textAlign: 'left',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      border: `1.5px solid ${theme === t.id ? 'var(--text)' : 'var(--line)'}`,
                      boxShadow: theme === t.id ? 'inset 0 -4px 0 var(--accent)' : 'none',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <b style={{ fontFamily: 'var(--font-display)' }}>{t.name}</b>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>{t.note}</span>
                  </button>
                ))}
              </div>
              <label className="field-label" htmlFor="ob-greet">
                Custom greeting <small>(optional; blank gives &ldquo;Good morning, {name || 'you'}&rdquo;)</small>
              </label>
              <input id="ob-greet" className="input" value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="e.g. Let's build the bakery, Alex" />
            </div>
          )}

          {step === 'review' && (
            <div>
              {stepHead(6, 'Build your Pulse', <>Here&apos;s what your board is about to become. Everything else (the mentor, the workout logger, kilograms, personal records) stays exactly as it is.</>)}
              <div style={{ background: 'var(--bg)', border: '1.5px solid var(--text)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p className="muted">
                  <strong style={{ color: 'var(--text)' }}>{name || 'You'}</strong> · {dream || '(no dream set)'}
                </p>
                <ul style={{ listStyle: 'none', marginTop: 8, lineHeight: 1.9 }}>
                  {selectedDomains.map((d) => (
                    <li key={d}>
                      <b>{domainLabel(d)}</b>
                      <span className="muted">
                        {' — '}
                        {targets[d]}
                        {d === priorityDomain ? ' (top priority)' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {stepIdx > 0 ? (
              <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={back} disabled={submitting}>
                Back
              </button>
            ) : (
              <button type="button" className="btn ghost" style={{ flex: 1, whiteSpace: 'normal' }} onClick={skip} disabled={submitting}>
                Skip — explore the demo
              </button>
            )}
            {step === 'review' ? (
              <button type="button" className="btn" style={{ flex: 1.3 }} onClick={submit} disabled={submitting}>
                {submitting ? 'Building your Pulse…' : 'Build my Pulse'}
              </button>
            ) : (
              <button type="button" className="btn" style={{ flex: 1.3 }} onClick={next} disabled={!canAdvance}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
