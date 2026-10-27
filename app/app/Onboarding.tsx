'use client'

import { useEffect, useState } from 'react'
import {
  answersV2ToV1,
  answerText,
  applyPersonalization,
  domainLabel,
  mapAnswersV2,
  mirrorPersonalization,
  skipOnboarding,
  MAX_FIELD,
  MAX_TOTAL,
  type InterviewAnswersV2,
  type LifeArea,
  type PersonalizationResult,
} from '@/lib/onboarding'
import { readScoped, writeScoped, removeScoped } from '@/lib/localScope'
import { THEMES, applyTheme, type ThemeId } from '@/lib/theme'

type Step = 'you' | 'goal' | 'days' | 'body' | 'recovery' | 'life' | 'track' | 'look' | 'review'
const STEPS: Step[] = ['you', 'goal', 'days', 'body', 'recovery', 'life', 'track', 'look', 'review']
const MIN_GOAL = 20

// Scoped keys: the half-filled interview survives a reload.
const DRAFT = 'intro:draft'
const STEP = 'intro:step'

/** The form as typed: raw strings for numbers, both unit systems kept. */
interface Form {
  name: string
  age: string
  sex: '' | 'male' | 'female'
  heightUnit: 'cm' | 'ftin'
  heightCm: string
  heightFt: string
  heightIn: string
  weightUnit: 'kg' | 'lb'
  weightKg: string
  weightLb: string
  goal: string
  otherGoals: string
  wake: string
  sleep: string
  work: InterviewAnswersV2['work']
  day: string
  trainFreq: InterviewAnswersV2['trainFreq']
  trainKinds: string[]
  trainNotes: string
  injuries: string
  eating: string
  sleepQuality: number
  energy: number
  devices: string[]
  life: Partial<Record<LifeArea, string>>
  logMinutes: number
  hateTracking: string
  boardSize: InterviewAnswersV2['boardSize']
  vibes: string[]
  theme: ThemeId | 'auto'
  greeting: string
}

const EMPTY: Form = {
  name: '', age: '', sex: '', heightUnit: 'cm', heightCm: '', heightFt: '', heightIn: '', weightUnit: 'kg', weightKg: '', weightLb: '',
  goal: '', otherGoals: '', wake: '', sleep: '', work: '', day: '',
  trainFreq: '', trainKinds: [], trainNotes: '', injuries: '', eating: '',
  sleepQuality: 0, energy: 0, devices: [], life: {},
  logMinutes: 0, hateTracking: '', boardSize: 'everything', vibes: [], theme: 'auto', greeting: '',
}

const LIFE: [LifeArea, string, string][] = [
  ['money', 'Money', 'e.g. Save 50,000 by December and stop living paycheck to paycheck.'],
  ['content', 'Content or audience', 'e.g. Post two videos a week and reach 10k subscribers.'],
  ['learning', 'Learning a skill', 'e.g. Hold a 20-minute conversation in Spanish by summer.'],
  ['mind', 'Mind and focus', 'e.g. Two hours of deep work a day, less doomscrolling.'],
]

/** Read the saved draft, keeping only fields that still have the right type. */
function loadForm(userId: string): Form {
  let saved: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(readScoped(userId, DRAFT) || 'null')
    if (parsed && typeof parsed === 'object') saved = parsed
  } catch {
    /* unreadable draft: start clean */
  }
  const form = { ...EMPTY } as Record<string, unknown>
  for (const [k, def] of Object.entries(EMPTY)) {
    const v = saved[k]
    if (Array.isArray(def) ? Array.isArray(v) && v.every((x) => typeof x === 'string') : typeof v === typeof def && v !== null) form[k] = v
  }
  const life: Form['life'] = {}
  if (form.life && typeof form.life === 'object') {
    for (const [k] of LIFE) {
      const v = (form.life as Record<string, unknown>)[k]
      if (typeof v === 'string') life[k] = v.slice(0, MAX_FIELD)
    }
  }
  return { ...(form as unknown as Form), life }
}

interface OnboardingProps {
  /** Whose board this personalizes — see lib/localScope.ts */
  userId: string
  /** Called once personalization is applied and the page is about to reload. */
  onComplete: () => void
  /** Called when the visitor skips — no data changes, just hide the overlay. */
  onSkip: () => void
}

