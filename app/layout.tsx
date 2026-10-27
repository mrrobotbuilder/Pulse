import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { THEME_INIT_SCRIPT, DEFAULT_THEME } from '@/lib/theme'
import './globals.css'

// All faces are SELF-HOSTED (app/fonts/*.woff2, latin subset, pulled from
// Google Fonts once). They used to come from `next/font/google`, which fetches
// at BUILD time — one flaky fonts.googleapis.com response killed the whole
// Vercel build (it happened at commit 4727000). Local files remove that
// network dependency entirely. To refresh a face, re-download the latin woff2
// and drop it in; the variable names below are what globals.css consumes.

// Display: Bricolage Grotesque, variable in weight, width and optical size.
const bricolage = localFont({
  src: './fonts/BricolageGrotesque-latin-var.woff2',
  weight: '400 800',
  variable: '--font-bricolage',
  display: 'swap',
})

const atkinson = localFont({
  src: [
    { path: './fonts/Atkinson-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Atkinson-latin-400i.woff2', weight: '400', style: 'italic' },
    { path: './fonts/Atkinson-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-atkinson',
  display: 'swap',
})

const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-latin-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
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
    // 'default' keeps the status bar out of the page: the default paper is
    // light, and black-translucent would put white status text on it.
    statusBarStyle: 'default',
  },
  // Modern equivalent of the (deprecated) apple-mobile-web-app-capable meta that
  // `appleWebApp.capable` emits — keeps both so non-iOS browsers stop warning.
  other: { 'mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false },
}

// viewportFit:'cover' lets the standalone app paint under the iPhone notch /
// home indicator; userScalable:false stops double-tap-zoom fighting tap
// targets in the dense logger UI.
export const viewport: Viewport = {
  themeColor: '#EEF1F4',
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
    // suppressHydrationWarning: the inline script may switch data-theme to the
    // visitor's saved preset before React hydrates.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${bricolage.variable} ${atkinson.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
