import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// All four faces are SELF-HOSTED (app/fonts/*.woff2, latin subset, pulled from
// Google Fonts once). They used to come from `next/font/google`, which fetches
// at BUILD time — one flaky fonts.googleapis.com response killed the whole
// Vercel build (it happened at commit 4727000). Local files remove that
// network dependency entirely. To refresh a face, re-download the latin woff2
// and drop it in; the variable names below are what the CSS consumes.

const inter = localFont({
  src: './fonts/Inter-latin-var.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})

const instrumentSerif = localFont({
  src: [
    { path: './fonts/InstrumentSerif-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InstrumentSerif-latin-400i.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-serif',
  display: 'swap',
})

// Sans-serif body face used by the landing hero (matches the Claude Design v1
// prototype — Hanken Grotesk reads softer than Inter at small sizes and gives
// the editorial chrome a magazine-typesetting feel).
const hankenGrotesk = localFont({
  src: './fonts/HankenGrotesk-latin-var.woff2',
  weight: '100 900',
  variable: '--font-hanken',
  display: 'swap',
})

// Monospace used by the landing eyebrow, footer coordinates, and museum caps.
const jetBrainsMono = localFont({
  src: './fonts/JetBrainsMono-latin-var.woff2',
  weight: '100 800',
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pulse',
  description: 'A personal dashboard built around your goals.',
  applicationName: 'Pulse',
  // Installable PWA: opens fullscreen from the home screen, no Safari chrome.
  // (manifest.ts + app/icon.tsx + app/apple-icon.tsx are auto-linked by Next.)
  appleWebApp: {
    capable: true,
    title: 'Pulse',
    statusBarStyle: 'black-translucent',
  },
  // Modern equivalent of the (deprecated) apple-mobile-web-app-capable meta that
  // `appleWebApp.capable` emits — keeps both so non-iOS browsers stop warning.
  other: { 'mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false },
}

// Mobile scaling + brand-dark browser/status-bar chrome. viewportFit:'cover'
// lets the standalone app paint under the iPhone notch / home indicator;
// userScalable:false stops double-tap-zoom fighting tap targets in the dense
// logger UI.
export const viewport: Viewport = {
  themeColor: '#04060a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${hankenGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
