/**
 * Custom tiles (docs/PLAN.md, Stage 7): the id rule, and the validator every
 * AI-written tile passes before anything stores it.
 *
 * A generated tile is code from a model, shaped by a stranger's text. Four
 * layers keep it in its box: the opaque-origin sandbox, the network lock
 * (TILE_CSP in tileBridge.ts plus frame-src on the board page), this
 * validator, and the preview the person sees before it lands. The validator is
 * the early, explainable layer: it refuses anything that reaches outside the
 * frame (so a refused tile stays an idea instead of a broken tile), and
 * anything the sandbox would make fail at runtime (storage, eval).
 *
 * Pure (no imports, no browser APIs) so the route and `node --test` share it.
 * Every pattern is linear: the text is a model's output and can be hostile, so
 * the length is capped before any regex runs and scripts are cut out with an
 * indexOf scan, never an "opener, anything, closer" regex.
 */

/** custom-<slug>: lowercase letters, digits and dashes, up to 40 after the prefix. */
export const CUSTOM_TILE_RE = /^custom-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
export const isCustomTileId = (v: unknown): v is string => typeof v === 'string' && CUSTOM_TILE_RE.test(v)

/** A custom id for this name, unique among `taken`. */
export function customTileId(name: string, taken: readonly string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'tile'
  let id = `custom-${slug}`
  for (let n = 2; taken.includes(id); n++) id = `custom-${slug}-${n}`
  return id
}

export const MAX_TILE_BYTES = 60 * 1024

/** Each reason a tile is refused, in the order they are checked. */
export type TileRejection =
  | 'not_text'
  | 'too_big'
  | 'not_a_document'
  | 'external_script'
  | 'external_resource'
  | 'blocked_tag'
  | 'network_call'
  | 'navigation'
  | 'storage'
  | 'eval'
  | 'no_bridge'
  | 'unclosed_script'
  | 'script_syntax'

// Attribute or CSS that points at another origin: http(s):// or protocol-relative //.
// No word boundary before the name on purpose: xlink:href and srcset count too.
const EXTERNAL_ATTR = /(?:src|href|action|poster|data|background|srcset)\s*=\s*(?:["']\s*)?(?:https?:|\/\/)/i
const EXTERNAL_CSS = /url\(\s*(?:["']\s*)?(?:https?:|\/\/)|@import/i
// [^<>]* rather than [^>]*: a scan stops at the next tag, so a page of unclosed
// "<meta <meta …" stays linear instead of rescanning to the end from each one.
const SCRIPT_SRC = /<script\b[^<>]*\bsrc\s*=/i
const BLOCKED_TAG = /<(?:link|iframe|frame|frameset|object|embed|base|form|portal)\b|<meta\b[^<>]*http-equiv/i
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\s*\(|\bWorker\s*\(|RTCPeerConnection/
const NAVIGATION = /\blocation\s*(?:=[^=]|\.\s*(?:href\s*=[^=]|assign|replace|reload))|window\.open\s*\(|\.submit\s*\(/
const STORAGE = /localStorage|sessionStorage|indexedDB|document\.cookie|caches\./
const EVAL = /\beval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`]/
const SAVES = /\b(?:Pulse|Vitality)\.save\s*\(/
const LOADS = /\b(?:Pulse|Vitality)\.load\s*\(/

/** The bodies of every inline <script>, or null if one never closes. Linear. */
function scriptBodies(html: string): string[] | null {
  const lower = html.toLowerCase()
  const out: string[] = []
  let i = 0
  for (;;) {
    const open = lower.indexOf('<script', i)
    if (open < 0) return out
    const start = lower.indexOf('>', open)
    if (start < 0) return null
    const end = lower.indexOf('</script', start)
    if (end < 0) return null
    out.push(html.slice(start + 1, end))
    i = end + 8
  }
}

/** Does this JavaScript parse? Compiles without running (the function is never called). */
function parses(code: string): boolean {
  try {
    new Function(code)
    return true
  } catch {
    return false
  }
}

/**
 * ok, or the first reason the tile is refused. `parse` is the syntax check for
 * inline scripts (server: `new Function`, which compiles without running).
 */
export function checkTileHtml(html: unknown, parse: (code: string) => boolean = parses): { ok: true } | { ok: false; reason: TileRejection } {
  const no = (reason: TileRejection) => ({ ok: false as const, reason })
  if (typeof html !== 'string') return no('not_text')
  if (html.length > MAX_TILE_BYTES || new TextEncoder().encode(html).length > MAX_TILE_BYTES) return no('too_big')
  if (!/^\s*<!doctype html>/i.test(html) || !/<body\b/i.test(html) || !/<\/html>\s*$/i.test(html)) return no('not_a_document')
  if (SCRIPT_SRC.test(html)) return no('external_script')
  if (EXTERNAL_ATTR.test(html) || EXTERNAL_CSS.test(html)) return no('external_resource')
  if (BLOCKED_TAG.test(html)) return no('blocked_tag')
  if (NETWORK.test(html)) return no('network_call')
  if (NAVIGATION.test(html)) return no('navigation')
  if (STORAGE.test(html)) return no('storage')
  if (EVAL.test(html)) return no('eval')
  if (!SAVES.test(html) || !LOADS.test(html)) return no('no_bridge')
  const scripts = scriptBodies(html)
  if (!scripts) return no('unclosed_script')
  if (!scripts.every((s) => parse(s))) return no('script_syntax')
  return { ok: true }
}
