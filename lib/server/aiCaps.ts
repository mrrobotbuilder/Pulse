/**
 * The caps that protect the owner's Anthropic bill (docs/PLAN.md, Stage 5).
 * Server-only: it holds the service-role key and the salt.
 *
 *   · `takeBuild` counts one AI build per (hashed IP, UTC day) in Supabase
 *     `ai_usage` (supabase/ai_usage.sql), against AI_BUILDS_PER_IP_PER_DAY and
 *     AI_BUILDS_PER_DAY. The check and the increment are one SQL call.
 *   · A follow-up "ticket" lets the second call of a build (after the follow-up
 *     questions) run without counting again: it is HMAC-signed, bound to the
 *     exact answers, expires, and is spent once in `ai_tickets`.
 *
 * Anything missing or misconfigured answers `missing`, and the route then keeps
 * the AI off: failing closed is the point when the cost is real money.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface CapsConfig {
  salt: string
  perIp: number
  perDay: number
  db: SupabaseClient
}

const TICKET_TTL_MS = 30 * 60 * 1000

function limit(name: string, fallback: number): number | null {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export function capsConfig(): { config: CapsConfig } | { missing: string[] } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const salt = process.env.AI_USAGE_SALT
  const perIp = limit('AI_BUILDS_PER_IP_PER_DAY', 3)
  const perDay = limit('AI_BUILDS_PER_DAY', 50)
  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !key && 'SUPABASE_SERVICE_ROLE_KEY',
    (!salt || salt.length < 32) && 'AI_USAGE_SALT',
    perIp === null && 'AI_BUILDS_PER_IP_PER_DAY',
    perDay === null && 'AI_BUILDS_PER_DAY',
  ].filter((m): m is string => Boolean(m))
  if (missing.length) return { missing }
  return {
    config: {
      salt: salt as string,
      perIp: perIp as number,
      perDay: perDay as number,
      db: createClient(url as string, key as string, { auth: { persistSession: false, autoRefreshToken: false } }),
    },
  }
}

/**
 * The caller's IP. On Vercel `x-forwarded-for` is set by the platform (it
 * overwrites whatever the client sent), so its first entry is the visitor.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export const hashIp = (salt: string, ip: string) => createHash('sha256').update(`ip:${salt}:${ip}`).digest('hex')

/** One build against both caps. 'ip' / 'day' = over that cap; nothing was taken. */
export async function takeBuild(c: CapsConfig, ipHash: string): Promise<'ok' | 'ip' | 'day'> {
  const { data, error } = await c.db.rpc('ai_usage_take', { p_ip_hash: ipHash, p_ip_limit: c.perIp, p_day_limit: c.perDay })
  if (error) throw new Error('caps_db: ' + error.message)
  if (data !== 'ok' && data !== 'ip' && data !== 'day') throw new Error('caps_db: unexpected ' + JSON.stringify(data))
  return data
}

/** A stable digest of the answers, so a ticket only works for the answers it was issued for. */
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('base64url')

const sign = (salt: string, body: string) => createHmac('sha256', `ticket:${salt}`).update(body).digest('base64url')

export function issueTicket(salt: string, answersDigest: string): string {
  const body = Buffer.from(JSON.stringify({ id: randomUUID(), d: answersDigest, exp: Date.now() + TICKET_TTL_MS })).toString('base64url')
  return `${body}.${sign(salt, body)}`
}

/** The ticket's id when the signature, the answers and the expiry all check out; else null. */
export function readTicket(salt: string, ticket: unknown, answersDigest: string): string | null {
  if (typeof ticket !== 'string' || ticket.length > 600) return null
  const [body, sig] = ticket.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(sign(salt, body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { id?: unknown; d?: unknown; exp?: unknown }
    if (typeof t.id !== 'string' || t.d !== answersDigest || typeof t.exp !== 'number' || t.exp < Date.now()) return null
    return t.id
  } catch {
    return null
  }
}

/** Spend a ticket. false = it was already spent. */
export async function spendTicket(c: CapsConfig, id: string): Promise<boolean> {
  const { error } = await c.db.from('ai_tickets').insert({ id })
  if (!error) return true
  if (error.code === '23505') return false
  throw new Error('caps_db: ' + error.message)
}
