/**
 * Optional AI polish for the onboarding interview. The client always computes
 * a full personalization deterministically first (lib/onboarding.ts
 * mapAnswersDeterministic) — that draft already has correct ids, weights, and
 * accents. This route, when ANTHROPIC_API_KEY is set, asks Claude to rewrite
 * the WORDING only (goal titles, the gold overall title, one welcome notice,
 * and two tile ideas per goal) so it reads like it was written for this
 * visitor specifically, not templated.
 *
 * No key set → 503 { fallback: true } and the client keeps its deterministic
 * draft untouched. Same on any parse/validation/API error — onboarding must
 * never block on this call.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { InterviewAnswers, PersonalizationResult } from '@/lib/onboarding'

export const runtime = 'nodejs'

const ideaSchema = z.object({
  word: z.string(),
  title: z.string(),
  tracks: z.string(),
  why: z.string(),
  estWeight: z.number(),
})

const aiResponseSchema = z.object({
  overallTitle: z.string().min(1),
  goals: z.array(z.object({ id: z.string(), title: z.string().min(1) })),
  notice: z.object({
    text: z.string().min(1),
    points: z.array(z.string()).min(2).max(5),
  }),
  ideas: z.array(
    z.object({
      goalId: z.string(),
      ideas: z.array(ideaSchema).min(1).max(3),
    }),
  ),
})

const jsonSchema = {
  type: 'object',
  properties: {
    overallTitle: { type: 'string', description: "A short, punchy title for the visitor's overall dream (their gold headline goal)." },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string', description: 'A short, specific title for this goal, based on the target the visitor wrote.' },
        },
        required: ['id', 'title'],
        additionalProperties: false,
      },
    },
    notice: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'One warm paragraph welcoming the visitor and connecting their dashboard to their stated dream.' },
        points: {
          type: 'array',
          items: { type: 'string' },
          description: '3-4 short bullet highlights, using **word** markdown bold on the key phrase in each.',
        },
      },
      required: ['text', 'points'],
      additionalProperties: false,
    },
    ideas: {
      type: 'array',
      description: 'Two tile ideas per goal id (including "overall"), tailored to that specific goal.',
      items: {
        type: 'object',
        properties: {
          goalId: { type: 'string' },
          ideas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                word: { type: 'string', description: 'ONE word label' },
                title: { type: 'string' },
                tracks: { type: 'string', description: 'what the tile would track, one line' },
                why: { type: 'string', description: 'why it moves this specific goal' },
                estWeight: { type: 'number' },
              },
              required: ['word', 'title', 'tracks', 'why', 'estWeight'],
              additionalProperties: false,
            },
          },
        },
        required: ['goalId', 'ideas'],
        additionalProperties: false,
      },
    },
  },
  required: ['overallTitle', 'goals', 'notice', 'ideas'],
  additionalProperties: false,
} as const

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ fallback: true, reason: 'no_key' }, { status: 503 })

  let body: { answers: InterviewAnswers; draft: PersonalizationResult }
  try {
    body = await req.json()
  } catch {
    return Response.json({ fallback: true, reason: 'bad_request' }, { status: 400 })
  }
  const { answers, draft } = body
  if (!answers || !draft || !Array.isArray(draft.goals)) {
    return Response.json({ fallback: true, reason: 'bad_request' }, { status: 400 })
  }

  try {
    const client = new Anthropic({ apiKey })
    const prompt = [
      `Visitor name: ${answers.name || '(not given)'}`,
      `Their dream (1-2 sentences, in their own words): ${answers.dream}`,
      `Priority focus right now: ${answers.priorityDomain}`,
      `Goals they picked, with the target they wrote for each:`,
      ...draft.goals.map((g, i) => `  - id "${g.id}": domain "${answers.areas[i]?.domain}", target: "${answers.areas[i]?.target}"`),
      '',
      'Write personalized wording for their dashboard. Do not invent facts about them beyond what they wrote. Keep titles short (under 8 words). Never mention YouTube, "185 lb", or any example unrelated to what they actually wrote.',
    ].join('\n')

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      output_config: { format: { type: 'json_schema', schema: jsonSchema } },
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('no_text_block')
    const parsed = aiResponseSchema.parse(JSON.parse(textBlock.text))

    const result: PersonalizationResult = {
      ...draft,
      overall: { ...draft.overall, title: parsed.overallTitle },
      goals: draft.goals.map((g) => {
        const match = parsed.goals.find((pg) => pg.id === g.id)
        return match ? { ...g, title: match.title } : g
      }),
      notices: [
        {
          id: 'welcome-' + Date.now(),
          when: 'just now',
          text: parsed.notice.text,
          points: parsed.notice.points,
        },
      ],
      ideas: (() => {
        const out: Record<string, PersonalizationResult['ideas'][string]> = { ...draft.ideas }
        for (const entry of parsed.ideas) out[entry.goalId] = entry.ideas
        return out
      })(),
    }

    return Response.json({ result })
  } catch {
    return Response.json({ fallback: true, reason: 'api_error' }, { status: 503 })
  }
}