/**
 * The first-visit interview (Stage 4: the deep version). Nine steps, big
 * free-text boxes, answers saved as you type. Submitting builds the board by
 * rules (mapAnswersV2) and tries the optional AI wording route; the rule-based
 * board always stands in, so the interview never blocks on the network.
 */
export default function Onboarding({ userId, onComplete, onSkip }: OnboardingProps) {
  const [form, setForm] = useState<Form>(() => loadForm(userId))
  const [stepIdx, setStepIdx] = useState(() => {
    const n = Number(readScoped(userId, STEP))
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0
  })
  const [submitting, setSubmitting] = useState(false)
  const step = STEPS[stepIdx]

  useEffect(() => writeScoped(userId, DRAFT, JSON.stringify(form)), [userId, form])
  useEffect(() => writeScoped(userId, STEP, String(stepIdx)), [userId, stepIdx])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const total = answerText(form).reduce((n, s) => n + s.length, 0)
  const over = total > MAX_TOTAL

  const canAdvance = !over && (step !== 'you' || form.name.trim().length > 0) && (step !== 'goal' || form.goal.trim().length >= MIN_GOAL)

  const next = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  const back = () => setStepIdx((i) => Math.max(i - 1, 0))

  const buildAnswers = (): InterviewAnswersV2 => {
    const f = form
    const heightCm =
      f.heightUnit === 'cm' ? (Number(f.heightCm) || undefined) : f.heightFt || f.heightIn ? Math.round(((Number(f.heightFt) || 0) * 12 + (Number(f.heightIn) || 0)) * 2.54) || undefined : undefined
    const weightKg = f.weightUnit === 'kg' ? (Number(f.weightKg) || undefined) : f.weightLb ? Math.round(Number(f.weightLb) * 0.4536) || undefined : undefined
    const trim = (s: string) => s.trim()
    const life: InterviewAnswersV2['life'] = {}
    for (const [k, v] of Object.entries(f.life)) life[k as LifeArea] = trim(v ?? '')
    return {
      version: 2,
      name: trim(f.name),
      age: Number(f.age) || undefined,
      heightCm,
      weightKg,
      sex: f.sex || undefined,
      units: f.heightUnit === 'cm' && f.weightUnit === 'kg' ? 'metric' : 'imperial',
      goal: trim(f.goal),
      otherGoals: trim(f.otherGoals),
      wake: f.wake,
      sleep: f.sleep,
      work: f.work,
      day: trim(f.day),
      trainFreq: f.trainFreq,
      trainKinds: f.trainKinds,
      trainNotes: trim(f.trainNotes),
      injuries: trim(f.injuries),
      eating: trim(f.eating),
      sleepQuality: f.sleepQuality,
      energy: f.energy,
      devices: f.devices,
      life,
      logMinutes: ([1, 5, 15].includes(f.logMinutes) ? f.logMinutes : 0) as InterviewAnswersV2['logMinutes'],
      hateTracking: trim(f.hateTracking),
      boardSize: f.boardSize,
      vibes: f.vibes,
      theme: f.theme,
      greeting: trim(f.greeting),
    }
  }

  const submit = async () => {
    setSubmitting(true)
    const answers = buildAnswers()
    const draft = mapAnswersV2(answers)
    let result: PersonalizationResult = draft

    try {
      // Until Stage 5 the route still reads the V1 shape; it only rewrites wording.
      const res = await fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersV2ToV1(answers), draft }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
      })
      if (res.ok) {
        const json = await res.json()
        if (json?.result) result = { ...(json.result as PersonalizationResult), theme: draft.theme, order: draft.order, removed: draft.removed }
      }
    } catch {
      /* offline / timeout — the rule-based board already stands in */
    }

    applyPersonalization(userId, result)
    mirrorPersonalization(answers, result)
    // Keep the answers (a redo starts from them), but start a redo at step 1.
    removeScoped(userId, STEP)
    onComplete()
    window.location.reload()
  }

  const skip = () => {
    skipOnboarding(userId)
    onSkip()
  }

  const stepHead = (title: string, help: React.ReactNode) => (
    <>
      <p className="ann">Step {stepIdx + 1} of {STEPS.length}</p>
      <h2>{title}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{help}</p>
    </>
  )

  const box = (id: string, label: React.ReactNode, value: string, onChange: (v: string) => void, placeholder: string, minHeight = 96) => (
    <div style={{ marginBottom: 14 }}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="input"
        style={{ minHeight, marginBottom: 2 }}
        maxLength={MAX_FIELD}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_FIELD))}
        placeholder={placeholder}
        aria-describedby={`${id}-n`}
      />
      <p id={`${id}-n`} className="ann" style={{ textAlign: 'right' }}>
        {value.length.toLocaleString('en')} / {MAX_FIELD.toLocaleString('en')}
      </p>
    </div>
  )

  /** Pick-one chips. Clicking the chosen one again keeps it (radios don't untick). */
  const pick = <K extends keyof Form>(key: K, label: string, options: [Form[K], string][]) => (
    <div style={{ marginBottom: 14 }}>
      <span className="field-label" id={`ob-${String(key)}-l`}>{label}</span>
      <div className="chips" role="radiogroup" id={`ob-${String(key)}`} aria-labelledby={`ob-${String(key)}-l`}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className="chip" role="radio" aria-checked={form[key] === v} onClick={() => set(key, v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )

  /** Pick-several chips over a string[] field. */
  const many = (key: 'trainKinds' | 'devices' | 'vibes', label: string, options: [string, string][]) => (
    <div style={{ marginBottom: 14 }}>
      <span className="field-label" id={`ob-${key}-l`}>{label}</span>
      <div className="chips" role="group" id={`ob-${key}`} aria-labelledby={`ob-${key}-l`}>
        {options.map(([v, text]) => {
          const onNow = form[key].includes(v)
          return (
            <button key={v} type="button" className="chip" aria-pressed={onNow} onClick={() => set(key, onNow ? form[key].filter((x) => x !== v) : [...form[key], v])}>
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )

  const scale = (key: 'sleepQuality' | 'energy', label: string) =>
    pick(key, label, [1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string]))

  const preview = step === 'review' ? answersV2ToV1(buildAnswers()) : null

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="Personalize your dashboard" style={{ zIndex: 200 }}>
      <div className="sheet" style={{ width: 'min(620px, 100%)' }}>
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

          {step === 'you' && (
            <div>
              {stepHead("Who's this for?", <>This board is built entirely around you, not a template. Only your name is needed; skip anything else you don&apos;t want to share.</>)}
              <label className="field-label" htmlFor="ob-name">Your name</label>
              <input id="ob-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value.slice(0, 60))} placeholder="First name" autoFocus />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor="ob-age">Age <small>(optional)</small></label>
                  <input id="ob-age" className="input" type="number" min={0} value={form.age} onChange={(e) => set('age', e.target.value)} placeholder="—" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor="ob-sex">Sex <small>(optional)</small></label>
                  <select id="ob-sex" className="input" value={form.sex} onChange={(e) => set('sex', e.target.value as Form['sex'])}>
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span className="field-label">
                    Height{' '}
                    <button type="button" className="ann" aria-label={`Height unit: ${form.heightUnit === 'cm' ? 'centimetres' : 'feet and inches'}. Switch`} onClick={() => set('heightUnit', form.heightUnit === 'cm' ? 'ftin' : 'cm')} style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                      {form.heightUnit === 'cm' ? 'cm' : 'ft/in'}
                    </button>
                  </span>
                  {form.heightUnit === 'cm' ? (
                    <input className="input" aria-label="Height in centimetres" type="number" min={0} value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} placeholder="—" />
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="input" aria-label="Height, feet" type="number" min={0} value={form.heightFt} onChange={(e) => set('heightFt', e.target.value)} placeholder="ft" />
                      <input className="input" aria-label="Height, inches" type="number" min={0} value={form.heightIn} onChange={(e) => set('heightIn', e.target.value)} placeholder="in" />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <span className="field-label">
                    Weight{' '}
                    <button type="button" className="ann" aria-label={`Weight unit: ${form.weightUnit === 'kg' ? 'kilograms' : 'pounds'}. Switch`} onClick={() => set('weightUnit', form.weightUnit === 'kg' ? 'lb' : 'kg')} style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                      {form.weightUnit}
                    </button>
                  </span>
                  {form.weightUnit === 'kg' ? (
                    <input className="input" aria-label="Weight in kilograms" type="number" min={0} value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} placeholder="—" />
                  ) : (
                    <input className="input" aria-label="Weight in pounds" type="number" min={0} value={form.weightLb} onChange={(e) => set('weightLb', e.target.value)} placeholder="—" />
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'goal' && (
            <div>
              {stepHead('Your goal, in your own words', <>Write everything: what you&apos;re chasing, why it matters, by when, and what has stopped you before. As long as you want. The first sentence becomes the gold goal at the top of your board.</>)}
              {box('ob-goal', 'Your goal', form.goal, (v) => set('goal', v), 'e.g. Deadlift 180 kg by June. I want to feel strong again after two years off; the last time I quit was when work got busy and I skipped a week…', 200)}
              {form.goal.trim().length < MIN_GOAL && <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>A little more, please: at least {MIN_GOAL} characters.</p>}
              {box('ob-other', <>Any other goals? <small>(optional)</small></>, form.otherGoals, (v) => set('otherGoals', v), 'Anything else you want this board to keep an eye on.')}
            </div>
          )}

          {step === 'days' && (
            <div>
              {stepHead('Your days', <>So the board fits around how you actually live. All optional.</>)}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor="ob-wake">You wake at</label>
                  <input id="ob-wake" className="input" type="time" value={form.wake} onChange={(e) => set('wake', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor="ob-sleep">You go to bed at</label>
                  <input id="ob-sleep" className="input" type="time" value={form.sleep} onChange={(e) => set('sleep', e.target.value)} />
                </div>
              </div>
              {pick('work', 'Your work', [['desk', 'Desk'], ['feet', 'On my feet'], ['shifts', 'Shifts'], ['student', 'Student'], ['other', 'Other']])}
              {box('ob-day', <>A normal day looks like… <small>(optional)</small></>, form.day, (v) => set('day', v), 'e.g. Up at 6, kids to school, desk until 5, too tired to cook most nights.')}
            </div>
          )}

          {step === 'body' && (
            <div>
              {stepHead('Body and training', <>Where you are now, not where you want to be. All optional.</>)}
              {pick('trainFreq', 'How often you train now', [['never', 'Never'], ['1-2', '1–2 a week'], ['3-4', '3–4 a week'], ['5+', '5+ a week']])}
              {many('trainKinds', 'What kind', [['weights', 'Weights'], ['running', 'Running'], ['sports', 'Sports'], ['yoga', 'Yoga or mobility'], ['walking', 'Walking'], ['other', 'Other']])}
              {box('ob-train-notes', <>More about your training <small>(optional)</small></>, form.trainNotes, (v) => set('trainNotes', v), 'e.g. Push/pull/legs, bench is stuck at 80 kg.', 72)}
              {box('ob-injuries', <>Injuries or conditions to work around <small>(optional)</small></>, form.injuries, (v) => set('injuries', v), 'e.g. Bad left knee, no running.', 72)}
              {box('ob-eating', <>How you eat now <small>(optional)</small></>, form.eating, (v) => set('eating', v), 'e.g. Skip breakfast, big dinners, vegetarian.', 72)}
            </div>
          )}

          {step === 'recovery' && (
            <div>
              {stepHead('Recovery and health', <>1 is poor, 5 is great. All optional.</>)}
              {scale('sleepQuality', 'Your sleep lately')}
              {scale('energy', 'Your energy during the day')}
              {many('devices', 'Devices you own', [['whoop', 'WHOOP'], ['apple-watch', 'Apple Watch'], ['garmin', 'Garmin'], ['oura', 'Oura'], ['phone', 'Phone only'], ['none', 'None']])}
            </div>
          )}

          {step === 'life' && (
            <div>
              {stepHead('The rest of life', <>Switch on any part of life you want on this board, and say what you want there. Skip all of it if the board is only about your goal.</>)}
              <div className="chips" role="group" aria-label="Parts of life" style={{ marginBottom: 14 }}>
                {LIFE.map(([k, label]) => {
                  const onNow = k in form.life
                  return (
                    <button
                      key={k}
                      type="button"
                      className="chip"
                      aria-pressed={onNow}
                      onClick={() => {
                        const life = { ...form.life }
                        if (onNow) delete life[k]
                        else life[k] = ''
                        set('life', life)
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {LIFE.filter(([k]) => k in form.life).map(([k, label, placeholder]) =>
                <div key={k}>{box(`ob-life-${k}`, <>{label}: what do you want here?</>, form.life[k] ?? '', (v) => set('life', { ...form.life, [k]: v }), placeholder, 72)}</div>,
              )}
            </div>
          )}

          {step === 'track' && (
            <div>
              {stepHead('How you want to track', <>Be honest: a board you stop opening helps nobody.</>)}
              {pick('logMinutes', 'Minutes a day you will really spend logging', [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes']])}
              {box('ob-hate', <>What do you hate tracking? <small>(optional)</small></>, form.hateTracking, (v) => set('hateTracking', v), 'e.g. Counting calories. Anything I have to type at the gym.', 72)}
              {pick('boardSize', 'How big should the board be?', [['focused', 'Tiny and focused'], ['everything', 'Show everything']])}
            </div>
          )}

          {step === 'look' && (
            <div>
              {stepHead('Look and feel', <>Pick the words that fit, then a paper, or let the board pick from your words. You can change it any time in the gear.</>)}
              {many('vibes', 'Vibe', [['calm', 'Calm'], ['intense', 'Intense'], ['minimal', 'Minimal'], ['playful', 'Playful'], ['data-heavy', 'Data-heavy']])}
              <span className="field-label" id="ob-theme-l">Paper</span>
              <div role="radiogroup" id="ob-theme" aria-labelledby="ob-theme-l" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                <button type="button" role="radio" className="chip" aria-checked={form.theme === 'auto'} onClick={() => set('theme', 'auto')} style={{ minHeight: 56 }}>
                  Let it pick for me
                </button>
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={form.theme === t.id}
                    data-theme={t.id}
                    onClick={() => {
                      set('theme', t.id)
                      applyTheme(t.id) // preview it live behind the dialog
                    }}
                    style={{
                      minHeight: 56,
                      padding: '8px 12px',
                      textAlign: 'left',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      border: `1.5px solid ${form.theme === t.id ? 'var(--text)' : 'var(--line)'}`,
                      boxShadow: form.theme === t.id ? 'inset 0 -4px 0 var(--accent)' : 'none',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <b style={{ fontFamily: 'var(--font-display)' }}>{t.name}</b>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>{t.note}</span>
                  </button>
                ))}
              </div>
              <label className="field-label" htmlFor="ob-greet">
                Custom greeting <small>(optional; blank gives &ldquo;Good morning, {form.name || 'you'}&rdquo;)</small>
              </label>
              <input id="ob-greet" className="input" value={form.greeting} onChange={(e) => set('greeting', e.target.value.slice(0, 80))} placeholder="e.g. Let's build the bakery, Alex" />
            </div>
          )}

          {step === 'review' && preview && (
            <div>
              {stepHead('Build your Pulse', <>Here&apos;s what your board is about to become. Go back to change anything.</>)}
              <div style={{ background: 'var(--bg)', border: '1.5px solid var(--text)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p className="muted">
                  <strong style={{ color: 'var(--text)' }}>{form.name || 'You'}</strong> · {preview.dream}
                </p>
                <p className="field-label" style={{ marginTop: 10 }}>Your board will track</p>
                <ul style={{ listStyle: 'none', lineHeight: 1.9 }}>
                  {preview.areas.map((a) => (
                    <li key={a.domain}>
                      <b>{domainLabel(a.domain)}</b>
                      <span className="muted">
                        {a.target ? ` — ${a.target}` : ''}
                        {a.domain === preview.priorityDomain ? ' (main focus)' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="muted" style={{ marginTop: 8 }}>
                  {form.boardSize === 'focused' ? 'Tiny and focused: tiles you don’t need stay hidden.' : 'Every tile shows; the ones that matter most come first.'}{' '}
                  Paper: {THEMES.find((t) => t.id === preview.theme)?.name ?? 'as it is now'}.
                </p>
              </div>
            </div>
          )}

          {step !== 'you' && step !== 'review' && (
            <p className="ann" role={over ? 'alert' : undefined} style={{ marginTop: 6, color: over ? 'var(--signal)' : undefined }}>
              {over
                ? `Over the ${MAX_TOTAL.toLocaleString('en')}-character total by ${(total - MAX_TOTAL).toLocaleString('en')}. Shorten an answer to continue.`
                : `All answers: ${total.toLocaleString('en')} / ${MAX_TOTAL.toLocaleString('en')} characters`}
            </p>
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
              <button type="button" className="btn" style={{ flex: 1.3 }} onClick={submit} disabled={submitting || over}>
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
