/**
 * Theme presets: which [data-theme] block from app/globals.css paints the page.
 *
 * The choice is per user (scoped key `theme`, see lib/localScope.ts). A second,
 * unscoped copy (`pulse:theme`) is the last theme used in this browser: the
 * inline script in app/layout.tsx reads it before first paint, so a reload
 * never flashes the default paper. On a shared browser the board then corrects
 * itself to the signed-in user's own choice on mount.
 */
import { readScoped, writeScoped } from './localScope'

export const THEMES = [
  { id: 'vellum', name: 'Vellum', note: 'Cool paper, red pencil' },
  { id: 'blueprint', name: 'Blueprint', note: 'Dark blue, yellow ink' },
  { id: 'pencil', name: 'Pencil', note: 'Grey paper, no colour' },
  { id: 'sage', name: 'Sage', note: 'Green paper, brick red' },
  { id: 'night', name: 'Night', note: 'For after dark' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export const DEFAULT_THEME: ThemeId = 'vellum'
const MIRROR = 'pulse:theme'

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v)

/** Runs in <head> before paint. Kept tiny and dependency-free on purpose. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${MIRROR}');if(/^(${THEMES.map((t) => t.id).join('|')})$/.test(t))document.documentElement.dataset.theme=t}catch(e){}`

export function readTheme(userId: string): ThemeId {
  const own = readScoped(userId, 'theme')
  if (isThemeId(own)) return own
  try {
    const last = window.localStorage.getItem(MIRROR)
    if (isThemeId(last)) return last
  } catch {
    /* storage blocked */
  }
  return DEFAULT_THEME
}

/** Paint a theme now (no save). Tells open tiles to recolour. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  try {
    window.localStorage.setItem(MIRROR, id)
  } catch {
    /* storage blocked: the theme still applies for this page view */
  }
  window.dispatchEvent(new CustomEvent('pulse:theme', { detail: id }))
}

export function saveTheme(userId: string, id: ThemeId): void {
  writeScoped(userId, 'theme', id)
  applyTheme(id)
}

/** The tokens a sealed tile gets, read from the live page (see tileBridge). */
export const TILE_TOKENS = ['bg', 'surface', 'text', 'muted', 'line', 'accent', 'accent-ink', 'gold', 'signal'] as const

export function themeTokens(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const out: Record<string, string> = {}
  for (const k of TILE_TOKENS) {
    const v = cs.getPropertyValue(`--${k}`).trim()
    if (v) out[k] = v
  }
  return out
}
