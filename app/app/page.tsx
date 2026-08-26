import Dashboard from './Dashboard'
import { site } from '@/content/site'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard · Pulse',
}

// The board itself. It used to live at "/" — "/" is now the landing page, so
// the dashboard moved here and the PWA start_url follows it (app/manifest.ts).
// localStorage is keyed by ORIGIN, not path, so every existing board survived
// the move untouched.
//
// userId is still the fixed "me" namespace: real per-account ids arrive with
// the multi-user work (see SETUP.md, stage B2). "me" stays the anonymous /
// demo namespace after that.
export default function Page() {
  return <Dashboard firstName={site.name || null} userId="me" />
}
