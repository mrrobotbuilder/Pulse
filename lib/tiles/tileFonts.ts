'use client'

/**
 * The board's fonts, for sealed tiles. A tile has no network (TILE_CSP), so the
 * host reads the font files once (public/tile-fonts, copies of app/fonts) and
 * hands them in as data: URLs inside an @font-face block. The tile kit
 * (tileKit.ts) names these families first and falls back to system fonts, so a
 * tile opened before the fonts arrive still renders, just in system type.
 */

const FACES: { family: string; file: string; weight: string }[] = [
  { family: 'Pulse Display', file: 'BricolageGrotesque-latin-var.woff2', weight: '200 800' },
  { family: 'Pulse Body', file: 'Atkinson-latin-400.woff2', weight: '400' },
  { family: 'Pulse Body', file: 'Atkinson-latin-700.woff2', weight: '700' },
  { family: 'Pulse Mono', file: 'IBMPlexMono-latin-500.woff2', weight: '400 600' },
]

let css: string | null = null
let loading: Promise<string> | null = null

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** The @font-face CSS if it is ready, else '' (and the load starts). */
export function tileFontCss(): string {
  if (css === null) void loadTileFonts()
  return css ?? ''
}

/** Load once; every caller shares the one request. A failure leaves tiles in system fonts. */
export function loadTileFonts(): Promise<string> {
  if (css !== null) return Promise.resolve(css)
  if (!loading) {
    loading = Promise.all(
      FACES.map(async (f) => {
        const res = await fetch(`/tile-fonts/${f.file}`)
        if (!res.ok) throw new Error(`${f.file}: ${res.status}`)
        const url = await toDataUrl(new Blob([await res.arrayBuffer()], { type: 'font/woff2' }))
        return `@font-face{font-family:"${f.family}";src:url(${url}) format("woff2");font-weight:${f.weight};font-display:swap}`
      }),
    ).then(
      (faces) => (css = faces.join('')),
      (e) => {
        console.error('tile fonts did not load; tiles use system fonts', e)
        loading = null
        return ''
      },
    )
  }
  return loading
}
