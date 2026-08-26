import type { MetadataRoute } from 'next'

/**
 * Web app manifest — makes Pulse installable as a PWA ("Add to Home
 * Screen"). display:standalone drops the browser chrome so it opens fullscreen
 * like a native app; start_url goes straight to the dashboard at /app (the
 * landing page owns "/"), so an installed Pulse never opens on marketing. Icons are the
 * build-time generated app icons (app/icon.tsx, app/apple-icon.tsx).
 *
 * The PWA is the install path and takes no app-store cut.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pulse',
    short_name: 'Pulse',
    description: 'Your personal life dashboard: workouts, fuel, recovery, and more.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#04060a',
    theme_color: '#04060a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
